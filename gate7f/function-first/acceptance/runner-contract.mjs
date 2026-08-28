import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES, CONTROL_CASES } from "./cases.mjs";

export const fail = code => Object.assign(new Error(code), { code });
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const OWNED_STAGE_PARENT = "C:\\AI\\RunaAI-Next-Candidate\\staging";
export const QDRANT_PIN = Object.freeze({ version: "1.19.0", bytes: 84184576,
  sha256: "369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4" });
export function assertOwnedStage(value) {
  const full = path.win32.resolve(value);
  if (path.win32.dirname(full).toLowerCase() !== OWNED_STAGE_PARENT.toLowerCase()
      || !/^m1-task-native-[a-f0-9]{32}$/.test(path.win32.basename(full))) throw fail("m1-acceptance-owned-stage-invalid");
  return full;
}

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const model = z.object({ modelId: z.string().min(1).max(200), artifactSha256: hex, artifactBytes: z.number().int().positive() }).strict();
export const RuntimeSealSchema = z.object({
  schemaVersion: z.literal("runaai-m1-functional-runtime-seal/v1"),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), caseBundleSha256: z.literal(CASE_BUNDLE_SHA256),
  runtime: z.object({ nodeSha256: hex, sourceArchiveSha256: hex, packageLockSha256: hex,
    qdrantSha256: z.literal(QDRANT_PIN.sha256), modelRuntimeSha256: hex, modelRuntimeVersion: z.string().min(1) }).strict(),
  candidates: z.array(z.object({ candidateId: z.enum(ACCEPTANCE_POLICY.roster.map(item => item.candidateId)), ...model.shape }).strict()).length(3),
  roles: z.object(Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, z.object({
    maximumOutputTokens: z.number().int().min(128).max(4096), maximumContextTokens: z.number().int().min(2048).max(32768),
    deadlineMs: z.number().int().min(1000).max(120000), reasoningEffort: z.literal("none").nullable(),
  }).strict()]))).strict(),
  providerBaseUrl: z.literal("http://127.0.0.1:9770/v1"),
  embedding: z.object({ baseUrl: z.string().url(), modelId: z.literal("text-embedding-nomic-embed-text-v1.5"), artifactSha256: hex }).strict(),
  reranker: z.object({ baseUrl: z.string().url(), artifactSha256: hex, windowCharacters: z.literal(2000), overlapCharacters: z.literal(300), batchSize: z.literal(32) }).strict(),
  residency: z.object({ oneLargeModelAtATime: z.literal(true), readinessEvidenceSha256: hex,
    effectiveReasoningEvidenceSha256: hex, telemetryPolicySha256: hex }).strict(),
  suites: z.record(z.string(), hex), evaluatorId: z.string().min(1).max(160),
  maximumBatchMs: z.number().int().min(1000).max(3600000), productionRoutingChanged: z.literal(false),
}).strict();

export function validateRuntimeSeal(value, { sourceCommit, candidateId } = {}) {
  const seal = RuntimeSealSchema.parse(value);
  if (new Set(seal.candidates.map(item => item.candidateId)).size !== 3
      || (sourceCommit && seal.sourceCommit !== sourceCommit)
      || (candidateId && !seal.candidates.some(item => item.candidateId === candidateId))) throw fail("m1-acceptance-seal-mismatch");
  for (const endpoint of [seal.embedding.baseUrl, seal.reranker.baseUrl]) {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || !["127.0.0.1", "192.168.50.165", "192.168.50.169"].includes(url.hostname)
        || url.username || url.password || url.search || url.hash) throw fail("m1-acceptance-seal-endpoint-invalid");
  }
  for (const [role, budget] of Object.entries(seal.roles)) {
    const planner = ["code", "agent"].includes(role);
    if (budget.maximumOutputTokens !== (planner ? 1536 : 512) || budget.deadlineMs !== (planner ? 30000 : 60000)) {
      throw fail("m1-acceptance-unenforced-budget");
    }
  }
  return seal;
}

export const SUPPORTED_ACTIONS = Object.freeze([
  "login.fresh", "chat.create", "chat.navigate-away", "chat.reopen", "session.logout", "answer",
  "fixture.foreign-session", "chat.switch-project", "sources.attach-and-select", "sources.attach",
  "source.request-foreign", "source.retry-index", "fault.index-unavailable", "fault.clear",
  "project.prepare-fixture", "run.start", "run.observe", "project.verify-independent",
  "user.approve-each-exact-effect", "grant.revoke", "run.resume-original", "user.restore-owned-receipt",
  "tests.run-restored", "run.retry-same-request", "proposal.approve-original", "harness.concurrent-approved-change",
]);
export function caseCoverage(item, additionalActions = []) {
  const available = new Set([...SUPPORTED_ACTIONS, ...additionalActions]);
  const missing = item.journey.filter(action => !available.has(action.action)).map(action => action.action);
  return { caseId: item.id, role: item.role, ready: missing.length === 0, unsupportedActions: [...new Set(missing)] };
}
export function inventory(additionalActions = []) {
  const cases = MODEL_CASES.map(item => caseCoverage(item, additionalActions));
  return { schemaVersion: "runaai-m1-functional-runner-inventory/v1", caseBundleSha256: CASE_BUNDLE_SHA256,
    modelCases: MODEL_CASES.length, controls: CONTROL_CASES.length, plannedAttempts: 360,
    readyCases: cases.filter(item => item.ready).length, cases, modelsInvoked: false, productQualificationPassed: false };
}

export function newObservation(item, { candidateId = null, repetition = 0, runtimeSealSha256 = null } = {}) {
  return { schemaVersion: "runaai-m1-functional-attempt/v1", caseId: item.id, candidateId, repetition, role: item.role,
    caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256, status: "running", startedAt: new Date().toISOString(),
    application: { requests: [], final: null }, provider: { calls: [], unexpectedCalls: [] },
    sources: { bindings: [], selectedAliases: [], indexOperations: [], canonicalBefore: [], canonicalAfter: [] },
    project: { initial: null, final: null, snapshots: [] },
    authority: { grants: [], approvals: [], revocations: [], sessionEvents: [] },
    workflow: { task: null, run: null, proposals: [], intents: [], receipts: [], events: [] },
    native: { calls: [], receipts: [], suites: [] }, evidence: [], checks: [], failures: [], notImplemented: [],
    identityBoundary: "synthetic-server-issued-session; not production Keycloak or Windows Hello qualification",
    browserExercised: false, protectedDataRead: false, productionChanged: false };
}

export class ObservationLedger {
  constructor(observation) { this.observation = observation; this.phase = "setup"; }
  evidence(source, kind, data) {
    if (!["application", "host-runtime", "host-filesystem", "postgresql", "langgraph", "browser", "independent-review"].includes(source)) throw fail("m1-evidence-source-invalid");
    const id = `evidence-${this.observation.evidence.length + 1}`;
    // A native receipt is retained byte-for-byte as structured data, not widened
    // with harness fields that could invalidate its versioned schema.
    this.observation.evidence.push({ id, source, kind, phase: this.phase,
      data: structuredClone(["native-receipt", "fixed-suite"].includes(kind) ? data : { phase: this.phase, ...data }) });
    return id;
  }
  actual(checkId, kind, value, evidenceId, pointer) {
    this.observation.checks.push({ checkId, kind, actual: structuredClone(value), evidenceRefs: [{ id: evidenceId, pointer }] });
  }
  unsupported(action, detail) {
    this.observation.notImplemented.push({ action, detail, phase: this.phase });
    this.observation.status = "not-implemented";
  }
}
