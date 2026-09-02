import test from "node:test";
import assert from "node:assert/strict";

import { CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { canonicalR15GemmaAttempts, createR15GemmaEligibilityManifest,
  validateR15GemmaBatchResult, validateR15GemmaEligibilityManifest } from "./r15-gemma-eligibility-contract.mjs";

const hex = character => character.repeat(64);
const input = {
  armId: "r15-gemma-eligibility-1111111111111111",
  createdAt: "2026-09-02T06:00:00.000Z",
  candidateArtifactSha256: hex("1"), candidateArtifactBytes: 123,
  embeddingArtifactSha256: hex("2"), sourceCommit: "3".repeat(40), sourceArchiveSha256: hex("4"),
  sourceTreeManifestSha256: hex("5"), runtimeSealSha256: hex("6"), hardwarePlanSha256: hex("7"),
  qualificationCriteriaSha256: hex("8"), controlsSha256: hex("9"), browserProofSha256: hex("a"),
  homeReadySha256: hex("b"), homeLeaseId: "20260902-campaign-gemma-eligibility-r1", homeLeaseSealSha256: hex("c")
};
const manifest = () => createR15GemmaEligibilityManifest(input);
const batch = scope => ({
  schemaVersion: "runaai-m1-candidate-batch-result/v2", candidateId: scope.candidateId,
  sourceCommit: scope.sourceCommit, runtimeSealSha256: scope.runtimeSealSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
  plannedCampaignAttempts: 360, plannedCandidateAttempts: 120, recordedAttempts: 120,
  attempts: canonicalR15GemmaAttempts().map(slot => ({ ...slot, file: `${slot.attemptId}.json`, sha256: hex("d"),
    bytes: 100, status: "completed", preliminaryGrade: "inconclusive", passed: false, providerCalls: 1, nativeCalls: 0 })),
  notExecuted: [], stopCode: null, denominatorChanged: false, supplemental: false,
  qualificationCompositionPermitted: false, productQualificationPassed: false,
  independentSemanticReviewPending: true, humanTrialRequired: true, productionChanged: false, protectedDataRead: false,
  healthDiagnosticArtifact: { file: "health-diagnostics.json", sha256: hex("e"), bytes: 100 },
  finishedAt: "2026-09-02T07:00:00.000Z",
  evidenceDirectory: `acceptance-evidence/campaign-${scope.candidateId}-${scope.runtimeSealSha256.slice(0, 16)}`
});

test("Gemma eligibility manifest fixes one candidate, Nomic-only auxiliary use, and 120 ordered rows", () => {
  const value = manifest();
  assert.equal(value.attempts.length, 120);
  assert.equal(value.createdBeforeScoredAttempts, true);
  assert.equal(value.scoredAttemptsAtCreation, 0);
  assert.deepEqual(value.roleCounts, { chat: 24, research: 24, code: 24, agent: 24, review: 24 });
  assert.equal(value.auxiliaryEmbedding.scoredCandidate, false);
  assert.equal(value.auxiliaryEmbedding.generativeCandidate, false);
  assert.equal(value.comparativeCampaignCompletionClaimPermitted, false);
  assert.equal(value.productQualificationPassed, false);
});

test("Gemma eligibility result requires the exact canonical order and identity", () => {
  const scope = manifest(), result = batch(scope);
  const validated = validateR15GemmaBatchResult(result, scope);
  assert.equal(validated.reviewedAttempts, 120);
  assert.equal(validated.fullR15CampaignComplete, false);
  for (const mutate of [
    value => { value.attempts.pop(); value.recordedAttempts = 119; },
    value => { value.attempts[1] = structuredClone(value.attempts[0]); },
    value => { [value.attempts[0], value.attempts[1]] = [value.attempts[1], value.attempts[0]]; },
    value => { value.attempts[0].candidateId = "qwen36-27b-mtp"; },
    value => { value.attempts[0].repetition = 2; },
    value => { value.attempts[0].role = "review"; },
    value => { value.notExecuted.push(value.attempts[0].attemptId); },
    value => { value.cleanupError = "cleanup-failed"; },
    value => { value.productQualificationPassed = true; }
  ]) {
    const changed = structuredClone(result); mutate(changed);
    assert.throws(() => validateR15GemmaBatchResult(changed, scope), /r15-gemma-result/u);
  }
});

test("Gemma eligibility manifest rejects comparison, pooling, qualification, and auxiliary-model drift", () => {
  const value = manifest();
  for (const mutate of [
    item => { item.comparativeCampaign = true; },
    item => { item.comparativeCampaignCompleted = true; },
    item => { item.r14PoolingPermitted = true; },
    item => { item.productQualificationPassed = true; },
    item => { item.auxiliaryEmbedding.generativeCandidate = true; },
    item => { item.attempts.reverse(); },
    item => { item.roleCounts.review = 23; },
    item => { item.extra = "winner"; }
  ]) {
    const changed = structuredClone(value); mutate(changed);
    assert.throws(() => validateR15GemmaEligibilityManifest(changed), /r15-gemma/u);
  }
});
