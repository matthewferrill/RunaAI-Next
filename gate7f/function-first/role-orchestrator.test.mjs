import test from "node:test";
import assert from "node:assert/strict";
import { M1RoleOrchestrator } from "./role-orchestrator.mjs";
import { MastraM1Planner } from "./planner.mjs";

test("Code and guided work select different explicit model roles", () => {
  const provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: "http://127.0.0.1:1234/v1",
    models: { chat: "chat", code: "coding-specialist", research: "research", review: "review", agent: "task-planner" } };
  assert.equal(new MastraM1Planner({ provider, role: "code", agent: {} }).modelId, "coding-specialist");
  assert.equal(new MastraM1Planner({ provider, role: "agent", agent: {} }).modelId, "task-planner");
  assert.throws(() => new MastraM1Planner({ provider, role: "chat", agent: {} }), /role-invalid/);
});
test("new work uses chosen workflow but resume reads the stored role", async () => {
  const calls = [], retained = { run: { plannerRole: "agent" } };
  const instance = role => ({ async start(context, input, options) { calls.push([role, "start", context, input, options]); },
    async resume(context, input, options) { calls.push([role, "resume", context, input, options]); },
    async status() { return retained; }, async list() { return []; } });
  const router = new M1RoleOrchestrator({ code: instance("code"), agent: instance("agent") });
  const context = { principalId: "alice" }, input = { taskId: "t", grantId: "g", grantRevision: 1, requestId: "r" };
  const authority = { agentActionAuthority: { schemaVersion: "runaai-agent-action-authority/v1",
    taskId: "t", authorityDigest: "a".repeat(64) } };
  await router.start(context, input); await router.start(context, { ...input, workflow: "agent" }, authority);
  await router.resume(context, { runId: "run" }, authority); retained.run.plannerRole = "code";
  await router.resume(context, { runId: "run" });
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [["code", "start"], ["agent", "start"], ["agent", "resume"], ["code", "resume"]]);
  assert.equal(calls[1][3].workflow, undefined);
  assert.equal(calls[1][4], authority);
  assert.equal(calls[2][4], authority);
  await assert.rejects(router.start(context, { ...input, workflow: "owner" }));
});
