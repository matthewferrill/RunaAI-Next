import { createHash } from "node:crypto";

const SCHEMA = "runa-omen-system-drive-journal/v2";
const DESCRIPTOR_PREFIX = Buffer.from("runa-omen-system-drive-descriptor/v3\0", "utf8");
const KEYS = ["schemaVersion", "transactionId", "operation", "phase", "transitionScriptSha256", "writeApi",
  "target", "preDescriptorBase64", "preDescriptorSha256", "expectedPostDescriptorBase64",
  "expectedPostDescriptorSha256", "prepareAttempt", "rollbackAttempt", "deprovisionAttempt", "systemDriveState",
  "rollbackVerified"];
const ATTEMPT_KEYS = ["started", "terminal", "win32Success", "win32Error"];
const PHASES = new Set(["authorized", "prepare-started", "prepare-terminal", "rollback-started",
  "rollback-terminal", "prepared", "deprovision-started", "deprovision-terminal"]);
const STATES = new Set(["prepared", "unprepared", "unknown"]);
const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every((key, index) => key === keys[index]);

function pushU32(parts, value) {
  const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); parts.push(bytes);
}

export function encodeCanonicalDescriptor({ daclPresent, daclNull, controlFlags, ownerSid, groupSid, aces }) {
  if (typeof daclPresent !== "boolean" || typeof daclNull !== "boolean" || (!daclPresent && !daclNull)
      || (daclPresent && daclNull) || !uint32(controlFlags) || !Buffer.isBuffer(ownerSid)
      || !Buffer.isBuffer(groupSid) || ownerSid.length < 8 || groupSid.length < 8 || !Array.isArray(aces)
      || aces.length > 512 || aces.some(ace => !Buffer.isBuffer(ace) || ace.length < 4 || ace.length > 65535)) {
    throw Object.assign(new Error("descriptor-invalid"), { code: "descriptor-invalid" });
  }
  const aclLength = 8 + aces.reduce((sum, ace) => sum + ace.length, 0);
  if (aclLength > 65535 || aces.some(ace => ace.readUInt16LE(2) !== ace.length)) {
    throw Object.assign(new Error("descriptor-invalid"), { code: "descriptor-invalid" });
  }
  const acl = Buffer.alloc(8); acl[0] = 2; acl.writeUInt16LE(aclLength, 2); acl.writeUInt16LE(aces.length, 4);
  const parts = [DESCRIPTOR_PREFIX, Buffer.from([Number(daclPresent), Number(daclNull)])];
  pushU32(parts, controlFlags); pushU32(parts, ownerSid.length); parts.push(ownerSid);
  pushU32(parts, groupSid.length); parts.push(groupSid); pushU32(parts, aclLength); parts.push(acl, ...aces);
  const result = Buffer.concat(parts);
  if (result.length > 131072) throw Object.assign(new Error("descriptor-invalid"), { code: "descriptor-invalid" });
  return result;
}

function decodeCanonicalDescriptor(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < DESCRIPTOR_PREFIX.length + 22 || bytes.length > 131072
      || !bytes.subarray(0, DESCRIPTOR_PREFIX.length).equals(DESCRIPTOR_PREFIX)) return null;
  let offset = DESCRIPTOR_PREFIX.length;
  const takeByte = () => offset < bytes.length ? bytes[offset++] : null;
  const takeU32 = () => { if (offset + 4 > bytes.length) return null; const value = bytes.readUInt32LE(offset);
    offset += 4; return value; };
  const take = length => { if (!uint32(length) || offset + length > bytes.length) return null;
    const value = bytes.subarray(offset, offset + length); offset += length; return value; };
  const present = takeByte(), nil = takeByte(), control = takeU32();
  if (!((present === 1 && nil === 0) || (present === 0 && nil === 1)) || control === null) return null;
  const ownerLength = takeU32(), owner = take(ownerLength);
  const groupLength = takeU32(), group = take(groupLength);
  const aclLength = takeU32(), acl = take(aclLength);
  if (!owner || owner.length < 8 || !group || group.length < 8 || !acl || acl.length < 8 || acl.length > 65535
      || ![2, 4].includes(acl[0]) || acl[1] !== 0 || acl[6] !== 0 || acl[7] !== 0
      || acl.readUInt16LE(2) !== acl.length || acl.readUInt16LE(4) > 512) return null;
  let aclOffset = 8;
  const aces = [];
  for (let index = 0; index < acl.readUInt16LE(4); index += 1) {
    if (aclOffset + 4 > acl.length) return null;
    const length = acl.readUInt16LE(aclOffset + 2);
    if (length < 4 || aclOffset + length > acl.length) return null;
    aces.push(acl.subarray(aclOffset, aclOffset + length));
    aclOffset += length;
  }
  if (aclOffset !== acl.length || offset !== bytes.length) return null;
  return { controlFlags: control, owner, group, acl, aclRevision: acl[0], aces };
}

export const validateCanonicalDescriptor = bytes => decodeCanonicalDescriptor(bytes) !== null;

const APP_SID = Buffer.from([1, 2, 0, 0, 0, 0, 0, 15, 2, 0, 0, 0, 1, 0, 0, 0]);
const RESTRICTED_SID = Buffer.from([1, 2, 0, 0, 0, 0, 0, 15, 2, 0, 0, 0, 2, 0, 0, 0]);
function targetAce(sid) {
  const result = Buffer.alloc(8 + sid.length); result[0] = 0; result.writeUInt16LE(result.length, 2);
  result.writeUInt32LE(0x00120088, 4); sid.copy(result, 8); return result;
}
const APP_ACE = targetAce(APP_SID), RESTRICTED_ACE = targetAce(RESTRICTED_SID);
const DENY_TYPES = new Set([1, 6, 10, 12]), ALLOW_TYPES = new Set([0, 5, 9, 11]);
const COMMON_ACE_TYPES = new Set([0, 1, 2, 3, 9, 10, 13, 14]);
function explicitCommonAceTargets(ace, sid) {
  if (!COMMON_ACE_TYPES.has(ace[0]) || (ace[1] & 0x10) !== 0 || ace.length < 16) return false;
  const subAuthorities = ace[9], sidLength = 8 + 4 * subAuthorities;
  return sidLength === sid.length && 8 + sidLength <= ace.length && ace.subarray(8, 8 + sidLength).equals(sid);
}
function canonicalDacl(aces) {
  let category = -1;
  for (const ace of aces) {
    const inherited = (ace[1] & 0x10) !== 0;
    const next = inherited ? 2 : DENY_TYPES.has(ace[0]) ? 0 : ALLOW_TYPES.has(ace[0]) ? 1 : -1;
    if (next < 0 || next < category) return false; category = next;
  }
  return true;
}

function descriptorDelta(beforeBytes, afterBytes, requireCanonicalPost) {
  const before = decodeCanonicalDescriptor(beforeBytes), after = decodeCanonicalDescriptor(afterBytes);
  if (!before || !after || before.controlFlags !== after.controlFlags || !before.owner.equals(after.owner)
      || !before.group.equals(after.group) || before.aclRevision !== after.aclRevision
      || after.aces.length !== before.aces.length + 2 || !canonicalDacl(before.aces)
      || (requireCanonicalPost && !canonicalDacl(after.aces))) return false;
  let app = 0, restricted = 0; const remaining = [];
  for (const ace of after.aces) {
    if (ace.equals(APP_ACE)) { app += 1; continue; }
    if (ace.equals(RESTRICTED_ACE)) { restricted += 1; continue; }
    if (explicitCommonAceTargets(ace, APP_SID) || explicitCommonAceTargets(ace, RESTRICTED_SID)) return false;
    remaining.push(ace);
  }
  return app === 1 && restricted === 1 && remaining.length === before.aces.length
    && remaining.every((ace, index) => ace.equals(before.aces[index]));
}

export const validatePlannedDescriptorDelta = (before, planned) => descriptorDelta(before, planned, false);
export const validatePreparedDescriptorDelta = (before, actual) => descriptorDelta(before, actual, true);

export const descriptorSha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function validAttempt(attempt) {
  if (!exactKeys(attempt, ATTEMPT_KEYS) || typeof attempt.started !== "boolean"
      || typeof attempt.terminal !== "boolean" || (attempt.terminal && !attempt.started)) return false;
  if (!attempt.started) return !attempt.terminal && attempt.win32Success === null && attempt.win32Error === null;
  if (!attempt.terminal) return attempt.win32Success === null && attempt.win32Error === null;
  if (typeof attempt.win32Success !== "boolean") return false;
  return attempt.win32Success ? attempt.win32Error === null : uint32(attempt.win32Error);
}

const idle = attempt => !attempt.started && !attempt.terminal;
const started = attempt => attempt.started && !attempt.terminal;
const terminal = attempt => attempt.started && attempt.terminal;

function phaseValid(value) {
  const p = value.prepareAttempt, r = value.rollbackAttempt, d = value.deprovisionAttempt;
  switch (value.phase) {
    case "authorized": return value.operation === "prepare" && idle(p) && idle(r) && idle(d)
      && value.systemDriveState === "unprepared" && !value.rollbackVerified;
    case "prepare-started": return value.operation === "prepare" && started(p) && idle(r) && idle(d)
      && value.systemDriveState === "unknown" && !value.rollbackVerified;
    case "prepare-terminal": return value.operation === "prepare" && terminal(p) && idle(r) && idle(d)
      && !value.rollbackVerified;
    case "rollback-started": return value.operation === "prepare" && terminal(p) && started(r) && idle(d)
      && value.systemDriveState === "unknown" && !value.rollbackVerified;
    case "rollback-terminal": return value.operation === "prepare" && terminal(p) && terminal(r) && idle(d)
      && value.rollbackVerified === (value.systemDriveState === "unprepared");
    case "prepared": return value.operation === "prepare" && terminal(p) && p.win32Success === true
      && idle(r) && idle(d) && value.systemDriveState === "prepared" && !value.rollbackVerified;
    case "deprovision-started": return value.operation === "deprovision" && terminal(p) && p.win32Success === true
      && idle(r) && started(d) && value.systemDriveState === "unknown" && !value.rollbackVerified;
    case "deprovision-terminal": return value.operation === "deprovision" && terminal(p) && p.win32Success === true
      && idle(r) && terminal(d) && !value.rollbackVerified;
    default: return false;
  }
}

export function validateSystemDriveJournal(value) {
  if (!exactKeys(value, KEYS) || value.schemaVersion !== SCHEMA || !/^[a-f0-9]{32}$/u.test(value.transactionId)
      || !["prepare", "deprovision"].includes(value.operation) || !PHASES.has(value.phase)
      || !/^[a-f0-9]{64}$/u.test(value.transitionScriptSha256)
      || value.writeApi !== "SetFileSecurityW:DACL_SECURITY_INFORMATION" || value.target !== "C:\\"
      || !/^[a-f0-9]{64}$/u.test(value.preDescriptorSha256)
      || !/^[a-f0-9]{64}$/u.test(value.expectedPostDescriptorSha256)
      || !validAttempt(value.prepareAttempt) || !validAttempt(value.rollbackAttempt)
      || !validAttempt(value.deprovisionAttempt) || !STATES.has(value.systemDriveState)
      || typeof value.rollbackVerified !== "boolean") return false;
  let before, after;
  try {
    before = Buffer.from(value.preDescriptorBase64, "base64");
    after = Buffer.from(value.expectedPostDescriptorBase64, "base64");
  } catch { return false; }
  if (before.toString("base64") !== value.preDescriptorBase64 || after.toString("base64") !== value.expectedPostDescriptorBase64
      || !validateCanonicalDescriptor(before) || !validateCanonicalDescriptor(after)
      || descriptorSha256(before) !== value.preDescriptorSha256
      || descriptorSha256(after) !== value.expectedPostDescriptorSha256
      || value.preDescriptorSha256 === value.expectedPostDescriptorSha256) return false;
  const actualAuthority = value.systemDriveState === "prepared"
    || ["prepared", "deprovision-started", "deprovision-terminal"].includes(value.phase);
  if (!(actualAuthority ? validatePreparedDescriptorDelta(before, after)
    : validatePlannedDescriptorDelta(before, after))) return false;
  return phaseValid(value);
}

export function serializeSystemDriveJournal(value) {
  if (!validateSystemDriveJournal(value)) throw Object.assign(new Error("journal-invalid"), { code: "journal-invalid" });
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (bytes.length > 524288) throw Object.assign(new Error("journal-invalid"), { code: "journal-invalid" });
  return bytes;
}

export function parseSystemDriveJournal(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 524288
      || bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw Object.assign(new Error("journal-invalid"), { code: "journal-invalid" });
  }
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch {
    throw Object.assign(new Error("journal-invalid"), { code: "journal-invalid" });
  }
  const canonical = serializeSystemDriveJournal(value);
  if (!canonical.equals(bytes)) throw Object.assign(new Error("journal-invalid"), { code: "journal-invalid" });
  return value;
}

export const SYSTEM_DRIVE_JOURNAL_SCHEMA = SCHEMA;
