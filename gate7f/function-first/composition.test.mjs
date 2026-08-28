import assert from "node:assert/strict";
import test from "node:test";
import { validateTrustedTaskHooks, composeM1Functions } from "./composition.mjs";

test("production composition has no task hooks by default", () => {
  assert.deepEqual(validateTrustedTaskHooks(), {});
  assert.equal(Object.isFrozen(validateTrustedTaskHooks()), true);
});

test("trusted task hooks are copied and limited to known lifecycle functions", () => {
  const seen = [], input = { afterMaterialize: value => seen.push(value) };
  const hooks = validateTrustedTaskHooks(input);
  input.afterMaterialize = () => { throw new Error("mutated source"); };
  hooks.afterMaterialize("actual retained materialization");
  assert.deepEqual(seen, ["actual retained materialization"]);
  assert.equal(Object.isFrozen(hooks), true);
});

test("unknown, serialized and inherited hooks fail without evaluating getters", () => {
  const getter = Object.defineProperty({}, "afterMaterialize", { get() { throw new Error("getter invoked"); } });
  for (const value of [null, [], "afterMaterialize", { afterMaterialize: "code" }, { dispatch: () => {} },
    Object.create({ afterMaterialize() {} }), { [Symbol("hook")]: () => {} }, getter]) {
    assert.throws(() => validateTrustedTaskHooks(value), /m1-trusted-task-hooks-invalid/);
  }
});

test("invalid hook construction fails before configuration or any dependency side effect", async () => {
  await assert.rejects(composeM1Functions({ taskHooks: { execute: () => {} } }), /m1-trusted-task-hooks-invalid/);
});
