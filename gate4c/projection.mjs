import { readAcceptedGate4bJournal } from "./source.mjs";
import { filterProjectionByScope } from "./scope.mjs";
import { selectBoundedAdvisoryContext } from "./selector.mjs";
import { GATE4C_PROJECTION_VERSION, GATE4C_SELECTION_VERSION } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const projections = new WeakSet();
const validDate = value => { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) throw coded("projection-time-invalid", "Projection time is invalid."); return date; };
function approvalsFrom(entry) { if (entry.kind === "approval") return [entry.payload]; if (entry.kind === "approval-batch") return entry.payload.approvals; return []; }
function requireText(value, code) { if (typeof value !== "string" || !value.trim()) throw coded("projection-event-invalid", `${code} is missing.`); return value.trim(); }
function requireTimestamp(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw coded("projection-event-invalid", `${code} is invalid.`); return value; }
function optionalTimestamp(value, code) { if (value !== null && value !== undefined) requireTimestamp(value, code); }
function eventScope(event) { const scope = requireText(event.scope?.proposedReuse, "event scope"); const scopeId = event.scope?.projectId ?? event.scope?.capabilityId ?? event.scope?.personId ?? null; return { scope, scopeId: typeof scopeId === "string" && scopeId.trim() ? scopeId.trim() : null }; }
function nextBoundary(entries, at) { const future = []; const add = value => { if (!value) return; const parsed = Date.parse(value); if (Number.isFinite(parsed) && parsed > at.getTime()) future.push(parsed); };
  for (const entry of entries) { if (entry.kind === "learning-event") { add(entry.payload.lifecycle?.expiresAt); add(entry.payload.lifecycle?.deletionRequiredBy); } if (entry.kind === "lifecycle") add(entry.payload.effectiveAt); for (const approval of approvalsFrom(entry)) add(approval.effectiveAt); }
  return future.length ? new Date(Math.min(...future)).toISOString() : null;
}
function lifecycleState(event, events, at) { let state = "candidate-recorded"; let held = false; let replacementEventId = null;
  for (const item of events ?? []) { if (Date.parse(item.effectiveAt) > at.getTime()) continue; if (item.action === "correct") { state = "corrected"; replacementEventId = item.replacementEventId; } else if (item.action === "delete") state = "deleted"; else if (item.action === "safe-hold-proposed") held = true; else if (item.action === "release-safe-hold") held = false; }
  if (state !== "deleted" && event.lifecycle?.deletionRequiredBy && at.getTime() >= Date.parse(event.lifecycle.deletionRequiredBy)) state = "deletion-required";
  else if (state === "candidate-recorded" && event.lifecycle?.expiresAt && at.getTime() >= Date.parse(event.lifecycle.expiresAt)) state = "expired";
  return { state, held, replacementEventId };
}

export function buildApprovedKnowledgeProjection({ source, cipher, now = new Date() } = {}) {
  const at = validDate(now); const accepted = readAcceptedGate4bJournal(source, cipher); const events = new Map(); const lifecycle = new Map(); const approvals = new Map();
  for (const entry of accepted.snapshot.entries) {
    if (entry.kind === "learning-event") { optionalTimestamp(entry.payload.lifecycle?.expiresAt, "event expiry"); optionalTimestamp(entry.payload.lifecycle?.deletionRequiredBy, "event deletion deadline"); events.set(requireText(entry.payload.eventId, "event id"), entry.payload); }
    else if (entry.kind === "lifecycle") { if (!["correct", "delete", "safe-hold-proposed", "release-safe-hold"].includes(entry.payload.action)) throw coded("projection-event-invalid", "Lifecycle action is invalid."); requireTimestamp(entry.payload.effectiveAt, "lifecycle effective time"); const list = lifecycle.get(entry.payload.targetEventId) ?? []; list.push(entry.payload); lifecycle.set(entry.payload.targetEventId, list); }
    for (const approval of approvalsFrom(entry)) { if (!["approve", "revoke", "expire"].includes(approval.action)) throw coded("projection-event-invalid", "Approval action is invalid."); requireTimestamp(approval.effectiveAt, "approval effective time"); approvals.set(approval.approvalId, approval); }
  }
  for (const event of events.values()) { const corrects = event.relationships?.corrects ?? []; if (!Array.isArray(corrects) || corrects.some(id => !events.has(id))) throw coded("projection-correction-lineage-invalid", "Correction relationships must name journaled events."); }
  for (const [target, items] of lifecycle) for (const item of items) if (item.action === "correct" && !events.get(item.replacementEventId)?.relationships?.corrects?.includes(target)) throw coded("projection-correction-lineage-invalid", "A lifecycle correction must bind its declared replacement.");
  const inactive = new Set(); for (const approval of approvals.values()) if (["revoke", "expire"].includes(approval.action) && Date.parse(approval.effectiveAt) <= at.getTime()) inactive.add(approval.targetApprovalId);
  const states = [...approvals.values()].filter(item => item.action === "approve" && Date.parse(item.effectiveAt) <= at.getTime()).map(approval => { const event = events.get(approval.targetEventId); if (!event) throw coded("projection-approval-lineage-invalid", "An approval target is unavailable."); const life = lifecycleState(event, lifecycle.get(event.eventId), at); const active = !inactive.has(approval.approvalId) && !life.held && life.state === "candidate-recorded"; return { approval, event, life, active }; });
  const activeTargets = new Set(); for (const item of states.filter(value => value.active)) { if (activeTargets.has(item.event.eventId)) throw coded("projection-approval-lineage-invalid", "A lesson has more than one active approval."); activeTargets.add(item.event.eventId); }
  const correctedByApproved = new Set(states.filter(item => item.active).flatMap(item => Array.isArray(item.event.relationships?.corrects) ? item.event.relationships.corrects : []));
  const lessons = states.filter(item => item.active && !correctedByApproved.has(item.event.eventId)).map(item => { const scope = eventScope(item.event); const lesson = requireText(item.event.candidate?.lesson, "candidate lesson"); const limitations = item.event.candidate?.limitations ?? []; const mustNotApply = item.event.candidate?.mustNotApply ?? []; if (!Array.isArray(limitations) || !Array.isArray(mustNotApply) || [...limitations, ...mustNotApply].some(value => typeof value !== "string")) throw coded("projection-event-invalid", "Lesson boundaries are invalid."); return Object.freeze({ lesson, ...scope, limitations: Object.freeze([...limitations]), mustNotApply: Object.freeze([...mustNotApply]), eventType: requireText(item.event.eventType, "event type"), approvalRefHmac: cipher.digest({ type: "approval", value: item.approval.approvalId }), eventRefHmac: cipher.digest({ type: "event", value: item.event.eventId }), eventIntegrityHmac: cipher.digest({ type: "event-integrity", value: item.event.integrity }) }); });
  const projection = Object.freeze({ schemaVersion: GATE4C_PROJECTION_VERSION, sourceManifestHmac: accepted.manifestHmac,
    builtAt: at.toISOString(), nextReevaluationAt: nextBoundary(accepted.snapshot.entries, at),
    activeLessonCount: lessons.length, lessons: Object.freeze(lessons), persisted: false,
    sourceAuthority: "accepted-gate4b-journal", derivedOnly: true, modelContextActivated: false,
    toolAuthorityGranted: false, networkAuthorityGranted: false, trainingAuthorityGranted: false });
  projections.add(projection); return projection;
}

export function projectionStatus(projection) {
  if (!projections.has(projection)) throw coded("projection-instance-invalid", "Only a validated projection has status.");
  return Object.freeze({ schemaVersion: GATE4C_PROJECTION_VERSION, activeLessonCount: projection.activeLessonCount,
    sourceManifestHmac: projection.sourceManifestHmac, builtAt: projection.builtAt,
    nextReevaluationAt: projection.nextReevaluationAt, persisted: false, derivedOnly: true,
    privateValuesEmitted: false, modelContextActivated: false, qdrantActivated: false });
}

export function retrieveApprovedKnowledge({ projection, currentManifestHmac, requestScope, task, cipher, now = new Date() } = {}) {
  if (!projections.has(projection)) throw coded("projection-instance-invalid", "Only a validated projection can be queried.");
  if (currentManifestHmac !== projection.sourceManifestHmac) throw coded("projection-stale", "The approved-knowledge projection is stale.");
  const at = validDate(now); if (projection.nextReevaluationAt && at.getTime() >= Date.parse(projection.nextReevaluationAt)) throw coded("projection-lifecycle-reevaluation-required", "A lifecycle boundary requires projection rebuild.");
  if (!cipher?.digest) throw coded("projection-cipher-required", "A provenance cipher is required.");
  const scoped = filterProjectionByScope(projection.lessons, requestScope);
  const result = selectBoundedAdvisoryContext(task, scoped.eligible, item => Object.freeze({ approvalRefHmac: item.approvalRefHmac, eventRefHmac: item.eventRefHmac, eventIntegrityHmac: item.eventIntegrityHmac }));
  return Object.freeze({ schemaVersion: GATE4C_SELECTION_VERSION, ...result,
    sourceManifestHmac: projection.sourceManifestHmac, scopeFiltering: Object.freeze({ consideredCount: scoped.consideredCount, eligibleCount: scoped.eligibleCount, excludedCount: scoped.excludedCount, excludedByReason: scoped.excludedByReason }),
    modelContextAuthorized: false, previewOnly: true, persisted: false, ordinaryChatLearningEnabled: false,
    mayAuthorizeAction: false, toolPermissionAllowed: false, filePermissionAllowed: false,
    networkPermissionAllowed: false, spendingPermissionAllowed: false, workerPermissionAllowed: false,
    trainingAllowed: false, policyChangeAllowed: false, identityChangeAllowed: false });
}

export function safeRetrieveApprovedKnowledge(options) {
  try { return retrieveApprovedKnowledge(options); } catch (error) { return Object.freeze({ schemaVersion: GATE4C_SELECTION_VERSION,
    selected: false, selectedCount: 0, context: null, references: Object.freeze([]),
    errorCode: typeof error?.code === "string" ? error.code : "projection-query-blocked",
    modelContextAuthorized: false, previewOnly: true, persisted: false, mayAuthorizeAction: false,
    toolPermissionAllowed: false, filePermissionAllowed: false, networkPermissionAllowed: false,
    spendingPermissionAllowed: false, workerPermissionAllowed: false, trainingAllowed: false,
    policyChangeAllowed: false, identityChangeAllowed: false, ordinaryChatLearningEnabled: false }); }
}
