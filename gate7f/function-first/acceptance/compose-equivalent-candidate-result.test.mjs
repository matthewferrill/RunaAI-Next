import assert from "node:assert/strict";
import test from "node:test";
import { composeEquivalentCandidateHistoryResult, composeEquivalentCandidateResult } from "./compose-equivalent-candidate-result.mjs";
import { ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";

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
      plannedCandidateAttempts: 3, recordedAttempts: 2, attempts: [row("a"), row("b")], notExecuted: ["c"], stopCode: "m1-campaign-batch-hard-stop" },
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

test("rejects a non-prefix prior window and a model-attributed stop", () => {
  const nonPrefix = fixture();
  nonPrefix.priorResult.attempts = [row("a"), row("c")]; nonPrefix.priorResult.notExecuted = ["b"];
  nonPrefix.supplementalResult.attempts = [row("b")]; nonPrefix.supplementalPlan.attempts = [row("b")];
  assert.throws(() => composeEquivalentCandidateResult(nonPrefix), /supplemental-identity-mismatch/u);
  const modelStop = fixture(); modelStop.priorResult.stopCode = "m1-model-response-invalid";
  assert.throws(() => composeEquivalentCandidateResult(modelStop), /prior-stop-not-non-model/u);
});

function historyFixture() {
  const id = "qwen36-27b-mtp", baseRows = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, repetition) =>
    MODEL_CASES.map(item => ({ attemptId: `${id}--${item.id}--${repetition + 1}`, candidateId: id,
      caseId: item.id, role: item.role, repetition: repetition + 1 }))).flat();
  const currentSeal = seal("new", hex("9"), hex("0")); currentSeal.candidates = [{ ...candidate, candidateId: id }];
  const firstSeal = seal("old1", hex("7"), hex("8")); firstSeal.candidates = structuredClone(currentSeal.candidates);
  const secondSeal = seal("old2", hex("6"), hex("7")); secondSeal.candidates = structuredClone(currentSeal.candidates);
  const basePlan = { candidateId: id, sourceCommit: "new", runtimeSealSha256: hex("c"), caseBundleSha256: hex("b"),
    modelId: currentSeal.candidates[0].modelId, roster: [id], createdAt: "prepared", plannedCampaignAttempts: 360,
    plannedCandidateAttempts: 120, attempts: baseRows };
  const definitions = [
    { index: 1, kind: "original", startOrdinal: 1, endOrdinal: 68, retainedAttempts: 68,
      resultSha256: hex("1"), planSha256: hex("2"), runtimeSealSha256: hex("3") },
    { index: 2, kind: "continuation", startOrdinal: 69, endOrdinal: 69, retainedAttempts: 1,
      resultSha256: hex("4"), planSha256: hex("5"), runtimeSealSha256: hex("6") },
  ];
  const window = (definition, offset, sourceCommit, sealValue) => ({ definition,
    resultSha256: definition.resultSha256, planSha256: definition.planSha256,
    runtimeSealSha256: definition.runtimeSealSha256, seal: sealValue,
    plan: { candidateId: id, sourceCommit, runtimeSealSha256: definition.runtimeSealSha256,
      caseBundleSha256: hex("b"), modelId: basePlan.modelId, roster: basePlan.roster,
      attempts: structuredClone(baseRows.slice(offset)) },
    result: { candidateId: id, sourceCommit, runtimeSealSha256: definition.runtimeSealSha256,
      caseBundleSha256: hex("b"), plannedCandidateAttempts: 120 - offset,
      recordedAttempts: definition.retainedAttempts,
      attempts: structuredClone(baseRows.slice(offset, offset + definition.retainedAttempts)),
      notExecuted: baseRows.slice(offset + definition.retainedAttempts).map(value => value.attemptId),
      stopCode: "m1-campaign-unknown-failure" } });
  const windows = [window(definitions[0], 0, "old1", firstSeal), window(definitions[1], 68, "old2", secondSeal)];
  const basePlanSha256 = hex("a"), historyManifestSha256 = hex("b"), currentRuntimeSealSha256 = hex("c"),
    finalResultSha256 = hex("d"), finalPlanSha256 = hex("e");
  const provenance = { schemaVersion: "runaai-m1-campaign-continuation-provenance/v1", historyManifestSha256,
    basePlanSha256, retainedPrefixAttempts: 69, resumeAttemptId: baseRows[69].attemptId,
    priorWindows: definitions.map((definition, index) => ({ index: definition.index, kind: definition.kind,
      startOrdinal: definition.startOrdinal, endOrdinal: definition.endOrdinal, resultSha256: definition.resultSha256,
      planSha256: definition.planSha256, runtimeSealSha256: definition.runtimeSealSha256,
      retainedAttempts: definition.retainedAttempts, sourceCommit: windows[index].result.sourceCommit })),
    singleUninterruptedArmClaimed: false };
  const continuationPlan = { ...basePlan, schemaVersion: "runaai-m1-campaign-continuation-plan/v2",
    historyManifestSha256, basePlanSha256, retainedPrefixAttempts: 69, resumeAttemptId: baseRows[69].attemptId,
    plannedCampaignAttempts: 51, plannedCandidateAttempts: 51, attempts: structuredClone(baseRows.slice(69)),
    continuation: true, supplemental: true, continuationHistory: provenance, qualificationCompositionPermitted: false };
  const finalResult = { candidateId: id, sourceCommit: "new", runtimeSealSha256: currentRuntimeSealSha256,
    caseBundleSha256: hex("b"), plannedCandidateAttempts: 51, recordedAttempts: 51,
    attempts: structuredClone(baseRows.slice(69)), notExecuted: [], stopCode: null };
  return { history: { schemaVersion: "runaai-m1-campaign-continuation-history/v1", candidateId: id,
    basePlanSha256, retainedPrefixAttempts: 69, resumeAttemptId: baseRows[69].attemptId, windows: definitions },
    windows, basePlan, finalResult, continuationPlan, currentSeal,
    bindings: { basePlanSha256, historyManifestSha256, currentRuntimeSealSha256,
      finalResultSha256, loadedFinalResultSha256: finalResultSha256,
      finalPlanSha256, loadedFinalPlanSha256: finalPlanSha256 } };
}

test("composes exactly 68 plus 1 plus 51 rows and discloses all three execution windows", () => {
  const value = composeEquivalentCandidateHistoryResult(historyFixture());
  assert.equal(value.result.recordedAttempts, 120); assert.equal(value.result.executionWindows.length, 3);
  assert.deepEqual(value.result.executionWindows.map(window => [window.startOrdinal, window.endOrdinal]),
    [[1, 68], [69, 69], [70, 120]]);
  assert.equal(value.audit.singleUninterruptedArmClaimed, false);
  assert.equal(value.result.productQualificationPassed, false);
});

test("history composition rejects a retained Agent06 row, an incomplete final suffix, and either prior seal drift", () => {
  const retainedAgent06 = historyFixture(); retainedAgent06.windows[1].result.attempts[0] = structuredClone(retainedAgent06.basePlan.attempts[69]);
  assert.throws(() => composeEquivalentCandidateHistoryResult(retainedAgent06), /window-identities-invalid/u);
  const incomplete = historyFixture(); incomplete.finalResult.attempts.pop(); incomplete.finalResult.recordedAttempts = 50;
  assert.throws(() => composeEquivalentCandidateHistoryResult(incomplete), /final-invalid/u);
  for (const index of [0, 1]) {
    const drift = historyFixture(); drift.windows[index].seal.roles.review.deadlineMs = 11;
    assert.throws(() => composeEquivalentCandidateHistoryResult(drift), /unexpected-runtime-seal-difference/u);
  }
  const provenance = historyFixture(); provenance.continuationPlan.continuationHistory.priorWindows[1].resultSha256 = hex("9");
  assert.throws(() => composeEquivalentCandidateHistoryResult(provenance), /final-invalid/u);
  const sourceModel = historyFixture(); sourceModel.windows[1].plan.modelId = "other";
  assert.throws(() => composeEquivalentCandidateHistoryResult(sourceModel), /window-invalid/u);
  for (const [field, value] of [["modelId", "coordinated-other"], ["sourceCommit", "coordinated-source"],
    ["caseBundleSha256", hex("9")], ["runtimeSealSha256", hex("9")]]) {
    const coordinated = historyFixture(); coordinated.basePlan[field] = value; coordinated.continuationPlan[field] = value;
    if (field === "modelId") coordinated.windows.forEach(window => { window.plan.modelId = value; });
    assert.throws(() => composeEquivalentCandidateHistoryResult(coordinated), /history-composition-binding-invalid/u);
  }
});
