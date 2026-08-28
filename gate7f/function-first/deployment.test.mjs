import assert from "node:assert/strict";
import test from "node:test";
import predecessor from "../../gate7a/fixtures/control-predecessor.json" with { type: "json" };
import { canonicalJson, sha256 } from "../../gate4/canonical.mjs";
import { CAPABILITY_SET_VERSION, CAPABILITY_SET_DIGEST } from "./tasks/contracts.mjs";
import { assertM1SuccessorProjection, requireQualifiedRoleSelection, assertQualifiedM1Successor, M1_CANDIDATE_MODELS } from "./deployment.mjs";
import { qualifiedDeploymentFixture } from "./deployment.fixtures.mjs";

const hash = value => sha256(canonicalJson(value));
function fixture() {
  const prior = structuredClone(predecessor.config);
  prior.mode = "active"; prior.limits.totalDeadlineMs = 60_000;
  prior.publicBaseUrl = "https://runa.bridgebuildersai.com";
  const successor = structuredClone(prior);
  successor.schemaVersion = "runa2-gate6b-release-config/v2";
  successor.provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: prior.provider.baseUrl,
    models: Object.fromEntries(["chat", "research", "review", "code", "agent"].map(role => [role, "gemma-4-26b-a4b-it-qat"])) };
  successor.functionFirst = { schemaVersion: "runaai-m1-functions/v1", enabled: true,
    scope: "supplied-text-and-disposable-javascript", capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST,
    requestControls: Object.fromEntries(["chat", "research", "review", "code", "agent"].map(role => [role, { reasoningEffort: "none" }])),
    qdrant: { endpoint: "http://127.0.0.1:9773", collection: "m1_candidate_sections" },
    embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", dimension: 768 },
    reranker: { baseUrl: "http://192.168.50.165:8412", windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 } };
  successor.services.caddy.configurationDigest = "c".repeat(64);
  const reseal = () => ({ schemaVersion: "runaai-m1-successor-plan/v1", priorConfigurationDigest: hash(prior),
    successorConfigurationDigest: hash(successor), provider: structuredClone(successor.provider),
    functionFirst: structuredClone(successor.functionFirst), caddyConfigurationDigest: successor.services.caddy.configurationDigest,
    acceptanceGradesSha256: "a".repeat(64), runtimeSealSha256: "b".repeat(64) });
  return { prior, successor, reseal };
}

test("M1 projection preserves the full predecessor except exactly sealed feature/provider/Caddy differences", () => {
  const { prior, successor, reseal } = fixture(), before = canonicalJson(prior), after = canonicalJson(successor);
  const result = assertM1SuccessorProjection(prior, successor, reseal());
  assert.equal(result.passed, true); assert.equal(result.authorityChanged, false);
  assert.equal(canonicalJson(prior), before); assert.equal(canonicalJson(successor), after);
});

test("resealing cannot authorize drift to protected bindings or resource ceilings", () => {
  const mutations = [v => v.keyRefs.coreEncryption = "file:other-key", v => v.databaseUrlRef = "file:other-db",
    v => v.keycloak.clientId = "other", v => v.openfga.storeId = "other", v => v.sourceGeneration = "other",
    v => v.cutoverId = "other", v => v.limits.maxRequestBytes++, v => v.limits.upstreamDeadlineMs++,
    v => v.services.postgresql.version = "other", v => v.services.caddy.version = "other", v => v.releaseManifestPath = "other.json"];
  for (const mutate of mutations) {
    const { prior, successor, reseal } = fixture(); mutate(successor);
    assert.throws(() => assertM1SuccessorProjection(prior, successor, reseal()), /m1-deploy-protected-binding-drift/);
  }
});

test("unsealed config changes, wider interfaces and unexpected plan fields fail closed", () => {
  const { prior, successor, reseal } = fixture(), plan = reseal();
  successor.provider.models.chat = "qwen3.6-27b-mtp";
  assert.throws(() => assertM1SuccessorProjection(prior, successor, plan), /m1-deploy-successor-config-drift/);
  successor.provider.baseUrl = "http://127.0.0.1:1234/v1";
  assert.throws(() => assertM1SuccessorProjection(prior, successor, reseal()), /m1-deploy-provider-boundary-drift/);
  const fresh = fixture(); fresh.successor.functionFirst.scope = "host-files";
  assert.throws(() => assertM1SuccessorProjection(fresh.prior, fresh.successor, fresh.reseal()));
  assert.throws(() => assertM1SuccessorProjection(prior, successor, { ...plan, ignoreFailures: true }));
});

test("missing acceptance cannot be converted into a deployment winner", () => {
  const { successor } = fixture();
  assert.throws(() => requireQualifiedRoleSelection([], successor.provider), /m1-deploy-controls-unqualified/);
});

test("combined verifier binds the exact grade/seal bytes and all five selected roles without mutating inputs", () => {
  const value = qualifiedDeploymentFixture(), input = value.inputs(), before = canonicalJson({ prior: input.prior, successor: input.successor, plan: input.plan });
  const verified = assertQualifiedM1Successor(input);
  assert.equal(verified.passed, true); assert.equal(verified.selectedRolesVerified, 5);
  assert.equal(verified.productionChanged, false); assert.equal(verified.humanTrialStillRequired, true);
  assert.equal(canonicalJson({ prior: input.prior, successor: input.successor, plan: input.plan }), before);
  // Owned ephemeral evaluation endpoints are deliberately not production endpoints.
  assert.notEqual(value.runtimeSeal.reranker.baseUrl, value.successor.functionFirst.reranker.baseUrl);
});

test("even semantically equivalent reserialized grade/seal files cannot replace the pinned bytes", () => {
  const value = qualifiedDeploymentFixture(), input = value.inputs();
  assert.throws(() => assertQualifiedM1Successor({ ...input, gradesBytes: Buffer.from(JSON.stringify(value.grades)) }), /m1-deploy-grades-byte-mismatch/);
  assert.throws(() => assertQualifiedM1Successor({ ...input, runtimeSealBytes: Buffer.concat([input.runtimeSealBytes, Buffer.from(" ")]) }), /m1-deploy-runtime-seal-byte-mismatch/);
  assert.throws(() => assertQualifiedM1Successor({ ...input, gradesBytes: value.grades }), /m1-deploy-evidence-bytes-required/);
});

test("separate projection and campaign passes cannot authorize a swapped grade/runtime chain", () => {
  const original = qualifiedDeploymentFixture(), other = qualifiedDeploymentFixture(), input = original.inputs();
  other.grades[0].checks[0].actual = "Another retained observation.";
  assert.throws(() => assertQualifiedM1Successor({ ...input, gradesBytes: other.inputs().gradesBytes }), /m1-deploy-grades-byte-mismatch/);
  other.runtimeSeal.runtime.modelRuntimeVersion = "another-runtime";
  const swapped = other.inputs();
  assert.throws(() => assertQualifiedM1Successor(swapped), /m1-deploy-grade-runtime-mismatch/);
});

test("a different installed source commit cannot consume an otherwise coherent campaign", () => {
  const input = qualifiedDeploymentFixture().inputs();
  assert.throws(() => assertQualifiedM1Successor({ ...input, expectedSourceCommit: "f".repeat(40) }), /m1-deploy-runtime-seal-invalid/);
  assert.throws(() => assertQualifiedM1Successor({ ...input, expectedSourceCommit: undefined }), /m1-deploy-source-commit-required/);
});

test("Qwen omission versus reasoning none is exact for every independently selected role", () => {
  for (const role of ["chat", "research", "code", "review", "agent"]) {
    const value = qualifiedDeploymentFixture();
    value.successor.provider.models[role] = M1_CANDIDATE_MODELS["qwen3-coder-30b-a3b"];
    assert.throws(() => assertQualifiedM1Successor(value.inputs()), /m1-deploy-role-request-controls-drift/, role);
    value.successor.functionFirst.requestControls[role].reasoningEffort = null;
    assert.equal(assertQualifiedM1Successor(value.inputs()).passed, true, role);
  }
});

test("matching settings do not rescue an unqualified selected role or incomplete comparison", () => {
  const value = qualifiedDeploymentFixture();
  const losses = value.grades.filter(grade => grade.candidateId === "gemma4-26b-a4b" && grade.role === "review").slice(0, 3);
  for (const grade of losses) { grade.status = "fail"; grade.passed = false; grade.checks[0].status = "fail"; grade.checks[0].passed = false; }
  assert.throws(() => assertQualifiedM1Successor(value.inputs()), /m1-deploy-selected-role-unqualified/);
  value.grades.pop();
  assert.throws(() => assertQualifiedM1Successor(value.inputs()), /m1-deploy-grade-ledger-incomplete/);
});

test("bare success labels, missing exact checks and erased critical findings cannot qualify", () => {
  for (const mutate of [
    value => { value.grades[0].checks.pop(); },
    value => { value.grades[0].checks[0].status = "fail"; value.grades[0].checks[0].passed = false; },
    value => { value.grades[0].checks[0].criticalProductFailure = true; },
    value => { value.grades[0].providerCalls = 0; },
  ]) {
    const value = qualifiedDeploymentFixture(); mutate(value);
    assert.throws(() => assertQualifiedM1Successor(value.inputs()), /m1-deploy-/);
  }
});

test("a selected model must correspond to the qualified candidate's exact installed ID", () => {
  const value = qualifiedDeploymentFixture();
  value.runtimeSeal.candidates[0].modelId = "a-different-gemma-artifact";
  const sealDigest = sha256(Buffer.from(`${JSON.stringify(value.runtimeSeal, null, 2)}\n`));
  value.grades.forEach(grade => { grade.runtimeSealSha256 = sealDigest; });
  assert.throws(() => assertQualifiedM1Successor(value.inputs()), /m1-deploy-selected-model-not-sealed/);
});

test("the deployment cannot inherit a changed fixed suite or over-budget repair attempt", () => {
  const value = qualifiedDeploymentFixture();
  const key = Object.keys(value.runtimeSeal.suites)[0]; value.runtimeSeal.suites[key] = "0".repeat(64);
  assert.throws(() => assertQualifiedM1Successor(value.inputs()), /m1-deploy-suite-contract-drift/);
  const other = qualifiedDeploymentFixture(); other.grades[0].repairs = 2;
  assert.throws(() => assertQualifiedM1Successor(other.inputs()), /m1-deploy-repair-budget-exceeded/);
});
