import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { digest } from "../tasks/contracts.mjs";
import { createM1TaskWorkflow } from "../tasks/workflow.mjs";
import { captureTaskCheckpoints } from "./checkpoint-probes.mjs";

const context = { principalId: "m1-test-checkpoints", projectId: "synthetic-project", sessionId: "synthetic-session" };
const task = { taskId: "synthetic-task", participantId: context.principalId, projectId: context.projectId };
const proposal = (proposalId, status = "completed") => ({ ...task, proposalId, status });
const threadKey = (context, proposalId) => digest({ participantId: context.principalId,
  projectId: context.projectId, proposalId, workflow: "m1-task/v1" });

test("a pending tail cannot hide earlier actual checkpoints, and probing never invokes the graph", async () => {
  const calls = [], status = { task, proposals: [proposal("first"), proposal("second"), proposal("pending", "pending-approval")] };
  const workflow = { threadKey, graph: { async getState(config) {
    calls.push(config);
    const found = status.proposals.find(value => threadKey(context, value.proposalId) === config.configurable.thread_id);
    return found.status === "pending-approval" ? { values: {}, config } : {
      config: { configurable: { ...config.configurable, checkpoint_id: `checkpoint-${found.proposalId}` } },
      values: { proposalId: found.proposalId, status: found.status, receiptId: `receipt-${found.proposalId}` },
    };
  }, async invoke() { assert.fail("read-only proof must never invoke a graph"); } } };
  const proof = await captureTaskCheckpoints({ workflow, context, status });
  assert.equal(proof.checkpoint.proposalId, "second");
  assert.equal(proof.checkpoints.length, 3);
  assert.equal(proof.checkpoints[2].checkpointId, null);
  assert.equal(calls.length, 3);
  assert(calls.every(call => call.configurable.authorityContext === context));
});

test("no executed checkpoint remains explicitly absent; the probe cannot manufacture storage proof", async () => {
  const workflow = { threadKey, graph: { async getState(config) { return { config, values: {} }; } } };
  const status = { task, proposals: [proposal("pending", "pending-approval")] };
  assert.equal((await captureTaskCheckpoints({ workflow, context, status })).checkpoint, null);
  assert.deepEqual(await captureTaskCheckpoints({ workflow, context, status: { task, proposals: [] } }), { checkpoints: [], checkpoint: null });
});

test("checkpoint reads reject foreign task/proposal scope, duplicate proposals and wrong checkpoint bindings", async () => {
  const status = { task, proposals: [proposal("first")] };
  const workflow = { threadKey, graph: { async getState(config) { return { config: {
    configurable: { ...config.configurable, checkpoint_id: "checkpoint" } }, values: { proposalId: "foreign-proposal" } }; } } };
  await assert.rejects(captureTaskCheckpoints({ workflow, context, status }), /binding-invalid/u);
  await assert.rejects(captureTaskCheckpoints({ workflow, context: { ...context, projectId: "foreign" }, status }), /scope-invalid/u);
  await assert.rejects(captureTaskCheckpoints({ workflow, context, status: { task, proposals: [{ ...proposal("first"), taskId: "other" }] } }), /scope-invalid/u);
  await assert.rejects(captureTaskCheckpoints({ workflow, context, status: { task, proposals: [proposal("first"), proposal("first")] } }), /scope-invalid/u);
  await assert.rejects(captureTaskCheckpoints({ workflow: { ...workflow, threadKey: () => "foreign-thread" }, context, status }), /thread-invalid/u);
});

test("checkpoint probe rejects unexpected payload fields and excessive proposal counts", async () => {
  const workflow = { threadKey, graph: { async getState(config) { return { config, values: { sourceText: "not checkpoint metadata" } }; } } };
  await assert.rejects(captureTaskCheckpoints({ workflow, context, status: { task, proposals: [proposal("pending")] } }), /payload-invalid/u);
  await assert.rejects(captureTaskCheckpoints({ workflow, context, status: { task, proposals: Array.from({ length: 31 }, (_, index) => proposal(`p-${index}`)) } }), /scope-invalid/u);
});

const integration = process.env.M1_TASK_PG_URL ? test : test.skip;
integration("actual PostgreSQL/LangGraph: read prior completed checkpoints with a pending tail after reconstruction", async () => {
  const url = new URL(process.env.M1_TASK_PG_URL);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.username, "m1_synthetic");
  const pool = new pg.Pool({ connectionString: url.href });
  const schema = `m1_probe_${randomBytes(6).toString("hex")}`;
  try {
    const saver = new PostgresSaver(pool, undefined, { schema }); await saver.setup();
    const proposals = [proposal("proposal-first"), proposal("proposal-second"), proposal("proposal-pending", "pending-approval")];
    let executions = 0;
    // Only the authority callback is a fixture here. Checkpoint storage, graph
    // invocation, reconstruction and the subsequent read-only probes are real.
    const service = {
      async proposalState(actualContext, proposalId) {
        assert.deepEqual(actualContext, context);
        const found = proposals.find(value => value.proposalId === proposalId); assert(found);
        return { proposal: found, receipt: found.status === "completed" ? { receiptId: `receipt-${proposalId}` } : null };
      },
      async execute(actualContext, { proposalId }) { executions++; return this.proposalState(actualContext, proposalId); },
    };
    const initial = createM1TaskWorkflow({ service, checkpointer: saver });
    await initial.run(context, { proposalId: proposals[0].proposalId });
    await initial.run(context, { proposalId: proposals[1].proposalId });
    assert.equal(executions, 2);
    const before = (await pool.query(`SELECT count(*)::int AS n FROM "${schema}".checkpoints`)).rows[0].n;
    const reconstructed = createM1TaskWorkflow({ service, checkpointer: new PostgresSaver(pool, undefined, { schema }) });
    const proof = await captureTaskCheckpoints({ workflow: reconstructed, context, status: { task, proposals } });
    assert.equal(proof.checkpoint.proposalId, "proposal-second");
    assert.equal(proof.checkpoint.channel_values.receiptId, "receipt-proposal-second");
    assert.equal(proof.checkpoints.at(-1).checkpointId, null);
    assert.equal(proof.checkpoints.filter(value => value.checkpointId).length, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "${schema}".checkpoints`)).rows[0].n, before);
    assert.equal(executions, 2, "proof reads must not dispatch any effect");
  } finally { await pool.end(); }
});
