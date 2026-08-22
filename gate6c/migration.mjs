import { createHmac } from "node:crypto";
import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { canonicalSnapshotManifest as canonicalProjectChat, parseGate4aSnapshot } from "../gate4/contracts.mjs";
import { buildGate4aPlan } from "../gate4/migration.mjs";
import { canonicalSnapshotManifest as canonicalLearning, parseGate4bSnapshot } from "../gate4b/contracts.mjs";
import { buildGate4bPlan } from "../gate4b/migration.mjs";
import { mapLegacySettingsRecord } from "../gate4d/settings-migration.mjs";
import { assertBackupProof, assertBinding, assertFreezeLease, assertOwnerAggregateInventory,
  bindingDigest, rejectPrivateFields } from "./contracts.mjs";
import { assertOwnerCeremonyComplete } from "./ceremony.mjs";
import { GATE6C_REQUIRED_DOMAINS } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const allowed = new Set(["Low", "Medium", "High"]);
const safeId = value => /^[A-Za-z0-9._:-]{1,160}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));

function keyedDigest(key, value) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw coded("gate6c-reconciliation-key-invalid", "A memory-only reconciliation key is required.");
  return createHmac("sha256", key).update(canonicalJson(value)).digest("hex");
}

function normalizeReceipt(value) {
  const keys = ["schemaVersion", "sourceReceiptDigest", "occurredAt", "beforeValue", "afterValue", "status"];
  if (!value || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")
      || value.schemaVersion !== "runa2-gate6c-selected-receipt-source/v1"
      || !hex64(value.sourceReceiptDigest) || !Number.isFinite(Date.parse(value.occurredAt))
      || !allowed.has(value.beforeValue) || !allowed.has(value.afterValue)
      || value.beforeValue === value.afterValue || value.status !== "executed") {
    throw coded("gate6c-selected-receipt-invalid", "A selected setting receipt is malformed or unclassified.");
  }
  rejectPrivateFields(value);
  return structuredClone(value);
}

function receiptRecord(receipt, participantId, cipher) {
  const locatorHmac = cipher.digest({ domain: "action-receipts", sourceReceiptDigest: receipt.sourceReceiptDigest });
  const targetId = `legacy-setting-receipt:${locatorHmac.slice(0, 40)}`;
  const publicData = { sourceReceiptDigest: receipt.sourceReceiptDigest, occurredAt: receipt.occurredAt,
    status: receipt.status, actionKind: "set-default-intelligence-level" };
  const privateData = { beforeValue: receipt.beforeValue, afterValue: receipt.afterValue };
  const context = { recordType: "migrated-setting-receipt", participantId, recordId: targetId,
    field: "private-payload" };
  return Object.freeze({ targetId, participantId, locatorHmac,
    contentHmac: cipher.digest({ domain: "action-receipts", publicData, privateData }),
    publicData, privateEnvelope: cipher.encrypt(context, privateData) });
}

function domain(count, logicalDigest) { return Object.freeze({ count, logicalDigest }); }

export function buildGate6cFinalDeltaPlan(input, { coreCipher, learningCipher,
  reconciliationKey }) {
  const binding = assertBinding(input.binding);
  if (!safeId(input.runId) || !coreCipher?.encrypt || !coreCipher?.digest
      || !learningCipher?.encrypt || !learningCipher?.digest) {
    throw coded("gate6c-final-delta-input-invalid", "The final-delta authority, run, or target ciphers are invalid.");
  }
  const projectChat = parseGate4aSnapshot(input.projectChatSnapshot);
  const learning = parseGate4bSnapshot(input.learningSnapshot);
  if (projectChat.participantId !== learning.participantId) {
    throw coded("gate6c-participant-mismatch", "Selected protected domains belong to different participants.");
  }
  if (learning.sourceCommit !== binding.sourceGeneration) {
    throw coded("gate6c-source-generation-drift", "The learning snapshot does not belong to the frozen source generation.");
  }
  const setting = mapLegacySettingsRecord(input.legacySetting);
  if (!setting.sourceValueAccepted && !(input.legacySetting === null && setting.defaultApplied)) {
    throw coded("gate6c-setting-source-invalid", "The final protected setting must be explicit or a proven absent-source default.");
  }
  const receipts = (input.selectedReceipts ?? []).map(normalizeReceipt)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)
      || left.sourceReceiptDigest.localeCompare(right.sourceReceiptDigest));
  if (new Set(receipts.map(item => item.sourceReceiptDigest)).size !== receipts.length) {
    throw coded("gate6c-selected-receipt-duplicate", "Selected action receipts must be unique.");
  }
  const projectPlan = buildGate4aPlan(projectChat, coreCipher);
  const learningPlan = buildGate4bPlan(learning, learningCipher, { runId: `${input.runId}:learning-events` });
  const receiptRecords = receipts.map(receipt => receiptRecord(receipt, projectChat.participantId, coreCipher));
  const canonicalDomains = {
    "project-chat": JSON.parse(canonicalProjectChat(projectChat)),
    "learning-events": JSON.parse(canonicalLearning(learning)),
    setting: setting.values,
    "action-receipts": receipts,
  };
  const domains = Object.freeze({
    "project-chat": domain(projectPlan.records.length, keyedDigest(reconciliationKey, canonicalDomains["project-chat"])),
    "learning-events": domain(learningPlan.records.length, keyedDigest(reconciliationKey, canonicalDomains["learning-events"])),
    setting: domain(1, keyedDigest(reconciliationKey, canonicalDomains.setting)),
    "action-receipts": domain(receiptRecords.length, keyedDigest(reconciliationKey, canonicalDomains["action-receipts"])),
  });
  const base = { schemaVersion: "runa2-gate6c-final-delta-plan/v1", runId: input.runId,
    binding: structuredClone(binding), bindingDigest: bindingDigest(binding), participantId: projectChat.participantId,
    projectChatPlan: { ...projectPlan, runId: `${input.runId}:project-chat`, mode: "cutover",
      domain: "project-chat", domainVersion: "runa2-gate4a/v1", sourceCommit: binding.sourceGeneration,
      targetCommit: binding.releaseCommit, sourceSnapshotDigest: projectPlan.manifestHmac },
    learningPlan, setting: { key: "defaultIntelligenceLevel",
      value: setting.values.defaultIntelligenceLevel, revision: 1 }, receiptRecords,
    domains, deferredStoresOpened: false, plaintextPersisted: false, privateValuesIncluded: false };
  const planDigest = sha256(canonicalJson({ ...base, projectChatPlan: { ...base.projectChatPlan,
    records: base.projectChatPlan.records.map(record => ({ kind: record.kind, targetId: record.targetId,
      locatorHmac: record.locatorHmac, contentHmac: record.contentHmac })) },
  learningPlan: { ...learningPlan, records: learningPlan.records.map(record => ({ sequence: record.sequence,
    targetId: record.targetId, sourceEntryDigest: record.sourceEntryDigest })) },
  receiptRecords: receiptRecords.map(record => ({ targetId: record.targetId,
    locatorHmac: record.locatorHmac, contentHmac: record.contentHmac })) }));
  return Object.freeze({ ...base, planDigest });
}

export class Gate6cFinalDeltaService {
  constructor({ store, coreCipher, learningCipher, reconciliationKey, now = () => new Date() }) {
    if (!store?.commitFinalDelta || !store?.rollbackRun) throw coded("gate6c-target-store-required", "A retained target store is required.");
    this.store = store; this.coreCipher = coreCipher; this.learningCipher = learningCipher;
    this.reconciliationKey = reconciliationKey; this.now = now;
  }

  async stage(input, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const binding = assertBinding(input.binding);
    assertOwnerCeremonyComplete(input.ownerCeremony, binding);
    assertBackupProof(input.backupProof, { binding, now: this.now() });
    assertFreezeLease(input.freezeLease, { binding, now: this.now() });
    const inventory = assertOwnerAggregateInventory(input.inventory, { binding });
    const plan = buildGate6cFinalDeltaPlan(input, { coreCipher: this.coreCipher,
      learningCipher: this.learningCipher, reconciliationKey: this.reconciliationKey });
    for (const name of GATE6C_REQUIRED_DOMAINS) {
      if (inventory.domains[name].count !== plan.domains[name].count
          || inventory.domains[name].logicalDigest !== plan.domains[name].logicalDigest) {
        throw coded("gate6c-inventory-delta-drift", `The protected ${name} capture changed after inventory.`);
      }
    }
    return this.store.commitFinalDelta(plan, { failBeforeCommit, failAfterCommit });
  }

  rollback(input) {
    if (input.targetAuthoritative !== false || input.legacyRuntimeVerified !== true
        || input.selectedWritesStillFrozen !== true) {
      throw coded("gate6c-rollback-boundary-invalid", "Pre-promotion rollback requires verified legacy and an unbroken write freeze.");
    }
    return this.store.rollbackRun(input.runId);
  }
}
