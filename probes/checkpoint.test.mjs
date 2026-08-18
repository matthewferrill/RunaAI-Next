// Executed test for the checkpoint mechanics (GREEN-resume.md G2 skip semantics, G3 consolidation).
import assert from "node:assert/strict";
import { skipSet, consolidate, isErrorEntry } from "./checkpoint.mjs";

const entries = [
  { caseId: "a", answer: "(error: fetch failed)" },        // errored once, then succeeded
  { caseId: "a", answer: "Rex" },
  { caseId: "b", answer: "(error: fetch failed)" },        // error-only, 3 attempts -> capped
  { caseId: "b", answer: "(error: fetch failed)" },
  { caseId: "b", answer: "(child err: spawn fail)" },
  { caseId: "c", answer: "(error: timeout)" },             // error-only, 1 attempt -> re-run
  { caseId: "d", storedMessages: 80, turns: 40 },          // no answer field -> non-error
  { caseId: "e", answer: "first" },                        // two non-errors -> latest wins
  { caseId: "e", answer: "second" },
];

const skip = skipSet(entries);
assert.ok(skip.has("a"), "non-error case is skipped");
assert.ok(skip.has("b"), "error-only case at 3 attempts is skipped");
assert.ok(!skip.has("c"), "error-only case under the attempt cap is re-run");
assert.ok(skip.has("d"), "answerless result entry counts as non-error");
assert.ok(skip.has("e"));

const out = consolidate(entries);
assert.equal(out.length, 5, "one entry per caseId");
const by = Object.fromEntries(out.map((e) => [e.caseId, e]));
assert.equal(by.a.answer, "Rex", "non-error preferred over earlier error");
assert.ok(isErrorEntry(by.b), "error-only case keeps its latest error entry");
assert.equal(by.b.answer, "(child err: spawn fail)");
assert.equal(by.e.answer, "second", "latest non-error wins");
assert.equal(by.d.storedMessages, 80);

console.log("checkpoint.test.mjs: all assertions passed");
