import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { digest } from "./contracts.mjs";
import { PostgresTaskStore } from "./postgres.mjs";
import { M1TaskService } from "./service.mjs";
import { createM1TaskWorkflow } from "./workflow.mjs";
import { M1TaskOrchestrator, runEvidenceProjection } from "./orchestrator.mjs";
import { testCipher } from "../../../gate4/fixtures.mjs";
import { MastraM1Planner } from "../planner.mjs";

const integration = process.env.M1_TASK_PG_URL ? test : test.skip;
const context = { principalId: "orch-alice", projectId: "orch-project", sessionId: "orch-session" };

test("run evidence is derived from this run's receipts and unsettled proposals only", () => {
  const run = { runId: "run-1", status: "completed", pendingProposalId: null,
    actions: [{ proposalId: "proposal-edit", receiptId: "receipt-edit" },
      { proposalId: "proposal-test", receiptId: "receipt-test" }] };
  const state = { receipts: [
    { receiptId: "receipt-edit", capabilityId: "project.apply-change", executionStatus: "published" },
    { receiptId: "receipt-test", capabilityId: "project.run-tests", executionStatus: "ran" },
    { receiptId: "foreign", capabilityId: "project.restore", executionStatus: "published" },
  ], proposals: [], pendingReconciliation: [] };
  assert.deepEqual(runEvidenceProjection(run, state), { schemaVersion: "runaai-m1-run-evidence/v1", runId: "run-1",
    changeStatus: "applied", testStatus: "ran" });
  assert.deepEqual(runEvidenceProjection({ ...run, actions: [] }, state), { schemaVersion: "runaai-m1-run-evidence/v1", runId: "run-1",
    changeStatus: "none-recorded", testStatus: "none-recorded" });
  const unsettled = { ...state, proposals: [{ proposalId: "proposal-edit", status: "unknown" }] };
  assert.deepEqual(runEvidenceProjection(run, unsettled), { schemaVersion: "runaai-m1-run-evidence/v1", runId: "run-1",
    changeStatus: "unknown", testStatus: "unknown" });
});

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
    const reference = prepared.capabilityId === "project.restore"
      ? prepared.arguments.targetReference
      : this.reference([{ path: prepared.arguments.path, content: prepared.arguments.content }]);
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
  files = { "index.js": "exports.add=(a,b)=>a-b;" }, allowedPaths = ["index.js"],
  objective = "Fix and test the addition function." } = {}) {
  const pool = new pg.Pool({ connectionString: process.env.M1_TASK_PG_URL });
  const schema = `m1_orch_${randomBytes(6).toString("hex")}`;
  const store = new PostgresTaskStore({ pool, schema, cipher, allowPlaintextForSynthetic: !cipher }); await store.initialize();
  const adapter = new Adapter();
  const service = new M1TaskService({ store, adapter, hooks,
    ...(authorizeContext ? { authorizeContext } : { allowSyntheticAuthority: true }) });
  await service.registerProject(context, { environmentId: "orch-environment", files });
  const task = await service.createTask(context, { requestId: "task-create", objective });
  const grant = await service.createGrant(context, { taskId: task.taskId, profile, allowedPaths,
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
    const published = result.receipts.find(value => value.capabilityId === "project.apply-change");
    assert(published.rollbackReference); assert.equal(published.executionStatus, "published");
    assert.equal(result.receipts.some(value => value.capabilityId === "project.restore"), false);
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

integration("durable run preserves the planner role across restart and rejects role substitution", async () => {
  const planner = { role: "code", async plan({ snapshot }) { return planFor(snapshot, true); } };
  const f = await fixture({ profile: "ask-every-time", planner });
  try {
    const pending = await f.start(); assert.equal(pending.run.plannerRole, "code");
    const other = new M1TaskOrchestrator({ service: f.service, workflow: f.workflow,
      planner: { ...planner, role: "agent" } });
    await assert.rejects(other.resume(context, { runId: pending.run.runId }), /planner-role-mismatch/);
    await assert.rejects(other.start(context, f.input), /request-id-conflict/);
    assert.equal(f.adapter.edits, 0);
    const replacement = new M1TaskOrchestrator({ service: f.service, workflow: f.workflow, planner });
    assert.equal((await replacement.status(context, { runId: pending.run.runId })).run.plannerRole, "code");
    assert.equal((await replacement.list(context)).runs[0].plannerRole, "code");
  } finally { await f.close(); }
});

for (const approveFirst of [false, true]) integration(`a stale pending edit is durably stopped on ${approveFirst ? "approval then resume" : "resume without approval"}`, async () => {
  let plans = 0;
  const f = await fixture({ profile: "ask-every-time", planner: { async plan({ snapshot }) { plans++; return planFor(snapshot, true); } } });
  try {
    const paused = await f.start(), original = paused.pendingProposal;
    const otherTask = await f.service.createTask(context, { requestId: "concurrent-task", objective: "Publish another approved correction." });
    const otherGrant = await f.service.createGrant(context, { taskId: otherTask.taskId, profile: "ask-every-time",
      allowedPaths: ["index.js"], allowedSuites: [], expiresAt: new Date(Date.now() + 600_000).toISOString() });
    const current = await f.service.currentProject(context);
    const other = await f.service.propose(context, { taskId: otherTask.taskId, grantId: otherGrant.grantId,
      grantRevision: otherGrant.revision, requestId: "concurrent-edit", capabilityId: "project.apply-change",
      arguments: { path: "index.js", content: "exports.add=(a,b)=>Number(a)+Number(b);", expectedSha256: current.reference.files[0].sha256 } });
    await f.service.approve(context, { proposalId: other.proposalId, proposalDigest: other.proposalDigest });
    await f.service.execute(context, { proposalId: other.proposalId });
    const concurrent = await f.service.currentProject(context);
    if (approveFirst) await assert.rejects(f.service.approve(context,
      { proposalId: original.proposalId, proposalDigest: original.proposalDigest }), /m1-stale-project/);
    const restarted = new M1TaskOrchestrator({ service: f.service, planner: f.chosen, workflow: f.workflow });
    const stopped = await restarted.resume(context, { runId: paused.run.runId });
    assert.equal(stopped.run.status, "failed"); assert.equal(stopped.run.errorCode, "m1-stale-project");
    assert.equal(stopped.pendingProposal.status, "stale");
    assert.equal(stopped.pendingProposal.proposalDigest, original.proposalDigest);
    assert.equal(stopped.receipts.length, 0);
    assert.deepEqual((await f.service.status(context, { taskId: f.task.taskId })).approvableProposalIds, []);
    assert.deepEqual(await f.service.currentProject(context), concurrent);
    const replay = await restarted.resume(context, { runId: paused.run.runId });
    assert.equal(replay.run.status, "failed"); assert.equal(plans, 1);
    assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 0);
    const durable = await f.store.transaction(context, tx => tx.get("proposal", original.proposalId));
    assert.equal(durable.status, "stale"); assert.equal(durable.errorCode, "m1-stale-project");
  } finally { await f.close(); }
});

integration("revoked pending authority fails on resume instead of waiting for an impossible approval", async () => {
  const f = await fixture({ profile: "ask-every-time" });
  try {
    const pending = await f.start();
    await f.service.revokeGrant(context, { grantId: f.grant.grantId });
    const stopped = await f.orchestrator.resume(context, { runId: pending.run.runId });
    assert.equal(stopped.run.status, "failed"); assert.equal(stopped.run.errorCode, "m1-grant-revoked");
    assert.equal(stopped.pendingProposal.status, "denied");
    assert.equal(f.adapter.edits, 0); assert.equal(f.adapter.tests, 0);
    assert.equal(stopped.run.planAttempts, 1);
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

integration("replacement planner never receives a restore receipt whose affected paths exceed its narrowed grant", async () => {
  let plans = 0, restoreReceiptId;
  const planner = { async plan({ snapshot, receipts }) {
    plans++;
    if (plans === 1) return planFor(snapshot, true);
    assert.equal(receipts.some(receipt => receipt.receiptId === restoreReceiptId), false);
    return { summary: "Untrusted guess of an omitted restore receipt.", steps: [
      { capabilityId: "project.inspect", arguments: { path: "index.js" } },
      { capabilityId: "project.restore", arguments: { receiptId: restoreReceiptId } },
    ] };
  } };
  const f = await fixture({ profile: "ask-every-time", planner, allowedPaths: ["index.js", "hidden.js"],
    files: { "index.js": "exports.add=(a,b)=>a-b;", "hidden.js": "exports.hidden='before';" } });
  try {
    const first = await f.start();
    assert.equal(first.run.status, "waiting-approval");
    const changed = await seedOwnedEdit(f, { path: "hidden.js", content: "exports.hidden='after';", requestId: "hidden-edit" });
    let restore = await f.service.propose(context, { taskId: f.task.taskId, grantId: f.grant.grantId,
      grantRevision: f.grant.revision, requestId: "hidden-restore", capabilityId: "project.restore",
      arguments: { receiptId: changed.receiptId } });
    assert(restore.restorePaths.includes("hidden.js"));
    await f.service.approve(context, { proposalId: restore.proposalId, proposalDigest: restore.proposalDigest });
    restore = (await f.service.execute(context, { proposalId: restore.proposalId })).proposal;
    restoreReceiptId = (await f.service.proposalState(context, restore.proposalId)).receipt.receiptId;
    assert.equal(restore.status, "completed");

    const before = await f.service.status(context, { taskId: f.task.taskId });
    const intents = (await f.store.transaction(context, tx => tx.list("intent", f.task.taskId))).length;
    const edits = f.adapter.edits, originalPlans = first.run.plans.length;
    const nextContext = { ...context, sessionId: "narrow-replacement-session" };
    const replacement = await f.service.createGrant(nextContext, { taskId: f.task.taskId, profile: "safe-autopilot",
      allowedPaths: ["index.js"], allowedSuites: ["addition"], expiresAt: new Date(Date.now() + 600_000).toISOString() });
    const result = await f.orchestrator.resume(nextContext, { runId: first.run.runId,
      grantId: replacement.grantId, grantRevision: replacement.revision });
    assert.equal(result.run.status, "failed");
    assert.equal(result.run.errorCode, "m1-plan-restore-reference-invalid");
    assert.equal(result.run.plans.length, originalPlans);
    assert.equal(result.proposals.length, before.proposals.length);
    assert.equal(result.receipts.length, before.receipts.length);
    assert.equal((await f.store.transaction(nextContext, tx => tx.list("intent", f.task.taskId))).length, intents);
    assert.equal(f.adapter.edits, edits);
    assert.equal(plans, 2);
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

integration("actual planner receives durable failed-test progress before the sole permitted repair", async () => {
  const calls = [], objective = "First run the registered suite, then fix any defect and rerun that suite.";
  const modelId = "synthetic-repair-model", provider = { baseUrl: "http://127.0.0.1:1234/v1", modelId };
  const planner = new MastraM1Planner({ provider, role: "code", agent: { async generate(raw, options) {
    const input = JSON.parse(raw); calls.push(input);
    assert.equal(input.objective, objective); assert.equal(options.modelSettings.maxOutputTokens, 1536);
    assert.equal(input.snapshot.files.length, 1); assert.deepEqual(input.allowedPaths, ["index.js"]);
    assert.deepEqual(input.allowedSuites, ["addition"]);
    const change = { path: "index.js", content: "exports.add=(a,b)=>a+b;", expectedSha256: input.snapshot.files[0].sha256 };
    const steps = [{ capabilityId: "project.preview-change", arguments: change },
      { capabilityId: "project.apply-change", arguments: change },
      { capabilityId: "project.run-tests", arguments: { suiteId: "addition" } }];
    if (input.progress.phase === "initial") {
      assert.deepEqual(input.progress.observations, []);
      steps.unshift({ capabilityId: "project.run-tests", arguments: { suiteId: "addition" } });
    } else {
      assert.equal(input.repair, true); assert.equal(input.progress.observations.length, 1);
      const observation = input.progress.observations[0], actual = input.receipts[0];
      assert.equal(observation.outcome, "test-failed"); assert.equal(actual.output.passed, false);
      assert.equal(input.previousPlans[0].steps.length, 4, "three planned actions have no receipts and are still pending");
      assert.equal(actual.beforeRevision, input.snapshot.projectRevision);
      assert.match(actual.receiptDigest, /^[a-f0-9]{64}$/); assert.match(actual.afterSha256, /^[a-f0-9]{64}$/);
      assert.equal(actual.afterSha256, input.snapshot.workspaceSha256);
      assert.equal(input.progress.currentFailedTests[0].receiptId, actual.receiptId);
      assert.equal(input.progress.currentFailedTests[0].suiteSha256, actual.output.suiteSha256);
      assert.equal(actual.beforeReference, undefined); assert.equal(actual.afterReference, undefined);
      assert.equal(actual.rollbackReference, undefined);
    }
    return { text: JSON.stringify({ summary: "Continue only the outstanding selected work.", steps }),
      finishReason: "stop", response: { modelId } };
  } } });
  const f = await fixture({ planner, objective, cipher: testCipher() });
  try {
    const result = await f.start();
    assert.equal(result.run.status, "completed"); assert.equal(result.run.planAttempts, 2);
    assert.equal(result.run.budgets.maxPlans, 2); assert.equal(result.run.budgets.maxActions, 12);
    assert.equal(calls.length, 2); assert.equal(f.adapter.tests, 2); assert.equal(f.adapter.edits, 1);
    assert.deepEqual(result.receipts.map(value => value.capabilityId),
      ["project.run-tests", "project.preview-change", "project.apply-change", "project.run-tests"]);
    assert.deepEqual(result.receipts.filter(value => value.capabilityId === "project.run-tests").map(value => value.output.passed), [false, true]);
    assert.equal(result.run.actions.length, 4);
    const replay = await f.orchestrator.resume(context, { runId: result.run.runId });
    assert.equal(replay.run.status, "completed"); assert.equal(calls.length, 2);
    assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 2);
  } finally { await f.close(); }
});

integration("actual planner cannot gain a third attempt by disregarding the repair progress", async () => {
  let calls = 0;
  const modelId = "synthetic-unrepaired-model";
  const planner = new MastraM1Planner({ provider: { baseUrl: "http://127.0.0.1:1234/v1", modelId }, role: "code",
    agent: { async generate(raw) {
      const input = JSON.parse(raw); calls++; assert.equal(input.progress.phase, calls === 1 ? "initial" : "repair");
      return { text: JSON.stringify({ summary: "Repeat the unchanged test.",
        steps: [{ capabilityId: "project.run-tests", arguments: { suiteId: "addition" } }] }),
        finishReason: "stop", response: { modelId } };
    } } });
  const f = await fixture({ planner });
  try {
    const result = await f.start();
    assert.equal(result.run.status, "failed"); assert.equal(result.run.errorCode, "m1-tests-failed");
    assert.equal(result.run.planAttempts, 2); assert.equal(calls, 2);
    assert.equal(f.adapter.tests, 2); assert.equal(f.adapter.edits, 0);
    assert.equal(result.receipts.length, 2);
  } finally { await f.close(); }
});

// These are real PostgreSQL/orchestration checks with deliberately deterministic
// model and executor fixtures. They do not claim a real model obeyed the prompt.
for (const role of ["code", "agent"]) for (const mode of ["preview-only", "approval-sequence", "read-only", "explain-only"]) {
  integration(`${role} planner protocol keeps ${mode} separate from actual effect authority`, async () => {
    const calls = [], modelId = `synthetic-${role}-approval-model`;
    const objective = mode === "explain-only" ? "Inspect and explain the supplied addition helper without changing or running it."
      : mode === "approval-sequence"
      ? "Correct the addition function, preview it, wait for approval before changing it, and run the registered tests."
      : "Preview a possible addition correction only; do not change or test files.";
    const provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: "http://127.0.0.1:1234/v1",
      models: Object.fromEntries(["chat", "research", "code", "review", "agent"].map(value => [value, modelId])) };
    const planner = new MastraM1Planner({ provider, role,
      fetchImpl: async (_url, options) => {
        const request = JSON.parse(options.body), input = JSON.parse(request.messages.at(-1).content);
        calls.push({ request, input });
        assert.match(request.messages[0].content, /application creates its exact proposal and pauses before the effect/);
        assert.match(request.messages[0].content, /preview-change is read-only; it does not create a pending edit approval/);
        assert.match(request.messages[0].content, /Every published edit automatically retains an application-owned undo receipt/);
        assert.match(request.messages[0].content, /Never invent a future receipt ID or a placeholder/);
        assert.equal(input.objective, objective);
        if (["read-only", "explain-only"].includes(mode)) assert.deepEqual(input.capabilityIds, ["project.inspect", "project.preview-change"]);
        const change = { path: "index.js", content: "exports.add=(a,b)=>a+b;", expectedSha256: input.snapshot.files[0].sha256 };
        const steps = mode === "explain-only" ? [{ capabilityId: "project.inspect", arguments: { path: "index.js" } }]
          : [{ capabilityId: "project.preview-change", arguments: change }];
        if (mode === "approval-sequence") steps.push({ capabilityId: "project.apply-change", arguments: change },
          { capabilityId: "project.run-tests", arguments: { suiteId: "addition" } });
        const summary = mode === "explain-only"
          ? "From the supplied snapshot, the helper subtracts b from a rather than adding them. No change or test has run."
          : "Proposed selected work, not execution.";
        return Response.json({ id: "synthetic-approval-completion", object: "chat.completion", created: 1, model: modelId,
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ summary, steps }) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 40, completion_tokens: 40, total_tokens: 80 } });
      } });
    const f = await fixture({ planner, objective, profile: ["read-only", "explain-only"].includes(mode) ? "read-only" : "ask-every-time", cipher: testCipher() });
    try {
      const initial = await f.start();
      assert.equal(initial.run.plannerRole, role); assert.equal(calls.length, 1);
      assert.equal(f.adapter.edits, 0); assert.equal(f.adapter.tests, 0);
      const readCapability = mode === "explain-only" ? "project.inspect" : "project.preview-change";
      assert.deepEqual(initial.receipts.map(value => value.capabilityId), [readCapability]);
      if (mode === "explain-only") {
        assert.match(initial.run.plans[0].summary, /From the supplied snapshot, the helper subtracts b from a/);
        assert.equal(initial.receipts[0].executionStatus, "observed");
        assert.equal(initial.receipts[0].effectKind, "observed");
      }
      if (mode !== "approval-sequence") {
        assert.equal(initial.run.status, "completed");
        assert.equal(initial.run.pendingProposalId, null);
        assert(initial.proposals.every(value => value.capabilityId === readCapability));
        const replay = await f.orchestrator.resume(context, { runId: initial.run.runId });
        assert.equal(replay.run.status, "completed"); assert.equal(calls.length, 1);
        assert.equal(f.adapter.edits, 0); assert.equal(f.adapter.tests, 0);
      } else {
        assert.equal(initial.run.status, "waiting-approval");
        const edit = initial.proposals.find(value => value.proposalId === initial.run.pendingProposalId);
        assert.equal(edit.capabilityId, "project.apply-change"); assert.equal(edit.status, "pending-approval");
        await assert.rejects(f.service.approve(context, { proposalId: edit.proposalId, proposalDigest: "f".repeat(64) }));
        assert.equal(f.adapter.edits, 0);
        await f.service.approve(context, { proposalId: edit.proposalId, proposalDigest: edit.proposalDigest });
        const reopened = new M1TaskOrchestrator({ service: f.service, planner, workflow: f.workflow });
        const testPause = await reopened.resume(context, { runId: initial.run.runId });
        assert.equal(testPause.run.status, "waiting-approval");
        assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 0);
        const runTests = testPause.proposals.find(value => value.proposalId === testPause.run.pendingProposalId);
        assert.equal(runTests.capabilityId, "project.run-tests");
        await f.service.approve(context, { proposalId: runTests.proposalId, proposalDigest: runTests.proposalDigest });
        const completed = await reopened.resume(context, { runId: initial.run.runId });
        assert.equal(completed.run.status, "completed"); assert.equal(calls.length, 1);
        assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 1);
        assert.equal(completed.receipts.find(value => value.capabilityId === "project.run-tests").output.passed, true);
      }
    } finally { await f.close(); }
  });
}

async function seedOwnedEdit(f, { path = "index.js", content = "exports.add=(a,b)=>a+b;", requestId = "seed-edit", task = f.task, grant = f.grant } = {}) {
  const project = await f.service.currentProject(context);
  const current = project.reference.files.find(file => file.path === path);
  const proposal = await f.service.propose(context, { taskId: task.taskId, grantId: grant.grantId,
    grantRevision: grant.revision, requestId, capabilityId: "project.apply-change",
    arguments: { path, content, expectedSha256: current.sha256 } });
  if (proposal.status === "pending-approval") await f.service.approve(context,
    { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest });
  return (await f.service.execute(context, { proposalId: proposal.proposalId })).receipt;
}

for (const kind of ["invented", "foreign", "stale", "future-invalidated", "out-of-path", "out-of-suite"]) {
  integration(`whole-plan preflight rejects ${kind} references before any new action`, async () => {
    let reference = "future-edit-receipt", plans = 0;
    const f = await fixture({ planner: { async plan({ snapshot }) {
      plans++;
      const steps = [{ capabilityId: "project.inspect", arguments: { path: "index.js" } }];
      if (kind === "invented" || kind === "future-invalidated") steps.push(...planFor(snapshot, true).steps);
      if (kind === "out-of-path") steps.push({ capabilityId: "project.inspect", arguments: { path: "hidden.js" } });
      else if (kind === "out-of-suite") steps.push({ capabilityId: "project.run-tests", arguments: { suiteId: "unregistered-suite" } });
      else steps.push({ capabilityId: "project.restore", arguments: { receiptId: reference } });
      return { summary: "Untrusted plan data.", steps };
    } } });
    try {
      if (["stale", "future-invalidated"].includes(kind)) reference = (await seedOwnedEdit(f)).receiptId;
      if (kind === "stale") await seedOwnedEdit(f, { content: "exports.add=(a,b)=>Number(a)+Number(b);", requestId: "newer-edit" });
      if (kind === "foreign") {
        const task = await f.service.createTask(context, { requestId: "foreign-task", objective: "A separate task." });
        const grant = await f.service.createGrant(context, { taskId: task.taskId, profile: "safe-autopilot", allowedPaths: ["index.js"],
          allowedSuites: [], expiresAt: new Date(Date.now() + 600_000).toISOString() });
        reference = (await seedOwnedEdit(f, { task, grant })).receiptId;
      }
      const before = await f.service.status(context, { taskId: f.task.taskId });
      const edits = f.adapter.edits, tests = f.adapter.tests;
      const result = await f.start();
      assert.equal(result.run.status, "failed"); assert.equal(result.run.plans.length, 0);
      assert.equal(result.proposals.length, before.proposals.length); assert.equal(result.receipts.length, before.receipts.length);
      assert.equal(f.adapter.edits, edits); assert.equal(f.adapter.tests, tests);
      assert.equal((await f.orchestrator.resume(context, { runId: result.run.runId })).run.status, "failed");
      assert.equal(plans, 1); assert.equal(f.adapter.edits, edits); assert.equal(f.adapter.tests, tests);
      const expected = kind === "stale" ? "m1-restore-stale" : kind === "out-of-path" ? "m1-path-outside-grant"
        : kind === "out-of-suite" ? "m1-suite-outside-grant" : "m1-plan-restore-reference-invalid";
      assert.equal(result.run.errorCode, expected);
    } finally { await f.close(); }
  });
}

integration("valid supplied current restore still requires exact approval and restores only its owned revision", async () => {
  let reference, plans = 0;
  const f = await fixture({ profile: "ask-every-time", planner: { async plan({ receipts }) {
    plans++; assert(receipts.some(receipt => receipt.receiptId === reference));
    return { summary: "Restore the requested recorded edit after approval.", steps: [
      { capabilityId: "project.inspect", arguments: { path: "index.js" } },
      { capabilityId: "project.restore", arguments: { receiptId: reference } },
    ] };
  } } });
  try {
    reference = (await seedOwnedEdit(f)).receiptId;
    const result = await f.start();
    assert.equal(result.run.status, "waiting-approval"); assert.equal(f.adapter.edits, 1);
    assert.equal(result.pendingProposal.capabilityId, "project.restore");
    await f.service.approve(context, { proposalId: result.pendingProposal.proposalId,
      proposalDigest: result.pendingProposal.proposalDigest });
    const completed = await f.orchestrator.resume(context, { runId: result.run.runId });
    assert.equal(completed.run.status, "completed"); assert.equal(f.adapter.edits, 2); assert.equal(plans, 1);
    const current = await f.service.currentProject(context);
    assert.equal((await f.adapter.inspectRevision({ reference: current.reference })).files[0].content, "exports.add=(a,b)=>a-b;");
    assert.equal(completed.receipts.at(-1).capabilityId, "project.restore");
  } finally { await f.close(); }
});

integration("a project change during planning rejects the stale whole plan before dispatch", async () => {
  let f;
  f = await fixture({ planner: { async plan({ snapshot }) {
    await seedOwnedEdit(f); return planFor(snapshot, true);
  } } });
  try {
    const result = await f.start();
    assert.equal(result.run.status, "failed"); assert.equal(result.run.errorCode, "m1-plan-snapshot-stale");
    assert.equal(result.run.plans.length, 0); assert.equal(result.run.actions.length, 0);
    assert.equal(result.proposals.length, 1); assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 0);
  } finally { await f.close(); }
});

integration("corrupt prior receipt cannot become a valid restore plan or create an effect", async () => {
  let reference, plans = 0;
  const f = await fixture({ planner: { async plan() { plans++;
    return { summary: "Restore", steps: [{ capabilityId: "project.restore", arguments: { receiptId: reference } }] };
  } } });
  try {
    const receipt = await seedOwnedEdit(f); reference = receipt.receiptId;
    await f.store.transaction(context, async tx => {
      const corrupted = await tx.get("receipt", reference); corrupted.receiptDigest = "f".repeat(64);
      await tx.save("receipt", reference, corrupted);
    });
    await assert.rejects(f.start(), /receipt-integrity-failed/);
    assert.equal(plans, 0); assert.equal(f.adapter.edits, 1); assert.equal(f.adapter.tests, 0);
  } finally { await f.close(); }
});
