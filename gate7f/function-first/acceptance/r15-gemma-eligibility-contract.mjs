import { createHash } from "node:crypto";

import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";

export const R15_GEMMA_CANDIDATE_ID = "gemma4-26b-a4b";
export const R15_GEMMA_MODEL_ID = "gemma-4-26b-a4b-it-qat";
export const R15_GEMMA_ROLES = Object.freeze(["chat", "research", "code", "agent", "review"]);
export const R15_GEMMA_REQUIRED_ATTEMPTS = 120;
export const R15_FULL_CAMPAIGN_ATTEMPTS = 360;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail(code);
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function stableSha(value) { return sha(JSON.stringify(stable(value))); }

export function r15GemmaEligibilityManifestSha256(value) {
  return stableSha(validateR15GemmaEligibilityManifest(value));
}

export function canonicalR15GemmaAttempts() {
  const attempts = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, repetition) =>
    MODEL_CASES.map(item => Object.freeze({
      attemptId: `${R15_GEMMA_CANDIDATE_ID}--${item.id}--${repetition + 1}`,
      candidateId: R15_GEMMA_CANDIDATE_ID,
      caseId: item.id,
      role: item.role,
      repetition: repetition + 1
    }))).flat();
  if (attempts.length !== R15_GEMMA_REQUIRED_ATTEMPTS
      || new Set(attempts.map(value => value.attemptId)).size !== R15_GEMMA_REQUIRED_ATTEMPTS) fail("r15-gemma-canonical-attempts");
  for (const role of R15_GEMMA_ROLES) if (attempts.filter(value => value.role === role).length !== 24) fail("r15-gemma-canonical-role-count");
  return Object.freeze(attempts);
}

export function r15GemmaAttemptPlanSha256() { return stableSha(canonicalR15GemmaAttempts()); }

const MANIFEST_KEYS = ["schemaVersion", "armId", "createdAt", "createdBeforeScoredAttempts", "scoredAttemptsAtCreation",
  "candidateId", "modelId", "candidateArtifactSha256", "candidateArtifactBytes", "auxiliaryEmbedding",
  "sourceCommit", "sourceArchiveSha256", "sourceTreeManifestSha256", "runtimeSealSha256", "hardwarePlanSha256",
  "qualificationCriteriaSha256", "caseBundleSha256", "controlsSha256", "browserProofSha256", "homeReadySha256",
  "homeLeaseId", "homeLeaseSealSha256", "attemptPlanSha256", "attempts", "roleCounts", "reviewContract",
  "comparativeCampaign", "comparativeCampaignCompleted", "comparativeCampaignCompletionClaimPermitted",
  "r14PoolingPermitted", "productQualificationPassed", "productionRoutingChanged", "protectedDataIncluded"];

export function createR15GemmaEligibilityManifest(input) {
  const attempts = canonicalR15GemmaAttempts();
  const manifest = {
    schemaVersion: "runaai-m1-r15-gemma-eligibility-arm/v1",
    armId: input.armId,
    createdAt: input.createdAt,
    createdBeforeScoredAttempts: true,
    scoredAttemptsAtCreation: 0,
    candidateId: R15_GEMMA_CANDIDATE_ID,
    modelId: R15_GEMMA_MODEL_ID,
    candidateArtifactSha256: input.candidateArtifactSha256,
    candidateArtifactBytes: input.candidateArtifactBytes,
    auxiliaryEmbedding: {
      modelId: "text-embedding-nomic-embed-text-v1.5",
      artifactSha256: input.embeddingArtifactSha256,
      purpose: "sealed-retrieval-embedding-only",
      scoredCandidate: false,
      generativeCandidate: false
    },
    sourceCommit: input.sourceCommit,
    sourceArchiveSha256: input.sourceArchiveSha256,
    sourceTreeManifestSha256: input.sourceTreeManifestSha256,
    runtimeSealSha256: input.runtimeSealSha256,
    hardwarePlanSha256: input.hardwarePlanSha256,
    qualificationCriteriaSha256: input.qualificationCriteriaSha256,
    caseBundleSha256: CASE_BUNDLE_SHA256,
    controlsSha256: input.controlsSha256,
    browserProofSha256: input.browserProofSha256,
    homeReadySha256: input.homeReadySha256,
    homeLeaseId: input.homeLeaseId,
    homeLeaseSealSha256: input.homeLeaseSealSha256,
    attemptPlanSha256: r15GemmaAttemptPlanSha256(),
    attempts,
    roleCounts: Object.fromEntries(R15_GEMMA_ROLES.map(role => [role, 24])),
    reviewContract: "runaai-m1-r15-gemma-candidate-blind-review/v1",
    comparativeCampaign: false,
    comparativeCampaignCompleted: false,
    comparativeCampaignCompletionClaimPermitted: false,
    r14PoolingPermitted: false,
    productQualificationPassed: false,
    productionRoutingChanged: false,
    protectedDataIncluded: false
  };
  return validateR15GemmaEligibilityManifest(manifest);
}

export function validateR15GemmaEligibilityManifest(value) {
  exactKeys(value, MANIFEST_KEYS, "r15-gemma-manifest-shape");
  if (value.schemaVersion !== "runaai-m1-r15-gemma-eligibility-arm/v1"
      || !/^r15-gemma-eligibility-[a-f0-9]{16}$/u.test(value.armId ?? "")
      || !Number.isFinite(Date.parse(value.createdAt)) || value.createdBeforeScoredAttempts !== true || value.scoredAttemptsAtCreation !== 0
      || value.candidateId !== R15_GEMMA_CANDIDATE_ID || value.modelId !== R15_GEMMA_MODEL_ID
      || !SHA256.test(value.candidateArtifactSha256 ?? "") || !Number.isSafeInteger(value.candidateArtifactBytes) || value.candidateArtifactBytes <= 0
      || !COMMIT.test(value.sourceCommit ?? "") || ![value.sourceArchiveSha256, value.sourceTreeManifestSha256,
        value.runtimeSealSha256, value.hardwarePlanSha256, value.qualificationCriteriaSha256, value.caseBundleSha256,
        value.controlsSha256, value.browserProofSha256, value.homeReadySha256, value.homeLeaseSealSha256].every(item => SHA256.test(item ?? ""))
      || value.caseBundleSha256 !== CASE_BUNDLE_SHA256 || typeof value.homeLeaseId !== "string" || value.homeLeaseId.length < 1
      || value.attemptPlanSha256 !== r15GemmaAttemptPlanSha256()
      || JSON.stringify(value.attempts) !== JSON.stringify(canonicalR15GemmaAttempts())
      || JSON.stringify(value.roleCounts) !== JSON.stringify(Object.fromEntries(R15_GEMMA_ROLES.map(role => [role, 24])))
      || value.reviewContract !== "runaai-m1-r15-gemma-candidate-blind-review/v1"
      || value.comparativeCampaign !== false || value.comparativeCampaignCompleted !== false
      || value.comparativeCampaignCompletionClaimPermitted !== false || value.r14PoolingPermitted !== false
      || value.productQualificationPassed !== false || value.productionRoutingChanged !== false || value.protectedDataIncluded !== false) {
    fail("r15-gemma-manifest-binding");
  }
  exactKeys(value.auxiliaryEmbedding, ["modelId", "artifactSha256", "purpose", "scoredCandidate", "generativeCandidate"], "r15-gemma-embedding-shape");
  if (value.auxiliaryEmbedding.modelId !== "text-embedding-nomic-embed-text-v1.5"
      || !SHA256.test(value.auxiliaryEmbedding.artifactSha256 ?? "")
      || value.auxiliaryEmbedding.purpose !== "sealed-retrieval-embedding-only"
      || value.auxiliaryEmbedding.scoredCandidate !== false || value.auxiliaryEmbedding.generativeCandidate !== false) {
    fail("r15-gemma-embedding-binding");
  }
  return Object.freeze(structuredClone(value));
}

export function validateR15GemmaBatchResult(value, manifest) {
  const scope = validateR15GemmaEligibilityManifest(manifest);
  const allowedResultKeys = new Set(["schemaVersion", "candidateId", "sourceCommit", "runtimeSealSha256", "caseBundleSha256",
    "plannedCampaignAttempts", "plannedCandidateAttempts", "recordedAttempts", "attempts", "notExecuted", "stopCode",
    "denominatorChanged", "supplemental", "qualificationCompositionPermitted", "productQualificationPassed",
    "independentSemanticReviewPending", "humanTrialRequired", "productionChanged", "protectedDataRead",
    "healthDiagnosticArtifact", "finishedAt", "evidenceDirectory", "cleanupError"]);
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some(key => !allowedResultKeys.has(key))
      || value.schemaVersion !== "runaai-m1-candidate-batch-result/v2"
      || value.candidateId !== scope.candidateId || value.sourceCommit !== scope.sourceCommit
      || value.runtimeSealSha256 !== scope.runtimeSealSha256 || value.caseBundleSha256 !== scope.caseBundleSha256
      || value.plannedCampaignAttempts !== R15_FULL_CAMPAIGN_ATTEMPTS || value.plannedCandidateAttempts !== R15_GEMMA_REQUIRED_ATTEMPTS
      || value.recordedAttempts !== R15_GEMMA_REQUIRED_ATTEMPTS || !Array.isArray(value.attempts)
      || value.attempts.length !== R15_GEMMA_REQUIRED_ATTEMPTS || !Array.isArray(value.notExecuted) || value.notExecuted.length !== 0
      || value.stopCode !== null || (value.cleanupError !== undefined && value.cleanupError !== null)
      || value.denominatorChanged !== false || value.supplemental !== false
      || value.qualificationCompositionPermitted !== false || value.productQualificationPassed !== false
      || value.independentSemanticReviewPending !== true || value.humanTrialRequired !== true
      || value.productionChanged !== false || value.protectedDataRead !== false) fail("r15-gemma-result-binding");
  exactKeys(value.healthDiagnosticArtifact, ["file", "sha256", "bytes"], "r15-gemma-result-health-shape");
  if (value.healthDiagnosticArtifact.file !== "health-diagnostics.json" || !SHA256.test(value.healthDiagnosticArtifact.sha256 ?? "")
      || !Number.isSafeInteger(value.healthDiagnosticArtifact.bytes) || value.healthDiagnosticArtifact.bytes < 1
      || !Number.isFinite(Date.parse(value.finishedAt))
      || value.evidenceDirectory !== `acceptance-evidence/campaign-${R15_GEMMA_CANDIDATE_ID}-${scope.runtimeSealSha256.slice(0, 16)}`)
    fail("r15-gemma-result-publication-binding");
  const expected = canonicalR15GemmaAttempts();
  const seen = new Set();
  for (let index = 0; index < expected.length; index += 1) {
    const actual = value.attempts[index], slot = expected[index];
    exactKeys(actual, ["attemptId", "candidateId", "caseId", "role", "repetition", "file", "sha256", "bytes",
      "status", "preliminaryGrade", "passed", "providerCalls", "nativeCalls"], "r15-gemma-result-attempt-shape");
    if (actual.attemptId !== slot.attemptId || actual.candidateId !== slot.candidateId
        || actual.caseId !== slot.caseId || actual.role !== slot.role || actual.repetition !== slot.repetition
        || actual.file !== `${slot.attemptId}.json` || !SHA256.test(actual.sha256 ?? "")
        || !Number.isSafeInteger(actual.bytes) || actual.bytes < 1 || seen.has(actual.attemptId)
        || !["completed", "failed", "blocked", "not-implemented", "interrupted"].includes(actual.status)
        || !["pass", "fail", "blocked", "not-implemented", "inconclusive"].includes(actual.preliminaryGrade)
        || typeof actual.passed !== "boolean" || !Number.isSafeInteger(actual.providerCalls) || actual.providerCalls < 0
        || !Number.isSafeInteger(actual.nativeCalls) || actual.nativeCalls < 0) fail("r15-gemma-result-attempt-binding");
    seen.add(actual.attemptId);
  }
  return Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-batch-validation/v1", candidateId: scope.candidateId,
    attemptPlanSha256: scope.attemptPlanSha256, reviewedAttempts: R15_GEMMA_REQUIRED_ATTEMPTS,
    roleCounts: structuredClone(scope.roleCounts), comparativeCampaign: false, fullR15CampaignComplete: false,
    productQualificationPassed: false, productionRoutingChanged: false });
}
