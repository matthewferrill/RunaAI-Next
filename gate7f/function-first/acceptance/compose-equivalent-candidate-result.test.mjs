import assert from "node:assert/strict";
import test from "node:test";
import { composeEquivalentCandidateResult } from "./compose-equivalent-candidate-result.mjs";

const hex = character => character.repeat(64);
const candidate = { candidateId: "qwen", modelId: "qwen-model", artifactSha256: hex("a"), requestControls: { review: { reasoningEffort: "none" } } };
const seal = (sourceCommit, archive, telemetry) => ({
  candidates: [candidate], caseBundleSha256: hex("b"), embedding: { artifactSha256: hex("c") }, evaluatorId: "evaluator",
  maximumBatchMs: 1000, productionRoutingChanged: false, providerBaseUrl: "http://127.0.0.1:1/v1",
  qualificationCriteria: { sha256: hex("d") }, reranker: { artifactSha256: hex("e") },
  residency: { effectiveReasoningEvidenceSha256: hex("f"), oneLargeModelAtATime: true,
    readinessEvidenceSha256: hex("1"), telemetryPolicySha256: telemetry },
  roles: { review: { deadlineMs: 10 } }, runtime: { modelRuntimeSha256: hex("2"), modelRuntimeVersion: "v",
    nodeSha256: hex("3"), packageLockSha256: hex("4"), qdrantSha256: hex("5"), sourceArchiveSha256: archive },
  schemaVersion: "seal/v1", sourceCommit, suites: { suite: hex("6") },
});
const row = attemptId => ({ attemptId, candidateId: "qwen" });
const fixture = () => {
  const priorSeal = seal("old", hex("7"), hex("8"));
  const supplementalSeal = seal("new", hex("9"), hex("0"));
  return {
    priorResult: { candidateId: "qwen", sourceCommit: "old", runtimeSealSha256: hex("a"), caseBundleSha256: hex("b"),
      plannedCandidateAttempts: 3, recordedAttempts: 2, attempts: [row("a"), row("b")], notExecuted: ["c"], stopCode: "hard-stop" },
    supplementalResult: { candidateId: "qwen", sourceCommit: "new", runtimeSealSha256: hex("c"), caseBundleSha256: hex("b"),
      plannedCandidateAttempts: 1, recordedAttempts: 1, attempts: [row("c")], notExecuted: [], stopCode: null },
    priorPlan: { candidateId: "qwen", attempts: [row("a"), row("b"), row("c")] },
    supplementalPlan: { candidateId: "qwen", attempts: [row("c")] }, priorSeal, supplementalSeal,
    bindings: { priorResultSha256: hex("d"), supplementalResultSha256: hex("e"),
      priorRuntimeSealSha256: hex("a"), supplementalRuntimeSealSha256: hex("c") },
  };
};

test("composes an exact timing-only completion while preserving both windows", () => {
  const output = composeEquivalentCandidateResult(fixture());
  assert.equal(output.result.recordedAttempts, 3);
  assert.deepEqual(output.result.attempts.map(item => item.attemptId), ["a", "b", "c"]);
  assert.equal(output.result.equivalenceCompositionPermitted, true);
  assert.equal(output.result.productQualificationPassed, false);
  assert.equal(output.audit.singleUninterruptedArmClaimed, false);
});

test("rejects a model-facing change", () => {
  const input = fixture();
  input.supplementalSeal.roles.review.deadlineMs = 11;
  assert.throws(() => composeEquivalentCandidateResult(input), /unexpected-runtime-seal-difference/);
});

test("rejects completion identities that differ from the original missing set", () => {
  const input = fixture();
  input.supplementalResult.attempts = [row("d")];
  input.supplementalPlan.attempts = [row("d")];
  assert.throws(() => composeEquivalentCandidateResult(input), /supplemental-identity-mismatch/);
});
