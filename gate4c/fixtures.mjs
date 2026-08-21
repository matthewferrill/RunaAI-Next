import { legacyStableDigest } from "../gate4b/contracts.mjs";
import { buildGate4bPlan } from "../gate4b/migration.mjs";
import { GATE4B_SNAPSHOT_VERSION, LEGACY_ENTRY_VERSION } from "../gate4b/contracts.mjs";
import { PARTICIPANT, SOURCE_COMMIT, testCipher } from "../gate4b/fixtures.mjs";
import { acceptedSourceFromPlan } from "./source.mjs";

export const NOW = "2026-08-21T15:00:00.000Z";
export const PROJECTION_PRIVATE_CANARY = "PRIVATE_PROJECTION_CANARY_4C";
const JOURNAL_ID = "2".repeat(32);
const integrity = id => legacyStableDigest({ id });

export function learningEvent(id, { lesson = `${PROJECTION_PRIVATE_CANARY} ${id}`, scope = "global", scopeId = null,
  eventType = "direct-teaching", limitations = [], mustNotApply = [], corrects = [],
  expiresAt = null, deletionRequiredBy = null } = {}) {
  return { schemaVersion: "runa-learning-event/v0", eventId: id, integrity: integrity(id), eventType,
    source: { sourceType: "synthetic", references: [] }, authority: { status: "synthetic" },
    scope: { proposedReuse: scope, personId: scope === "personal" ? scopeId : null,
      projectId: scope === "project" ? scopeId : null, capabilityId: scope === "capability" ? scopeId : null },
    destination: { tier: scope }, approval: { state: "unapproved-candidate" },
    candidate: { lesson, limitations, mustNotApply }, statement: { summary: "synthetic" },
    task: { intent: "synthetic" }, evidence: [], relationships: { corrects },
    lifecycle: { retentionClass: "synthetic", expiresAt, deletionRequiredBy } };
}
export function approval(id, targetEventId, action = "approve", targetApprovalId = null, effectiveAt = "2026-08-21T14:00:00.000Z") {
  return { approvalId: id, action, targetEventId, targetIntegrity: integrity(targetEventId), targetApprovalId,
    actorId: "founder-steward", rationale: "Synthetic approval", effectiveAt };
}
export function lifecycle(action, targetEventId, { replacementEventId = null, effectiveAt = "2026-08-21T14:30:00.000Z" } = {}) {
  return { action, targetEventId, replacementEventId, reason: "Synthetic lifecycle", actorId: "founder-steward", effectiveAt };
}

export function makeProjectionSnapshot(payloads, { sourceSnapshotId = "synthetic-projection-1" } = {}) {
  let prior = null; const entries = payloads.map(([kind, payload], index) => { const entry = { formatVersion: LEGACY_ENTRY_VERSION,
    journalId: JOURNAL_ID, entryId: (index + 1).toString(16).padStart(32, "0"), sequence: index + 1,
    kind, recordedAt: new Date(Date.UTC(2026, 7, 21, 12, index, 0)).toISOString(), previousEntryDigest: prior,
    payloadDigest: legacyStableDigest(payload), payload: structuredClone(payload), entryDigest: "" };
    entry.entryDigest = legacyStableDigest(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "entryDigest"))); prior = entry.entryDigest; return entry; });
  return { schemaVersion: GATE4B_SNAPSHOT_VERSION, sourceSnapshotId, participantId: PARTICIPANT,
    sourceCommit: SOURCE_COMMIT, predecessorManifestHmac: null, journalId: JOURNAL_ID, entries };
}

export function acceptedFixture(payloads, { cipher = testCipher(), sourceSnapshotId } = {}) {
  const snapshot = makeProjectionSnapshot(payloads, { sourceSnapshotId });
  const plan = buildGate4bPlan(snapshot, cipher, { runId: `projection-${sourceSnapshotId ?? "default"}` });
  return { cipher, snapshot, plan, source: acceptedSourceFromPlan(snapshot, plan) };
}

export function approvedEvent(id, options = {}, approvalId = `approval-${id}`) { return [["learning-event", learningEvent(id, options)], ["approval", approval(approvalId, id)]]; }
