import { canonicalSnapshotManifest, parseGate4bSnapshot } from "../gate4b/contracts.mjs";
import { GATE4C_ACCEPTED_SOURCE_VERSION } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function acceptedSourceFromPlan(snapshot, plan) {
  return Object.freeze({
    schemaVersion: GATE4C_ACCEPTED_SOURCE_VERSION,
    sourceSnapshotId: plan.sourceSnapshotId,
    participantId: plan.participantId,
    sourceCommit: plan.sourceCommit,
    predecessorManifestHmac: plan.predecessorManifestHmac,
    journalId: snapshot.journalId,
    manifestHmac: plan.manifestHmac,
    sourceHeadDigest: plan.sourceHeadDigest,
    records: Object.freeze(plan.records.map(record => structuredClone(record))),
  });
}

export function readAcceptedGate4bJournal(source, cipher) {
  if (!cipher?.decrypt || !cipher?.digest) throw coded("projection-cipher-required", "An authenticated Gate 4B envelope cipher is required.");
  if (!source || source.schemaVersion !== GATE4C_ACCEPTED_SOURCE_VERSION || !digest(source.manifestHmac)
      || !Array.isArray(source.records)) throw coded("projection-source-invalid", "The accepted Gate 4B source is invalid.");
  const ordered = [...source.records].sort((left, right) => left.sequence - right.sequence);
  const entries = ordered.map((record, index) => {
    if (record.sequence !== index + 1 || typeof record.targetId !== "string") throw coded("projection-source-chain-invalid", "The accepted target sequence is incomplete or duplicated.");
    const context = { recordType: "learning-journal-entry", participantId: source.participantId, recordId: record.targetId, field: "legacy-entry" };
    const entry = cipher.decrypt(context, record.privateEnvelope);
    if (entry.sequence !== record.sequence || entry.entryDigest !== record.sourceEntryDigest || entry.kind !== record.entryKind) throw coded("projection-source-record-mismatch", "An accepted target record does not match its authenticated journal entry.");
    return entry;
  });
  const snapshot = parseGate4bSnapshot({ schemaVersion: "runa2-gate4b-learning-snapshot/v1",
    sourceSnapshotId: source.sourceSnapshotId, participantId: source.participantId,
    sourceCommit: source.sourceCommit, predecessorManifestHmac: source.predecessorManifestHmac,
    journalId: source.journalId, entries });
  const manifestHmac = cipher.digest({ domain: "learning-events", manifest: canonicalSnapshotManifest(snapshot) });
  if (manifestHmac !== source.manifestHmac || (entries.at(-1)?.entryDigest ?? null) !== source.sourceHeadDigest) throw coded("projection-source-manifest-mismatch", "The journal head does not match the accepted Gate 4B manifest.");
  return Object.freeze({ snapshot, manifestHmac });
}
