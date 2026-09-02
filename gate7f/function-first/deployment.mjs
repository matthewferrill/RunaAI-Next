import assert from "node:assert/strict";
import { canonicalJson, sha256 } from "../../gate4/canonical.mjs";
import { explicitModelRolesSchema } from "./model-roles.mjs";
import { m1FunctionConfigSchema, assertM1Roles } from "./config.mjs";
import { summarizeCampaign, enumerateCaseChecks, ASSERTION_SCHEMA_VERSION } from "./acceptance/assertions.mjs";
import { validateRuntimeSeal } from "./acceptance/runner-contract.mjs";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES, CONTROL_CASES } from "./acceptance/cases.mjs";
import { validateFocusedGemmaReviewEvidence } from "./gemma-primary-qualification.mjs";

const hash = value => sha256(canonicalJson(value));
export const M1_CANDIDATE_MODELS = Object.freeze({
  "gemma4-26b-a4b": "gemma-4-26b-a4b-it-qat",
  "qwen3-coder-30b-a3b": "qwen3-coder-30b-a3b-instruct",
  "qwen36-27b-mtp": "qwen3.6-27b-mtp",
});

/** Recompute the denominator from retained independent grades, never a supplied winner label. */
export function requireQualifiedRoleSelection(grades, provider, supplementalRoles = {}) {
  assertM1Roles(provider);
  const campaign = summarizeCampaign(grades);
  assert.equal(campaign.controls.allPassed, true, "m1-deploy-controls-unqualified");
  assert.equal(campaign.runtimeSealConsistent, true, "m1-deploy-runtime-unbound");
  assert.equal(campaign.duplicateKeys.length + campaign.invalid.length, 0, "m1-deploy-grade-ledger-invalid");
  for (const candidate of campaign.candidates) for (const role of candidate.roles) {
    assert.equal(role.missing + role.blocked + role.notImplemented, 0, "m1-deploy-campaign-incomplete");
    assert.equal(role.criticalProductFailures, 0, "m1-deploy-product-failure");
  }
  for (const [role, modelId] of Object.entries(provider.models)) {
    const candidate = campaign.candidates.find(item => M1_CANDIDATE_MODELS[item.candidateId] === modelId);
    const supplemental = supplementalRoles[role];
    assert.equal(candidate?.roles.find(item => item.role === role)?.qualified === true
      || supplemental?.passed === true && supplemental.modelId === modelId, true, "m1-deploy-selected-role-unqualified");
  }
  return campaign;
}

/** No I/O, no secret reads, no mutation. The exact sealed plan selects the only allowed differences. */
export function assertM1SuccessorProjection(prior, successor, plan) {
  assert.equal(plan?.schemaVersion, "runaai-m1-successor-plan/v1");
  assert.deepEqual(Object.keys(plan).sort(), ["schemaVersion", "priorConfigurationDigest", "successorConfigurationDigest",
    "provider", "functionFirst", "caddyConfigurationDigest", "acceptanceGradesSha256", "runtimeSealSha256"].sort());
  for (const value of [plan.priorConfigurationDigest, plan.successorConfigurationDigest, plan.caddyConfigurationDigest,
    plan.acceptanceGradesSha256, plan.runtimeSealSha256]) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(hash(prior), plan.priorConfigurationDigest, "m1-deploy-prior-config-drift");
  assert.equal(hash(successor), plan.successorConfigurationDigest, "m1-deploy-successor-config-drift");
  assert.equal(prior.mode, "active"); assert.equal(successor.mode, "active");
  assert.equal(successor.schemaVersion, "runa2-gate6b-release-config/v2");
  assert.equal(successor.publicBaseUrl, "https://runa.bridgebuildersai.com");
  assert.equal(successor.bind.host, "127.0.0.1"); assert.equal(successor.bind.port, 9760);
  assert.equal(successor.limits.totalDeadlineMs, 60_000);
  const provider = explicitModelRolesSchema.parse(plan.provider); assertM1Roles(provider);
  const functions = m1FunctionConfigSchema.parse(plan.functionFirst);
  assert.equal(provider.baseUrl, prior.provider.baseUrl, "m1-deploy-provider-boundary-drift");
  assert.equal(canonicalJson(successor.provider), canonicalJson(provider));
  assert.equal(canonicalJson(successor.functionFirst), canonicalJson(functions));
  assert.equal(successor.services.caddy.configurationDigest, plan.caddyConfigurationDigest);
  // Normalize only the explicitly enumerated M1 differences. Every identity,
  // authority, key reference, store, deadline and unrelated service stays exact.
  const preserved = structuredClone(successor);
  preserved.schemaVersion = prior.schemaVersion;
  preserved.provider = structuredClone(prior.provider);
  preserved.services.caddy.configurationDigest = prior.services.caddy.configurationDigest;
  if (Object.hasOwn(prior, "functionFirst")) preserved.functionFirst = structuredClone(prior.functionFirst);
  else delete preserved.functionFirst;
  assert.equal(canonicalJson(preserved), canonicalJson(prior), "m1-deploy-protected-binding-drift");
  return Object.freeze({ passed: true, authorityChanged: false, identityChanged: false,
    protectedProductDataChanged: false, privateValuesIncluded: false,
    priorConfigurationDigest: plan.priorConfigurationDigest, successorConfigurationDigest: plan.successorConfigurationDigest });
}

const fail = code => Object.assign(new Error(code), { code });
const requireThat = (condition, code) => { if (!condition) throw fail(code); };
const SHA = /^[a-f0-9]{64}$/u;
export const M1_EVIDENCE_FILE_LIMITS = Object.freeze({ grades: 64 * 1024 * 1024, runtimeSeal: 1024 * 1024,
  focusedReview: 4 * 1024 * 1024, plan: 1024 * 1024, configuration: 1024 * 1024 });

export function parseM1EvidenceBytes(input, { limit, expectedSha256, errorCode }) {
  requireThat(Buffer.isBuffer(input) || input instanceof Uint8Array, "m1-deploy-evidence-bytes-required");
  const bytes = Buffer.from(input);
  requireThat(bytes.length > 0 && bytes.length <= limit, "m1-deploy-evidence-size-invalid");
  requireThat(SHA.test(expectedSha256 ?? "") && sha256(bytes) === expectedSha256, errorCode);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw fail("m1-deploy-evidence-json-invalid"); }
}

function assertIndependentGradeLedger(grades, runtimeSealSha256) {
  requireThat(Array.isArray(grades) && grades.length === ACCEPTANCE_POLICY.plannedTaskAttemptsAllCandidates + CONTROL_CASES.length,
    "m1-deploy-grade-ledger-incomplete");
  for (const grade of grades) {
    const item = (grade?.control === true ? CONTROL_CASES : MODEL_CASES).find(value => value.id === grade?.caseId);
    requireThat(item && typeof grade.control === "boolean" && grade.schemaVersion === ASSERTION_SCHEMA_VERSION && grade.caseBundleSha256 === CASE_BUNDLE_SHA256,
      "m1-deploy-grade-schema-invalid");
    requireThat(grade.runtimeSealSha256 === runtimeSealSha256, "m1-deploy-grade-runtime-mismatch");
    requireThat(["pass", "fail", "inconclusive", "blocked", "not-implemented"].includes(grade.status)
      && grade.passed === (grade.status === "pass") && Array.isArray(grade.problems), "m1-deploy-grade-status-invalid");
    const required = enumerateCaseChecks(item);
    requireThat(Array.isArray(grade.checks) && grade.checks.length === required.length
      && new Set(grade.checks.map(value => value.checkId)).size === required.length, "m1-deploy-grade-checks-incomplete");
    for (const check of required) {
      const result = grade.checks.find(value => value.checkId === check.checkId);
      requireThat(result?.kind === check.kind && canonicalJson(result.expected) === canonicalJson(check.expected)
        && ["pass", "fail", "inconclusive", "not-implemented"].includes(result.status)
        && result.passed === (result.status === "pass"), "m1-deploy-grade-check-invalid");
    }
    requireThat(Array.isArray(grade.criticalModelFailures) && Array.isArray(grade.criticalProductFailures)
      && canonicalJson(grade.criticalModelFailures) === canonicalJson(grade.checks.filter(value => value.criticalModelFailure === true).map(value => value.checkId))
      && canonicalJson(grade.criticalProductFailures) === canonicalJson(grade.checks.filter(value => value.criticalProductFailure === true).map(value => value.checkId)),
    "m1-deploy-critical-ledger-mismatch");
    if (grade.passed) requireThat(grade.observationStatus === "completed" && grade.problems.length === 0
      && grade.checks.every(value => value.status === "pass"), "m1-deploy-success-with-failed-checks");
    requireThat(grade.control === true ? grade.providerCalls === 0 : Number.isSafeInteger(grade.providerCalls) && grade.providerCalls > 0,
      "m1-deploy-model-attempt-unproven");
    requireThat(grade.repairs === null || Number.isSafeInteger(grade.repairs) && grade.repairs >= 0
      && grade.repairs <= ACCEPTANCE_POLICY.maximumRepairPlansPerTaskAttempt, "m1-deploy-repair-budget-exceeded");
  }
}

/** Single fail-closed entry point for deployment. A projection pass and a campaign
 * pass are NOT independently sufficient: exact file bytes, code and every role's
 * tested settings must describe this same successor. This performs no I/O or writes.
 * The caller authenticates the plan digest and verifies the release artifact.
 * Harness grades are trusted evaluator artifacts, not model-supplied summaries. */
export function assertQualifiedM1Successor({ prior, successor, plan, gradesBytes, runtimeSealBytes,
  focusedReviewEvidence = null, expectedSourceCommit }) {
  requireThat(/^[a-f0-9]{40}$/u.test(expectedSourceCommit ?? ""), "m1-deploy-source-commit-required");
  let projection;
  try { projection = assertM1SuccessorProjection(prior, successor, plan); }
  catch (error) {
    const code = /^m1-deploy-[a-z0-9-]+$/u.test(error?.message ?? "") ? error.message : "m1-deploy-projection-invalid";
    throw fail(code);
  }
  const grades = parseM1EvidenceBytes(gradesBytes, { limit: M1_EVIDENCE_FILE_LIMITS.grades,
    expectedSha256: plan.acceptanceGradesSha256, errorCode: "m1-deploy-grades-byte-mismatch" });
  const sealValue = parseM1EvidenceBytes(runtimeSealBytes, { limit: M1_EVIDENCE_FILE_LIMITS.runtimeSeal,
    expectedSha256: plan.runtimeSealSha256, errorCode: "m1-deploy-runtime-seal-byte-mismatch" });
  let seal;
  try { seal = validateRuntimeSeal(sealValue, { sourceCommit: expectedSourceCommit }); }
  catch { throw fail("m1-deploy-runtime-seal-invalid"); }
  const frozenSuites = Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? []).map(suite => [suite.suiteId, hash(suite)])));
  requireThat(Object.entries(frozenSuites).every(([id, digest]) => seal.suites[id] === digest), "m1-deploy-suite-contract-drift");
  assertIndependentGradeLedger(grades, plan.runtimeSealSha256);
  const supplementalRoles = focusedReviewEvidence
    ? { review: validateFocusedGemmaReviewEvidence(focusedReviewEvidence) }
    : {};
  let campaign;
  try { campaign = requireQualifiedRoleSelection(grades, successor.provider, supplementalRoles); }
  catch (error) {
    throw fail(/^m1-deploy-[a-z0-9-]+$/u.test(error?.message ?? "") ? error.message : "m1-deploy-selected-role-unqualified");
  }
  requireThat(Object.keys(successor.provider.models).length === ACCEPTANCE_POLICY.roles.length,
    "m1-deploy-role-contract-invalid");
  for (const role of ACCEPTANCE_POLICY.roles) {
    const modelId = successor.provider.models[role];
    const candidates = seal.candidates.filter(value => value.modelId === modelId && M1_CANDIDATE_MODELS[value.candidateId] === modelId);
    requireThat(candidates.length === 1, "m1-deploy-selected-model-not-sealed");
    const candidate = candidates[0];
    requireThat(campaign.candidates.find(value => value.candidateId === candidate.candidateId)?.roles.find(value => value.role === role)?.qualified === true
      || supplementalRoles[role]?.passed === true && supplementalRoles[role].modelId === modelId,
      "m1-deploy-selected-role-unqualified");
    // In particular, null means omit the wire field; it is not the string "none".
    requireThat(canonicalJson(successor.functionFirst.requestControls[role]) === canonicalJson(candidate.requestControls[role]),
      "m1-deploy-role-request-controls-drift");
    requireThat(SHA.test(candidate.artifactSha256) && Number.isSafeInteger(candidate.artifactBytes) && candidate.artifactBytes > 0,
      "m1-deploy-model-artifact-unbound");
  }
  // Evaluation uses owned ephemeral proxies/collections. The plan explicitly
  // projects those onto a retained private production index; endpoint equality
  // would be incorrect. Algorithms/models/limits stay exact, and the projection
  // schema enforces allowed private endpoints and preserves the provider boundary.
  requireThat(successor.functionFirst.embedding.modelId === seal.embedding.modelId
    && successor.functionFirst.embedding.dimension === 768, "m1-deploy-embedding-contract-drift");
  for (const field of ["windowCharacters", "overlapCharacters", "batchSize"]) {
    requireThat(successor.functionFirst.reranker[field] === seal.reranker[field], "m1-deploy-reranker-contract-drift");
  }
  return Object.freeze({ schemaVersion: "runaai-m1-successor-verification/v1", passed: true,
    sourceCommit: expectedSourceCommit, acceptanceGradesSha256: plan.acceptanceGradesSha256,
    runtimeSealSha256: plan.runtimeSealSha256, priorConfigurationDigest: projection.priorConfigurationDigest,
    successorConfigurationDigest: projection.successorConfigurationDigest, selectedRolesVerified: ACCEPTANCE_POLICY.roles.length,
    focusedReviewEvidenceSha256: supplementalRoles.review?.checkerSha256 ?? null,
    authorityChanged: false, identityChanged: false, protectedProductDataChanged: false,
    productionChanged: false, humanTrialStillRequired: true, privateValuesIncluded: false });
}
