import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { AGENT05_POST_RECEIPT_HOLD_MS, AcceptanceFaultController, createFaultActions, holdApplicationAcknowledgement } from "./fault-actions.mjs";
import { startApplicationFaultWorker } from "./fault-worker.mjs";
import { MODEL_CASES } from "./cases.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const scope = { participantId: "m1-test-fixture", projectId: "fixture-project" };
function ledger() {
  return { phase: "unit-test", observation: { caseId: "unit-test", candidateId: "synthetic", repetition: 1, role: "agent",
    application: { requests: [] }, native: { calls: [], receipts: [], suites: [] }, authority: { sessionEvents: [] }, evidence: [] },
  evidence(source, kind, data) { this.observation.evidence.push({ source, kind, data: structuredClone(data) }); } };
}
async function server(handler) {
  const instance = createServer(handler); instance.listen(0, "127.0.0.1"); await once(instance, "listening");
  return { baseUrl: `http://127.0.0.1:${instance.address().port}`, async close() {
    await new Promise(done => { instance.close(done); instance.closeAllConnections(); });
  } };
}

test("provider fault truncates a real HTTP socket exactly once; no successful answer is synthesized", async () => {
  const observed = ledger(), faults = new AcceptanceFaultController({ getLedger: () => observed });
  faults.armProviderResponseDrop(scope);
  const body = Buffer.from('{"model":"synthetic","choices":[{"message":{"content":"fixture"}}]}');
  const endpoint = await server(async (_, response) => {
    const item = { scope, sequence: 1, httpStatus: 200 };
    if (await faults.deliverProviderResponse({ response, raw: body, item })) { response.writeHead(200); response.end(body); }
  });
  try {
    await assert.rejects(async () => { const response = await fetch(endpoint.baseUrl); return response.text(); });
    assert.equal(faults.providerFaultObserved(), true);
    assert.equal((await (await fetch(endpoint.baseUrl)).json()).model, "synthetic");
    const event = observed.observation.evidence.find(entry => entry.kind === "fault-provider-response-truncated");
    assert.equal(event.data.deliveredBytes, 1); assert.equal(event.data.actualSocketDestroyed, true);
  } finally { faults.clear(); await endpoint.close(); }
});

test("fault arming rejects non-test identities and does not intercept another scope", async () => {
  const faults = new AcceptanceFaultController();
  assert.equal(faults.nativeReceiptHoldMs, AGENT05_POST_RECEIPT_HOLD_MS);
  assert.throws(() => faults.armProviderResponseDrop({ participantId: "owner", projectId: "production" }), /synthetic-scope/u);
  faults.armProviderResponseDrop(scope);
  assert.equal(await faults.deliverProviderResponse({ item: { scope: { ...scope, projectId: "another-project" } } }), true);
  assert.equal(faults.providerFaultObserved(), false); faults.clear();
  assert.throws(() => new AcceptanceFaultController({ maximumHoldMs: 100000 }), /hold-budget/u);
  assert.throws(() => new AcceptanceFaultController({ nativeReceiptHoldMs: AGENT05_POST_RECEIPT_HOLD_MS + 1 }), /native-hold-budget/u);
});

test("lost acknowledgement destroys the actual client socket after headers and preserves the exact retry body", async () => {
  const observed = ledger(), received = [], committed = new Map();
  const endpoint = await server(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    received.push(JSON.parse(body));
    const id = received.at(-1).input.requestId;
    committed.set(id, committed.get(id) ?? { receiptId: "synthetic-retained-receipt" });
    response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(committed.get(id)));
  });
  const body = { projectId: "fixture-project", experience: "code", operation: "run.start", input: { requestId: "exact-request" } };
  let held;
  try {
    held = await holdApplicationAcknowledgement({ baseUrl: endpoint.baseUrl, body, sessionId: "a".repeat(64), ledger: observed });
    assert.equal(committed.size, 1);
    const dropped = await held.drop();
    assert.equal(dropped.response, null); assert.equal(dropped.responseBodyRead, false);
    const retried = await fetch(`${endpoint.baseUrl}/api/m1/workspace`, { method: "POST", body: JSON.stringify(body) });
    assert.equal((await retried.json()).receiptId, "synthetic-retained-receipt");
    assert.deepEqual(received[0], received[1]);
    assert.equal(observed.observation.application.requests[0].requestId, "exact-request");
  } finally { held?.close(); await endpoint.close(); }
});

test("acknowledgement faults cannot target a remote or arbitrary route", async () => {
  await assert.rejects(holdApplicationAcknowledgement({ baseUrl: "http://example.com", body: { operation: "run.start" }, sessionId: "a".repeat(64), ledger: ledger() }), /boundary/u);
  await assert.rejects(holdApplicationAcknowledgement({ baseUrl: "http://127.0.0.1:1", path: "/admin/delete", body: { operation: "run.start" }, sessionId: "a".repeat(64), ledger: ledger() }), /boundary/u);
});

test("stale vector fault performs real bounded HTTP mutation only after exact owned point verification", async () => {
  const observed = ledger(), requests = [], reference = { projectId: "fixture-project", sourceId: "fixture-source", sectionId: "provided", contentSha256: "1".repeat(64) };
  const digest = sha256(JSON.stringify(reference)), pointId = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
  let payload = structuredClone(reference);
  // Protocol fixture only, not Qdrant functional acceptance. The actual runner
  // invokes these same HTTP operations against its owned real Qdrant instance.
  const endpoint = await server(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text); requests.push({ path: request.url, body });
    let result;
    if (request.url.endsWith("/points/payload?wait=true")) { payload = { ...payload, ...body.payload }; result = { status: "completed", operation_id: 7 }; }
    else result = [{ id: pointId, payload }];
    response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "ok", result }));
  });
  try {
    const faults = new AcceptanceFaultController({ getLedger: () => observed, qdrant: { endpoint: endpoint.baseUrl, collection: "m1_unit_fixture", syntheticOnly: true } });
    const proof = await faults.poisonSelectedPoint(reference);
    assert.equal(requests.length, 3); assert.equal(proof.before.contentSha256, reference.contentSha256);
    assert.notEqual(proof.after.contentSha256, reference.contentSha256);
    assert.deepEqual(requests[1].body.points, [pointId]);
    assert.deepEqual(Object.keys(requests[1].body.payload), ["contentSha256"]);
    assert.equal(proof.canonicalSourceChanged, false);
    await assert.rejects(faults.poisonSelectedPoint(reference), /authority-mismatch/u);
    assert.equal(requests.length, 4, "The mismatched point must not be mutated again.");
  } finally { await endpoint.close(); }
});

test("production-named and remote index targets cannot receive a stale-point mutation", async () => {
  for (const qdrant of [{ endpoint: "http://127.0.0.1:6333", collection: "production", syntheticOnly: true },
    { endpoint: "http://192.168.50.169:6333", collection: "m1_test", syntheticOnly: true }]) {
    await assert.rejects(new AcceptanceFaultController({ qdrant }).poisonSelectedPoint({}), /owned-index/u);
  }
});

test("materialization hold is bounded and does not claim an exception was a process crash", async () => {
  const observed = ledger(), faults = new AcceptanceFaultController({ getLedger: () => observed, maximumHoldMs: 100 });
  faults.armMaterializationHold(scope);
  const effect = { proposal: { ...scope, proposalId: "proposal-one", capabilityId: "project.apply-change" }, intent: { effectId: "effect-one" }, observed: { status: "fixture" } };
  const pending = faults.afterMaterialize(effect);
  assert.deepEqual(await faults.waitMaterializationHeld(), effect);
  await assert.rejects(pending, /hold-expired/u);
  assert.equal(observed.observation.evidence.some(entry => entry.kind === "fault-actual-worker-crashed"), false);
  faults.clear();
});

test("actual isolated child is terminated and restarted, with initialization kept off argv", async () => {
  const observed = ledger();
  const worker = await startApplicationFaultWorker({ initialization: { lifecycleFixture: true, sessionId: "b".repeat(64) }, getLedger: () => observed,
    bootstrapModule: new URL("./fault-worker.fixture.mjs", import.meta.url), allowLifecycleFixture: true, maximumLifetimeMs: 10000 });
  try {
    const issued = await worker.identities.issue(scope.participantId);
    assert.equal(issued.sessionId, "b".repeat(64)); assert.equal(issued.argv.join(" ").includes(issued.sessionId), false);
    await worker.syncPhase("staged", scope);
    await worker.worker.armMaterializationHold(scope);
    const pending = fetch(`${worker.baseUrl}/materialize-hook`, { method: "POST" }).catch(error => error);
    const staged = await worker.worker.waitMaterializationHeld();
    assert.equal(staged.proposal.proposalId, "fixture-proposal");
    const exit = await worker.worker.crash();
    assert.equal(exit.actualProcessExit, true); assert.ok(Number.isInteger(exit.pid));
    assert.ok(await pending instanceof Error);
    const restarted = await worker.worker.restart();
    assert.equal(restarted.generation, 2);
    assert.equal((await worker.identities.issue(scope.participantId)).sessionId, issued.sessionId);
    const response = await fetch(worker.baseUrl); assert.equal(response.status, 200);
  } finally { await worker.close(); }
});

test("the scored worker cannot load the unit lifecycle fixture without explicit test construction", async () => {
  await assert.rejects(startApplicationFaultWorker({ initialization: {}, getLedger: () => ledger(),
    bootstrapModule: new URL("./fault-worker.fixture.mjs", import.meta.url) }), /construction-invalid/u);
});

test("all five non-browser gap families have concrete action implementations", () => {
  const extension = createFaultActions();
  const ids = ["chat-08-retry-incomplete", "research-06-stale-derived-record", "agent-05-cancel-drain", "agent-06-crash-reconcile", "agent-07-lost-ack"];
  const missingActions = new Set(["fault.provider-before-response", "fault.stale-vector-reference", "answer.expect-source-failure",
    "user.cancel-after-native-dispatch", "run.observe-drain", "fault.kill-worker-after-materialization", "worker.restart", "proposal.reconcile", "run.resume", "fault.drop-http-ack-after-commit"]);
  for (const item of MODEL_CASES.filter(item => ids.includes(item.id))) for (const action of item.journey) if (missingActions.has(action.action)) {
    assert.equal(typeof extension.actions[action.action], "function"); missingActions.delete(action.action);
  }
  assert.equal(missingActions.size, 0); extension.close();
});

test("Agent05 binds the authoritative cancellation time, releases once and introduces no later dispatch", async () => {
  const observed = ledger(), calls = [], checkpoints = []; let releaseRun, releases = 0;
  const pendingRun = new Promise(resolve => { releaseRun = resolve; });
  const held = { requestId: "native-request", receiptId: "native-receipt", sourceSha256: "c".repeat(64),
    runtimeStatus: "executed", heldAt: "2026-08-29T15:00:00.000Z", nativeCompletedBeforeHold: true };
  const cancelled = { schemaVersion: "runa-m1-task/v1", status: "cancelled", taskId: "fixture-task",
    participantId: scope.participantId, projectId: scope.projectId, updatedAt: "2026-08-29T15:00:01.125Z" };
  const faults = { armProviderResponseDrop() {}, armNativeReceiptHold(value) { assert.deepEqual(value, scope); }, async waitNativeReceiptHeld() { return held; },
    releaseNativeReceipt() { releases++; }, clear() {} };
  const extension = createFaultActions({ async checkpoint(value) { checkpoints.push(value); } });
  const client = { item: { id: "agent-05-cancel-drain", role: "agent" }, principalId: scope.participantId, projectId: scope.projectId,
    task: { taskId: "fixture-task" }, grant: { grantId: "fixture-grant", revision: 1 }, id: () => "fixture-request",
    ledger: observed, host: { faults }, async m1(operation) {
      calls.push(operation); if (operation === "run.start") return pendingRun; if (operation === "task.cancel") return structuredClone(cancelled);
      throw new Error("unexpected operation");
    }, async recordState(value) { return value; } };
  try {
    await extension.actions["run.start"](client);
    assert.deepEqual(await extension.actions["user.cancel-after-native-dispatch"](client), cancelled);
    assert.equal(releases, 1); assert.deepEqual(calls, ["run.start", "task.cancel"]);
    assert.equal(checkpoints.length, 1); assert.equal(checkpoints[0].stage, "in-flight");
    assert.equal(checkpoints[0].cancellationAt, cancelled.updatedAt);
    const records = observed.observation.evidence.filter(value => value.kind === "fault-cancel-after-native-dispatch");
    assert.equal(records.length, 1); assert.equal(records[0].data.cancellationAt, cancelled.updatedAt);
    assert.equal(records[0].data.held.receiptId, held.receiptId);
    releaseRun({ status: "cancelled", receipts: [{ receiptId: held.receiptId }] });
    assert.equal((await extension.actions["run.observe-drain"](client)).status, "cancelled");
    assert.deepEqual(calls, ["run.start", "task.cancel"], "Checkpoint and drain must not dispatch another effect.");
  } finally { releaseRun({ status: "cancelled" }); extension.close(); }
});

for (const scenario of ["checkpoint-failure", "invalid-cancel-result"]) test(`Agent05 always releases its held receipt after ${scenario}`, async () => {
  const observed = ledger(), calls = []; let releases = 0, checkpointCalls = 0;
  const held = { requestId: "native-request", receiptId: "native-receipt", sourceSha256: "c".repeat(64),
    runtimeStatus: "executed", heldAt: "2026-08-29T15:10:00.000Z", nativeCompletedBeforeHold: true };
  const faults = { armProviderResponseDrop() {}, armNativeReceiptHold() {}, async waitNativeReceiptHeld() { return held; }, releaseNativeReceipt() {
    releases++; if (releases > 1) throw new Error("released twice");
  }, clear() {} };
  const extension = createFaultActions({ async checkpoint() { checkpointCalls++; throw new Error("synthetic-checkpoint-failure"); } });
  const client = { item: { id: "agent-05-cancel-drain", role: "agent" }, principalId: scope.participantId, projectId: scope.projectId,
    task: { taskId: "fixture-task" }, grant: { grantId: "fixture-grant", revision: 1 }, id: () => "fixture-request",
    ledger: observed, host: { faults }, async m1(operation) {
      calls.push(operation); if (operation === "run.start") return new Promise(() => {});
      if (operation === "task.cancel") return { schemaVersion: "runa-m1-task/v1", status: scenario === "invalid-cancel-result" ? "active" : "cancelled",
        taskId: "fixture-task", participantId: scope.participantId, projectId: scope.projectId, updatedAt: "2026-08-29T15:10:01.000Z" };
      throw new Error("unexpected operation");
    } };
  try {
    await extension.actions["run.start"](client);
    await assert.rejects(extension.actions["user.cancel-after-native-dispatch"](client),
      scenario === "invalid-cancel-result" ? /m1-cancel-result-invalid/u : /synthetic-checkpoint-failure/u);
    assert.equal(releases, 1); assert.equal(checkpointCalls, scenario === "checkpoint-failure" ? 1 : 0);
    assert.deepEqual(calls, ["run.start", "task.cancel"]);
  } finally { extension.close(); }
});

test("fault drain waits for the real pending HTTP call after close releases its fixture hold", async () => {
  let release, requestStarted;
  const held = new Promise(resolve => { release = resolve; });
  const arrived = new Promise(resolve => { requestStarted = resolve; });
  const endpoint = await server(async (_request, response) => { requestStarted(); await held; response.end("settled"); });
  const extension = createFaultActions(); let completed = false;
  // Only the hook is a test double; drain observes an actual held TCP request.
  // This fixture is not a native-execution or model qualification claim.
  const client = { item: { id: "agent-05-cancel-drain", role: "agent" }, principalId: scope.participantId, projectId: scope.projectId,
    task: { taskId: "fixture-task" }, grant: { grantId: "fixture-grant", revision: 1 }, id: () => "fixture-request",
    host: { faults: { armProviderResponseDrop() {}, armNativeReceiptHold() {}, async waitNativeReceiptHeld() { await arrived; return { fixture: true }; }, clear() { release(); } } },
    async m1() { const response = await fetch(endpoint.baseUrl); const value = await response.text(); completed = true; return value; } };
  try {
    await extension.actions["run.start"](client); assert.equal(completed, false);
    const drained = extension.drain(); extension.close();
    assert.equal((await drained).pendingSettled, 1); assert.equal(completed, true);
    await assert.rejects(extension.drain({ maximumMs: 10001 }), /budget-invalid/u);
  } finally { release(); extension.close(); await endpoint.close(); }
});
