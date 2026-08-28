import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { digest } from "./contracts.mjs";
import { PostgresTaskStore } from "./postgres.mjs";
import { M1TaskService } from "./service.mjs";
import { createM1TaskWorkflow } from "./workflow.mjs";
import { M1TaskOrchestrator } from "./orchestrator.mjs";
import { testCipher } from "../../../gate4/fixtures.mjs";

const integration = process.env.M1_TASK_PG_URL ? test : test.skip;
const context = { principalId: "orch-alice", projectId: "orch-project", sessionId: "orch-session" };

// Deliberately a deterministic executor double; native process proof is project.integration.test.mjs.
class Adapter {
  constructor() { this.snapshots = new Map(); this.staged = new Map(); this.tests = 0; this.edits = 0; }
  reference(files) {
    const reference = { environmentId: "orch-environment", revisionId: digest(files), workspaceSha256: digest(files),
      files: files.map(file => ({ path: file.path, sha256: digest(file.content), bytes: Buffer.byteLength(file.content) })) };
    this.snapshots.set(reference.revisionId, { reference, workspaceSha256: reference.workspaceSha256,
      files: files.map(file => ({ ...file, sha256: digest(file.content), bytes: Buffer.byteLength(file.content) })) });
    return reference;
  }
  async createEnvironment({ files }) { return this.reference(files); }
  async inspectRevision({ reference }) { return structuredClone(this.snapshots.get(reference.revisionId)); }
  verifyMaterialized(input) { return this.inspectRevision(input); }
  async prepare({ reference, capabilityId, args }) {
    const snapshot = await this.inspectRevision({ reference });
    if (args.path) assert(snapshot.files.some(file => file.path === args.path));
    if (capabilityId === "project.apply-change") assert.equal(args.expectedSha256, snapshot.files.find(file => file.path === args.path).sha256);
    return { capabilityId, arguments: args, beforeReference: reference, beforeSha256: reference.workspaceSha256,
      preview: { suiteSha256: digest("addition") } };
  }
  async materialize({ effectId, prepared, authorize, signal }) {
    await authorize(); assert(!signal.aborted); this.edits++;
    const reference = this.reference([{ path: prepared.arguments.path, content: prepared.arguments.content }]);
    const result = { reference, beforeSha256: prepared.beforeSha256, afterSha256: reference.workspaceSha256,
      output: { changed: true }, rollbackReference: prepared.beforeReference };
    this.staged.set(effectId, result); return result;
  }
  async observeMaterialized({ effectId }) { return this.staged.has(effectId)
    ? { status: "present", result: this.staged.get(effectId) } : { status: "absent" }; }
  async executeTests({ reference, suiteId, authorize, signal }) {
    await authorize(); assert(!signal.aborted); this.tests++;
    const passed = this.snapshots.get(reference.revisionId).files[0].content === "exports.add=(a,b)=>a+b;";
    return { status: passed ? "passed" : "failed", passed, suiteId, suiteSha256: digest(suiteId),
      workspaceSha256: reference.workspaceSha256, checks: [{ actual: passed ? 26 : 2, expected: 26, passed }],
      executionReceipt: { status: "executed", syntheticExecutorDouble: true } };
  }
}

async function fixture({ planner, profile = "safe-autopilot", hooks = {}, budgets = {}, cipher = null, authorizeContext = null,
  files = { "index.js": "exports.add=(a,b)=>a-b;" } } = {}) {
  const pool = new pg.Pool({ connectionString: process.env.M1_TASK_PG_URL });
  const schema = `m1_orch_${randomBytes(6).toString("hex")}`;
  const store = new PostgresTaskStore({ pool, schema, cipher, allowPlaintextForSynthetic: !cipher }); await store.initialize();
  const adapter = new Adapter();
  const service = new M1TaskService({ store, adapter, hooks,
    ...(authorizeContext ? { authorizeContext } : { allowSyntheticAuthority: true }) });
  await service.registerProject(context, { environmentId: "orch-environment", files });
  const task = await service.createTask(context, { requestId: "task-create", objective: "Fix and test the addition function." });
  const grant = await service.createGrant(context, { taskId: task.taskId, profile, allowedPaths: ["index.js"],
    allowedSuites: ["addition"], expiresAt: new Date(Date.now() + 600_000).toISOString() });
  const saver = new PostgresSaver(pool, undefined, { schema: `${schema}_cp` }); await saver.setup();
  const workflow = createM1TaskWorkflow({ service, checkpointer: saver });
  const chosen = planner ?? { async plan({ snapshot }) { return planFor(snapshot, true); } };
  const orchestrator = new M1TaskOrchestrator({ service, planner: chosen, workflow, budgets });
  const input = { taskId: task.taskId, grantId: grant.grantId, grantRevision: grant.revision, requestId: "conversation-run" };
  return { pool, schema, store, service, adapter, task, grant, saver, workflow, chosen, orchestrator, input,
    start: () => orchestrator.start(context, input), close: () => pool.end() };
}

function planFor(snapshot, fixed) {
  return { summary: fixed ? "Correct the addition function and test it." : "Try the draft and run its tests.", steps: [
    { capabilityId: "project.apply-change", arguments: { path: "index.js", content: fixed ? "exports.add=(a,b)=>a+b;" : "exports.add=(a,b)=>a-b;",
      expectedSha256: snapshot.files[0].sha256 } },
    { capabilityId: "project.run-tests", arguments: { suiteId: "addition" } },
  ] };
}

integration("conversational safe-auto plans, edits, observes actual service receipt, and completes without approval bypass", async () => {
  let plans = 0;
  const f = await fixture({ planner: { async plan({ snapshot }) { plans++; return planFor(snapshot, true); } } });
  try {
    const result = await f.start();
    assert.equal(result.run.status, "completed"); assert.equal(result.run.outcome, "plan-completed");
    assert.equal(result.run.actions.length, 2); assert.equal(result.receipts.find(value => value.capabilityId === "project.run-tests").output.passed, true);
    assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 1); assert.equal(plans, 1);
    const duplicate = await f.start();
    assert.equal(duplicate.run.runId, result.run.runId); assert.equal(plans, 1);
  } finally { await f.close(); }
});

integration("ask-profile pauses each effect and survives orchestrator replacement after exact approval", async () => {
  let plans = 0;
  const f = await fixture({ profile: "ask-every-time", planner: { async plan({ snapshot }) { plans++; return planFor(snapshot, true); } } });
  try {
    const paused = await f.start();
    assert.equal(paused.run.status, "waiting-approval"); assert.equal(f.adapter.edits, 0);
    const first = paused.proposals.find(proposal => proposal.proposalId === paused.run.pendingProposalId);
    await f.service.approve(context, { proposalId: first.proposalId, proposalDigest: first.proposalDigest });
    const replacement = new M1TaskOrchestrator({ service: f.service, planner: f.chosen, workflow: f.workflow });
    const secondPause = await replacement.resume(context, { runId: paused.run.runId });
    assert.equal(secondPause.run.status, "waiting-approval"); assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 0);
    const second = secondPause.proposals.find(proposal => proposal.proposalId === secondPause.run.pendingProposalId);
    await f.service.approve(context, { proposalId: second.proposalId, proposalDigest: second.proposalDigest });
    const completed = await replacement.resume(context, { runId: paused.run.runId });
    assert.equal(completed.run.status, "completed"); assert.equal(f.adapter.tests, 1); assert.equal(plans, 1);
  } finally { await f.close(); }
});

integration("one bounded repair is based on a real failed test receipt and fresh immutable snapshot", async () => {
  let plans = 0;
  const f = await fixture({ planner: { async plan({ snapshot, receipts, repair }) {
    plans++;
    if (plans === 2) { assert.equal(repair, true); assert(receipts.some(receipt => receipt.output.passed === false)); }
    return planFor(snapshot, plans === 2);
  } } });
  try {
    const result = await f.start();
    assert.equal(result.run.status, "completed"); assert.equal(result.run.planAttempts, 2);
    assert.equal(result.run.actions.length, 4); assert.equal(f.adapter.edits, 2); assert.equal(f.adapter.tests, 2);
    assert(result.receipts.some(receipt => receipt.output.passed === false));
    assert(result.receipts.some(receipt => receipt.output.passed === true));
  } finally { await f.close(); }
});

integration("repeated failed tests stop at the repair budget instead of forming an unbounded agent loop", async () => {
  let plans = 0;
  const f = await fixture({ planner: { async plan({ snapshot }) { plans++; return planFor(snapshot, false); } } });
  try {
    const result = await f.start();
    assert.equal(result.run.status, "failed"); assert.equal(result.run.errorCode, "m1-tests-failed");
    assert.equal(plans, 2); assert.equal(f.adapter.tests, 2);
  } finally { await f.close(); }
});

integration("planner output cannot add approval, runtime paths, shell execution or a fake completed receipt", async () => {
  for (const plan of [
    { summary: "Execute", approved: true, steps: [{ capabilityId: "project.run-tests", arguments: { suiteId: "addition" } }] },
    { summary: "Execute", steps: [{ capabilityId: "terminal.run", arguments: { command: "anything" } }] },
    { summary: "Execute", steps: [{ capabilityId: "project.inspect", arguments: { path: "../../secret" } }] },
    { summary: "Already done", steps: [], receipt: { executed: true } },
  ]) {
    const f = await fixture({ planner: { async plan() { return plan; } } });
    try {
      const result = await f.start(); assert.equal(result.run.status, "failed");
      assert.equal(result.receipts.length, 0); assert.equal(f.adapter.tests, 0); assert.equal(f.adapter.edits, 0);
    } finally { await f.close(); }
  }
});

integration("read-only denies an effect even when a planner disregards the supplied allowed capability list", async () => {
  const f = await fixture({ profile: "read-only", planner: { async plan({ snapshot, capabilityIds }) {
    assert(!capabilityIds.includes("project.apply-change")); return planFor(snapshot, true);
  } } });
  try {
    const result = await f.start(); assert.equal(result.run.status, "failed"); assert.equal(result.run.errorCode, "m1-capability-denied");
    assert.equal(f.adapter.edits, 0); assert.equal(result.receipts.length, 0);
  } finally { await f.close(); }
});

integration("revocation before resumed approval blocks effects; a different participant cannot inspect a run", async () => {
  const f = await fixture({ profile: "ask-every-time" });
  try {
    const paused = await f.start();
    await assert.rejects(f.orchestrator.status({ ...context, principalId: "other-owner" }, { runId: paused.run.runId }), /m1-run-not-found/);
    await f.service.revokeGrant(context, { grantId: f.grant.grantId });
    const proposal = paused.proposals[0];
    await assert.rejects(f.service.approve(context, { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest }), /m1-grant-revoked/);
    assert.equal(f.adapter.edits, 0);
    await f.service.cancel(context, { taskId: f.task.taskId });
    assert.equal((await f.orchestrator.resume(context, { runId: paused.run.runId })).run.status, "cancelled");
  } finally { await f.close(); }
});

integration("uncertain test result pauses durable orchestration and does not repeat the process", async () => {
  const f = await fixture({ hooks: { afterTests: () => { throw new Error("lost-native-result"); } } });
  try {
    const result = await f.start(); assert.equal(result.run.status, "needs-reconciliation");
    const restarted = await f.orchestrator.resume(context, { runId: result.run.runId });
    assert.equal(restarted.run.status, "needs-reconciliation"); assert.equal(f.adapter.tests, 1);
    assert.equal(restarted.receipts.length, 1); // Only the earlier edit has a durable receipt.
  } finally { await f.close(); }
});

integration("planner deadline aborts advisory work and authorizes no effect", async () => {
  let signal;
  const f = await fixture({ budgets: { planningTimeoutMs: 10 }, planner: { plan(input) {
    signal = input.signal; return new Promise(() => {});
  } } });
  try {
    const result = await f.start(); assert.equal(result.run.status, "failed");
    assert.equal(result.run.errorCode, "m1-planning-deadline"); assert.equal(signal.aborted, true);
    assert.equal(f.adapter.edits, 0); assert.equal(f.adapter.tests, 0);
  } finally { await f.close(); }
});

integration("encrypted plans survive listing/reload without plaintext source or summary in raw runs", async () => {
  const canary = "M1_ORCHESTRATION_PRIVATE_SUMMARY_CANARY";
  const f = await fixture({ cipher: testCipher(), planner: { async plan({ snapshot }) { return { ...planFor(snapshot, true), summary: canary }; } } });
  try {
    const result = await f.start(); assert.equal(result.run.status, "completed");
    const raw = await f.pool.query(`SELECT payload::text value FROM "${f.schema}".runs`);
    assert(raw.rows.every(row => !row.value.includes(canary) && !row.value.includes("exports.add") && row.value.includes("ciphertext")));
    const listed = await f.orchestrator.list(context); assert.equal(listed.runs.length, 1);
    assert.equal(listed.runs[0].runId, result.run.runId);
    assert.equal((await f.orchestrator.status(context, { runId: result.run.runId })).run.plans[0].summary, canary);
    assert.equal((await f.orchestrator.list({ ...context, principalId: "foreign-user" })).runs.length, 0);
  } finally { await f.close(); }
});

integration("explicit new-session grant continuation invalidates old approvals and plans fresh", async () => {
  let plans = 0;
  const f = await fixture({ profile: "ask-every-time", planner: { async plan({ snapshot }) { plans++; return planFor(snapshot, true); } } });
  try {
    const first = await f.start();
    const nextContext = { ...context, sessionId: "new-login-session" };
    const listed = await f.orchestrator.list(nextContext); assert.equal(listed.runs[0].sessionRebindRequired, true);
    const replacement = await f.service.createGrant(nextContext, { taskId: f.task.taskId, profile: "safe-autopilot",
      allowedPaths: ["index.js"], allowedSuites: ["addition"], expiresAt: new Date(Date.now() + 600_000).toISOString() });
    const result = await f.orchestrator.resume(nextContext, { runId: first.run.runId,
      grantId: replacement.grantId, grantRevision: replacement.revision });
    assert.equal(result.run.status, "completed"); assert.equal(plans, 2);
    assert.equal(result.proposals.find(value => value.proposalId === first.pendingProposal.proposalId).status, "cancelled");
    assert(result.receipts.every(receipt => receipt.grantId === replacement.grantId));
    assert.equal(result.run.authorityChanges.length, 1);
  } finally { await f.close(); }
});

integration("an unknown old test outcome blocks replacement-grant continuation", async () => {
  const f = await fixture({ hooks: { afterTests: () => { throw new Error("lost-test"); } } });
  try {
    const first = await f.start(); assert.equal(first.run.status, "needs-reconciliation");
    const nextContext = { ...context, sessionId: "new-login-session" };
    const replacement = await f.service.createGrant(nextContext, { taskId: f.task.taskId, profile: "safe-autopilot",
      allowedPaths: ["index.js"], allowedSuites: ["addition"], expiresAt: new Date(Date.now() + 600_000).toISOString() });
    const result = await f.orchestrator.resume(nextContext, { runId: first.run.runId,
      grantId: replacement.grantId, grantRevision: replacement.revision });
    assert.equal(result.run.status, "needs-reconciliation"); assert.equal(f.adapter.tests, 1);
    assert.equal(result.run.grantId, f.grant.grantId);
  } finally { await f.close(); }
});

integration("logout between conversational steps prevents every following effect", async () => {
  let active = true;
  const f = await fixture({ authorizeContext: async () => active, hooks: { afterCommit: () => { active = false; } } });
  try {
    const result = await f.start();
    assert.notEqual(result.run.status, "completed"); assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 0);
    assert.equal(result.receipts.length, 1);
    assert.equal(result.receipts[0].capabilityId, "project.apply-change");
  } finally { await f.close(); }
});

integration("planner receives only grant-selected file contents and no opaque full reference", async () => {
  const canary = "OUTSIDE_SELECTED_PATH_CANARY";
  const f = await fixture({ files: { "index.js": "exports.add=(a,b)=>a+b;", "hidden.js": canary },
    planner: { async plan(input) {
      assert.equal(input.snapshot.files.length, 1); assert.equal(input.snapshot.omittedFileCount, 1);
      assert.equal(input.snapshot.reference, undefined); assert(!JSON.stringify(input).includes(canary));
      return { summary: "Read the selected file", steps: [{ capabilityId: "project.inspect", arguments: { path: "index.js" } }] };
    } } });
  try { assert.equal((await f.start()).run.status, "completed"); }
  finally { await f.close(); }
});
