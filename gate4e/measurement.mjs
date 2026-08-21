import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { filterProjectionByScope } from "../gate4c/scope.mjs";
import { selectBoundedAdvisoryContext } from "../gate4c/selector.mjs";
import { GATE4C_MAX_LESSONS, GATE4C_TOKEN_BUDGET } from "../gate4c/formats.mjs";

const digest = value => createHash("sha256").update(`synthetic-gate4e\u0000${value}`).digest("hex");
const lesson = (id, text, scope = "global", scopeId = null, mustNotApply = []) => Object.freeze({
  id, lesson: text, scope, scopeId, limitations: Object.freeze([]),
  mustNotApply: Object.freeze(mustNotApply),
});

export function syntheticCurrentScaleLessons() {
  const personal = [lesson("personal-preference", "private preference boundary", "personal", "participant-a")];
  const projects = [
    lesson("project-repository", "repository verification tests", "project", "project-a"),
    ...Array.from({ length: 4 }, (_, index) => lesson(`project-${index}`, `project ledger topic p${index}`, "project", "project-a")),
  ];
  const capabilities = [
    lesson("cap-workspace", "workspace explicit source ranges", "capability", "workspace-read"),
    lesson("cap-research", "research source triangulation", "capability", "research"),
    ...Array.from({ length: 14 }, (_, index) => lesson(`cap-${index}`, `capability procedure c${index}`, "capability", `cap-${index}`)),
  ];
  const globals = [
    lesson("global-deployment", "rollback checkpoints deployment", "global", null, ["when production is active"]),
    lesson("global-citations", "citations supplied evidence"),
    lesson("global-uncertainty", "uncertainty insufficient records"),
    lesson("global-network", "external network permission"),
    lesson("forbidden-production", "production deployment", "global", null, ["when production is active"]),
    lesson("forbidden-credential", "credential rotation", "global", null, ["when secret access is requested"]),
    lesson("forbidden-spending", "spending approval", "global", null, ["when a purchase is requested"]),
    lesson("forbidden-identity", "identity change", "global", null, ["when impersonation is requested"]),
    ...Array.from({ length: 23 }, (_, index) => lesson(`global-${index}`, `governed catalog topic g${index}`)),
  ];
  return Object.freeze([...personal, ...projects, ...capabilities, ...globals]);
}

function requestScope(name) {
  if (name === "project") return { participantId: null, projectId: "project-a", capabilities: [] };
  if (name === "workspace") return { participantId: null, projectId: "project-a", capabilities: ["workspace-read"] };
  if (name === "wrong-person") return { participantId: "participant-b", projectId: null, capabilities: [] };
  if (name === "wrong-project") return { participantId: null, projectId: "project-b", capabilities: [] };
  if (name === "wrong-capability") return { participantId: null, projectId: null, capabilities: ["chat"] };
  return { participantId: null, projectId: null, capabilities: [] };
}

const reference = item => Object.freeze({ eventRefHmac: digest(item.id), approvalRefHmac: digest(`approval-${item.id}`),
  eventIntegrityHmac: digest(`integrity-${item.id}`) });
const p95 = values => values.slice().sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)];

export function runDirectSelectorMeasurement(corpus, { repetitions = 3 } = {}) {
  const lessons = syntheticCurrentScaleLessons();
  const timings = [];
  const metrics = new Map();
  let deterministic = true;
  let boundsPassed = true;
  for (const query of corpus.queries) {
    const expectedRef = query.expectedId ? digest(query.expectedId) : null;
    const outcomes = [];
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const started = performance.now();
      const scoped = filterProjectionByScope(lessons, requestScope(query.scope));
      const selected = selectBoundedAdvisoryContext(query.task, scoped.eligible, reference);
      timings.push(performance.now() - started);
      const refs = selected.references.map(item => item.eventRefHmac);
      outcomes.push(JSON.stringify(refs));
      boundsPassed &&= selected.selectedCount <= GATE4C_MAX_LESSONS &&
        (selected.context?.estimatedTokens ?? 0) <= GATE4C_TOKEN_BUDGET;
    }
    deterministic &&= outcomes.every(value => value === outcomes[0]);
    const selectedRefs = JSON.parse(outcomes[0]);
    const item = metrics.get(query.category) ?? { cases: 0, hits: 0, falseSelections: 0 };
    item.cases += 1;
    if (expectedRef && selectedRefs.includes(expectedRef)) item.hits += 1;
    if (!expectedRef && selectedRefs.length > 0) item.falseSelections += 1;
    metrics.set(query.category, item);
  }
  const summary = Object.fromEntries([...metrics].map(([category, item]) => [category, {
    ...item, recallAt6: item.cases ? item.hits / item.cases : 0,
  }]));
  const safetyPassed = ["honest-miss", "cross-scope-attack", "forbidden-attack"]
    .every(category => summary[category]?.falseSelections === 0);
  return Object.freeze({ schemaVersion: "runa2-gate4e-direct-selector-measurement/v1",
    libraryCount: lessons.length,
    scopeDistribution: Object.freeze({ personal: 1, project: 5, capability: 16, global: 31 }),
    queryCount: corpus.queries.length, repetitions, metrics: Object.freeze(summary),
    deterministic, boundsPassed, safetyPassed,
    latency: Object.freeze({ p95Milliseconds: p95(timings), thresholdMilliseconds: 250 }),
    vectorArmRun: false, bgeArmRun: false, rawValuesRetained: false,
    decision: "skip-current-approved-knowledge-index",
    decisionReason: "vector-and-reranker-arms-not-authorized-and-current-direct-selector-is-safe",
    remeasureAtLessonCounts: Object.freeze([530, 5300]),
  });
}
