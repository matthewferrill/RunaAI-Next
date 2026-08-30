import test from "node:test";
import assert from "node:assert/strict";
import { describePlanProtocol, planProtocolViolations } from "./planner-protocol.mjs";

const args = { path: "index.js", content: "module.exports = 1;", expectedSha256: "a".repeat(64) };
const plan = steps => ({ summary: "bounded plan", steps });

test("effect work pairs each preview with one later byte-identical apply", () => {
  const capabilities = ["project.inspect", "project.preview-change", "project.apply-change"];
  assert.match(describePlanProtocol(capabilities, "effect-requested").previewApplyPairing, /byte-identical/);
  assert.deepEqual(planProtocolViolations(plan([
    { capabilityId: "project.preview-change", arguments: args },
    { capabilityId: "project.apply-change", arguments: structuredClone(args) },
  ]), capabilities, "effect-requested"), []);
  assert.deepEqual(planProtocolViolations(plan([
    { capabilityId: "project.preview-change", arguments: args },
  ]), capabilities, "effect-requested"), ["preview-without-matching-later-apply"]);
  assert.deepEqual(planProtocolViolations(plan([
    { capabilityId: "project.apply-change", arguments: args },
  ]), capabilities, "effect-requested"), ["apply-without-matching-earlier-preview"]);
  assert.deepEqual(planProtocolViolations(plan([
    { capabilityId: "project.apply-change", arguments: args },
    { capabilityId: "project.preview-change", arguments: args },
  ]), capabilities, "effect-requested"), ["preview-without-matching-later-apply", "apply-without-matching-earlier-preview"]);
});

test("analysis and preview intents reject effects independently of model prose", () => {
  assert.deepEqual(planProtocolViolations(plan([{ capabilityId: "project.inspect", arguments: { path: "index.js" } }]),
    ["project.inspect"], "analysis-only"), []);
  assert.deepEqual(planProtocolViolations(plan([{ capabilityId: "project.run-tests", arguments: { suiteId: "addition" } }]),
    ["project.inspect", "project.run-tests"], "analysis-only"), ["analysis-only-plan-has-non-inspection-step"]);
  assert.deepEqual(planProtocolViolations(plan([{ capabilityId: "project.preview-change", arguments: args }]),
    ["project.inspect", "project.preview-change"], "preview-only"), []);
  assert.deepEqual(planProtocolViolations(plan([{ capabilityId: "project.apply-change", arguments: args }]),
    ["project.inspect", "project.preview-change", "project.apply-change"], "preview-only"), ["preview-only-plan-has-effect-step"]);
});
