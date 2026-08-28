import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBrowserCheckpoint } from "./browser-checkpoint.mjs";
import { CONTROL_CASES, MODEL_CASES } from "./cases.mjs";
import { newObservation, ObservationLedger } from "./runner-contract.mjs";

test("aborted campaign cannot begin a browser checkpoint",async()=>{
  const controller=new AbortController();controller.abort();
  const checkpoint=createBrowserCheckpoint({directory:"unused",signal:controller.signal});
  await assert.rejects(checkpoint({client:null}),/m1-browser-checkpoint-aborted/);
});

function cancelClient() {
  const item = MODEL_CASES.find(value => value.id === "agent-05-cancel-drain");
  const principalId = "m1-test-" + "a".repeat(32), ledger = new ObservationLedger(newObservation(item,
    { candidateId: "gemma4-26b-a4b", repetition: 1, runtimeSealSha256: "a".repeat(64) }));
  const client = { ledger, item, principalId, session: { principalId, sessionId: "b".repeat(64) },
    projectId: "fixture-project", experience: "code", task: { taskId: "fixture-task", objective: item.objective },
    bootstrapCalls: 0, host: { baseUrl: "http://127.0.0.1:12345", async createBootstrap(id, { session }) {
      assert.equal(id, principalId); assert.equal(session.sessionId, "b".repeat(64)); client.bootstrapCalls++;
      // UNIT fixture for the host's consumed-nonce record. This does not claim
      // an actual browser session or native acceptance was exercised here.
      ledger.evidence("browser", "synthetic-session-bootstrap", { principalId, sameSessionReattached: true, oneTimeNonceConsumed: true });
      return { url: "http://127.0.0.1:12345/__acceptance/session", nonce: "unit-only" };
    } } };
  return client;
}
function preparationAck(request) {
  return { schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
    caseId: request.caseId, runtimeSealSha256: request.runtimeSealSha256, preparedScope: request.scope, checks: [],
    evidence: [{ id: "unit-preparation", source: "browser", kind: "browser-preparation", data: {
      scope: request.scope, url: request.baseUrl + "/", observedAt: new Date().toISOString(),
      projectName: request.projectName, taskObjective: request.taskObjective, note: "UNIT fixture, not customer proof" } }] };
}
test("cancel browser prep is ungraded and actual in-flight checkpoint reuses the same session", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-prep-"));
  t.after(async () => { assert.equal(path.dirname(directory), path.resolve(tmpdir())); assert.match(path.basename(directory), /^m1-browser-prep-/u); await rm(directory, { recursive: true, force: true }); });
  const client = cancelClient(), requests = [], writers = [];
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 2000, announce(value) {
    writers.push((async () => {
      const request = JSON.parse(await readFile(value.requestPath, "utf8")); requests.push(request);
      if (request.preparationOnly) await writeFile(request.ackPath, JSON.stringify(preparationAck(request)));
      else {
        const descriptor = request.checks[0];
        await writeFile(request.ackPath, JSON.stringify({ schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
          caseId: request.caseId, runtimeSealSha256: request.runtimeSealSha256,
          evidence: [{ id: "unit-inflight", source: "browser", kind: descriptor.kind,
            data: { checkId: descriptor.checkId, actual: false, note: "UNIT real-check fixture only" } }],
          checks: [{ checkId: descriptor.checkId, kind: descriptor.kind, actual: false, evidenceRefs: [{ id: "unit-inflight", pointer: "/actual" }] }] }));
      }
    })());
  } });
  const ticket = await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  assert.equal(ticket.preparationOnly, true); assert.equal(client.ledger.observation.checks.length, 0);
  assert.equal(client.ledger.observation.browserExercised, false); assert.equal(requests[0].checks.length, 0);
  await checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight" });
  await Promise.all(writers);
  assert.equal(client.bootstrapCalls, 1); assert.equal(requests[1].bootstrap, null);
  assert.equal(requests[1].reusePreparedBrowser, true); assert.equal(requests[1].preparationCheckpointId, ticket.checkpointId);
  assert.equal(client.ledger.observation.checks.length, 1); assert.equal(client.ledger.observation.browserExercised, true);
});
test("in-flight cancel cannot bootstrap late or borrow another task/session preparation", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-prep-scope-"));
  t.after(async () => { assert.equal(path.dirname(directory), path.resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); });
  const client = cancelClient(), writers = [];
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, announce(value) {
    writers.push((async () => { const request = JSON.parse(await readFile(value.requestPath, "utf8")); await writeFile(request.ackPath, JSON.stringify(preparationAck(request))); })());
  } });
  await assert.rejects(checkpoint({ client, stage: "in-flight" }), /preparation-required/u); assert.equal(client.bootstrapCalls, 0);
  await checkpoint({ client, stage: "before-native-dispatch", phase: "before" }); await Promise.all(writers);
  client.task.taskId = "other-task";
  await assert.rejects(checkpoint({ client, stage: "in-flight" }), /preparation-required/u);
  client.task.taskId = "fixture-task"; client.session.sessionId = "c".repeat(64);
  await assert.rejects(checkpoint({ client, stage: "in-flight" }), /preparation-required/u); assert.equal(client.bootstrapCalls, 1);
});
test("preparation refuses graded checks and does not turn a readiness ack into a pass", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-prep-denied-"));
  t.after(async () => { assert.equal(path.dirname(directory), path.resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); });
  const client = cancelClient(); let writer;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, announce(value) {
    writer = (async () => { const request = JSON.parse(await readFile(value.requestPath, "utf8")), ack = preparationAck(request);
      ack.checks.push({ checkId: "cannot-pass-during-prep", kind: "ui.claimedImmediateKill", actual: false });
      await writeFile(request.ackPath, JSON.stringify(ack)); })();
  } });
  await assert.rejects(checkpoint({ client, stage: "before-native-dispatch", phase: "before" }), /preparation-unproven/u);
  await writer; assert.equal(client.ledger.observation.checks.length, 0); assert.equal(client.ledger.observation.browserExercised, false);
});

test("campaign cancellation ends a pending browser checkpoint without consuming evidence",async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),"m1-browser-abort-"));t.after(()=>rm(directory,{recursive:true,force:true}));
  const item=CONTROL_CASES.find(item=>item.id==="control-10-unknown-execution"),ledger=new ObservationLedger(newObservation({...item,role:"control"}));
  const controller=new AbortController(),checkpoint=createBrowserCheckpoint({directory,signal:controller.signal,announce(){controller.abort();}});
  await assert.rejects(checkpoint({client:{ledger,item:{setup:{project:"fixture"}},principalId:"m1-test-"+"a".repeat(32),session:{},projectId:"fixture",experience:"code",
    host:{baseUrl:"http://127.0.0.1:12345",async createBootstrap(){return{nonce:"synthetic-unit-nonce"};}}},phase:"unknown",stage:"unknown"}),/m1-browser-checkpoint-aborted/);
  assert.equal(ledger.observation.checks.length,0);
});

test("operator checkpoint consumes exact bound browser evidence without pretending to inspect a DOM", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-bridge-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const item = CONTROL_CASES.find(item => item.id === "control-10-unknown-execution");
  const ledger = new ObservationLedger(newObservation({ ...item, role: "control" }, { runtimeSealSha256: "a".repeat(64) }));
  const principalId = "m1-test-" + "a".repeat(32), session = { principalId, sessionId: "b".repeat(64) };
  let writer;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 2000, announce(value) {
    writer = (async () => { const request = JSON.parse(await readFile(value.requestPath, "utf8")), descriptor = request.checks[0];
      await writeFile(request.ackPath, JSON.stringify({ schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
        caseId: item.id, runtimeSealSha256: request.runtimeSealSha256,
        evidence: [{ id: "unit-browser", source: "browser", kind: descriptor.kind,
          data: { checkId: descriptor.checkId, actual: true, note: "UNIT FIXTURE ONLY, not real browser qualification" } }],
        checks: [{ checkId: descriptor.checkId, kind: descriptor.kind, actual: true, evidenceRefs: [{ id: "unit-browser", pointer: "/actual" }] }] })); })();
  } });
  await checkpoint({ client: { ledger, item: { setup: { project: "fixture" } }, principalId, session, projectId: "fixture", experience: "code",
    host: { baseUrl: "http://127.0.0.1:12345", async createBootstrap(id, options) { assert.equal(id, principalId); assert.deepEqual(options.session, session);
      return { url: "http://127.0.0.1:12345/__acceptance/session", nonce: "synthetic-unit-nonce" }; } } }, phase: "unknown", stage: "unknown" });
  await writer; assert.equal(ledger.observation.checks.length, 1); assert.equal(ledger.observation.evidence[0].source, "browser");
  assert.match(ledger.observation.evidence[0].data.note, /UNIT FIXTURE ONLY/);
});
