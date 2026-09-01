import assert from "node:assert/strict";
import test from "node:test";
import { parseHistoryCompositionArguments } from "./compose-equivalent-candidate-history-result.mjs";

test("three-window composition CLI requires one complete hash-bound mode", () => {
  const h = "a".repeat(64), argv = ["--owned-root", "x", "--history-manifest", "acceptance-evidence/history.json",
    "--history-manifest-sha256", h, "--final-result", "acceptance-evidence/final/result.json",
    "--final-result-sha256", h, "--final-plan", "acceptance-evidence/final/plan.json", "--final-plan-sha256", h,
    "--current-runtime-seal", "runtimeSeal.json", "--current-runtime-seal-sha256", h,
    "--output-directory", "acceptance-evidence/composed"];
  assert.equal(parseHistoryCompositionArguments(argv)["output-directory"], "acceptance-evidence/composed");
  assert.throws(() => parseHistoryCompositionArguments([...argv, "--output-directory", "again"]), /argument-invalid/u);
  assert.throws(() => parseHistoryCompositionArguments(argv.slice(0, -2)), /argument-invalid/u);
});
