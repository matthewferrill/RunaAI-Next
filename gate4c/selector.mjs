import { GATE4C_CONTEXT_VERSION, GATE4C_MAX_LESSONS, GATE4C_TOKEN_BUDGET } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const stop = new Set(["the", "and", "for", "that", "this", "with", "from", "into", "your", "you", "are", "was", "were", "what", "when", "where", "which", "how", "does", "can", "should", "would", "about"]);
const families = [
  ["internet", "browse", "browser", "fetch", "webpage", "website", "url", "outreach", "external", "network", "connector"],
  ["repository", "repo", "codebase", "workspace", "project"],
  ["correct", "correction", "corrected", "fix", "replace", "replacement"],
];
const normalize = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function stem(value) { for (const suffix of ["ments", "ment", "ions", "ion", "ies", "ing", "ers", "ed", "es", "s"]) if (value.endsWith(suffix) && value.length - suffix.length >= 4) return value.slice(0, -suffix.length); return value.endsWith("e") && value.length > 4 ? value.slice(0, -1) : value; }
function tokens(values) { const result = new Set(); for (const raw of values) for (const value of normalize(raw).split(/\s+/)) if (value.length >= 3 && !stop.has(value)) result.add(stem(value)); for (const family of families) if (family.some(value => result.has(stem(value)))) for (const value of family) result.add(stem(value)); return result; }
function counts(value) { const result = new Map(); for (const raw of normalize(value).split(/\s+/)) { if (raw.length < 3 || stop.has(raw)) continue; const key = stem(raw); result.set(key, Math.min(3, (result.get(key) ?? 0) + 1)); } return result; }
const estimatedTokens = item => Math.ceil(([item.lesson, item.scope, item.scopeId, ...item.limitations, ...item.mustNotApply].join(" ").length) / 4);

export function selectBoundedAdvisoryContext(task, lessons, makeReference) {
  if (typeof task !== "string" || !task.trim() || task.length > 20_000) throw coded("projection-task-invalid", "A bounded task is required.");
  const taskNormalized = normalize(task); const taskTokens = tokens([task]); const taskCounts = counts(task);
  const ranked = lessons.map((item, index) => {
    const forbidden = item.mustNotApply.some(condition => normalize(condition).length >= 8 && taskNormalized.includes(normalize(condition)));
    const shared = [...taskTokens].filter(token => tokens([item.lesson, item.scope, item.scopeId, ...item.limitations]).has(token));
    return { item, index, score: forbidden ? -1 : shared.reduce((total, token) => total + (taskCounts.get(token) ?? 1), 0) };
  }).filter(value => value.score > 0).sort((left, right) => right.score - left.score || left.index - right.index);
  if (!ranked.length) return Object.freeze({ selected: false, reason: "no-relevant-approved-knowledge", selectedCount: 0, scoredCount: 0, context: null, references: Object.freeze([]) });
  const peakScore = ranked[0].score; const minimumScore = peakScore === 1 ? 1 : Math.max(2, Math.floor(peakScore / 2));
  const eligible = peakScore === 1 ? ranked.slice(0, 1) : ranked.filter(item => item.score >= minimumScore);
  const selected = []; let tokenEstimate = 0;
  for (const entry of eligible) { const size = estimatedTokens(entry.item); if (selected.length >= GATE4C_MAX_LESSONS) break; if (tokenEstimate + size > GATE4C_TOKEN_BUDGET) continue; selected.push(entry.item); tokenEstimate += size; }
  if (!selected.length) return Object.freeze({ selected: false, reason: "approved-knowledge-budget-exhausted", selectedCount: 0, scoredCount: ranked.length, context: null, references: Object.freeze([]) });
  return Object.freeze({ selected: true, reason: "relevant-approved-knowledge", selectedCount: selected.length,
    scoredCount: ranked.length, eligibleCount: eligible.length, peakScore, minimumScore,
    truncated: selected.length < eligible.length, references: Object.freeze(selected.map(makeReference)),
    context: Object.freeze({ schemaVersion: GATE4C_CONTEXT_VERSION, label: "Runa approved knowledge - bounded advisory data",
      lessons: Object.freeze(selected.map(item => Object.freeze({ lesson: item.lesson, appliesWhen: Object.freeze({ scope: item.scope, scopeId: item.scopeId }), limitations: item.limitations, mustNotApply: item.mustNotApply }))),
      lessonCount: selected.length, estimatedTokens: tokenEstimate, tokenBudget: GATE4C_TOKEN_BUDGET,
      retrievalPolicy: "explicit-scope-before-deterministic-relevance", mayInformAnswer: true,
      mayAuthorizeAction: false, toolPermissionAllowed: false, filePermissionAllowed: false,
      networkPermissionAllowed: false, spendingPermissionAllowed: false, workerPermissionAllowed: false,
      trainingAllowed: false, policyChangeAllowed: false, identityChangeAllowed: false,
      ordinaryChatLearningEnabled: false }) });
}
