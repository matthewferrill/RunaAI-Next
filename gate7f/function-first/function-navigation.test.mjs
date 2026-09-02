import test from "node:test";
import assert from "node:assert/strict";
import { FUNCTION_CATALOG, FUNCTION_NAMES, PRIMARY_FUNCTION_NAMES, functionNameForContext, functionTarget } from "../../gate6b/public/function-navigation.mjs";
import { answerLaneAllowed, functionModeAllowed } from "../../gate6b/function-contract.mjs";

test("three primary destinations expose Review and Agent only as contextual functions", () => {
  assert.deepEqual(FUNCTION_NAMES, ["chat", "research", "review", "code", "agent"]);
  assert.deepEqual(PRIMARY_FUNCTION_NAMES, ["chat", "code", "research"]);
  for (const name of FUNCTION_NAMES) {
    const item = functionTarget(name);
    assert.equal(item.name, name);
    assert.ok(item.label && item.title && item.description && item.placeholder && item.greeting);
  }
  assert.deepEqual(Object.values(FUNCTION_CATALOG).filter(item => item.experience === "code").map(item => item.name), ["code", "agent"]);
});

test("visible functions map onto existing authority-preserving experience and lane controls", () => {
  assert.equal(functionNameForContext("chat", "conversation"), "chat");
  assert.equal(functionNameForContext("chat", "research"), "research");
  assert.equal(functionNameForContext("chat", "review"), "review");
  assert.equal(functionNameForContext("code", "conversation"), "code");
  assert.equal(functionNameForContext("code", "work"), "agent");
  assert.throws(() => functionNameForContext("code", "review"), /invalid-function-context/u);
  assert.throws(() => functionNameForContext("chat", "work"), /invalid-function-context/u);
  assert.throws(() => functionTarget("comparison"), /unknown-function/u);
});

test("one canonical matrix rejects mismatched UI modes and answer lanes", () => {
  assert.equal(functionModeAllowed("chat", "review"), true);
  assert.equal(functionModeAllowed("code", "work"), true);
  assert.equal(functionModeAllowed("code", "review"), false);
  assert.equal(functionModeAllowed("chat", "work"), false);
  assert.equal(answerLaneAllowed("chat", "research"), true);
  assert.equal(answerLaneAllowed("code", "code"), true);
  assert.equal(answerLaneAllowed("code", "review"), false);
  assert.equal(answerLaneAllowed("chat", "code"), false);
});
