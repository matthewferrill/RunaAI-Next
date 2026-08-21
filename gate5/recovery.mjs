import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export const GATE5_BACKUP_VERSION = "runa2-gate5-authoritative-backup/v1";
const coded = (code, message) => Object.assign(new Error(message), { code });
const canonical = value => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw coded("backup-value-invalid", "Backup records must be JSON values.");
};
const keyedDigest = (value, key, domain) => createHmac("sha256", key).update(`${domain}\0${canonical(value)}`).digest("hex");

export function createAuthoritativeBackup({ records, sourceAuthority, sourceCommit, encryptionKey, digestKey, now = () => new Date(), nonce = randomBytes(12) }) {
  if (!Array.isArray(records) || records.length === 0) throw coded("backup-records-required", "Authoritative records are required.");
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) throw coded("backup-key-invalid", "A distinct 32-byte backup encryption key is required.");
  if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw coded("backup-nonce-invalid", "A 12-byte backup nonce is required.");
  const grouped = new Map();
  for (const record of records) {
    if (!record?.domain || !record.schemaVersion || !record.recordId) throw coded("backup-record-invalid", "Each record needs domain, schemaVersion, and recordId.");
    const key = `${record.domain}\0${record.schemaVersion}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }
  const domains = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => ({
    domain: values[0].domain,
    schemaVersion: values[0].schemaVersion,
    count: values.length,
    keyedDigest: keyedDigest(values.slice().sort((a, b) => a.recordId.localeCompare(b)), digestKey, `domain:${values[0].domain}`),
  }));
  const manifest = {
    schemaVersion: GATE5_BACKUP_VERSION,
    sourceAuthority,
    sourceCommit,
    createdAt: now().toISOString(),
    recordCount: records.length,
    domains,
    allRecordsDigest: keyedDigest(records.slice().sort((a, b) => `${a.domain}/${a.recordId}`.localeCompare(`${b.domain}/${b.recordId}`)), digestKey, "all-records"),
    derivedStores: ["qdrant"],
  };
  const plain = Buffer.from(canonical({ manifest, records }), "utf8");
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  cipher.setAAD(Buffer.from(GATE5_BACKUP_VERSION, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Object.freeze({
    schemaVersion: GATE5_BACKUP_VERSION,
    algorithm: "AES-256-GCM",
    nonce: nonce.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    manifest: structuredClone(manifest),
  });
}
export function openAuthoritativeBackup({ envelope, encryptionKey, digestKey, expectedAuthority, expectedCommit }) {
  if (envelope?.schemaVersion !== GATE5_BACKUP_VERSION || envelope.algorithm !== "AES-256-GCM") throw coded("backup-envelope-invalid", "Backup envelope is invalid.");
  let parsed;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(envelope.nonce, "base64url"));
    decipher.setAAD(Buffer.from(GATE5_BACKUP_VERSION, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8"));
  } catch {
    throw coded("backup-authentication-failed", "Backup authentication failed.");
  }
  const { manifest, records } = parsed;
  if (manifest?.sourceAuthority !== expectedAuthority || manifest?.sourceCommit !== expectedCommit) throw coded("backup-authority-mismatch", "Backup source authority does not match.");
  if (!Array.isArray(records) || records.length !== manifest.recordCount) throw coded("backup-count-mismatch", "Backup record count does not match.");
  const digest = keyedDigest(records.slice().sort((a, b) => `${a.domain}/${a.recordId}`.localeCompare(`${b.domain}/${b.recordId}`)), digestKey, "all-records");
  if (digest !== manifest.allRecordsDigest) throw coded("backup-digest-mismatch", "Backup record digest does not match.");
  return Object.freeze({ manifest: structuredClone(manifest), records: structuredClone(records) });
}

export class MemoryRecoveryTarget {
  constructor(initial = []) { this.rows = structuredClone(initial); this.run = null; }
  count() { return this.rows.length; }
  restore({ runId, opened, failAfter = null }) {
    if (this.rows.length > 0 && this.run !== runId) throw coded("restore-target-not-empty", "Restore target must be distinct and empty.");
    if (this.run === runId) return { restored: this.rows.length, replayed: true };
    const staged = [];
    try {
      for (const record of opened.records) {
        staged.push(structuredClone(record));
        if (failAfter !== null && staged.length >= failAfter) throw coded("restore-injected-failure", "Synthetic restore failure.");
      }
      this.rows = staged;
      this.run = runId;
      return { restored: staged.length, replayed: false };
    } catch (error) {
      this.rows = [];
      this.run = null;
      throw error;
    }
  }
  rollback(runId) {
    if (this.run !== runId) return false;
    this.rows = [];
    this.run = null;
    return true;
  }
}

export function ownerRecoveryPlan({ principalRef, oldCredentialRef, newCredentialType = "webauthn-platform" }) {
  if (!principalRef || !oldCredentialRef) throw coded("recovery-authority-required", "Existing product authority references are required.");
  return Object.freeze({
    schemaVersion: "runa2-gate5-owner-recovery-plan/v1",
    principalRef,
    priorCredentialRef: oldCredentialRef,
    newCredentialType,
    requiredActs: Object.freeze([
      "verify-product-principal-and-recovery-authority",
      "enrol-new-user-verified-credential",
      "verify-new-sign-in-and-fresh-step-up",
      "revoke-old-credential-sessions-and-pending-capabilities",
      "record-governed-recovery-receipt",
    ]),
    forbiddenImports: Object.freeze(["session", "token", "cookie", "private-key", "dpapi-ciphertext", "device-vault", "recovery-secret"]),
    productRecordsPreserved: true,
    auditHistoryPreserved: true,
    protectedDeletionAuthorized: false,
  });
}

export function legacySecurityDisposition() {
  return Object.freeze({
    e3: "defer-one-unresolved-record",
    e4: "replace-two-authority-records-by-explicit-re-enrolment",
    e5: "retire-absent-store",
    deviceVault: "do-not-copy-ciphertext-retire-only-after-witnessed-recovery",
    dpapiSessions: "do-not-migrate-sign-in-again",
    windowsHelloPrivateKeys: "never-export-or-copy",
  });
}
