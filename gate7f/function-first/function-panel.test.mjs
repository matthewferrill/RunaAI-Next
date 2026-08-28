import test from "node:test";
import assert from "node:assert/strict";
import { functionAnswerSelection, functionDescription } from "../../gate6b/public/function-panel.mjs";
test("ordinary conversation keeps Chat and Code routes separate", () => {
  assert.deepEqual(functionAnswerSelection("conversation", [], "chat"), { lane: "general" });
  assert.deepEqual(functionAnswerSelection("conversation", [], "code"), { lane: "code" });
});

test("function descriptions distinguish drafts, selected research, review and real bounded work", () => {
  assert.match(functionDescription("conversation", "code"), /draft is not execution/i);
  assert.match(functionDescription("work", "code"), /edit and run its fixed tests/);
  assert.match(functionDescription("work", "code"), /approval profile/);
  assert.match(functionDescription("research", "chat"), /not live web research/);
  assert.match(functionDescription("review", "code"), /does not edit or execute/);
  assert.doesNotMatch(functionDescription("work", "chat"), /can plan, inspect, edit/);
});
test("research/review requires an explicit bounded source selection", () => {
  for (const mode of ["research", "review"]) {
    assert.throws(() => functionAnswerSelection(mode, [], "chat"), /Select/);
    assert.throws(() => functionAnswerSelection(mode, Array(7).fill({}), "chat"), /Select/);
    assert.deepEqual(functionAnswerSelection(mode, [{ sourceId: "a", sectionId: "provided", content: "not in payload" }], "code"),
      { lane: mode, workspace: { sources: [{ sourceId: "a", sectionId: "provided" }] } });
  }
});
