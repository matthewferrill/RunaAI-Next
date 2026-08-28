import test from "node:test";
import assert from "node:assert/strict";
import { functionAnswerSelection } from "../../gate6b/public/function-panel.mjs";
test("ordinary conversation keeps Chat and Code routes separate", () => {
  assert.deepEqual(functionAnswerSelection("conversation", [], "chat"), { lane: "general" });
  assert.deepEqual(functionAnswerSelection("conversation", [], "code"), { lane: "code" });
});
test("research/review requires an explicit bounded source selection", () => {
  for (const mode of ["research", "review"]) {
    assert.throws(() => functionAnswerSelection(mode, [], "chat"), /Select/);
    assert.throws(() => functionAnswerSelection(mode, Array(7).fill({}), "chat"), /Select/);
    assert.deepEqual(functionAnswerSelection(mode, [{ sourceId: "a", sectionId: "provided", content: "not in payload" }], "code"),
      { lane: mode, workspace: { sources: [{ sourceId: "a", sectionId: "provided" }] } });
  }
});
