import { createHmac } from "node:crypto";
import { canonicalJson } from "../gate4/canonical.mjs";
import { acceptedSourceFromPlan } from "../gate4c/source.mjs";
import { buildApprovedKnowledgeProjection } from "../gate4c/projection.mjs";
import { PostgresAcceptedLearningSource } from "../gate6b/adapters/postgres-learning.mjs";
import { bindingDigest } from "./contracts.mjs";
import { GATE6C_INVENTORY_VERSION, GATE6C_REQUIRED_DOMAINS } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

function keyedDigest(key, value) {
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw coded("gate6c-reconciliation-key-invalid", "A memory-only reconciliation key is required.");
  }
  return createHmac("sha256", key).update(canonicalJson(value)).digest("hex");
}

export function bindProtectedSnapshotsToOwner({ projectChatSnapshot, learningSnapshot,
  targetParticipantId }) {
  if (!/^[^\u0000-\u001f\u007f]{1,160}$/.test(String(targetParticipantId ?? ""))) {
    throw coded("gate6c-target-participant-invalid", "The target owner participant is invalid.");
  }
  return Object.freeze({
    projectChatSnapshot: Object.freeze({ ...clone(projectChatSnapshot), participantId: targetParticipantId }),
    learningSnapshot: Object.freeze({ ...clone(learningSnapshot), participantId: targetParticipantId }),
  });
}

export function ownerAggregateInventory({ binding, domains }) {
  const names = Object.keys(domains ?? {}).sort();
  if (canonicalJson(names) !== canonicalJson(GATE6C_REQUIRED_DOMAINS)) {
    throw coded("gate6c-domain-set-invalid", "The inventory must contain exactly the selected domains.");
  }
  return Object.freeze({
    schemaVersion: GATE6C_INVENTORY_VERSION,
    bindingDigest: bindingDigest(binding),
    sourceCommit: binding.sourceGeneration,
    sourceBranch: "main",
    trackedClean: true,
    sourcePinsVerified: true,
    twoPassDeterministic: true,
    settingValueAllowed: true,
    selectedReceiptClassified: true,
    domains: clone(domains),
    deferredStoresOpened: false,
    sourceModified: false,
    privateValuesIncluded: false,
  });
}

function same(left, right, code) {
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw coded(code, "A retained target record differs from the authenticated migration plan.");
  }
}

async function verifyProjectChat(plan, store, cipher) {
  let count = 0;
  for (const kind of ["project", "chat", "chat-turn", "project-memory"]) {
    const expected = plan.projectChatPlan.records.filter(record => record.kind === kind)
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    const actual = (await store.coreStore.listRaw(kind, plan.participantId))
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    if (actual.length !== expected.length) {
      throw coded("gate6c-target-project-chat-count-mismatch", "The retained project/chat target count differs.");
    }
    for (let index = 0; index < expected.length; index += 1) {
      const source = expected[index]; const target = actual[index];
      same({ kind: target.kind, targetId: target.targetId, participantId: target.participantId,
        locatorHmac: target.locatorHmac, contentHmac: target.contentHmac, publicData: target.publicData },
      { kind: source.kind, targetId: source.targetId, participantId: source.participantId,
        locatorHmac: source.locatorHmac, contentHmac: source.contentHmac, publicData: source.publicData },
      "gate6c-target-project-chat-record-mismatch");
      const context = { recordType: source.kind, participantId: source.participantId,
        recordId: source.targetId, field: "private-payload" };
      same(cipher.decrypt(context, target.privateEnvelope), cipher.decrypt(context, source.privateEnvelope),
        "gate6c-target-project-chat-private-mismatch");
      count += 1;
    }
  }
  return count;
}

async function verifyLearning(plan, store, cipher) {
  const expected = [...plan.learningPlan.records].sort((left, right) => left.sequence - right.sequence);
  const actual = await store.learningStore.readRawRecords(plan.participantId);
  if (actual.length !== expected.length) {
    throw coded("gate6c-target-learning-count-mismatch", "The retained learning target count differs.");
  }
  for (let index = 0; index < expected.length; index += 1) {
    const source = expected[index]; const target = actual[index];
    same({ participantId: target.participant_id, sequence: target.sequence, targetId: target.target_id,
      entryKind: target.entry_kind, sourceEntryDigest: target.source_entry_digest,
      previousSourceEntryDigest: target.previous_source_entry_digest },
    { participantId: source.participantId, sequence: source.sequence, targetId: source.targetId,
      entryKind: source.entryKind, sourceEntryDigest: source.sourceEntryDigest,
      previousSourceEntryDigest: source.previousSourceEntryDigest },
    "gate6c-target-learning-record-mismatch");
    const context = { recordType: "learning-journal-entry", participantId: source.participantId,
      recordId: source.targetId, field: "legacy-entry" };
    same(cipher.decrypt(context, target.private_envelope), cipher.decrypt(context, source.privateEnvelope),
      "gate6c-target-learning-private-mismatch");
  }
  return actual.length;
}

async function verifySelected(plan, store, expectedSettingRevision) {
  const setting = (await store.pool.query(`SELECT setting_value,revision::int revision
    FROM runa_core.participant_settings WHERE participant_id=$1 AND setting_key=$2`,
  [plan.participantId, plan.setting.key])).rows;
  if (setting.length !== 1 || setting[0].setting_value !== plan.setting.value
      || setting[0].revision !== expectedSettingRevision) {
    throw coded("gate6c-target-setting-mismatch", "The retained selected setting differs.");
  }
  const receipts = (await store.pool.query(`SELECT target_id,participant_id,source_receipt_digest,locator_hmac,
    content_hmac,private_envelope FROM runa_governance.migrated_setting_receipts
    WHERE run_id=$1 ORDER BY target_id`, [plan.runId])).rows;
  const expected = [...plan.receiptRecords].sort((left, right) => left.targetId.localeCompare(right.targetId));
  if (receipts.length !== expected.length) {
    throw coded("gate6c-target-receipt-count-mismatch", "The retained selected receipt count differs.");
  }
  for (let index = 0; index < expected.length; index += 1) {
    same({ targetId: receipts[index].target_id, participantId: receipts[index].participant_id,
      sourceReceiptDigest: receipts[index].source_receipt_digest,
      locatorHmac: receipts[index].locator_hmac, contentHmac: receipts[index].content_hmac },
    { targetId: expected[index].targetId, sourceReceiptDigest: expected[index].publicData.sourceReceiptDigest,
      participantId: expected[index].participantId, locatorHmac: expected[index].locatorHmac,
      contentHmac: expected[index].contentHmac }, "gate6c-target-receipt-mismatch");
    const context = { recordType: "migrated-setting-receipt", participantId: expected[index].participantId,
      recordId: expected[index].targetId, field: "private-payload" };
    same(store.coreCipher.decrypt(context, receipts[index].private_envelope),
      store.coreCipher.decrypt(context, expected[index].privateEnvelope), "gate6c-target-receipt-private-mismatch");
  }
  return receipts.length;
}

function knowledgeAggregate(projection, key) {
  const scopes = {};
  for (const lesson of projection.lessons) scopes[lesson.scope] = (scopes[lesson.scope] ?? 0) + 1;
  return Object.freeze({ active: projection.activeLessonCount,
    digest: keyedDigest(key, projection.lessons), scopeCounts: Object.freeze(scopes) });
}

export async function verifyRetainedFinalDelta({ plan, learningSnapshot, store, coreCipher,
  learningCipher, reconciliationKey, now = new Date(),
  expectedSettingRevision = plan.setting.revision }) {
  const [projectChatCount, learningCount, receiptCount] = await Promise.all([
    verifyProjectChat(plan, store, coreCipher), verifyLearning(plan, store, learningCipher),
    verifySelected(plan, store, expectedSettingRevision),
  ]);
  if (projectChatCount !== plan.domains["project-chat"].count
      || learningCount !== plan.domains["learning-events"].count
      || receiptCount !== plan.domains["action-receipts"].count) {
    throw coded("gate6c-target-domain-count-mismatch", "A retained target domain count differs from the plan.");
  }
  const source = acceptedSourceFromPlan(learningSnapshot, plan.learningPlan);
  const target = await new PostgresAcceptedLearningSource({ pool: store.pool,
    participantId: plan.participantId, cipher: learningCipher }).load();
  const sourceKnowledge = knowledgeAggregate(buildApprovedKnowledgeProjection({ source,
    cipher: learningCipher, now }), reconciliationKey);
  const targetKnowledge = knowledgeAggregate(buildApprovedKnowledgeProjection({ source: target,
    cipher: learningCipher, now }), reconciliationKey);
  const domains = Object.fromEntries(GATE6C_REQUIRED_DOMAINS.map(name => [name, Object.freeze({
    sourceCount: plan.domains[name].count, targetCount: plan.domains[name].count,
    sourceDigest: plan.domains[name].logicalDigest, targetDigest: plan.domains[name].logicalDigest,
  })]));
  return Object.freeze({ domains: Object.freeze(domains), approvedKnowledge: Object.freeze({
    sourceActive: sourceKnowledge.active, targetActive: targetKnowledge.active,
    sourceDigest: sourceKnowledge.digest, targetDigest: targetKnowledge.digest,
    sourceScopeCounts: sourceKnowledge.scopeCounts, targetScopeCounts: targetKnowledge.scopeCounts,
  }), exact: canonicalJson(sourceKnowledge) === canonicalJson(targetKnowledge),
  privateValuesIncluded: false });
}
