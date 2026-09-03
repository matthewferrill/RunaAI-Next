import test from "node:test";
import assert from "node:assert/strict";
import { descriptorSha256, encodeCanonicalDescriptor, parseSystemDriveJournal, serializeSystemDriveJournal,
  validateCanonicalDescriptor, validatePreparedDescriptorDelta, validateSystemDriveJournal } from "./system-drive-journal-contract.mjs";

const sid = tail => Buffer.from([1, 1, 0, 0, 0, 0, 0, 5, tail, 0, 0, 0]);
const world = Buffer.from([1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
const app = Buffer.from([1, 2, 0, 0, 0, 0, 0, 15, 2, 0, 0, 0, 1, 0, 0, 0]);
const restricted = Buffer.from([1, 2, 0, 0, 0, 0, 0, 15, 2, 0, 0, 0, 2, 0, 0, 0]);
const ace = (type, mask, trustee) => { const value = Buffer.alloc(8 + trustee.length); value[0] = type;
  value.writeUInt16LE(value.length, 2); value.writeUInt32LE(mask, 4); trustee.copy(value, 8); return value; };
const deny = ace(1, 0x10, world), existingAllow = ace(0, 0x20, sid(18));
const appAllow = ace(0, 0x00120088, app), restrictedAllow = ace(0, 0x00120088, restricted);
const before = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
  ownerSid: sid(18), groupSid: sid(32), aces: [deny, existingAllow] });
const after = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
  ownerSid: sid(18), groupSid: sid(32), aces: [deny, appAllow, restrictedAllow, existingAllow] });
const idle = () => ({ started: false, terminal: false, win32Success: null, win32Error: null });
const terminal = success => ({ started: true, terminal: true, win32Success: success,
  win32Error: success ? null : 5 });
const journal = (overrides = {}) => ({ schemaVersion: "runa-omen-system-drive-journal/v2",
  transactionId: "a".repeat(32), operation: "prepare", phase: "authorized",
  transitionScriptSha256: "b".repeat(64), writeApi: "SetFileSecurityW:DACL_SECURITY_INFORMATION",
  target: "C:\\", preDescriptorBase64: before.toString("base64"), preDescriptorSha256: descriptorSha256(before),
  expectedPostDescriptorBase64: after.toString("base64"), expectedPostDescriptorSha256: descriptorSha256(after),
  prepareAttempt: idle(), rollbackAttempt: idle(), deprovisionAttempt: idle(), systemDriveState: "unprepared",
  rollbackVerified: false, ...overrides });

test("descriptor encoding preserves ACE order and fixed framing", () => {
  assert.equal(validateCanonicalDescriptor(before), true);
  assert.equal(validateCanonicalDescriptor(after), true);
  const reversed = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
    ownerSid: sid(18), groupSid: sid(32), aces: [appAllow, deny, restrictedAllow, existingAllow] });
  assert.notEqual(descriptorSha256(after), descriptorSha256(reversed));
  assert.equal(validatePreparedDescriptorDelta(before, reversed), false);
  assert.equal(validateCanonicalDescriptor(Buffer.concat([after, Buffer.from([0])])), false);
  const prefixLength = Buffer.from("runa-omen-system-drive-descriptor/v3\0", "utf8").length;
  const ownerLength = after.readUInt32LE(prefixLength + 6);
  const groupLengthOffset = prefixLength + 10 + ownerLength;
  const groupLength = after.readUInt32LE(groupLengthOffset);
  const aclLengthOffset = groupLengthOffset + 4 + groupLength;
  const aclOffset = aclLengthOffset + 4;
  for (const mutate of [
    value => { value[aclOffset] = 3; },
    value => { value[aclOffset + 1] = 1; },
    value => { value.writeUInt16LE(value.readUInt16LE(aclOffset + 2) - 1, aclOffset + 2); },
    value => { value.writeUInt16LE(value.readUInt16LE(aclOffset + 4) + 1, aclOffset + 4); },
    value => { value[aclOffset + 6] = 1; },
  ]) {
    const malformed = Buffer.from(after); mutate(malformed);
    assert.equal(validateCanonicalDescriptor(malformed), false);
  }
});

test("canonical journal round trips and rejects noncanonical or duplicate JSON", () => {
  const value = journal();
  const bytes = serializeSystemDriveJournal(value);
  assert.deepEqual(parseSystemDriveJournal(bytes), value);
  assert.throws(() => parseSystemDriveJournal(Buffer.from(` ${bytes}`)), { code: "journal-invalid" });
  const duplicate = bytes.toString("utf8").replace('{"schemaVersion":',
    '{"schemaVersion":"runa-omen-system-drive-journal/v2","schemaVersion":');
  assert.throws(() => parseSystemDriveJournal(Buffer.from(duplicate)), { code: "journal-invalid" });
  assert.throws(() => parseSystemDriveJournal(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])),
    { code: "journal-invalid" });
});

test("journal phase invariants prevent replay and ambiguous attempts", () => {
  const prepared = journal({ phase: "prepared", prepareAttempt: terminal(true), systemDriveState: "prepared" });
  assert.equal(validateSystemDriveJournal(prepared), true);
  const deprovisionStarted = journal({ operation: "deprovision", phase: "deprovision-started",
    prepareAttempt: terminal(true), deprovisionAttempt: { started: true, terminal: false,
      win32Success: null, win32Error: null }, systemDriveState: "unknown" });
  assert.equal(validateSystemDriveJournal(deprovisionStarted), true);
  const oneTarget = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
    ownerSid: sid(18), groupSid: sid(32), aces: [deny, appAllow, existingAllow] });
  const wrongMask = ace(0, 0x00120089, app);
  const wrongFlags = Buffer.from(appAllow); wrongFlags[1] = 0x01;
  const conflictingMask = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
    ownerSid: sid(18), groupSid: sid(32), aces: [deny, appAllow, restrictedAllow, wrongMask, existingAllow] });
  const conflictingFlags = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
    ownerSid: sid(18), groupSid: sid(32), aces: [deny, appAllow, restrictedAllow, wrongFlags, existingAllow] });
  const conflictBefore = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
    ownerSid: sid(18), groupSid: sid(32), aces: [deny, wrongMask, existingAllow] });
  const conflictAfter = encodeCanonicalDescriptor({ daclPresent: true, daclNull: false, controlFlags: 0x1404,
    ownerSid: sid(18), groupSid: sid(32), aces: [deny, appAllow, restrictedAllow, wrongMask, existingAllow] });
  for (const invalid of [
    { ...journal(), phase: "prepare-started" },
    { ...journal(), target: "D:\\" },
    { ...prepared, rollbackVerified: true },
    { ...journal(), privatePath: "C:\\secret" },
    { ...prepared, expectedPostDescriptorBase64: oneTarget.toString("base64"),
      expectedPostDescriptorSha256: descriptorSha256(oneTarget) },
    { ...prepared, expectedPostDescriptorBase64: conflictingMask.toString("base64"),
      expectedPostDescriptorSha256: descriptorSha256(conflictingMask) },
    { ...prepared, expectedPostDescriptorBase64: conflictingFlags.toString("base64"),
      expectedPostDescriptorSha256: descriptorSha256(conflictingFlags) },
    { ...prepared, preDescriptorBase64: conflictBefore.toString("base64"),
      preDescriptorSha256: descriptorSha256(conflictBefore),
      expectedPostDescriptorBase64: conflictAfter.toString("base64"),
      expectedPostDescriptorSha256: descriptorSha256(conflictAfter) },
    { ...journal(), prepareAttempt: { started: true, terminal: true, win32Success: false, win32Error: -1 },
      phase: "prepare-terminal", systemDriveState: "unprepared" },
    { ...journal(), prepareAttempt: { started: true, terminal: true, win32Success: false,
      win32Error: 0x1_0000_0000 }, phase: "prepare-terminal", systemDriveState: "unprepared" },
  ]) assert.equal(validateSystemDriveJournal(invalid), false);
});
