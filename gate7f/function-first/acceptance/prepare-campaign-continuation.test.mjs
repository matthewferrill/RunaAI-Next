import test from "node:test";
import assert from "node:assert/strict";
import { prepareCampaignContinuation } from "./prepare-campaign-continuation.mjs";

const hex = value => value.repeat(64);
const attempts = ["a", "b", "c", "d"].map((attemptId, index) => ({ attemptId, candidateId: "candidate", caseId: `case-${index}`, repetition: 1 }));
const bindings = { priorResultSha256: hex("a"), priorPlanSha256: hex("b"), priorRuntimeSealSha256: hex("c") };
const boundObservation = (row, failures = []) => ({ candidateId: row.candidateId, caseId: row.caseId,
  repetition: row.repetition, runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"), failures });

test("retains the immutable completed prefix and resumes at the first harness-attributed row", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"), plannedCandidateAttempts: 4, recordedAttempts: 3,
    attempts: [{ ...attempts[0], status: "completed" }, { ...attempts[1], status: "failed" }, { ...attempts[2], status: "interrupted" }],
    notExecuted: ["d"], stopCode: "m1-campaign-operator-stop" };
  const observations = new Map([
    ["a", boundObservation(attempts[0])],
    ["b", boundObservation(attempts[1], [{ phase: "browser", errorCode: "m1-browser-checkpoint-unobserved" }])],
    ["c", boundObservation(attempts[2], [{ phase: "runner", errorCode: "m1-campaign-operator-stop" }])],
  ]);
  const value = prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations, bindings });
  assert.deepEqual(value.retainedPrefixResult.attempts.map(row => row.attemptId), ["a"]);
  assert.deepEqual(value.continuationPlan.attempts.map(row => row.attemptId), ["b", "c", "d"]);
  assert.equal(value.audit.resumeAttemptId, "b");
  assert.equal(value.audit.retainedPrefixAttempts, 1);
  assert.deepEqual(value.audit.discardedHistoricalAttempts.map(row => row.attemptId), ["b", "c"]);
});

test("refuses to continue a complete campaign", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"), plannedCandidateAttempts: 4, recordedAttempts: 4,
    attempts: attempts.map(row => ({ ...row, status: "completed" })), notExecuted: [], stopCode: null };
  const observations = new Map(attempts.map(row => [row.attemptId, boundObservation(row)]));
  assert.throws(() => prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations, bindings }), /campaign-complete/u);
});

test("refuses to discard a model-attributed result after the first non-model row", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"),
    plannedCandidateAttempts: 4, recordedAttempts: 3,
    attempts: [{ ...attempts[0], status: "completed" }, { ...attempts[1], status: "failed" },
      { ...attempts[2], status: "failed" }], notExecuted: ["d"], stopCode: "m1-browser-checkpoint-unobserved" };
  const observations = new Map([
    ["a", boundObservation(attempts[0])],
    ["b", boundObservation(attempts[1], [{ phase: "browser", errorCode: "m1-browser-checkpoint-unobserved" }])],
    ["c", boundObservation(attempts[2], [{ phase: "provider", errorCode: "m1-provider-output-invalid" }])],
  ]);
  assert.throws(() => prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations, bindings }),
    /m1-continuation-model-result-discarded/u);
});

test("refuses to discard a clean model-success row after the first non-model row", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"),
    plannedCandidateAttempts: 4, recordedAttempts: 3,
    attempts: [{ ...attempts[0], status: "completed" }, { ...attempts[1], status: "failed" },
      { ...attempts[2], status: "completed" }], notExecuted: ["d"], stopCode: "m1-browser-checkpoint-unobserved" };
  const observations = new Map([
    ["a", boundObservation(attempts[0])],
    ["b", boundObservation(attempts[1], [{ phase: "browser", errorCode: "m1-browser-checkpoint-unobserved" }])],
    ["c", boundObservation(attempts[2])],
  ]);
  assert.throws(() => prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations, bindings }),
    /m1-continuation-model-result-discarded/u);
});

test("validates late observations after the first non-model row", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"),
    plannedCandidateAttempts: 4, recordedAttempts: 3,
    attempts: [{ ...attempts[0], status: "completed" }, { ...attempts[1], status: "failed" },
      { ...attempts[2], status: "interrupted" }], notExecuted: ["d"], stopCode: "m1-browser-checkpoint-unobserved" };
  const observations = new Map([
    ["a", boundObservation(attempts[0])],
    ["b", boundObservation(attempts[1], [{ phase: "browser", errorCode: "m1-browser-checkpoint-unobserved" }])],
    ["c", { ...boundObservation(attempts[2], [{ phase: "runner", errorCode: "m1-campaign-operator-stop" }]), caseId: "wrong" }],
  ]);
  assert.throws(() => prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations, bindings }),
    /m1-continuation-observation-binding-invalid/u);
});

test("refuses to invent an operator stop for an incomplete clean prefix", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"),
    plannedCandidateAttempts: 4, recordedAttempts: 1, attempts: [{ ...attempts[0], status: "completed" }],
    notExecuted: ["b", "c", "d"], stopCode: null };
  const observations = new Map([["a", boundObservation(attempts[0])]]);
  assert.throws(() => prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations, bindings }),
    /m1-continuation-non-model-stop-missing/u);
});

test("refuses an unbound observation even when top-level plan and result hashes were supplied", () => {
  const priorPlan = { candidateId: "candidate", attempts };
  const priorResult = { candidateId: "candidate", runtimeSealSha256: hex("c"), caseBundleSha256: hex("d"),
    plannedCandidateAttempts: 4, recordedAttempts: 1, attempts: [{ ...attempts[0], status: "failed" }] };
  assert.throws(() => prepareCampaignContinuation({ priorResult, priorPlan,
    observationsByAttemptId: new Map([["a", { ...boundObservation(attempts[0]), caseId: "wrong" }]]), bindings }),
  /m1-continuation-observation-binding-invalid/u);
});
