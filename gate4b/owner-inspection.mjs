import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const coded = (code, message) => Object.assign(new Error(message), { code });
const ENTRY_FILE = /^(\d{12})-([a-f0-9]{32})\.runaenc$/;
const ENTRY_KINDS = ["learning-event", "outcome-feedback", "lifecycle", "approval", "approval-batch"];
const EVENT_TYPES = ["direct-teaching", "user-correction", "user-preference", "conversation-distillation", "decision-record", "project-observation", "procedure-demonstration", "tool-result", "verification-result", "task-outcome", "failure-or-incident", "external-source-claim", "structured-data-observation", "multimodal-observation", "teacher-model-proposal", "worker-result", "simulation-result", "retrieval-use", "routing-result", "freshness-check", "correction-or-retraction"];
const DESTINATIONS = ["session", "personal", "project", "capability", "global-approved", "evaluation", "ethical-amendment-proposal", "training-candidate", "unavailable-deleted"];
const SCOPES = ["session", "personal", "project", "capability", "global", "evaluation", "training-candidate", "unavailable-deleted"];
const LIFECYCLE_STATES = ["candidate-recorded", "corrected", "deleted", "deletion-required", "expired"];
const APPROVAL_STATES = ["active-until-revoked", "revoked-or-expired", "candidate-recorded", "corrected", "deleted", "deletion-required", "expired", "superseded-by-approved-correction"];

function integer(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw coded("inventory-aggregate-invalid", `${label} must be a non-negative integer.`);
  return value;
}
function bool(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "boolean") throw coded("inventory-aggregate-invalid", `${label} must be boolean.`);
  return value;
}
function allowedTally(raw, allowed, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw coded("inventory-aggregate-invalid", `${label} is invalid.`);
  const output = {};
  for (const key of allowed) if (Object.hasOwn(raw, key)) output[key] = integer(raw[key], `${label}.${key}`);
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) throw coded("inventory-aggregate-invalid", `${label} contains an unknown category.`);
  return output;
}
function legacyStore(raw, label, extras = []) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw coded("inventory-aggregate-invalid", `${label} is invalid.`);
  const output = { present: bool(raw.present, `${label}.present`, true), records: integer(raw.records, `${label}.records`, true), unreadable: integer(raw.unreadable, `${label}.unreadable`, true) };
  for (const key of extras) output[key] = integer(raw[key], `${label}.${key}`, true);
  return output;
}
function sanitizeAggregate(raw) {
  const journal = raw?.stores?.eventJournal;
  if (!journal || journal.present !== true) throw coded("inventory-aggregate-invalid", "The E6 journal aggregate is missing.");
  const output = {
    schemaVersion: "runa2-gate4b-owner-inventory-aggregate/v1",
    stores: {
      eventJournal: { present: true, entries: integer(journal.entries, "eventJournal.entries"),
        byKind: allowedTally(journal.byKind, ENTRY_KINDS, "eventJournal.byKind"),
        encryptedBytes: integer(journal.encryptedBytes, "eventJournal.encryptedBytes"),
        maximumEncryptedEntryBytes: integer(journal.maximumEncryptedEntryBytes, "eventJournal.maximumEncryptedEntryBytes"),
        unreadableEntries: integer(journal.unreadableEntries, "eventJournal.unreadableEntries"),
        integrityFindings: integer(journal.integrityFindings, "eventJournal.integrityFindings"),
        unresolvedLineage: integer(journal.unresolvedLineage, "eventJournal.unresolvedLineage") },
      legacyInboxE3: legacyStore(raw.stores.legacyInboxE3, "legacyInboxE3", ["tombstones"]),
      legacyReviewE4: legacyStore(raw.stores.legacyReviewE4, "legacyReviewE4", ["authorityRecords", "retrievalCapsules", "evaluationCapsules"]),
      legacyGrantE5: legacyStore(raw.stores.legacyGrantE5, "legacyGrantE5", ["events"]),
      deviceVault: legacyStore(raw.stores.deviceVault, "deviceVault"),
    },
    learningEvents: { byEventType: allowedTally(raw.learningEvents?.byEventType, EVENT_TYPES, "learningEvents.byEventType"),
      byDestination: allowedTally(raw.learningEvents?.byDestination, DESTINATIONS, "learningEvents.byDestination"),
      byScope: allowedTally(raw.learningEvents?.byScope, SCOPES, "learningEvents.byScope") },
    lifecycle: { byState: allowedTally(raw.lifecycle?.byState, LIFECYCLE_STATES, "lifecycle.byState"),
      held: integer(raw.lifecycle?.held, "lifecycle.held") },
    approvals: { totalEvents: integer(raw.approvals?.totalEvents, "approvals.totalEvents"),
      active: integer(raw.approvals?.active, "approvals.active"),
      byState: allowedTally(raw.approvals?.byState, APPROVAL_STATES, "approvals.byState"),
      actionCountsAvailable: false },
  };
  const stores = output.stores;
  output.passed = stores.eventJournal.unreadableEntries === 0 && stores.eventJournal.integrityFindings === 0
    && stores.eventJournal.unresolvedLineage === 0
    && [stores.legacyInboxE3, stores.legacyReviewE4, stores.legacyGrantE5, stores.deviceVault]
      .every(store => store.present === false || store.unreadable === 0);
  return output;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function tally(values) { const result = {}; for (const value of values) result[value] = (result[value] ?? 0) + 1; return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))); }
function moduleUrl(root, relative) { return pathToFileURL(join(root, relative)).href; }

function envelopeInventory(legacyRepo) {
  const root = resolve(legacyRepo, ".runaai-local", "state", "learning", "event-journal-v1", "entries");
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) throw coded("protected-inventory-entry-layout-invalid", "The journal entry directory is unavailable or unsafe.");
  const files = readdirSync(root); const byKind = Object.fromEntries(ENTRY_KINDS.map(kind => [kind, 0])); let bytes = 0; let maximum = 0;
  const ordered = files.map(name => { const match = ENTRY_FILE.exec(name); if (!match) throw coded("protected-inventory-entry-layout-invalid", "The journal entry layout contains an unexpected file."); return { name, sequence: Number(match[1]), entryId: match[2] }; }).sort((a, b) => a.sequence - b.sequence);
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index]; const path = join(root, item.name); const stats = lstatSync(path);
    if (item.sequence !== index + 1 || !stats.isFile() || stats.isSymbolicLink() || realpathSync(path) !== path || stats.size < 1 || stats.size > 1024 * 1024) throw coded("protected-inventory-entry-layout-invalid", "The journal entry layout is invalid.");
    let envelope; try { envelope = JSON.parse(readFileSync(path, "utf8")); } catch { throw coded("protected-inventory-entry-layout-invalid", "A journal envelope is unreadable."); }
    if (envelope.entryId !== item.entryId || envelope.sequence !== item.sequence || !ENTRY_KINDS.includes(envelope.kind)) throw coded("protected-inventory-entry-layout-invalid", "A journal envelope identity is invalid.");
    byKind[envelope.kind] += 1; bytes += stats.size; maximum = Math.max(maximum, stats.size);
  }
  return { entries: ordered.length, byKind, encryptedBytes: bytes, maximumEncryptedEntryBytes: maximum };
}

export function assertOwnerInventoryAuthority({ legacyRepo, nextRepo, expectedLegacyCommit, expectedNextCommit, sourcePins, exec = execFileSync }) {
  const run = (file, args, cwd = undefined) => String(exec(file, args, { cwd, encoding: "utf8", windowsHide: true })).trim();
  const legacy = resolve(legacyRepo); const next = resolve(nextRepo);
  const hostname = run("hostname", []).toLowerCase(); const identity = run("whoami", []).toLowerCase();
  if (hostname !== "runa-control" || identity !== "runa-control\\matthew") throw coded("inventory-owner-authority-mismatch", "The inventory requires Matthew on Runa-Control.");
  const git = (repo, ...args) => run("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "-C", repo, ...args]);
  if (git(legacy, "rev-parse", "HEAD") !== expectedLegacyCommit || git(legacy, "branch", "--show-current") !== "main" || git(legacy, "status", "--porcelain", "--untracked-files=no")) throw coded("inventory-legacy-authority-mismatch", "The legacy checkout authority does not match.");
  if (git(next, "rev-parse", "HEAD") !== expectedNextCommit || git(next, "branch", "--show-current") !== "runa2/gate-4b-learning-events-plan" || git(next, "status", "--porcelain", "--untracked-files=no")) throw coded("inventory-next-authority-mismatch", "The inventory checkout authority does not match.");
  for (const source of sourcePins.sources) if (git(legacy, "rev-parse", `HEAD:${source.path}`) !== source.gitBlobSha1) throw coded("inventory-source-pin-mismatch", "A reviewed legacy source pin changed.");
  return { legacyCommit: expectedLegacyCommit, nextCommit: expectedNextCommit, ownerIdentityVerified: true, sourcePinsVerified: true, clean: true };
}

export async function inspectProtectedLearningStores({ legacyRepo }) {
  const root = resolve(legacyRepo);
  const [{ createLearningDeviceVaultService }, { createLearningCenterService },
    { openLearningInboxStore }, { openLearningReviewStore }, { openApprovedKnowledgeE5GrantStore }] = await Promise.all([
    import(moduleUrl(root, "src/runa/learning-device-vault-service.mjs")),
    import(moduleUrl(root, "src/runa/learning-center-service.mjs")),
    import(moduleUrl(root, "src/runa/learning-inbox-store.mjs")),
    import(moduleUrl(root, "src/runa/learning-review-store.mjs")),
    import(moduleUrl(root, "src/runa/approved-knowledge-e5-grant-store.mjs")),
  ]);
  const vault = createLearningDeviceVaultService({ workspaceRoot: root }); const vaultStatus = vault.status();
  const center = createLearningCenterService({ workspaceRoot: root, credentialProvider: vault }); let journal;
  try {
    journal = center.openJournalForAuthorizedAdapter(); const integrity = journal.integrity(); const status = journal.status();
    const envelope = envelopeInventory(root); const events = []; let offset = 0;
    while (true) { const page = journal.listCandidateDetails({ offset, limit: 100 }); for (const item of page.items) events.push({ eventType: item.eventType, destination: item.event?.destination?.tier ?? "unavailable-deleted", scope: item.event?.scope?.proposedReuse ?? "unavailable-deleted", state: item.lifecycle.state, held: item.lifecycle.held }); if (!page.hasNext) break; offset = page.nextOffset; }
    const approvalStates = journal.listApprovedKnowledgeSummaries().map(item => item.state);
    let credentials = null; let inbox = null; let review = null; let grants = null;
    const e3Present = vaultStatus.e3StorePresent === true; const e4Present = vaultStatus.e4StorePresent === true;
    const e5Root = resolve(root, ".runaai-local", "state", "learning", "activation-v1"); const e5Present = existsSync(join(e5Root, "manifest.json"));
    let e3 = { present: e3Present, records: e3Present ? null : 0, tombstones: e3Present ? null : 0, unreadable: e3Present ? 1 : 0 };
    let e4 = { present: e4Present, records: e4Present ? null : 0, authorityRecords: e4Present ? null : 0, retrievalCapsules: e4Present ? null : 0, evaluationCapsules: e4Present ? null : 0, unreadable: e4Present ? 1 : 0 };
    let e5 = { present: e5Present, records: e5Present ? null : 0, events: e5Present ? null : 0, unreadable: e5Present ? 1 : 0 };
    try {
      if (vaultStatus.configured && (e3Present || e4Present || e5Present)) credentials = vault.credentialsForReview();
      if (e3Present) { inbox = openLearningInboxStore({ root: resolve(root, ".runaai-local", "state", "learning", "inbox-v1"), passphrase: credentials.e3Passphrase, sourceRoot: root }); const value = inbox.integrity(); e3 = { present: true, records: value.recordCount, tombstones: value.tombstoneCount, unreadable: value.healthy ? 0 : value.corruption.length || 1 }; }
      if (e4Present) { review = openLearningReviewStore({ root: resolve(root, ".runaai-local", "state", "learning", "review-v1"), passphrase: credentials.e4Passphrase }); const value = review.integrity(); e4 = { present: true, records: value.transactionCount, authorityRecords: value.authorityRecordCount, retrievalCapsules: value.retrievalCapsuleCount, evaluationCapsules: value.evaluationCapsuleCount, unreadable: value.healthy ? 0 : value.corruption.length || 1 }; }
      if (e5Present) { grants = openApprovedKnowledgeE5GrantStore({ root: e5Root, passphrase: credentials.e4Passphrase }); const value = grants.integrity(); e5 = { present: true, records: value.grantCount, events: value.eventCount, unreadable: value.healthy ? 0 : value.corruption.length || 1 }; }
    } finally { credentials = null; try { inbox?.lock(); } catch {} try { review?.lock(); } catch {} try { grants?.lock(); } catch {} }
    return { schemaVersion: "runa2-gate4b-owner-inventory-aggregate/v1", stores: {
      eventJournal: { present: true, ...envelope, unreadableEntries: integrity.healthy ? 0 : integrity.corruption.length || 1, integrityFindings: integrity.healthy ? 0 : integrity.corruption.length || 1, unresolvedLineage: integrity.healthy && status.entryCount === envelope.entries ? 0 : 1 },
      legacyInboxE3: e3, legacyReviewE4: e4, legacyGrantE5: e5,
      deviceVault: { present: vaultStatus.configured === true, records: vaultStatus.configured === true ? 1 : 0, unreadable: vaultStatus.configured === true ? 0 : null },
    }, learningEvents: { byEventType: tally(events.map(item => item.eventType)), byDestination: tally(events.map(item => item.destination)), byScope: tally(events.map(item => item.scope)) },
    lifecycle: { byState: tally(events.map(item => item.state)), held: events.filter(item => item.held).length },
    approvals: { totalEvents: status.approvalEventCount, active: status.activeApprovedKnowledgeCount, byState: tally(approvalStates), actionCountsAvailable: false }, passed: true };
  } finally { try { journal?.lock(); } catch {} }
}

export async function runOwnerInventory({ authority, inspect }) {
  const first = sanitizeAggregate(await inspect()); const second = sanitizeAggregate(await inspect());
  const deterministicSecondPass = JSON.stringify(stable(first)) === JSON.stringify(stable(second));
  return { schemaVersion: "runa2-gate4b-owner-inventory-result/v1", authority: { legacyCommit: authority.legacyCommit, nextCommit: authority.nextCommit, clean: authority.clean, ownerIdentityVerified: authority.ownerIdentityVerified, sourcePinsVerified: authority.sourcePinsVerified }, aggregate: first, deterministicSecondPass, disallowedFieldsEmitted: false, passed: deterministicSecondPass && first.passed };
}
