import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateFocusedGemmaReviewEvidence } from "./gemma-primary-qualification.mjs";

const root = new URL("./readiness/evidence/20260902-focused-gemma-review/", import.meta.url);
const load = async name => Buffer.from(await readFile(new URL(name, root)));
const inputs = async () => ({
  gradeBytes: await load("focused-review-grade.json"),
  answerBytes: await load("focused-review-20260902-f17e80070418.json"),
  checkerBytes: await load("focused-review-checker-20260902-cb6e5785b5af.json"),
});

test("exact retained actual-system Review evidence qualifies Gemma for the bounded Review role", async () => {
  const result = validateFocusedGemmaReviewEvidence(await inputs());
  assert.equal(result.passed, true);
  assert.equal(result.modelId, "gemma-4-26b-a4b-it-qat");
  assert.equal(result.semanticAnswersPassed, 8);
  assert.equal(result.checkerContractsPassed, 8);
  assert.equal(result.productionChanged, false);
});

test("reformatted, substituted or incomplete Review evidence fails closed", async () => {
  const original = await inputs();
  for (const [field, bytes] of [
    ["gradeBytes", Buffer.from(JSON.stringify(JSON.parse(original.gradeBytes)))],
    ["answerBytes", Buffer.concat([original.answerBytes, Buffer.from(" ")])],
    ["checkerBytes", Buffer.from("{}")],
  ]) await assert.rejects(async () => validateFocusedGemmaReviewEvidence({ ...original, [field]: bytes }), /m1-gemma-review-/u);
});
