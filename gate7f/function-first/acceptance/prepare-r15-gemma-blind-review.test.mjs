import test from "node:test";
import assert from "node:assert/strict";

import { parseR15GemmaBlindReviewArguments } from "./prepare-r15-gemma-blind-review.mjs";

const h = "a".repeat(64), prefix = "b".repeat(16);
function argv(overrides = {}) {
  const value = { "owned-root": `C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-${"f".repeat(32)}`,
    "eligibility-manifest": "acceptance-evidence/r15-gemma-eligibility-arm.json", "eligibility-manifest-sha256": h,
    "batch-result": `acceptance-evidence/campaign-gemma4-26b-a4b-${prefix}/result.json`, "batch-result-sha256": h,
    "private-output-directory": "acceptance-evidence/operator-review-binding",
    "worksheet-output-directory": "acceptance-evidence/candidate-blind-review", ...overrides };
  return Object.entries(value).flatMap(([key, item]) => [`--${key}`, item]);
}

test("review identity binding and blind worksheet paths are physically separated", () => {
  const value = parseR15GemmaBlindReviewArguments(argv());
  assert.notEqual(value["private-output-directory"], value["worksheet-output-directory"]);
  assert.equal(value["worksheet-output-directory"].includes("gemma"), false);
  assert.throws(() => parseR15GemmaBlindReviewArguments(argv({ "worksheet-output-directory":
    "acceptance-evidence/r15-gemma-blind-review" })), /r15-gemma-review-argument-invalid/u);
  assert.throws(() => parseR15GemmaBlindReviewArguments(argv({ "private-output-directory":
    "acceptance-evidence/candidate-blind-review" })), /r15-gemma-review-argument-invalid/u);
});
