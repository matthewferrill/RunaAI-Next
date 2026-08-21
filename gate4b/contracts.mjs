import { z } from "zod";
import { canonicalJson, sha256 } from "../gate4/canonical.mjs";

export const GATE4B_SNAPSHOT_VERSION = "runa2-gate4b-learning-snapshot/v1";
export const LEGACY_ENTRY_VERSION = "runa-learning-event-journal-entry/v1";
export const TARGET_JOURNAL_RECORD_VERSION = "runa2-learning-journal-record/v1";
export const TARGET_INDEX_RECORD_VERSION = "runa2-learning-index-record/v1";

const coded = (code, message) => Object.assign(new Error(message), { code });
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/);
const hexId = z.string().regex(/^[a-f0-9]{32}$/);
const dateTime = z.string().datetime();
const payload = z.record(z.string(), z.unknown());

const entrySchema = z.object({
  formatVersion: z.literal(LEGACY_ENTRY_VERSION), journalId: hexId, entryId: hexId,
  sequence: z.number().int().positive(), kind: z.enum(["learning-event", "outcome-feedback", "lifecycle", "approval", "approval-batch"]),
  recordedAt: dateTime, previousEntryDigest: digest.nullable(), payloadDigest: digest,
  payload, entryDigest: digest,
}).strict();

const snapshotSchema = z.object({
  schemaVersion: z.literal(GATE4B_SNAPSHOT_VERSION),
  sourceSnapshotId: z.string().regex(/^[A-Za-z0-9._:-]+$/).max(160),
  participantId: z.string().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  predecessorManifestHmac: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  journalId: hexId, entries: z.array(entrySchema).max(1_000_000),
}).strict();

export function legacyStableDigest(value) { return `sha256:${sha256(canonicalJson(value))}`; }
function withoutEntryDigest(entry) { const copy = structuredClone(entry); delete copy.entryDigest; return copy; }
function requireId(value, label) {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw coded("migration-source-lineage-invalid", `${label} is missing or invalid.`);
  return parsed.data;
}
function approvalItems(entry) {
  if (entry.kind === "approval") return [entry.payload];
  if (entry.kind !== "approval-batch" || !Array.isArray(entry.payload.approvals)
      || entry.payload.approvals.length < 1 || entry.payload.approvals.length > 25) {
    throw coded("migration-source-lineage-invalid", "An approval batch must contain one through 25 approvals.");
  }
  return entry.payload.approvals;
}
function assertLineage(entries) {
  const events = new Map(); const outcomes = new Set(); const approvals = new Map();
  for (const entry of entries) {
    const value = entry.payload;
    if (entry.kind === "learning-event") {
      const eventId = requireId(value.eventId, "learning event id");
      if (events.has(eventId) || !digest.safeParse(value.integrity).success) throw coded("migration-source-lineage-invalid", "Learning event identity or integrity is invalid or duplicated.");
      events.set(eventId, value);
    } else if (entry.kind === "outcome-feedback") {
      const linkId = requireId(value.linkId, "outcome link id"); const target = requireId(value.outcomeEventRef?.eventId, "outcome event reference");
      if (outcomes.has(linkId) || !events.has(target)) throw coded("migration-source-lineage-invalid", "Outcome feedback must name a unique link and an earlier event.");
      outcomes.add(linkId);
    } else if (entry.kind === "lifecycle") {
      const target = requireId(value.targetEventId, "lifecycle target");
      if (!events.has(target)) throw coded("migration-source-lineage-invalid", "Lifecycle history must name an earlier event.");
      if (value.action === "correct" && !events.has(requireId(value.replacementEventId, "correction replacement"))) throw coded("migration-source-lineage-invalid", "A correction replacement must already exist.");
    } else {
      for (const item of approvalItems(entry)) {
        const approvalId = requireId(item.approvalId, "approval id"); const target = requireId(item.targetEventId, "approval target"); const event = events.get(target);
        if (approvals.has(approvalId) || !event || item.targetIntegrity !== event.integrity) throw coded("migration-source-lineage-invalid", "Approval history must bind a unique approval to an earlier exact event.");
        if (item.action !== "approve") {
          const prior = approvals.get(requireId(item.targetApprovalId, "approval lifecycle target"));
          if (!prior || prior.action !== "approve" || prior.targetEventId !== target) throw coded("migration-source-lineage-invalid", "Revocation or expiration must bind an earlier approval for the same event.");
        }
        approvals.set(approvalId, item);
      }
    }
  }
}

export function parseGate4bSnapshot(raw) {
  let snapshot;
  try { snapshot = snapshotSchema.parse(raw); } catch (error) { throw coded("migration-source-invalid", error.message); }
  const entryIds = new Set(); let prior = null;
  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const entry = snapshot.entries[index];
    if (entry.journalId !== snapshot.journalId || entry.sequence !== index + 1 || entry.previousEntryDigest !== prior || entryIds.has(entry.entryId)) throw coded("migration-source-chain-invalid", "The source journal sequence, journal identity, or prior-entry link is invalid.");
    if (legacyStableDigest(entry.payload) !== entry.payloadDigest || legacyStableDigest(withoutEntryDigest(entry)) !== entry.entryDigest) throw coded("migration-source-digest-invalid", "The source journal payload or entry digest is invalid.");
    entryIds.add(entry.entryId); prior = entry.entryDigest;
  }
  assertLineage(snapshot.entries);
  return structuredClone(snapshot);
}

export function canonicalSnapshotManifest(snapshot) {
  return canonicalJson({ schemaVersion: snapshot.schemaVersion, sourceSnapshotId: snapshot.sourceSnapshotId,
    participantId: snapshot.participantId, sourceCommit: snapshot.sourceCommit,
    journalId: snapshot.journalId, entries: snapshot.entries });
}
