import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import {
  GATE6C_BACKUP_VERSION, GATE6C_BINDING_VERSION, GATE6C_FREEZE_VERSION,
  GATE6C_INVENTORY_VERSION, GATE6C_REQUIRED_DOMAINS,
} from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const safeId = value => /^[A-Za-z0-9._:-]{1,160}$/.test(String(value));
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const privateKey = /(^|[-_])(secret|token|password|cookie|authorization|private[-_]?key|ciphertext|recovery[-_]?secret|credential[-_]?id|client[-_]?data|attestation)($|[-_])/i;

export function rejectPrivateFields(value, path = "evidence") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (privateKey.test(key)) throw coded("gate6c-private-field-forbidden", `Private field is forbidden at ${path}.${key}.`);
    rejectPrivateFields(child, `${path}.${key}`);
  }
}

export function digestEvidence(value) {
  rejectPrivateFields(value);
  return sha256(canonicalJson(value));
}

export function assertBinding(value) {
  const keys = ["schemaVersion", "cutoverId", "releaseId", "releaseCommit", "artifactDigest",
    "sourceGeneration", "targetGeneration", "participantRefHmac"];
  if (!exactKeys(value, keys) || value.schemaVersion !== GATE6C_BINDING_VERSION
      || !safeId(value.cutoverId) || !safeId(value.releaseId) || !hex40(value.releaseCommit)
      || !hex64(value.artifactDigest) || !safeId(value.sourceGeneration)
      || !safeId(value.targetGeneration) || value.sourceGeneration === value.targetGeneration
      || !hex64(value.participantRefHmac)) {
    throw coded("gate6c-binding-invalid", "The Gate 6C authority binding is invalid.");
  }
  rejectPrivateFields(value);
  return Object.freeze(structuredClone(value));
}

function assertFresh(value, now, maximumAgeMs, code) {
  const observed = Date.parse(value);
  const current = now.getTime();
  if (!Number.isFinite(observed) || observed > current + 60_000 || current - observed > maximumAgeMs) {
    throw coded(code, "The retained proof is stale or has an invalid timestamp.");
  }
}

export function assertBackupProof(value, { binding, now = new Date(), maximumAgeMs = 24 * 60 * 60_000 } = {}) {
  assertBinding(binding);
  const keys = ["schemaVersion", "bindingDigest", "scheduleActive", "encryptedBackupCount",
    "plaintextBackupCount", "manifestDigest", "distinctRestoreVerified", "verifiedAt",
    "privateValuesIncluded"];
  if (!exactKeys(value, keys) || value.schemaVersion !== GATE6C_BACKUP_VERSION
      || value.bindingDigest !== digestEvidence(binding) || value.scheduleActive !== true
      || !Number.isInteger(value.encryptedBackupCount) || value.encryptedBackupCount < 3
      || value.plaintextBackupCount !== 0 || !hex64(value.manifestDigest)
      || value.distinctRestoreVerified !== true || value.privateValuesIncluded !== false) {
    throw coded("gate6c-backup-proof-invalid", "The recurring encrypted backup proof is not green.");
  }
  assertFresh(value.verifiedAt, now, maximumAgeMs, "gate6c-backup-proof-stale");
  rejectPrivateFields(value);
  return Object.freeze(structuredClone(value));
}

export function assertFreezeLease(value, { binding, now = new Date() } = {}) {
  assertBinding(binding);
  const keys = ["schemaVersion", "bindingDigest", "leaseId", "sourceGeneration", "selectedDomains",
    "selectedWritesFrozen", "legacyReadsAvailable", "issuedAt", "expiresAt", "status",
    "privateValuesIncluded"];
  const domains = [...(value?.selectedDomains ?? [])].sort();
  if (!exactKeys(value, keys) || value.schemaVersion !== GATE6C_FREEZE_VERSION
      || value.bindingDigest !== digestEvidence(binding) || !safeId(value.leaseId)
      || value.sourceGeneration !== binding.sourceGeneration
      || canonicalJson(domains) !== canonicalJson(GATE6C_REQUIRED_DOMAINS)
      || value.selectedWritesFrozen !== true || value.legacyReadsAvailable !== true
      || value.status !== "active" || value.privateValuesIncluded !== false
      || !Number.isFinite(Date.parse(value.issuedAt)) || !Number.isFinite(Date.parse(value.expiresAt))
      || Date.parse(value.issuedAt) > now.getTime() || Date.parse(value.expiresAt) <= now.getTime()) {
    throw coded("gate6c-freeze-lease-invalid", "The selected-write freeze lease is absent, expired, or invalid.");
  }
  rejectPrivateFields(value);
  return Object.freeze({ ...structuredClone(value), selectedDomains: Object.freeze(domains) });
}

function aggregate(value, label) {
  if (!exactKeys(value, ["count", "logicalDigest"]) || !Number.isInteger(value.count)
      || value.count < 0 || !hex64(value.logicalDigest)) {
    throw coded("gate6c-aggregate-invalid", `The ${label} aggregate is invalid.`);
  }
  return { count: value.count, logicalDigest: value.logicalDigest };
}

export function assertOwnerAggregateInventory(value, { binding } = {}) {
  assertBinding(binding);
  const keys = ["schemaVersion", "bindingDigest", "sourceCommit", "sourceBranch", "trackedClean",
    "sourcePinsVerified", "twoPassDeterministic", "settingValueAllowed", "selectedReceiptClassified",
    "domains", "deferredStoresOpened", "sourceModified", "privateValuesIncluded"];
  if (!exactKeys(value, keys) || value.schemaVersion !== GATE6C_INVENTORY_VERSION
      || value.bindingDigest !== digestEvidence(binding) || value.sourceCommit !== binding.sourceGeneration
      || value.sourceBranch !== "main" || value.trackedClean !== true || value.sourcePinsVerified !== true
      || value.twoPassDeterministic !== true || value.settingValueAllowed !== true
      || value.selectedReceiptClassified !== true || value.deferredStoresOpened !== false
      || value.sourceModified !== false || value.privateValuesIncluded !== false) {
    throw coded("gate6c-owner-inventory-invalid", "The owner aggregate inventory is not green.");
  }
  const names = Object.keys(value.domains ?? {}).sort();
  if (canonicalJson(names) !== canonicalJson(GATE6C_REQUIRED_DOMAINS)) {
    throw coded("gate6c-domain-set-invalid", "The inventory must contain exactly the selected domains.");
  }
  const domains = Object.fromEntries(names.map(name => [name, aggregate(value.domains[name], name)]));
  rejectPrivateFields(value);
  return Object.freeze({ ...structuredClone(value), domains: Object.freeze(domains) });
}

export function assertExactDomainPair(value, label) {
  if (!exactKeys(value, ["sourceCount", "targetCount", "sourceDigest", "targetDigest"])
      || !Number.isInteger(value.sourceCount) || value.sourceCount < 0
      || !Number.isInteger(value.targetCount) || value.targetCount < 0
      || !hex64(value.sourceDigest) || !hex64(value.targetDigest)
      || value.sourceCount !== value.targetCount || value.sourceDigest !== value.targetDigest) {
    throw coded("gate6c-domain-reconciliation-failed", `${label} did not reconcile exactly.`);
  }
  return Object.freeze(structuredClone(value));
}

export function bindingDigest(binding) { return digestEvidence(assertBinding(binding)); }
