import test from "node:test";
import assert from "node:assert/strict";
import { classifyCampaignFailure, classifyCapturedProviderFailure, pauseableObservationFailure } from "./campaign-failure.mjs";

test("browser, publication, timeout and application defects pause without grading the model", () => {
  for (const [code, category, phase] of [
    ["m1-browser-checkpoint-unobserved", "browser-witness", "browser"],
    ["m1-browser-ack-publication-expired", "operator-publication", "browser"],
    ["EBUSY", "operator-publication", "browser-ack"],
    ["m1-campaign-publication-hard-stop", "timeout", "runner"],
    ["m1-pending-state-inconsistent", "application", "application"],
    ["m1-campaign-attempt-undrained", "harness", "attempt-drain"],
  ]) {
    const value = classifyCampaignFailure(code, { phase });
    assert.equal(value.category, category, code);
    assert.equal(value.attribution, "non-model");
    assert.equal(value.pauseCampaign, true);
    assert.equal(value.consumeAttempt, false);
    assert.equal(value.gradeModel, false);
  }
});

test("provider and semantic failures consume a model record, while a bare planner deadline fails closed", () => {
  for (const code of ["m1-provider-output-invalid", "m1-model-critical-fabrication", "m1-semantic-answer-unacceptable"]) {
    const value = classifyCampaignFailure(code, { phase: "provider" });
    assert.equal(value.category, "model");
    assert.equal(value.consumeAttempt, true);
    assert.equal(value.gradeModel, true);
  }
  const bare = classifyCampaignFailure("m1-planning-deadline", { phase: "5:run.resume" });
  assert.equal(bare.category, "harness"); assert.equal(bare.consumeAttempt, false); assert.equal(bare.gradeModel, false);
});

test("a downstream provider disconnect is model-attributed only when durable state proves the frozen planner deadline", () => {
  const value = { errorCode: "m1-capture-downstream-disconnected", phase: "5:run.resume" };
  const observation = { evidence: [{ kind: "durable-task-state", phase: "5:run.resume",
    data: { run: { errorCode: "m1-planning-deadline" } } }] };
  const deadline = classifyCapturedProviderFailure(value, observation);
  assert.equal(deadline.code, "m1-planning-deadline");
  assert.equal(deadline.category, "model");
  assert.equal(deadline.consumeAttempt, true);

  for (const unproved of [
    { ...observation, evidence: [] },
    { evidence: [{ kind: "durable-task-state", phase: "other", data: { run: { errorCode: "m1-planning-deadline" } } }] },
  ]) {
    const failure = classifyCapturedProviderFailure(value, unproved);
    assert.equal(failure.code, "m1-capture-downstream-disconnected");
    assert.equal(failure.category, "harness");
    assert.equal(failure.consumeAttempt, false);
  }
  const numeric = classifyCapturedProviderFailure({ errorCode: 20, phase: value.phase }, observation);
  assert.equal(numeric.code, "m1-campaign-unknown-failure");
  assert.equal(numeric.consumeAttempt, false);
});

test("unknown and application action failures fail closed without consuming or grading the model", () => {
  for (const [code, phase, category] of [
    ["m1-native-dispatch-not-observed", "action", "application"],
    ["m1-cancel-result-invalid", "action", "application"],
    ["m1-new-unclassified-failure", "attempt", "harness"],
  ]) {
    const value = classifyCampaignFailure(code, { phase });
    assert.equal(value.category, category);
    assert.equal(value.attribution, "non-model");
    assert.equal(value.consumeAttempt, false);
    assert.equal(value.gradeModel, false);
  }
});

test("observation classifier returns the first non-model failure and ignores model-only failures", () => {
  assert.equal(pauseableObservationFailure({ failures: [{ phase: "provider", errorCode: "m1-provider-output-invalid" }] }), null);
  const value = pauseableObservationFailure({ failures: [
    { phase: "provider", errorCode: "m1-provider-output-invalid" },
    { phase: "browser", errorCode: "m1-browser-checkpoint-unobserved" },
  ] });
  assert.equal(value.category, "browser-witness");
});

test("a direct planner deadline is model-attributed only with phase-matched durable proof", () => {
  const failure = { phase: "5:run.resume", errorCode: "m1-planning-deadline" };
  const matched = { failures: [failure], evidence: [{ kind: "durable-task-state", phase: failure.phase,
    data: { run: { errorCode: failure.errorCode } } }] };
  assert.equal(pauseableObservationFailure(matched), null);
  for (const observation of [
    { failures: [failure], evidence: [] },
    { failures: [failure], evidence: [{ kind: "durable-task-state", phase: "other", data: { run: { errorCode: failure.errorCode } } }] },
    { failures: [failure], evidence: [{ kind: "durable-task-state", phase: failure.phase, data: { run: { errorCode: "m1-other" } } }] },
  ]) {
    const value = pauseableObservationFailure(observation);
    assert.equal(value.code, "m1-planning-deadline"); assert.equal(value.category, "harness"); assert.equal(value.consumeAttempt, false);
  }
});
