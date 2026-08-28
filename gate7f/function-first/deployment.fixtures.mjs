// Synthetic verifier fixtures ONLY. These are not model/host acceptance results.
import predecessor from "../../gate7a/fixtures/control-predecessor.json" with { type: "json" };
import { canonicalJson, sha256 } from "../../gate4/canonical.mjs";
import { CAPABILITY_SET_VERSION, CAPABILITY_SET_DIGEST } from "./tasks/contracts.mjs";
import { M1_CANDIDATE_MODELS } from "./deployment.mjs";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES, CONTROL_CASES } from "./acceptance/cases.mjs";
import { enumerateCaseChecks, ASSERTION_SCHEMA_VERSION } from "./acceptance/assertions.mjs";
import { QDRANT_PIN } from "./acceptance/runner-contract.mjs";

export const DEPLOYMENT_FIXTURE_COMMIT = "1".repeat(40);
const hash = value => sha256(canonicalJson(value));
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export function qualifiedDeploymentFixture() {
  const prior = structuredClone(predecessor.config);
  prior.mode = "active"; prior.limits.totalDeadlineMs = 60_000; prior.publicBaseUrl = "https://runa.bridgebuildersai.com";
  const successor = structuredClone(prior);
  successor.schemaVersion = "runa2-gate6b-release-config/v2";
  successor.provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: prior.provider.baseUrl,
    models: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, M1_CANDIDATE_MODELS["gemma4-26b-a4b"]])) };
  successor.functionFirst = { schemaVersion: "runaai-m1-functions/v1", enabled: true,
    scope: "supplied-text-and-disposable-javascript", capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { reasoningEffort: "none" }])),
    qdrant: { endpoint: "http://127.0.0.1:9773", collection: "m1_candidate_sections" },
    embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", dimension: 768 },
    reranker: { baseUrl: "http://192.168.50.165:8412", windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 } };
  successor.services.caddy.configurationDigest = "c".repeat(64);
  const hex = "a".repeat(64);
  const runtimeSeal = { schemaVersion: "runaai-m1-functional-runtime-seal/v1", sourceCommit: DEPLOYMENT_FIXTURE_COMMIT,
    caseBundleSha256: CASE_BUNDLE_SHA256,
    runtime: { nodeSha256: hex, sourceArchiveSha256: hex, packageLockSha256: hex, qdrantSha256: QDRANT_PIN.sha256,
      modelRuntimeSha256: hex, modelRuntimeVersion: "synthetic-runtime-test-only" },
    candidates: ACCEPTANCE_POLICY.roster.map((candidate, index) => ({ candidateId: candidate.candidateId,
      modelId: M1_CANDIDATE_MODELS[candidate.candidateId], artifactSha256: String(index + 1).repeat(64), artifactBytes: 1000 + index,
      requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { reasoningEffort: index === 1 ? null : "none" }])) })),
    roles: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { maximumOutputTokens: ["code", "agent"].includes(role) ? 1536 : 512,
      maximumContextTokens: 8192, deadlineMs: ["code", "agent"].includes(role) ? 30000 : 60000 }])),
    providerBaseUrl: "http://127.0.0.1:9770/v1", embedding: { baseUrl: "http://127.0.0.1:17770/v1",
      modelId: "text-embedding-nomic-embed-text-v1.5", artifactSha256: hex },
    reranker: { baseUrl: "http://127.0.0.1:17771", artifactSha256: hex, windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
    residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: hex, effectiveReasoningEvidenceSha256: hex, telemetryPolicySha256: hex },
    suites: Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? []).map(suite => [suite.suiteId, hash(suite)]))),
    evaluatorId: "independent-synthetic-verifier-test", maximumBatchMs: 300000, productionRoutingChanged: false };
  const runtimeSealBytes = bytes(runtimeSeal);
  function grade(item, candidateId = null, repetition = null) {
    return { schemaVersion: ASSERTION_SCHEMA_VERSION, caseId: item.id, control: candidateId === null,
      candidateId, role: candidateId ? item.role : null, repetition, caseBundleSha256: CASE_BUNDLE_SHA256,
      runtimeSealSha256: sha256(runtimeSealBytes), observationStatus: "completed", status: "pass", passed: true,
      providerCalls: candidateId ? 1 : 0, nativeCalls: 0, repairs: null, repaired: false,
      criticalModelFailures: [], criticalProductFailures: [], problems: [],
      checks: enumerateCaseChecks(item).map(check => ({ checkId: check.checkId, kind: check.kind, status: "pass", passed: true,
        expected: check.expected, actual: check.expected, reason: "Synthetic verifier test only, not functional evidence.", evidenceRefs: [],
        criticalModelFailure: false, criticalProductFailure: false })) };
  }
  const grades = [...ACCEPTANCE_POLICY.roster.flatMap(candidate => MODEL_CASES.flatMap(item =>
    Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) => grade(item, candidate.candidateId, index + 1)))),
  ...CONTROL_CASES.map(item => grade(item))];
  const reseal = ({ gradesBytes = bytes(grades), runtimeBytes = bytes(runtimeSeal) } = {}) => ({
    schemaVersion: "runaai-m1-successor-plan/v1", priorConfigurationDigest: hash(prior), successorConfigurationDigest: hash(successor),
    provider: structuredClone(successor.provider), functionFirst: structuredClone(successor.functionFirst),
    caddyConfigurationDigest: successor.services.caddy.configurationDigest,
    acceptanceGradesSha256: sha256(gradesBytes), runtimeSealSha256: sha256(runtimeBytes) });
  return { prior, successor, grades, runtimeSeal, reseal,
    inputs() { const gradesBytes = bytes(grades), runtimeSealBytes = bytes(runtimeSeal);
      return { prior, successor, plan: reseal({ gradesBytes, runtimeBytes: runtimeSealBytes }), gradesBytes, runtimeSealBytes,
        expectedSourceCommit: DEPLOYMENT_FIXTURE_COMMIT }; } };
}
