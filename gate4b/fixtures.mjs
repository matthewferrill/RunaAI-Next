import { createEnvelopeCipher } from "../gate4/envelope.mjs";
import { GATE4B_SNAPSHOT_VERSION, LEGACY_ENTRY_VERSION, legacyStableDigest } from "./contracts.mjs";

export const PARTICIPANT = "matthew-owner";
export const JOURNAL_ID = "1".repeat(32);
export const SOURCE_COMMIT = "b4db04090d8f0df87234fab573b396e7824c5354";
export const PRIVATE_CANARY = "PRIVATE_LEARNING_CANARY_4B";

export function testCipher(options = {}) {
  return createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, 41), hmacKey: Buffer.alloc(32, 42), keyId: "gate4b-test-key", random: () => Buffer.alloc(12, 43), ...options });
}

function event(eventId, integrity, overrides = {}) {
  return { schemaVersion: "runa-learning-event/v0", eventId, integrity, eventType: "user-correction",
    source: { sourceType: "synthetic", references: [{ locator: `${PRIVATE_CANARY} source` }] }, authority: { status: "not-applicable-synthetic" },
    scope: { proposedReuse: "personal", personId: PARTICIPANT },
    destination: { tier: "personal" }, approval: { state: "unapproved-candidate" },
    candidate: { lesson: `${PRIVATE_CANARY} ${eventId}`, limitations: [], mustNotApply: [] },
    statement: { summary: `${PRIVATE_CANARY} statement` }, task: { intent: `${PRIVATE_CANARY} task` },
    evidence: [{ summary: `${PRIVATE_CANARY} evidence` }], relationships: { corrects: [] }, ...overrides };
}

function approval(approvalId, action, targetEventId, targetIntegrity, targetApprovalId = null) {
  return { approvalId, action, targetEventId, targetIntegrity, targetApprovalId,
    actorId: "founder-steward", rationale: `${PRIVATE_CANARY} approval rationale.`, effectiveAt: "2026-08-21T12:02:00.000Z" };
}

function rawPayloads({ extraEntry = false } = {}) {
  const integrityA = `sha256:${"a".repeat(64)}`; const integrityB = `sha256:${"b".repeat(64)}`;
  const values = [
    ["learning-event", event("event-alpha", integrityA)],
    ["outcome-feedback", { schemaVersion: "runa-outcome-feedback-link/v0", linkId: "outcome-alpha", outcomeEventRef: { eventId: "event-alpha", integrity: integrityA }, result: { status: "success", summary: `${PRIVATE_CANARY} outcome` } }],
    ["approval-batch", { batchId: "batch-alpha", approvals: [approval("approval-alpha", "approve", "event-alpha", integrityA)] }],
    ["learning-event", event("event-beta", integrityB, { relationships: { corrects: ["event-alpha"] } })],
    ["lifecycle", { action: "correct", targetEventId: "event-alpha", replacementEventId: "event-beta", reason: "Synthetic correction lineage.", actorId: "founder-steward", effectiveAt: "2026-08-21T12:04:00.000Z" }],
    ["approval", approval("approval-revoke-alpha", "revoke", "event-alpha", integrityA, "approval-alpha")],
  ];
  if (extraEntry) values.push(["learning-event", event("event-gamma", `sha256:${"c".repeat(64)}`, { eventType: "project-observation", scope: { proposedReuse: "project", projectId: "runaai-next" }, destination: { tier: "project" } })]);
  return values;
}

function makeEntries(options = {}) {
  const payloads = rawPayloads(options).map(([kind, payload]) => [kind, structuredClone(payload)]);
  options.mutatePayloads?.(payloads);
  let prior = null;
  return payloads.map(([kind, payload], index) => {
    const entry = { formatVersion: LEGACY_ENTRY_VERSION, journalId: JOURNAL_ID,
      entryId: (index + 1).toString(16).padStart(32, "0"), sequence: index + 1, kind,
      recordedAt: new Date(Date.UTC(2026, 7, 21, 12, index, 0)).toISOString(),
      previousEntryDigest: prior, payloadDigest: legacyStableDigest(payload), payload, entryDigest: "" };
    entry.entryDigest = legacyStableDigest(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "entryDigest")));
    prior = entry.entryDigest;
    return entry;
  });
}

export function makeSnapshot({ sourceSnapshotId = "synthetic-learning-1", predecessorManifestHmac = null,
  extraEntry = false, mutatePayloads = null, mutate = null } = {}) {
  const value = { schemaVersion: GATE4B_SNAPSHOT_VERSION, sourceSnapshotId, participantId: PARTICIPANT,
    sourceCommit: SOURCE_COMMIT, predecessorManifestHmac, journalId: JOURNAL_ID,
    entries: makeEntries({ extraEntry, mutatePayloads }) };
  return mutate ? mutate(structuredClone(value)) : value;
}
