import { canonicalSnapshotManifest, parseGate4bSnapshot, TARGET_INDEX_RECORD_VERSION, TARGET_JOURNAL_RECORD_VERSION } from "./contracts.mjs";
const coded = (code, message) => Object.assign(new Error(message), { code });
function semanticReference(entry) {
  if (entry.kind === "learning-event") return { type: "event", value: entry.payload.eventId };
  if (entry.kind === "outcome-feedback") return { type: "outcome", value: entry.payload.linkId };
  if (entry.kind === "lifecycle") return { type: "event", value: entry.payload.targetEventId };
  if (entry.kind === "approval") return { type: "approval", value: entry.payload.approvalId };
  return { type: "approval-batch", value: entry.payload.batchId };
}
function indexMetadata(entry, cipher) {
  const reference = semanticReference(entry); const common = { schemaVersion: TARGET_INDEX_RECORD_VERSION, sequence: entry.sequence, entryKind: entry.kind, recordedAt: entry.recordedAt, referenceType: reference.type, referenceHmac: cipher.digest({ type: reference.type, value: reference.value }) };
  if (entry.kind === "learning-event") return { ...common, eventType: entry.payload.eventType, destination: entry.payload.destination?.tier, scope: entry.payload.scope?.proposedReuse, authorityState: entry.payload.approval?.state };
  if (entry.kind === "outcome-feedback") return { ...common, targetEventHmac: cipher.digest({ type: "event", value: entry.payload.outcomeEventRef.eventId }) };
  if (entry.kind === "lifecycle" || entry.kind === "approval") return { ...common, action: entry.payload.action, targetEventHmac: cipher.digest({ type: "event", value: entry.payload.targetEventId }) };
  return { ...common, action: "approve", approvalCount: entry.payload.approvals.length };
}
function counts(entries) { const byKind = Object.fromEntries(["learning-event", "outcome-feedback", "lifecycle", "approval", "approval-batch"].map(kind => [kind, 0])); for (const entry of entries) byKind[entry.kind] += 1; return { entries: entries.length, byKind }; }
export function buildGate4bPlan(rawSnapshot, cipher, { runId = "gate4b-run" } = {}) {
  if (!cipher?.encrypt || !cipher?.digest) throw coded("migration-cipher-required", "An authenticated application envelope is required.");
  if (!String(runId).trim()) throw coded("migration-run-id-invalid", "A run id is required.");
  const snapshot = parseGate4bSnapshot(rawSnapshot); const manifestHmac = cipher.digest({ domain: "learning-events", manifest: canonicalSnapshotManifest(snapshot) });
  const records = snapshot.entries.map(entry => { const targetId = cipher.digest({ type: "journal-entry", journalId: snapshot.journalId, entryId: entry.entryId }); const context = { recordType: "learning-journal-entry", participantId: snapshot.participantId, recordId: targetId, field: "legacy-entry" }; return { schemaVersion: TARGET_JOURNAL_RECORD_VERSION, participantId: snapshot.participantId, targetId, sequence: entry.sequence, entryKind: entry.kind, sourceEntryDigest: entry.entryDigest, previousSourceEntryDigest: entry.previousEntryDigest, privateEnvelope: cipher.encrypt(context, entry) }; });
  const indexes = snapshot.entries.map(entry => indexMetadata(entry, cipher));
  return Object.freeze({ runId: String(runId), sourceSnapshotId: snapshot.sourceSnapshotId, participantId: snapshot.participantId, sourceCommit: snapshot.sourceCommit, predecessorManifestHmac: snapshot.predecessorManifestHmac, manifestHmac, sourceHeadDigest: snapshot.entries.at(-1)?.entryDigest ?? null, sourceEntryDigests: snapshot.entries.map(entry => entry.entryDigest), records: Object.freeze(records), indexes: Object.freeze(indexes), counts: counts(snapshot.entries), projectionActivated: false });
}
export class Gate4bMigrationService { constructor({ store, cipher }) { if (!store?.commitSnapshot) throw coded("migration-store-required", "A target store is required."); this.store = store; this.cipher = cipher; } async migrate(snapshot, options = {}) { return this.store.commitSnapshot(buildGate4bPlan(snapshot, this.cipher, options), options); } }
