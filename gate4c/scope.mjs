import { GATE4C_REQUEST_SCOPE_VERSION } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const scopes = new Set(["session", "personal", "project", "capability", "global", "evaluation", "training-candidate"]);

export function parseRequestScope(raw) {
  if (!raw || !Object.hasOwn(raw, "participantId") || !Object.hasOwn(raw, "projectId") || !Object.hasOwn(raw, "capabilities")) throw coded("projection-request-scope-required", "Participant, project, and capability scope must be declared explicitly.");
  if (raw.participantId !== null && (typeof raw.participantId !== "string" || !raw.participantId.trim())) throw coded("projection-request-scope-invalid", "Participant scope is invalid.");
  if (raw.projectId !== null && (typeof raw.projectId !== "string" || !raw.projectId.trim())) throw coded("projection-request-scope-invalid", "Project scope is invalid.");
  if (!Array.isArray(raw.capabilities) || raw.capabilities.some(value => typeof value !== "string" || !value.trim())) throw coded("projection-request-scope-invalid", "Capability scope must be an explicit array.");
  return Object.freeze({ schemaVersion: GATE4C_REQUEST_SCOPE_VERSION,
    participantId: raw.participantId?.trim() ?? null, projectId: raw.projectId?.trim() ?? null,
    capabilities: Object.freeze([...new Set(raw.capabilities.map(value => value.trim()))].sort()) });
}

function decision(eligible, code) { return Object.freeze({ eligible, code }); }
export function lessonScopeDecision(lesson, request) {
  if (!scopes.has(lesson.scope)) return decision(false, "unknown-scope");
  if (["evaluation", "training-candidate", "session"].includes(lesson.scope)) return decision(false, "never-advisory");
  if (lesson.scope === "global") return decision(true, "global");
  if (!lesson.scopeId) return decision(false, "missing-scope-id");
  if (lesson.scope === "personal") return decision(request.participantId === lesson.scopeId, request.participantId ? "participant-mismatch" : "participant-undeclared");
  if (lesson.scope === "project") return decision(request.projectId === lesson.scopeId, request.projectId ? "project-mismatch" : "project-undeclared");
  if (lesson.scope === "capability") return decision(request.capabilities.includes(lesson.scopeId), "capability-not-declared");
  return decision(false, "scope-denied");
}

export function filterProjectionByScope(lessons, rawRequest) {
  const request = parseRequestScope(rawRequest); const eligible = []; const excluded = new Map();
  for (const lesson of lessons) { const result = lessonScopeDecision(lesson, request); if (result.eligible) eligible.push(lesson); else excluded.set(result.code, (excluded.get(result.code) ?? 0) + 1); }
  return Object.freeze({ request, eligible: Object.freeze(eligible), consideredCount: lessons.length,
    eligibleCount: eligible.length, excludedCount: lessons.length - eligible.length,
    excludedByReason: Object.freeze(Object.fromEntries([...excluded].sort())) });
}
