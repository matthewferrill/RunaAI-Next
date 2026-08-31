import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prepare, propose, recordCheck, denial } from "./model-free-controls.mjs";
import { M1TaskOrchestrator } from "../tasks/orchestrator.mjs";
import { startApplicationFaultWorker } from "./fault-worker.mjs";
import { scanRawOwnedRows } from "./private-row-scan.mjs";

function fixtureOrchestrator(host, text) {
  const service = host.m1.tasks;
  // This is an explicit model-free control planner, not a model candidate or a
  // fabricated runtime receipt. All proposals, effects and checkpoints below use
  // the shipped durable authority and existing LangGraph graph.
  return new M1TaskOrchestrator({ service, workflow: host.m1.orchestrator.agent.workflow,
    planner: { role: "agent", async plan({ snapshot }) {
      const file = snapshot.files.find(value => value.path === "control.js");
      return { summary: `Synthetic control plan ${text}`, steps: [
        { capabilityId: "project.inspect", arguments: { path: "control.js" } },
        { capabilityId: "project.apply-change", arguments: { path: "control.js", content: `// ${text}\nexports.value=()=>8;`, expectedSha256: file.sha256 } },
      ] };
    } }, budgets: { maximumRequestActiveMs: 55000, maximumRunActiveMs: 120000, planningTimeoutMs: 30000 } });
}
const startInput = client => ({ taskId: client.task.taskId, grantId: client.grant.grantId,
  grantRevision: client.grant.revision, requestId: client.id("control-run") });
const continuityScope = client => ({ participantId: client.principalId, projectId: client.projectId,
  threadId: client.threadId, experience: client.experience });

async function encryptedRecords(host, item, ledger, { testbed }) {
  const canary = `m1-private-canary-${randomBytes(16).toString("hex")}`;
  const client = await prepare(host, item, ledger, "ask-every-time");
  client.task = await client.m1("task.create", { requestId: client.id("private-task"), objective: canary });
  client.grant = await client.m1("grant.create", { taskId: client.task.taskId, profile: "ask-every-time", allowedPaths: ["control.js"],
    allowedSuites: [], expiresAt: new Date(Date.now() + 600000).toISOString() });
  const source = await client.m1("sources.attach", { requestId: client.id("source"), label: canary, content: `Synthetic private source ${canary}` });
  const ask = message => client.http("answer", "/api/selected/answer", { requestId: client.id("private-answer"), projectId: client.projectId,
    threadId: client.threadId, experience: "code", lane: "code", message, history: [], contextRevision: client.contextRevision });
  const first = await ask(`What was my previous question? ${canary}`); client.contextRevision = first.contextRevision;
  const second = await ask("What was my previous question?"); client.contextRevision = second.contextRevision;
  assert.ok(second.answer.includes(canary));
  const orchestration = fixtureOrchestrator(host, canary), run = await orchestration.start(client.context(), startInput(client));
  assert.equal(run.run.status, "waiting-approval"); assert.ok(run.pendingProposal);
  const before = await host.continuity.prepareAnswerContext(continuityScope(client));
  const rows = await scanRawOwnedRows(host.pool, [canary]);
  assert.equal(rows.reduce((sum, value) => sum + value.privateCanaryMatches, 0), 0);
  assert.ok(rows.find(value => value.schema === "runa_runtime" && value.table === "route_responses_v2")?.rowCount > 0);
  assert.ok(rows.find(value => value.schema === "runa_m1_checkpoints" && value.table === "checkpoints")?.rowCount > 0);
  const other = await client.m1("task.create", { requestId: client.id("second-private-task"), objective: `${canary}-other` });
  const originals = (await host.pool.query("SELECT record_id,payload,payload_sha256 FROM runa_m1.records WHERE kind='task' AND record_id=ANY($1::text[])",
    [[client.task.taskId, other.taskId]])).rows;
  assert.equal(originals.length, 2);
  const target = originals.find(value => value.record_id === other.taskId), donor = originals.find(value => value.record_id === client.task.taskId);
  let swap;
  try {
    await host.pool.query("UPDATE runa_m1.records SET payload=$1::jsonb,payload_sha256=$2 WHERE kind='task' AND record_id=$3",
      [JSON.stringify(donor.payload), donor.payload_sha256, target.record_id]);
    swap = await denial(ledger, "foreign-record-envelope", () => client.m1("task.status", { taskId: target.record_id }));
  } finally {
    await host.pool.query("UPDATE runa_m1.records SET payload=$1::jsonb,payload_sha256=$2 WHERE kind='task' AND record_id=$3",
      [JSON.stringify(target.payload), target.payload_sha256, target.record_id]);
  }
  let worker;
  try {
    worker = await startApplicationFaultWorker({ initialization: testbed.workerInit, getLedger: () => ledger });
    const actualExit = await worker.worker.crash(); assert.equal(actualExit.actualProcessExit, true);
    const restart = await worker.worker.restart();
    const after = await worker.continuity.prepareAnswerContext(continuityScope(client));
    const readSources = await worker.m1.sources.selected(client.context(), [source.sourceId]);
    const previousHost = client.host; client.host = worker;
    let restored; try { restored = await client.m1("run.status", { runId: run.run.runId }); } finally { client.host = previousHost; }
    assert.deepEqual(after, before); assert.equal(readSources[0].content, `Synthetic private source ${canary}`);
    assert.equal(restored.run.objective, canary); assert.equal(restored.run.plans[0].summary, `Synthetic control plan ${canary}`);
    recordCheck(ledger, item, "restart.decryptSameScope", true, { before, after, source: readSources, run: restored.run,
      actualExit, restart }, "postgresql");
  } finally { await worker?.close(); }
  recordCheck(ledger, item, "rawRows.privateCanaries", rows.reduce((sum, value) => sum + value.privateCanaryMatches, 0), rows, "postgresql");
  recordCheck(ledger, item, "envelope.foreignSwapRejected", swap.denied, { swap, donorId: donor.record_id, targetId: target.record_id }, "postgresql");
}

async function logoutMidPlan(host, item, ledger, { testbed }) {
  const client = await prepare(host, item, ledger, "ask-every-time"), initial = await host.snapshot(client.context());
  const orchestrator = fixtureOrchestrator(host, "logout-between-steps"), started = await orchestrator.start(client.context(), startInput(client));
  assert.equal(started.run.status, "waiting-approval");
  const pending = started.pendingProposal;
  await client.m1("proposal.approve", { proposalId: pending.proposalId, proposalDigest: pending.proposalDigest });
  const oldContext = client.context(), oldSession = client.session;
  await client.http("session.logout", "/session/user/logout", {});
  await denial(ledger, "old-session-logout", () => client.m1("proposal.execute", { proposalId: pending.proposalId }));
  let worker, directError, restarted;
  try {
    worker = await startApplicationFaultWorker({ initialization: testbed.workerInit, getLedger: () => ledger });
    const exit = await worker.worker.crash(); restarted = { exit, next: await worker.worker.restart() };
    try { await worker.worker.executeWithoutRegisteredVerifier(oldContext, { proposalId: pending.proposalId }); }
    catch (error) { directError = error.code; }
    assert.equal(directError, "m1-session-authority-unavailable");
  } finally { await worker?.close(); }
  const afterLogout = await host.snapshot(oldContext); assert.equal(afterLogout.workspaceSha256, initial.workspaceSha256);
  await client.login(); assert.notEqual(client.session.sessionId, oldSession.sessionId);
  const oldGrant = client.grant;
  const replacement = await client.m1("grant.create", { taskId: client.task.taskId, profile: "ask-every-time", allowedPaths: ["control.js"],
    allowedSuites: [], expiresAt: new Date(Date.now() + 600000).toISOString() });
  const rebound = await orchestrator.resume(client.context(), { runId: started.run.runId, grantId: replacement.grantId, grantRevision: replacement.revision });
  assert.equal(rebound.run.status, "waiting-approval"); assert.notEqual(rebound.pendingProposal.proposalId, pending.proposalId);
  assert.equal(rebound.pendingProposal.approval ?? null, null); assert.equal(rebound.run.planAttempts, 2);
  const afterRebind = await host.snapshot(client.context()); assert.equal(afterRebind.workspaceSha256, initial.workspaceSha256);
  recordCheck(ledger, item, "effects.oldSessionAfterLogout", afterLogout.projectRevision - initial.projectRevision,
    { initial, afterLogout, directError, restarted }, "postgresql");
  recordCheck(ledger, item, "oldPlan.inheritsNewGrant", false, { oldGrant, replacement, oldProposal: pending,
    newProposal: rebound.pendingProposal, run: rebound.run, afterRebind }, "postgresql");
}

async function unknownExecution(_host, item, ledger, { testbed, checkpoint }) {
  let worker;
  try {
    worker = await startApplicationFaultWorker({ initialization: testbed.workerInit, getLedger: () => ledger, maximumLifetimeMs: 600000 });
    const client = await prepare(worker, item, ledger);
    const proposal = await propose(client, "project.run-tests", { suiteId: "control-value-v1" });
    ledger.phase = "actual-dispatch";
    await worker.worker.armNativeReceiptHold({ participantId: client.principalId, projectId: client.projectId });
    const pending = client.m1("proposal.execute", { proposalId: proposal.proposalId }); pending.catch(() => {});
    const held = await worker.worker.waitNativeReceiptHeld();
    assert.equal(ledger.observation.native.calls.length, 1); assert.equal(ledger.observation.native.receipts.length, 1);
    const exit = await worker.worker.crash(); await pending.catch(() => {});
    const restarted = await worker.worker.restart(); ledger.phase = "unknown-before-reconcile";
    const status = await client.m1("task.status", { taskId: client.task.taskId });
    assert.equal(status.receipts.length, 0); assert.equal(status.pendingReconciliation.length, 1);
    const reconciled = await client.m1("proposal.reconcile", { proposalId: proposal.proposalId });
    assert.equal(reconciled.proposal.status, "unknown"); assert.equal(reconciled.receipt, null);
    await client.recordState();
    // Only the parent-owned actual browser can add ui.unknownVisible. HTTP state
    // is not browser evidence. If unavailable, keep the control inconclusive.
    await checkpoint?.({ client, phase: "unknown-before-successor", stage: "unknown", proposalId: proposal.proposalId });
    const retried = await client.m1("proposal.execute", { proposalId: proposal.proposalId });
    assert.equal(retried.proposal.status, "unknown"); assert.equal(retried.receipt, null);
    assert.equal(ledger.observation.native.calls.length, 1);
    recordCheck(ledger, item, "unknown.nativeRerun", false, { held, exit, restarted, status, reconciled, retried,
      nativeCalls: ledger.observation.native.calls.length, canonicalReceipts: status.receipts.length }, "postgresql");
    if (!checkpoint) ledger.evidence("application", "browser-proof-pending", { controlId: item.id, requiredCheck: "ui.unknownVisible", actualStatus: reconciled.proposal.status });
  } finally { await worker?.close(); }
}

export const DURABLE_CONTROLS = Object.freeze({ "control-05-encrypted-records": encryptedRecords,
  "control-07-logout-mid-plan": logoutMidPlan, "control-10-unknown-execution": unknownExecution });
