import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { digest } from "./contracts.mjs";
import { PostgresTaskStore } from "./postgres.mjs";
import { M1TaskService } from "./service.mjs";
import { createM1TaskWorkflow } from "./workflow.mjs";
import { testCipher } from "../../../gate4/fixtures.mjs";

const url = process.env.M1_TASK_PG_URL;
const integration = url ? test : test.skip;
const context = { principalId: "m1-alice", projectId: "m1-generated-project", sessionId: "m1-session-a" };
const initial = "exports.add = (a,b) => a + b;";

// This double deliberately does not establish filesystem or sandbox acceptance. These tests exercise
// real PostgreSQL authority, transaction faults and LangGraph restart. Real adapter tests are separate.
class DeterministicAdapter {
  constructor() { this.revisions = new Map(); this.materializations = new Map(); this.materializeCalls = 0; this.testCalls = 0; }
  ref(files) {
    const values = Object.entries(files).map(([path, content]) => ({ path, content, sha256: digest(content), bytes: Buffer.byteLength(content) }));
    const reference = { schemaVersion: "test-revision/v1", environmentId: "m1-generated-environment", revisionId: digest(files),
      workspaceSha256: digest(files), files: values.map(({ content, ...item }) => item) };
    this.revisions.set(reference.revisionId, { reference, files: values, workspaceSha256: reference.workspaceSha256 });
    return reference;
  }
  async createEnvironment({ files }) { return this.ref(Object.fromEntries(files.map(file => [file.path, file.content]))); }
  async inspectRevision({ reference }) {
    const value = this.revisions.get(reference.revisionId);
    assert(value && digest(value.reference) === digest(reference));
    return structuredClone(value);
  }
  verifyMaterialized(input) { return this.inspectRevision(input); }
  async prepare({ reference, capabilityId, args }) {
    const current = await this.inspectRevision({ reference });
    const files = Object.fromEntries(current.files.map(file => [file.path, file.content]));
    if (["project.apply-change", "project.preview-change"].includes(capabilityId)) {
      const actual = current.files.find(file => file.path === args.path)?.sha256 ?? null;
      assert.equal(args.expectedSha256, actual);
      files[args.path] = args.content;
    }
    return { capabilityId, arguments: args, beforeReference: reference, beforeSha256: reference.workspaceSha256,
      preconditionSha256: digest({ reference, args }), preview: capabilityId === "project.run-tests"
        ? { suiteSha256: digest(args.suiteId) } : { path: args.path ?? null }, targetFiles: files };
  }
  async materialize({ effectId, prepared }) {
    this.materializeCalls++;
    const reference = prepared.capabilityId === "project.restore" ? prepared.arguments.targetReference : this.ref(prepared.targetFiles);
    const result = { status: "materialized", reference, beforeSha256: prepared.beforeSha256,
      afterSha256: reference.workspaceSha256, output: { type: "changed", path: prepared.arguments.path ?? null },
      rollbackReference: prepared.beforeReference };
    this.materializations.set(effectId, result);
    return result;
  }
  async observeMaterialized({ effectId }) {
    return this.materializations.has(effectId) ? { status: "present", result: this.materializations.get(effectId) } : { status: "absent" };
  }
  async executeTests({ reference, suiteId, authorize, signal }) {
    await authorize?.();
    if (signal.aborted) throw new Error("aborted");
    this.testCalls++;
    return { status: "passed", passed: true, suiteId, suiteSha256: digest(suiteId), workspaceSha256: reference.workspaceSha256,
      checks: [{ testId: "test-a", passed: true, expected: 26, actual: 26 }], executionReceipt: { status: "executed", syntheticExecutorDouble: true } };
  }
}

async function fixture(options = {}) {
  const pool = new pg.Pool({ connectionString: url });
  const schema = `m1_task_${randomBytes(6).toString("hex")}`;
  const store = new PostgresTaskStore({ pool, schema, cipher: options.cipher ?? null, allowPlaintextForSynthetic: !options.cipher });
  await store.initialize();
  const adapter = new DeterministicAdapter();
  const clock = { now: Date.now() };
  const service = new M1TaskService({ store, adapter, now: () => new Date(clock.now), hooks: options.hooks ?? {},
    ...(options.authorizeContext ? { authorizeContext: options.authorizeContext } : { allowSyntheticAuthority: true }) });
  const project = await service.registerProject(context, { environmentId: "m1-generated-environment", files: { "index.js": initial } });
  const task = await service.createTask(context, { requestId: "task-request", objective: "Edit a generated addition function." });
  const grant = await service.createGrant(context, { taskId: task.taskId, profile: options.profile ?? "safe-autopilot",
    allowedPaths: ["index.js", "other.js"], allowedSuites: ["addition"], expiresAt: new Date(clock.now + 60_000).toISOString() });
  const propose = (capabilityId = "project.apply-change", args, requestId = `request-${randomBytes(5).toString("hex")}`) => service.propose(context,
    { taskId: task.taskId, grantId: grant.grantId, grantRevision: grant.revision, requestId, capabilityId,
      arguments: args ?? { path: "index.js", content: "exports.add = (a,b) => a-b;", expectedSha256: project.reference.files[0].sha256 } });
  return { pool, schema, store, adapter, clock, service, project, task, grant, propose, close: () => pool.end() };
}

integration("real PG: safe-auto publication atomically advances pointer, receipt and outbox once", async () => {
  const f = await fixture();
  try {
    const proposal = await f.propose();
    const first = await f.service.execute(context, { proposalId: proposal.proposalId });
    const duplicate = await f.service.execute(context, { proposalId: proposal.proposalId });
    assert.equal(first.receipt.receiptId, duplicate.receipt.receiptId);
    assert.equal(duplicate.replayed, true);
    assert.equal((await f.service.currentProject(context)).revision, 2);
    assert.equal(f.adapter.materializeCalls, 1);
    assert.equal((await f.pool.query(`SELECT count(*)::int n FROM "${f.schema}".outbox`)).rows[0].n, 1);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).receipts.length, 1);
  } finally { await f.close(); }
});

integration("real PG: scoped idempotency rejects changed requests and foreign identities", async () => {
  const f = await fixture();
  try {
    const first = await f.propose("project.inspect", { path: "index.js" }, "same-request");
    assert.equal((await f.propose("project.inspect", { path: "index.js" }, "same-request")).proposalId, first.proposalId);
    await assert.rejects(f.propose("project.inspect", { path: "other.js" }, "same-request"), /m1-request-id-conflict/);
    await assert.rejects(f.service.execute({ ...context, principalId: "m1-bob" }, { proposalId: first.proposalId }), /m1-proposal-not-found/);
    await assert.rejects(f.service.status({ ...context, projectId: "foreign-project" }, { taskId: f.task.taskId }), /m1-task-not-found/);
    await assert.rejects(f.service.execute({ ...context, sessionId: "new-session" }, { proposalId: first.proposalId }), /m1-grant-session-mismatch/);
    assert.equal(f.adapter.materializeCalls, 0);
  } finally { await f.close(); }
});

integration("real PG: ask profile requires exact application approval; read-only cannot execute", async () => {
  const f = await fixture({ profile: "ask-every-time" });
  try {
    const proposal = await f.propose();
    await assert.rejects(f.service.execute(context, { proposalId: proposal.proposalId }), /m1-approval-required/);
    await assert.rejects(f.service.approve(context, { proposalId: proposal.proposalId, proposalDigest: "0".repeat(64) }), /m1-proposal-digest-mismatch/);
    await f.service.approve(context, { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest });
    assert((await f.service.execute(context, { proposalId: proposal.proposalId })).receipt);
    const readGrant = await f.service.createGrant(context, { taskId: f.task.taskId, profile: "read-only", allowedPaths: ["index.js"],
      allowedSuites: ["addition"], expiresAt: new Date(f.clock.now + 60_000).toISOString() });
    const denied = await f.service.propose(context, { taskId: f.task.taskId, grantId: readGrant.grantId, grantRevision: 1,
      requestId: "read-only-run", capabilityId: "project.run-tests", arguments: { suiteId: "addition" } });
    assert.equal(denied.status, "denied");
    assert.equal((await f.service.execute(context, { proposalId: denied.proposalId })).receipt, null);
    assert.equal(f.adapter.testCalls, 0);
  } finally { await f.close(); }
});

integration("real PG: same-session reload retains exact pending approval; a new login, expiry and revocation do not", async () => {
  const f = await fixture({ profile: "ask-every-time" });
  try {
    const proposal = await f.propose();
    const status = ctx => f.service.status(ctx, { taskId: f.task.taskId });
    assert.deepEqual((await status(context)).approvableProposalIds, [proposal.proposalId]);
    assert.deepEqual((await status({ ...context, sessionId: "fresh-login" })).approvableProposalIds, []);
    f.clock.now += 60_001;
    assert.deepEqual((await status(context)).approvableProposalIds, []);
    f.clock.now -= 60_001;
    assert.deepEqual((await status(context)).approvableProposalIds, [proposal.proposalId]);
    await f.service.revokeGrant(context, { grantId: f.grant.grantId });
    assert.deepEqual((await status(context)).approvableProposalIds, []);
    assert.equal(f.adapter.materializeCalls, 0);
    assert.equal(f.adapter.testCalls, 0);
  } finally { await f.close(); }
});

integration("real PG: stale project proposals and cancelled tasks are not offered for approval", async () => {
  const f = await fixture({ profile: "ask-every-time" });
  try {
    const first = await f.propose(), stale = await f.propose();
    await f.service.approve(context, { proposalId: first.proposalId, proposalDigest: first.proposalDigest });
    await f.service.execute(context, { proposalId: first.proposalId });
    assert.deepEqual((await f.service.status(context, { taskId: f.task.taskId })).approvableProposalIds, []);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).proposals.find(p => p.proposalId === stale.proposalId).status, "pending-approval");
    await f.service.cancel(context, { taskId: f.task.taskId });
    assert.deepEqual((await f.service.status(context, { taskId: f.task.taskId })).approvableProposalIds, []);
  } finally { await f.close(); }
});

integration("real PG: effect-time revocation, expiry and stale project state fail closed", async () => {
  const f = await fixture();
  try {
    const first = await f.propose(), stale = await f.propose();
    await f.service.execute(context, { proposalId: first.proposalId });
    await assert.rejects(f.service.execute(context, { proposalId: stale.proposalId }), /m1-stale-project/);
    const current = await f.propose("project.inspect", { path: "index.js" });
    f.clock.now += 60_001;
    await assert.rejects(f.service.execute(context, { proposalId: current.proposalId }), /m1-grant-expired/);
    f.clock.now -= 60_001;
    await f.service.revokeGrant(context, { grantId: f.grant.grantId });
    await assert.rejects(f.service.execute(context, { proposalId: current.proposalId }), /m1-grant-revoked/);
    assert.equal(f.adapter.materializeCalls, 1);
  } finally { await f.close(); }
});

integration("real PG: revoke after intent but before dispatch does not materialize", async () => {
  let release, reached;
  const barrier = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const f = await fixture({ hooks: { beforeDispatch: async () => { reached(); await barrier; } } });
  try {
    const proposal = await f.propose();
    const executing = f.service.execute(context, { proposalId: proposal.proposalId });
    await entered;
    await f.service.revokeGrant(context, { grantId: f.grant.grantId });
    release();
    await assert.rejects(executing, /m1-grant-revoked/);
    assert.equal(f.adapter.materializeCalls, 0);
    const reconciled = await f.service.reconcile(context, { proposalId: proposal.proposalId });
    assert.equal(reconciled.proposal.status, "not-published");
    assert.equal(reconciled.receipt, null);
  } finally { release(); await f.close(); }
});

integration("real PG: two concurrent dispatchers do not execute the same proposal twice", async () => {
  let release, reached;
  const barrier = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const f = await fixture({ hooks: { beforeDispatch: async () => { reached(); await barrier; } } });
  try {
    const proposal = await f.propose(), one = f.service.execute(context, { proposalId: proposal.proposalId });
    await entered;
    const two = new M1TaskService({ store: f.store, adapter: f.adapter, allowSyntheticAuthority: true });
    await assert.rejects(two.execute(context, { proposalId: proposal.proposalId }), /m1-operation-in-progress/);
    release(); await one;
    assert.equal(f.adapter.materializeCalls, 1);
  } finally { release(); await f.close(); }
});

integration("real PG: failed publication commit leaves pointer unchanged, then reconciles without repeating staging", async () => {
  const f = await fixture({ hooks: { beforeCommit: () => { throw new Error("injected-before-commit"); } } });
  try {
    const proposal = await f.propose();
    await assert.rejects(f.service.execute(context, { proposalId: proposal.proposalId }));
    assert.equal((await f.service.currentProject(context)).revision, 1);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).receipts.length, 0);
    const restarted = new M1TaskService({ store: f.store, adapter: f.adapter, allowSyntheticAuthority: true });
    const result = await restarted.execute(context, { proposalId: proposal.proposalId });
    assert.equal(result.reconciled, true);
    assert.equal(result.receipt.afterRevision, 2);
    assert.equal(f.adapter.materializeCalls, 1);
  } finally { await f.close(); }
});

integration("real PG: lost acknowledgement replays durable receipt even after cancellation", async () => {
  const f = await fixture({ hooks: { afterCommit: () => { throw new Error("lost-acknowledgement"); } } });
  try {
    const proposal = await f.propose();
    await assert.rejects(f.service.execute(context, { proposalId: proposal.proposalId }));
    await f.service.cancel(context, { taskId: f.task.taskId });
    const result = await f.service.execute(context, { proposalId: proposal.proposalId });
    assert(result.receipt); assert.equal(result.replayed, true);
    assert.equal(f.adapter.materializeCalls, 1);
    assert.equal((await f.service.currentProject(context)).revision, 2);
  } finally { await f.close(); }
});

integration("real PG: unknown test outcome is not inferred or blindly rerun", async () => {
  const f = await fixture({ hooks: { afterTests: () => { throw new Error("crash-after-test"); } } });
  try {
    const proposal = await f.propose("project.run-tests", { suiteId: "addition" });
    await assert.rejects(f.service.execute(context, { proposalId: proposal.proposalId }));
    const restarted = new M1TaskService({ store: f.store, adapter: f.adapter, allowSyntheticAuthority: true });
    const retry = await restarted.execute(context, { proposalId: proposal.proposalId });
    assert.equal(retry.proposal.status, "unknown"); assert.equal(retry.receipt, null);
    assert.equal(f.adapter.testCalls, 1);
  } finally { await f.close(); }
});

integration("real PG: cancellation drains an already-started bounded test and preserves its actual result", async () => {
  let release, reached;
  const barrier = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const f = await fixture({ hooks: { afterTests: async () => { reached(); await barrier; } } });
  try {
    const proposal = await f.propose("project.run-tests", { suiteId: "addition" });
    const running = f.service.execute(context, { proposalId: proposal.proposalId });
    await entered;
    await f.service.cancel(context, { taskId: f.task.taskId });
    release();
    const result = await running;
    assert.equal(result.receipt.cancellationRequested, true);
    assert.equal(result.receipt.grantRevokedAfterDispatch, true);
    assert.equal(result.receipt.executionStatus, "ran");
    assert.equal(result.receipt.output.checks[0].actual, 26);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).task.status, "cancelled");
    assert.equal(f.adapter.testCalls, 1);
    assert.equal((await f.service.currentProject(context)).revision, 1);
  } finally { release(); await f.close(); }
});

integration("real PG: cancel after staging preserves the original pointer and never publishes", async () => {
  let release, reached;
  const barrier = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const f = await fixture({ hooks: { afterMaterialize: async () => { reached(); await barrier; } } });
  try {
    const proposal = await f.propose(), running = f.service.execute(context, { proposalId: proposal.proposalId });
    await entered;
    await f.service.cancel(context, { taskId: f.task.taskId });
    release(); await assert.rejects(running, /m1-task-not-active/);
    const result = await f.service.reconcile(context, { proposalId: proposal.proposalId });
    assert.equal(result.receipt, null); assert.equal((await f.service.currentProject(context)).revision, 1);
    assert.equal(f.adapter.materializeCalls, 1);
  } finally { release(); await f.close(); }
});

integration("real PG: restore is scoped to an exact owned forward receipt and preserves versions", async () => {
  const f = await fixture();
  try {
    const proposal = await f.propose();
    const result = await f.service.execute(context, { proposalId: proposal.proposalId });
    const restore = await f.propose("project.restore", { receiptId: result.receipt.receiptId });
    const restored = await f.service.execute(context, { proposalId: restore.proposalId });
    assert.equal(restored.receipt.afterRevision, 3);
    assert.equal(restored.receipt.afterSha256, f.project.reference.workspaceSha256);
    assert.equal(f.adapter.revisions.size, 2);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).receipts.length, 2);
    await assert.rejects(f.propose("project.restore", { receiptId: result.receipt.receiptId }), /m1-restore-stale/);
  } finally { await f.close(); }
});

integration("real PG/LangGraph: a fresh process resumes an actual checkpoint without invoking the executor", async () => {
  const f = await fixture();
  const saver = new PostgresSaver(f.pool, undefined, { schema: `${f.schema}_cp` });
  try {
    await saver.setup();
    const proposal = await f.propose();
    const workflow = createM1TaskWorkflow({ service: f.service, checkpointer: saver });
    const first = await workflow.run(context, { proposalId: proposal.proposalId });
    const result = await runWorker({ schema: f.schema, checkpointSchema: `${f.schema}_cp`, context, proposalId: proposal.proposalId });
    assert.equal(result.receiptId, first.receipt.receiptId);
    assert.equal(result.resumed, true);
    assert.equal(f.adapter.materializeCalls, 1);
    const checkpoints = await f.pool.query(`SELECT count(*)::int n FROM "${f.schema}_cp".checkpoints`);
    assert(checkpoints.rows[0].n >= 3);
  } finally { await f.close(); }
});

integration("encrypted PG roundtrip and fresh-process checkpoint resume do not retain source canaries in raw rows", async () => {
  const f = await fixture({ cipher: testCipher() });
  const saver = new PostgresSaver(f.pool, undefined, { schema: `${f.schema}_cp` });
  const canary = "M1_SOURCE_ENCRYPTION_CANARY_NEVER_PLAINTEXT";
  try {
    await saver.setup();
    const proposal = await f.propose("project.apply-change", { path: "index.js", content: `exports.note=()=>\"${canary}\";`,
      expectedSha256: f.project.reference.files[0].sha256 });
    const workflow = createM1TaskWorkflow({ service: f.service, checkpointer: saver });
    const first = await workflow.run(context, { proposalId: proposal.proposalId });
    const raw = await f.pool.query(`SELECT payload::text value FROM "${f.schema}".records
      UNION ALL SELECT payload::text value FROM "${f.schema}".projects`);
    assert(raw.rows.every(row => !row.value.includes(canary) && row.value.includes("ciphertext")));
    const result = await runWorker({ schema: f.schema, checkpointSchema: `${f.schema}_cp`, context,
      proposalId: proposal.proposalId, encrypted: true });
    assert.equal(result.receiptId, first.receipt.receiptId);
    const replacement = new PostgresTaskStore({ pool: f.pool, schema: f.schema, cipher: testCipher() });
    const service = new M1TaskService({ store: replacement, adapter: f.adapter, allowSyntheticAuthority: true });
    assert.equal((await service.status(context, { taskId: f.task.taskId })).receipts.length, 1);
  } finally { await f.close(); }
});

integration("encrypted records reject same-kind record swaps and foreign-project envelope substitution", async () => {
  const f = await fixture({ cipher: testCipher() });
  try {
    const other = await f.service.createTask(context, { requestId: "other-task", objective: "Another generated task." });
    await f.pool.query(`UPDATE "${f.schema}".records destination SET payload=source.payload,payload_sha256=source.payload_sha256
      FROM "${f.schema}".records source WHERE source.kind='task' AND source.record_id=$1
      AND destination.kind='task' AND destination.record_id=$2`, [f.task.taskId, other.taskId]);
    await assert.rejects(f.service.status(context, { taskId: other.taskId }), /m1-authority-envelope-invalid/);
    const foreign = { ...context, projectId: "other-generated-project" };
    await f.service.registerProject(foreign, { environmentId: "other-environment", files: { "index.js": "exports.x=()=>1;" } });
    await f.pool.query(`UPDATE "${f.schema}".projects destination SET payload=source.payload,payload_sha256=source.payload_sha256
      FROM "${f.schema}".projects source WHERE source.project_id=$1 AND destination.project_id=$2`,
    [context.projectId, foreign.projectId]);
    await assert.rejects(f.service.currentProject(foreign), /m1-authority-envelope-invalid/);
  } finally { await f.close(); }
});

integration("session logout after intent and before dispatch prevents the executor", async () => {
  let active = true, release, reached;
  const barrier = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { reached = resolve; });
  const f = await fixture({ authorizeContext: async () => active,
    hooks: { beforeDispatch: async () => { reached(); await barrier; } } });
  try {
    const proposal = await f.propose(), running = f.service.execute(context, { proposalId: proposal.proposalId });
    await entered; active = false; release();
    await assert.rejects(running, /m1-session-authority-unavailable/);
    assert.equal(f.adapter.materializeCalls, 0);
    assert.equal((await f.service.reconcile(context, { proposalId: proposal.proposalId })).proposal.status, "not-published");
  } finally { release(); await f.close(); }
});

integration("session logout after staging prevents logical revision publication", async () => {
  let active = true;
  const f = await fixture({ authorizeContext: async () => active, hooks: { afterMaterialize: () => { active = false; } } });
  try {
    const proposal = await f.propose();
    await assert.rejects(f.service.execute(context, { proposalId: proposal.proposalId }), /m1-session-authority-unavailable/);
    assert.equal((await f.service.currentProject(context)).revision, 1);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).receipts.length, 0);
  } finally { await f.close(); }
});

integration("task listing is owner/project scoped and bounded to twenty", async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 23; index++) await f.service.createTask(context, { requestId: `task-${index}`, objective: `Generated task ${index}` });
    const listed = await f.service.listTasks(context);
    assert.equal(listed.tasks.length, 20);
    assert.equal((await f.service.listTasks({ ...context, principalId: "foreign-owner" })).tasks.length, 0);
  } finally { await f.close(); }
});

function runWorker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("./resume-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
      { env: { ...process.env, M1_TASK_PG_URL: url }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "", error = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { error += chunk; });
    child.on("error", reject);
    child.on("exit", code => { if (code !== 0) reject(new Error(`resume-worker-failed:${code}:${error}`));
      else { try { resolve(JSON.parse(output)); } catch (failure) { reject(failure); } } });
    child.stdin.end(JSON.stringify(input));
  });
}
