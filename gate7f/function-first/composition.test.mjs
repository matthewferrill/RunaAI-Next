import assert from "node:assert/strict";
import test from "node:test";
import { createOwnedProductionComposition } from "../../gate6b/composition.mjs";
import { validateTrustedTaskHooks, composeM1Functions,
  createNativeCandidateAttachment, rejectNativeCandidateConstruction } from "./composition.mjs";

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

test("native candidate construction failure closes every constructed resource in reverse order", async () => {
  const closed = [], failure = new Error("post-checkpointer-construction-failed");
  const resources = ["workspace-store", "watchdog", "native-host"].map(name => ({
    async close() { closed.push(name); },
  }));
  await assert.rejects(() => rejectNativeCandidateConstruction(resources, failure), error => error === failure);
  assert.deepEqual(closed, ["native-host", "watchdog", "workspace-store"]);
});

test("native candidate construction cleanup retains the construction and every cleanup failure", async () => {
  const construction = new Error("downstream-construction-failed");
  const firstCleanup = new Error("native-host-close-failed");
  const secondCleanup = new Error("workspace-store-close-failed");
  const resources = [{ async close() { throw secondCleanup; } }, { async close() {} },
    { async close() { throw firstCleanup; } }];
  await assert.rejects(() => rejectNativeCandidateConstruction(resources, construction), error => {
    assert.equal(error instanceof AggregateError, true);
    assert.deepEqual(error.errors, [construction, firstCleanup, secondCleanup]);
    return true;
  });
});

test("surface attachment failure retains its cause, closes every candidate resource in reverse, and cannot double close", async () => {
  const closed = [], construction = new Error("m1-surface-construction-failed");
  const nativeHostCleanup = new Error("native-host-close-failed");
  const storeCleanup = new Error("workspace-store-close-failed");
  const resources = [
    { async close() { closed.push("workspace-store"); throw storeCleanup; } },
    { async close() { closed.push("watchdog"); } },
    { async close() { closed.push("native-host"); throw nativeHostCleanup; } },
  ];
  const attachment = createNativeCandidateAttachment(resources, () => { throw construction; });
  await assert.rejects(() => attachment.attach({}), error => {
    assert.equal(error instanceof AggregateError, true);
    assert.deepEqual(error.errors, [construction, nativeHostCleanup, storeCleanup]);
    return true;
  });
  assert.deepEqual(closed, ["native-host", "watchdog", "workspace-store"]);
  await attachment.close();
  assert.deepEqual(closed, ["native-host", "watchdog", "workspace-store"]);
  await assert.rejects(() => attachment.attach({}), /m1-native-candidate-attach-state-invalid/);
});

test("successful surface attachment transfers candidate resources to one-use normal close ownership", async () => {
  const closed = [], application = {}, surface = {};
  const resources = ["workspace-store", "watchdog", "native-host"].map(name => ({
    async close() { closed.push(name); },
  }));
  const attachment = createNativeCandidateAttachment(resources, candidate => {
    assert.equal(candidate, application);
    return surface;
  });
  assert.equal(await attachment.attach(application), surface);
  assert.deepEqual(closed, []);
  await attachment.close();
  assert.deepEqual(closed, ["native-host", "watchdog", "workspace-store"]);
  await attachment.close();
  assert.deepEqual(closed, ["native-host", "watchdog", "workspace-store"]);
});

test("production factory owns M1 and pool when a post-compose constructor fails before attach", async () => {
  const events = [], construction = new Error("post-compose-constructor-failed");
  const m1Cleanup = new Error("m1-cleanup-failed"), poolCleanup = new Error("pool-cleanup-failed");
  const m1 = {
    async attach() { events.push("attach"); throw new Error("attach-must-not-run"); },
    async close() { events.push("m1-close"); throw m1Cleanup; },
  };
  const pool = { async end() { events.push("pool-end"); throw poolCleanup; } };
  await assert.rejects(() => createOwnedProductionComposition({ m1, pool, build: async () => {
    events.push("post-compose-constructor");
    throw construction;
  } }), error => {
    assert.equal(error instanceof AggregateError, true);
    assert.deepEqual(error.errors, [construction, m1Cleanup, poolCleanup]);
    return true;
  });
  assert.deepEqual(events, ["post-compose-constructor", "m1-close", "pool-end"]);
});

test("production factory awaits attachment and closes M1 before pool on attachment rejection", async () => {
  const events = [], attachment = new Error("m1-attach-rejected"), application = {};
  const m1 = {
    async attach(value) {
      events.push("attach-start");
      assert.equal(value, application);
      await Promise.resolve();
      events.push("attach-reject");
      throw attachment;
    },
    async close() { events.push("m1-close"); },
  };
  const pool = { async end() { events.push("pool-end"); } };
  await assert.rejects(() => createOwnedProductionComposition({ m1, pool, build: async () => ({
    application, m1Functions: await m1.attach(application),
  }) }), error => error === attachment);
  assert.deepEqual(events, ["attach-start", "attach-reject", "m1-close", "pool-end"]);
});

test("production factory transfers successful attachment to one-use normal close with deterministic aggregation", async () => {
  const events = [], m1Functions = {}, application = {};
  const m1Cleanup = new Error("normal-m1-cleanup-failed"), poolCleanup = new Error("normal-pool-cleanup-failed");
  const m1 = {
    async attach(value) { events.push("attach"); assert.equal(value, application); return m1Functions; },
    async close() { events.push("m1-close"); throw m1Cleanup; },
  };
  const pool = { async end() { events.push("pool-end"); throw poolCleanup; } };
  const composition = await createOwnedProductionComposition({ m1, pool, build: async () => ({
    application, m1Functions: await m1.attach(application),
  }) });
  assert.equal(Object.isFrozen(composition), true);
  assert.equal(composition.m1Functions, m1Functions);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => composition.close(), error => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(error.errors, [m1Cleanup, poolCleanup]);
      return true;
    });
  }
  assert.deepEqual(events, ["attach", "m1-close", "pool-end"]);
});
