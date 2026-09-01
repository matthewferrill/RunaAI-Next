import test from "node:test";
import assert from "node:assert/strict";
import { classifyCampaignFailure, pauseableObservationFailure } from "./campaign-failure.mjs";

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

test("provider and semantic failures remain model-attributed and consume a record", () => {
  for (const code of ["m1-provider-output-invalid", "m1-model-critical-fabrication", "m1-semantic-answer-unacceptable"]) {
    const value = classifyCampaignFailure(code, { phase: "provider" });
    assert.equal(value.category, "model");
    assert.equal(value.consumeAttempt, true);
    assert.equal(value.gradeModel, true);
  }
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
