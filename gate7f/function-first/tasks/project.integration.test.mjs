import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";
import { MxcJavascriptExecutor } from "../../../gate7e/mxc-javascript-executor.mjs";
import { PostgresTaskStore } from "./postgres.mjs";
import { M1TaskService } from "./service.mjs";

const integration = process.env.M1_TASK_PG_URL ? test : test.skip;
const context = { principalId: "m1-fs-alice", projectId: "m1-generated-js", sessionId: "m1-fs-session" };
const suite = { suiteId: "addition", cases: [
  { testId: "positive", exportName: "add", args: [14, 12], expected: 26 },
  { testId: "negative", exportName: "add", args: [-2, 1], expected: -1 },
] };
const adapterPath = process.env.M1_PROJECT_ADAPTER
  ? pathToFileURL(path.resolve(process.env.M1_PROJECT_ADAPTER)).href : new URL("../project/adapter.mjs", import.meta.url).href;

async function fixture() {
  const { DisposableJavascriptProjectAdapter } = await import(adapterPath);
  const directory = await mkdtemp(path.join(tmpdir(), "runa-m1-task-"));
  const pool = new pg.Pool({ connectionString: process.env.M1_TASK_PG_URL });
  const schema = `m1_real_${randomBytes(6).toString("hex")}`;
  const store = new PostgresTaskStore({ pool, schema, allowPlaintextForSynthetic: true });
  await store.initialize();
  const runtimeRoot = process.env.M1_EXECUTOR_RUNTIME_ROOT ?? path.resolve(import.meta.dirname, "../../..");
  const executor = new MxcJavascriptExecutor({ runtimeRoot, runnerPath: path.join(runtimeRoot, "gate7e/quickjs-child.mjs") });
  const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory: directory, executor, suites: { addition: suite } });
  const service = new M1TaskService({ store, adapter, allowSyntheticAuthority: true });
  const project = await service.registerProject(context, { environmentId: "m1-disposable-js", files: { "index.js": "exports.add=(a,b)=>a-b;" } });
  const task = await service.createTask(context, { requestId: "create-task", objective: "Correct and verify a generated addition function." });
  const grant = await service.createGrant(context, { taskId: task.taskId, profile: "safe-autopilot",
    allowedPaths: ["index.js", "extra.js"], allowedSuites: ["addition"], expiresAt: new Date(Date.now() + 180_000).toISOString() });
  const propose = async (capabilityId, args) => service.propose(context, { taskId: task.taskId, grantId: grant.grantId,
    grantRevision: grant.revision, requestId: `real-${randomBytes(6).toString("hex")}`, capabilityId, arguments: args });
  const run = async (capabilityId, args) => {
    const proposal = await propose(capabilityId, args);
    return service.execute(context, { proposalId: proposal.proposalId });
  };
  return { directory, pool, schema, store, executor, adapter, service, project, task, grant, propose, run,
    async close() {
      await pool.end();
      const relative = path.relative(tmpdir(), directory);
      assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative)
        && path.basename(directory).startsWith("runa-m1-task-"));
      await rm(directory, { recursive: true, force: true });
    } };
}

integration("real PG + immutable filesystem + MXC: inspect, fail, correct, verify and exact restore", async () => {
  const f = await fixture();
  try {
    const inspect = await f.run("project.inspect", { path: "index.js" });
    assert.equal(inspect.receipt.output.file.content, "exports.add=(a,b)=>a-b;");
    const failed = await f.run("project.run-tests", { suiteId: "addition" });
    assert.equal(failed.receipt.executionStatus, "ran", JSON.stringify(failed.receipt.output));
    assert.equal(failed.receipt.output.status, "failed");
    assert.deepEqual(failed.receipt.output.checks.map(check => check.actual), [2, -3]);
    const changed = await f.run("project.apply-change", { path: "index.js", content: "exports.add=(a,b)=>a+b;",
      expectedSha256: f.project.reference.files[0].sha256 });
    assert.equal(changed.receipt.afterRevision, 2);
    const passed = await f.run("project.run-tests", { suiteId: "addition" });
    assert.equal(passed.receipt.executionStatus, "ran", JSON.stringify(passed.receipt.output));
    assert.equal(passed.receipt.output.status, "passed");
    assert.deepEqual(passed.receipt.output.checks.map(check => check.actual), [26, -1]);
    const restored = await f.run("project.restore", { receiptId: changed.receipt.receiptId });
    assert.equal(restored.receipt.afterRevision, 3);
    assert.equal(restored.receipt.afterSha256, f.project.reference.workspaceSha256);
    const old = await f.adapter.inspectRevision({ binding: { participantId: context.principalId, projectId: context.projectId,
      environmentId: f.project.environmentId }, reference: changed.receipt.afterReference });
    assert.equal(old.files[0].content, "exports.add=(a,b)=>a+b;");
    const confirmed = await f.run("project.run-tests", { suiteId: "addition" });
    assert.equal(confirmed.receipt.output.status, "failed");
  } finally { await f.close(); }
});

integration("actual worker crash after immutable staging reconciles from disk without re-executing", async () => {
  const f = await fixture();
  try {
    const proposal = await f.propose("project.apply-change", { path: "index.js", content: "exports.add=(a,b)=>a+b;",
      expectedSha256: f.project.reference.files[0].sha256 });
    const worker = await crashWorker({ schema: f.schema, baseDirectory: f.directory, context, proposalId: proposal.proposalId, adapterPath });
    assert.equal(worker.code, 88, worker.error);
    assert.equal((await f.service.currentProject(context)).revision, 1);
    const fresh = new M1TaskService({ store: f.store, allowSyntheticAuthority: true, adapter: new Proxy(f.adapter, {
      get(target, property) {
        if (property === "materialize") return () => { throw new Error("must-not-materialize-again"); };
        const value = target[property]; return typeof value === "function" ? value.bind(target) : value;
      },
    }) });
    const result = await fresh.execute(context, { proposalId: proposal.proposalId });
    assert.equal(result.reconciled, true); assert.equal(result.executionRepeated, false);
    assert.equal(result.receipt.afterRevision, 2);
    assert.equal((await f.service.currentProject(context)).reference.workspaceSha256, result.receipt.afterSha256);
    assert.equal((await f.service.status(context, { taskId: f.task.taskId })).receipts.length, 1);
  } finally { await f.close(); }
});

integration("actual bounded MXC result is retained when cancellation occurs after execution but before record", async () => {
  const f = await fixture();
  let release, reached;
  const barrier = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const service = new M1TaskService({ store: f.store, adapter: f.adapter, allowSyntheticAuthority: true,
    hooks: { afterTests: async () => { reached(); await barrier; } } });
  try {
    const proposal = await f.propose("project.run-tests", { suiteId: "addition" });
    const running = service.execute(context, { proposalId: proposal.proposalId });
    await entered;
    await service.cancel(context, { taskId: f.task.taskId });
    release();
    const result = await running;
    assert.equal(result.receipt.executionStatus, "ran", JSON.stringify(result.receipt.output));
    assert.equal(result.receipt.cancellationRequested, true);
    assert.deepEqual(result.receipt.output.checks.map(check => check.actual), [2, -3]);
    assert.equal((await service.status(context, { taskId: f.task.taskId })).task.status, "cancelled");
  } finally { release(); await f.close(); }
});

function crashWorker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("./crash-worker.mjs", import.meta.url))],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let error = "";
    child.stderr.on("data", chunk => { error += chunk; });
    child.on("error", reject);
    child.on("exit", code => resolve({ code, error }));
    child.stdin.end(JSON.stringify(input));
  });
}
