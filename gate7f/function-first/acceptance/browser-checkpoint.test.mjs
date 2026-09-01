import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AGENT05_ACK_PUBLICATION_GRACE_MS, AGENT05_BOUNDED_DRAIN_NOTICE,
  AGENT05_IN_FLIGHT_OBSERVATION_MS, HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS,
  createBrowserCheckpoint } from "./browser-checkpoint.mjs";
import { AGENT05_BOUNDED_DRAIN, browserDomBindingFromAck, browserDomBindingSha256,
  browserWitnessFromAck, browserWitnessSha256 } from "./browser-witness.mjs";
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
function preparationAck(request, observedAt = new Date().toISOString()) {
  return { schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
    caseId: request.caseId, runtimeSealSha256: request.runtimeSealSha256, preparedScope: request.scope, checks: [],
    evidence: [{ id: "unit-preparation", source: "browser", kind: "browser-preparation", data: {
      scope: request.scope, url: request.baseUrl + "/", observedAt,
      projectName: request.projectName, taskObjective: request.taskObjective, note: "UNIT fixture, not customer proof" } }] };
}

function cancellation(client, cancellationAt = new Date().toISOString()) {
  const held = { requestId: "unit-native-request", receiptId: "unit-native-receipt", sourceSha256: "c".repeat(64),
    runtimeStatus: "executed", heldAt: cancellationAt, nativeCompletedBeforeHold: true };
  const receipt = { requestId: held.requestId, receiptId: held.receiptId, sourceSha256: held.sourceSha256,
    participantId: client.principalId, projectId: client.projectId };
  const result = { schemaVersion: "runa-m1-task/v1", status: "cancelled", taskId: client.task.taskId,
    participantId: client.principalId, projectId: client.projectId, updatedAt: cancellationAt };
  client.ledger.observation.native.receipts.push(receipt);
  client.ledger.evidence("host-runtime", "fault-native-result-held", held);
  client.ledger.evidence("postgresql", "fault-cancel-after-native-dispatch", { taskId: client.task.taskId, result, held, cancellationAt });
  return { cancellationAt, held, result };
}

function inFlightAck(request, overrides = {}) {
  const { data: dataOverrides = {}, ...topLevelOverrides } = overrides;
  const descriptor = request.checks[0], evidenceId = "unit-inflight";
  const data = { checkId: descriptor.checkId, actual: false, claimedImmediateKill: false,
    scope: request.scope, url: request.baseUrl + "/", observedAt: new Date().toISOString(),
    projectName: request.projectName, projectId: request.projectId, taskId: request.taskId,
    experience: request.experience, taskObjective: request.taskObjective,
    taskStatus: "cancelled", cancellationAt: request.cancellationAt,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, boundedDrain: { noNewSteps: true,
      alreadyDispatchedMayFinish: true, awaitingReconciliation: true, resultWillBeRetained: true },
    ...dataOverrides };
  return { schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
    caseId: request.caseId, runtimeSealSha256: request.runtimeSealSha256,
    preparedScope: request.scope, preparationCheckpointId: request.preparationCheckpointId,
    cancellationAt: request.cancellationAt,
    evidence: [{ id: evidenceId, source: "browser", kind: descriptor.kind, data }],
    checks: [{ checkId: descriptor.checkId, kind: descriptor.kind, actual: false,
      evidenceRefs: [{ id: evidenceId, pointer: "/actual" }] }], ...topLevelOverrides };
}

function liveEnvelope(request, witness, receivedAtMs, ack = null) {
  const domBinding = ack ? browserDomBindingFromAck(ack) : {
    cancellationAt: request.cancellationAt, experience: request.experience, projectId: request.projectId,
    taskId: request.taskId, taskObjective: request.taskObjective, witnessedUrl: `${request.baseUrl}/`,
  };
  return { witness, witnessSha256: browserWitnessSha256(witness), domBinding,
    domBindingSha256: browserDomBindingSha256(domBinding), receivedAtMs };
}

function controlFixture() {
  const item = CONTROL_CASES.find(value => value.id === "control-10-unknown-execution");
  const ledger = new ObservationLedger(newObservation({ ...item, role: "control" }, { runtimeSealSha256: "a".repeat(64) }));
  const principalId = "m1-test-" + "a".repeat(32), session = { principalId, sessionId: "b".repeat(64) };
  const client = { ledger, item: { setup: { project: "fixture" } }, principalId, session, projectId: "fixture", experience: "code",
    host: { baseUrl: "http://127.0.0.1:12345", async createBootstrap(id, options) {
      assert.equal(id, principalId); assert.deepEqual(options.session, session);
      return { url: "http://127.0.0.1:12345/__acceptance/session", nonce: "synthetic-unit-nonce" };
    } } };
  return { item, ledger, client };
}

function gradedAck(request, overrides = {}) {
  const descriptor = request.checks[0];
  return { schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
    caseId: request.caseId, runtimeSealSha256: request.runtimeSealSha256,
    evidence: [{ id: "unit-browser", source: "browser", kind: descriptor.kind,
      data: { checkId: descriptor.checkId, actual: true, note: "UNIT FIXTURE ONLY, not real browser qualification" } }],
    checks: [{ checkId: descriptor.checkId, kind: descriptor.kind, actual: true,
      evidenceRefs: [{ id: "unit-browser", pointer: "/actual" }] }], ...overrides };
}
test("cancel browser prep is ungraded and actual in-flight checkpoint reuses the same session", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-prep-"));
  t.after(async () => { assert.equal(path.dirname(directory), path.resolve(tmpdir())); assert.match(path.basename(directory), /^m1-browser-prep-/u); await rm(directory, { recursive: true, force: true }); });
  const client = cancelClient(), requests = [], writers = [];
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 2000, announce(value) {
    writers.push((async () => {
      const request = JSON.parse(await readFile(value.requestPath, "utf8")); requests.push(request);
      if (request.preparationOnly) await writeFile(request.ackPath, JSON.stringify(preparationAck(request)));
      else await writeFile(request.ackPath, JSON.stringify(inFlightAck(request)));
    })());
  } });
  const ticket = await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  assert.equal(ticket.preparationOnly, true); assert.equal(client.ledger.observation.checks.length, 0);
  assert.equal(client.ledger.observation.browserExercised, false); assert.equal(requests[0].checks.length, 0);
  const cancelled = cancellation(client);
  await checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight", cancellationAt: cancelled.cancellationAt });
  await Promise.all(writers);
  assert.equal(client.bootstrapCalls, 1); assert.equal(requests[1].bootstrap, null);
  assert.equal(requests[1].reusePreparedBrowser, true); assert.equal(requests[1].preparationCheckpointId, ticket.checkpointId);
  assert.equal(requests[1].cancellationAt, cancelled.cancellationAt); assert.deepEqual(requests[1].scope, ticket.scope);
  assert.equal(client.ledger.observation.checks.length, 1); assert.equal(client.ledger.observation.browserExercised, true);
});

test("scored preparation requires an exact watcher arm written before the browser acknowledgement", async t => {
  for (const mode of ["missing", "exact", "wrong-request"]) {
    const directory = await mkdtemp(path.join(tmpdir(), `m1-browser-arm-${mode}-`));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const client = cancelClient();
    const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, requireWatcherArmed: true,
      announce(value) { void (async () => {
        const request = JSON.parse(await readFile(value.requestPath, "utf8"));
        if (mode !== "missing") await writeFile(path.join(path.dirname(value.requestPath), "watcher-armed.json"), JSON.stringify({
          schemaVersion: "runaai-m1-browser-watcher-armed/v1", checkpointId: request.checkpointId,
          caseId: request.caseId, stage: request.stage, runtimeSealSha256: request.runtimeSealSha256,
          requestSha256: mode === "exact" ? value.requestSha256 : "0".repeat(64),
          armedAt: new Date(Date.now() - 10).toISOString(), exactCheckpointStatusRequired: true, globalCounterUsed: false,
        }));
        await writeFile(request.ackPath, JSON.stringify(preparationAck(request)));
      })(); } });
    const pending = checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
    if (mode === "exact") assert.equal((await pending).preparationOnly, true);
    else await assert.rejects(pending, new RegExp(mode === "missing" ? "watcher-not-armed" : "watcher-arm-invalid", "u"));
  }
});

test("human browser checkpoints allow fifteen minutes but remain bounded", () => {
  assert.equal(HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS, 900000);
  assert.doesNotThrow(() => createBrowserCheckpoint({ directory: "unused", maximumWaitMs: 900000 }));
  assert.throws(() => createBrowserCheckpoint({ directory: "unused", maximumWaitMs: 900001 }), /m1-browser-checkpoint-budget-invalid/u);
});

test("a checkpoint never advertises deadlines beyond the campaign hard stop", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-hard-stop-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(), clock = Date.now(), checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000,
    now: () => clock, campaignHardStopAt: clock + AGENT05_IN_FLIGHT_OBSERVATION_MS + AGENT05_ACK_PUBLICATION_GRACE_MS + 30_000 - 1,
    announce(value) { void (async () => { const request = JSON.parse(await readFile(value.requestPath, "utf8"));
      await writeFile(request.ackPath, JSON.stringify(preparationAck(request, new Date(clock).toISOString()))); })(); } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client, new Date(clock).toISOString());
  await assert.rejects(checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight",
    cancellationAt: cancelled.cancellationAt }), /campaign-budget-insufficient/u);
});

test("on-time live witness releases the checkpoint before a matching acknowledgement publication", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-live-receipt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(), start = Date.parse("2026-08-30T12:00:00.000Z"); let clock = start;
  let request, requestPath, announcedWitness, consumed = false, fileReads = 0, requestDeliveredAt = null;
  const witness = { boundedDrain: AGENT05_BOUNDED_DRAIN, claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, taskStatus: "cancelled" };
  Object.assign(client.host, {
    createBrowserObservation(checkpointId, witnessExpiresAtMs, publishExpiresAtMs) {
      return { schemaVersion: "runaai-m1-browser-observation-endpoint/v2",
        witnessUrl: `${client.host.baseUrl}/__acceptance/browser-observation-witness`, witnessToken: "c".repeat(64),
        ackUrl: `${client.host.baseUrl}/__acceptance/browser-observation-ack`, ackToken: "d".repeat(64),
        witnessExpiresAt: new Date(witnessExpiresAtMs).toISOString(), publishExpiresAt: new Date(publishExpiresAtMs).toISOString() };
    },
    readBrowserWitness() {
      if (clock - start < 23999) throw Object.assign(new Error("not witnessed"), { code: "ENOENT" });
      const value = JSON.parse(readFileSync(requestPath, "utf8"));
      return liveEnvelope(value, witness, start + 23999);
    },
    readBrowserObservation() {
      if (clock - start < 83999) throw Object.assign(new Error("not published"), { code: "ENOENT" });
      request = JSON.parse(readFileSync(requestPath, "utf8")); requestDeliveredAt = clock;
      const ack = inFlightAck(request, { data: { observedAt: new Date(start + 83999).toISOString() } });
      return { raw: JSON.stringify(ack), ...liveEnvelope(request, browserWitnessFromAck(ack), start + 83999, ack),
        witnessReceivedAtMs: start + 23999 };
    },
    consumeBrowserObservation() { consumed = true; }
  });
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 120000, now: () => clock,
    pause: async ms => { clock += ms; }, async readAck(ackPath) {
      fileReads++;
      const value = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      return JSON.stringify(preparationAck(value, new Date(clock).toISOString()));
    }, announce(value) { if (value.witnessPublication) {
      requestPath = value.requestPath; announcedWitness = value.witnessPublication;
    } } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client, new Date(start).toISOString());
  const ticket = await checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight", cancellationAt: cancelled.cancellationAt });
  assert.equal(ticket.schemaVersion, "runaai-m1-browser-witness-ticket/v1");
  assert.equal(ticket.witnessReceivedAt, new Date(start + 23999).toISOString());
  await ticket.publication;
  assert.equal(fileReads, 1, "only preparation used the file reader");
  assert.deepEqual(Object.keys(announcedWitness).sort(), ["baseUrl", "caseId", "checkpointId", "schemaVersion",
    "stage", "witnessExpiresAt", "witnessToken", "witnessUrl"]);
  assert.equal(announcedWitness.checkpointId, request.checkpointId);
  assert.equal(announcedWitness.witnessToken, request.observationEndpoint.witnessToken);
  assert.equal("ackToken" in announcedWitness, false); assert.equal("scope" in announcedWitness, false);
  assert.equal("sessionSha256" in announcedWitness, false);
  assert(requestDeliveredAt - start > AGENT05_IN_FLIGHT_OBSERVATION_MS,
    "the complete request may arrive after the witness deadline without blocking the immediate ticket");
  assert.equal(request.observationEndpoint.schemaVersion, "runaai-m1-browser-observation-endpoint/v2");
  assert.equal(Date.parse(request.observationDeadline) - start, AGENT05_IN_FLIGHT_OBSERVATION_MS);
  assert.equal(Date.parse(request.expiresAt) - start, AGENT05_IN_FLIGHT_OBSERVATION_MS + AGENT05_ACK_PUBLICATION_GRACE_MS);
  assert.equal(clock - start, 84000); assert.equal(consumed, true);
  assert.equal(client.ledger.observation.checks[0].actual, false);
});

test("on-time witness cannot authorize acknowledgement publication after the grace deadline", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-live-publication-expired-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(), start = Date.parse("2026-08-30T12:15:00.000Z"); let clock = start, request, consumed = 0;
  const witness = { boundedDrain: AGENT05_BOUNDED_DRAIN, claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, taskStatus: "cancelled" };
  Object.assign(client.host, {
    createBrowserObservation(_checkpointId, witnessExpiresAtMs, publishExpiresAtMs) {
      return { schemaVersion: "runaai-m1-browser-observation-endpoint/v2",
        witnessUrl: `${client.host.baseUrl}/__acceptance/browser-observation-witness`, witnessToken: "c".repeat(64),
        ackUrl: `${client.host.baseUrl}/__acceptance/browser-observation-ack`, ackToken: "d".repeat(64),
        witnessExpiresAt: new Date(witnessExpiresAtMs).toISOString(), publishExpiresAt: new Date(publishExpiresAtMs).toISOString() };
    },
    readBrowserWitness() {
      if (clock - start < 10000) throw Object.assign(new Error("not witnessed"), { code: "ENOENT" });
      return liveEnvelope(request, witness, start + 10000);
    },
    readBrowserObservation() {
      if (clock - start < 105000) throw Object.assign(new Error("not published"), { code: "ENOENT" });
      const ack = inFlightAck(request, { data: { observedAt: new Date(start + 10000).toISOString() } });
      return { raw: JSON.stringify(ack), ...liveEnvelope(request, witness, start + 105001, ack),
        witnessReceivedAtMs: start + 10000 };
    },
    consumeBrowserObservation() { consumed++; }
  });
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 120000, now: () => clock,
    pause: async ms => { clock += ms; }, async readAck(ackPath) {
      const value = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      return JSON.stringify(preparationAck(value, new Date(clock).toISOString()));
    }, announce(value) { const valueRequest = JSON.parse(readFileSync(value.requestPath, "utf8"));
      if (!valueRequest.preparationOnly) request = valueRequest; } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client, new Date(start).toISOString()), evidenceBefore = client.ledger.observation.evidence.length;
  const ticket = await checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight", cancellationAt: cancelled.cancellationAt });
  await assert.rejects(ticket.publication, /m1-browser-ack-publication-expired/u);
  assert.equal(consumed, 1); assert.deepEqual([client.ledger.observation.evidence.length,
    client.ledger.observation.checks.length, client.ledger.observation.browserExercised], [evidenceBefore, 0, false]);
});

test("failed live observation consumes its bounded harness slot", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-live-cleanup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(), start = Date.parse("2026-08-30T12:30:00.000Z"); let clock = start, consumed = 0;
  Object.assign(client.host, {
    createBrowserObservation(_checkpointId, witnessExpiresAtMs, publishExpiresAtMs) {
      return { schemaVersion: "runaai-m1-browser-observation-endpoint/v2",
        witnessUrl: `${client.host.baseUrl}/__acceptance/browser-observation-witness`, witnessToken: "d".repeat(64),
        ackUrl: `${client.host.baseUrl}/__acceptance/browser-observation-ack`, ackToken: "e".repeat(64),
        witnessExpiresAt: new Date(witnessExpiresAtMs).toISOString(), publishExpiresAt: new Date(publishExpiresAtMs).toISOString() };
    },
    readBrowserWitness() { throw Object.assign(new Error("not witnessed"), { code: "ENOENT" }); },
    readBrowserObservation() { throw Object.assign(new Error("not observed"), { code: "ENOENT" }); },
    consumeBrowserObservation() { consumed++; },
  });
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, now: () => clock,
    pause: async ms => { clock += ms; }, async readAck(ackPath) {
      const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      return JSON.stringify(preparationAck(request, new Date(clock).toISOString()));
    } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client, new Date(start).toISOString());
  await assert.rejects(checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight",
    cancellationAt: cancelled.cancellationAt }), /m1-browser-checkpoint-unobserved/u);
  assert.equal(consumed, 1);
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
  cancellation(client);
  client.task.taskId = "other-task";
  await assert.rejects(checkpoint({ client, stage: "in-flight" }), /preparation-required/u);
  client.task.taskId = "fixture-task"; client.session.sessionId = "c".repeat(64);
  await assert.rejects(checkpoint({ client, stage: "in-flight" }), /preparation-required/u); assert.equal(client.bootstrapCalls, 1);
});

for (const acknowledgementMs of [10000, 30000, 44000]) test(`post-cancel browser evidence at ${acknowledgementMs / 1000}s uses the authoritative timestamp and passes`, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-inflight-late-valid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(), start = Date.parse("2026-08-29T14:00:00.000Z"); let clock = start, inFlightRequest;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 60000, now: () => clock,
    pause: async ms => { clock += ms; }, async readAck(ackPath) {
      const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      if (request.preparationOnly) return JSON.stringify(preparationAck(request, new Date(clock).toISOString()));
      inFlightRequest = request;
      if (clock - start < acknowledgementMs) throw Object.assign(new Error("not published yet"), { code: "ENOENT" });
      return JSON.stringify(inFlightAck(request, { data: { observedAt: new Date(clock).toISOString() } }));
    } });
  const prepared = await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client, new Date(start).toISOString());
  await checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight", cancellationAt: cancelled.cancellationAt });
  assert.equal(clock - start, acknowledgementMs); assert.equal(Date.parse(inFlightRequest.expiresAt) - start, AGENT05_IN_FLIGHT_OBSERVATION_MS);
  assert.equal(inFlightRequest.cancellationAt, cancelled.result.updatedAt);
  assert.deepEqual(inFlightRequest.scope, prepared.scope); assert.equal(inFlightRequest.preparationCheckpointId, prepared.checkpointId);
  assert.equal(client.ledger.observation.checks[0].actual, false); assert.equal(client.ledger.observation.browserExercised, true);
});

test("post-cancel browser evidence beyond forty-five seconds expires without grading the DOM", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-inflight-expired-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(), start = Date.parse("2026-08-29T14:30:00.000Z"); let clock = start;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 60000, now: () => clock,
    pause: async ms => { clock += ms; }, async readAck(ackPath) {
      const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      if (request.preparationOnly) return JSON.stringify(preparationAck(request, new Date(clock).toISOString()));
      if (clock - start <= AGENT05_IN_FLIGHT_OBSERVATION_MS) throw Object.assign(new Error("not published yet"), { code: "ENOENT" });
      return JSON.stringify(inFlightAck(request, { data: { observedAt: new Date(clock).toISOString() } }));
    } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client, new Date(start).toISOString()), evidenceBefore = client.ledger.observation.evidence.length;
  await assert.rejects(checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight",
    cancellationAt: cancelled.cancellationAt }), /m1-browser-checkpoint-unobserved/u);
  assert.equal(clock - start, AGENT05_IN_FLIGHT_OBSERVATION_MS);
  assert.deepEqual([client.ledger.observation.evidence.length, client.ledger.observation.checks.length,
    client.ledger.observation.browserExercised], [evidenceBefore, 0, false]);
});

for (const [label, mutate] of [
  ["pre-cancel observation", (ack, request) => { ack.evidence[0].data.observedAt = new Date(Date.parse(request.cancellationAt) - 1).toISOString(); }],
  ["different prepared scope", ack => { ack.preparedScope = { ...ack.preparedScope, projectId: "wrong-project" }; }],
  ["different session", ack => { ack.evidence[0].data.scope = { ...ack.evidence[0].data.scope, sessionSha256: "d".repeat(64) }; }],
  ["different task", ack => { ack.evidence[0].data.taskId = "wrong-task"; }],
  ["different project", ack => { ack.evidence[0].data.projectId = "wrong-project"; }],
  ["different experience", ack => { ack.evidence[0].data.experience = "chat"; }],
  ["non-authoritative cancellation", ack => { ack.cancellationAt = "2026-08-29T00:00:00.000Z"; }],
]) test(`in-flight browser rejects ${label} without ledger mutation`, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-inflight-binding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient(); let inFlight = false;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, async readAck(ackPath) {
    const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
    if (request.preparationOnly) return JSON.stringify(preparationAck(request));
    inFlight = true; const ack = inFlightAck(request); mutate(ack, request); return JSON.stringify(ack);
  } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client), evidenceBefore = client.ledger.observation.evidence.length;
  await assert.rejects(checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight",
    cancellationAt: cancelled.cancellationAt }), /m1-browser-in-flight-(binding|dom)-invalid/u);
  assert.equal(inFlight, true); assert.deepEqual([client.ledger.observation.evidence.length,
    client.ledger.observation.checks.length, client.ledger.observation.browserExercised], [evidenceBefore, 0, false]);
});

for (const [label, data] of [
  ["generic false value", { notice: "cancelled" }],
  ["immediate-kill claim", { claimedImmediateKill: true }],
  ["active task state", { taskStatus: "active" }],
  ["missing bounded drain", { boundedDrain: { noNewSteps: true } }],
]) test(`in-flight browser requires actual bounded-drain DOM truth: ${label}`, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-inflight-dom-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = cancelClient();
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, async readAck(ackPath) {
    const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
    return JSON.stringify(request.preparationOnly ? preparationAck(request) : inFlightAck(request, { data }));
  } });
  await checkpoint({ client, phase: "1:run.start", stage: "before-native-dispatch" });
  const cancelled = cancellation(client), evidenceBefore = client.ledger.observation.evidence.length;
  await assert.rejects(checkpoint({ client, phase: "2:user.cancel-after-native-dispatch", stage: "in-flight",
    cancellationAt: cancelled.cancellationAt }), /m1-browser-in-flight-dom-invalid/u);
  assert.deepEqual([client.ledger.observation.evidence.length, client.ledger.observation.checks.length,
    client.ledger.observation.browserExercised], [evidenceBefore, 0, false]);
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

for (const transientCode of ["EBUSY", "EPERM"]) test(`operator checkpoint retries ${transientCode} then consumes exact bound evidence`, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-bridge-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture();
  let writer, busy = true;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 2000,
    async readAck(ackPath) {
      if (busy) { busy = false; throw Object.assign(new Error("synthetic Windows share window"), { code: transientCode }); }
      return readFile(ackPath, "utf8");
    }, announce(value) {
    writer = (async () => { const request = JSON.parse(await readFile(value.requestPath, "utf8"));
      await writeFile(request.ackPath, JSON.stringify(gradedAck(request))); })();
  } });
  await checkpoint({ client, phase: "unknown", stage: "unknown" });
  await writer; assert.equal(busy, false); assert.equal(ledger.observation.checks.length, 1); assert.equal(ledger.observation.evidence[0].source, "browser");
  assert.match(ledger.observation.evidence[0].data.note, /UNIT FIXTURE ONLY/);
});

test("nontransient reader failure is immediate and leaves the ledger unchanged", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-eacces-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture(); let pauses = 0;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000,
    async readAck() { throw Object.assign(new Error("denied"), { code: "EACCES" }); }, async pause() { pauses++; } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), error => error.code === "EACCES");
  assert.equal(pauses, 0); assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

test("persistent transient sharing failures expire without ledger mutation", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-timeout-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture(); let clock = 0, reads = 0;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, now: () => clock, pause: async ms => { clock += ms; },
    async readAck() { reads++; throw Object.assign(new Error("busy"), { code: reads % 2 ? "EBUSY" : "EPERM" }); } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-checkpoint-unobserved/u);
  assert.equal(reads, 4); assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

test("a valid ack returned after the deadline is rejected without parsing or mutation", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-late-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture(); let clock = 0;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, now: () => clock, pause: async () => {},
    announce() {}, async readAck(ackPath) {
      const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      clock = 1000; return JSON.stringify(gradedAck(request));
    } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-checkpoint-unobserved/u);
  assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

test("operator-visible expiresAt and enforcement use one deadline even when announce consumes time", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-one-deadline-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture(); let clock = 0, requestExpiry = null;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, now: () => clock, pause: async () => {},
    announce(value) { const request = JSON.parse(readFileSync(value.requestPath, "utf8")); requestExpiry = Date.parse(request.expiresAt); clock = 900; },
    async readAck(ackPath) {
      const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
      clock = 1000; return JSON.stringify(gradedAck(request));
    } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-checkpoint-unobserved/u);
  assert.equal(requestExpiry, 1000); assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

test("transient observation followed by malformed JSON fails immediately", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-malformed-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture(); let reads = 0, pauses = 0;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, pause: async () => { pauses++; }, async readAck() {
    reads++; if (reads === 1) throw Object.assign(new Error("busy"), { code: "EBUSY" }); return "{";
  } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-ack-invalid/u);
  assert.equal(reads, 2); assert.equal(pauses, 1); assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

for (const invalidPart of ["evidence", "check", "reference"]) test(`a malformed ${invalidPart} after a valid prefix cannot partially mutate the ledger`, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), `m1-browser-atomic-${invalidPart}-`)); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture();
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, async readAck(ackPath) {
    const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8")), ack = gradedAck(request);
    if (invalidPart === "evidence") ack.evidence.push({ id: "bad", source: "model", kind: "bad", data: {} });
    if (invalidPart === "check") ack.checks.push({ checkId: "unknown", kind: "ui.unknown", actual: true, evidenceRefs: [{ id: "unit-browser", pointer: "/actual" }] });
    if (invalidPart === "reference") ack.checks[0].evidenceRefs.push({ id: "missing", pointer: "/actual" });
    return JSON.stringify(ack);
  } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-(evidence|check|reference)-invalid/u);
  assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

test("an ack missing a required frozen browser check is rejected without ledger mutation", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-missing-check-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const { ledger, client } = controlFixture();
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, async readAck(ackPath) {
    const request = JSON.parse(await readFile(path.join(path.dirname(ackPath), "request.json"), "utf8"));
    return JSON.stringify(gradedAck(request, { checks: [] }));
  } });
  await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-check-invalid/u);
  assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
});

test("the default reader rejects oversized and reparse-point acknowledgments", async t => {
  for (const kind of ["oversized", "junction"]) {
    const directory = await mkdtemp(path.join(tmpdir(), `m1-browser-${kind}-`)); t.after(() => rm(directory, { recursive: true, force: true }));
    const { ledger, client } = controlFixture(); let writer;
    const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 1000, announce(value) { writer = (async () => {
      const request = JSON.parse(await readFile(value.requestPath, "utf8"));
      if (kind === "oversized") await writeFile(request.ackPath, "x".repeat(262145));
      else { const target = path.join(directory, "external-ack-directory"); await mkdir(target); await symlink(target, request.ackPath, "junction"); }
    })(); } });
    await assert.rejects(checkpoint({ client, phase: "unknown", stage: "unknown" }), /m1-browser-ack-invalid/u); await writer;
    assert.deepEqual([ledger.observation.evidence.length, ledger.observation.checks.length, ledger.observation.browserExercised], [0, 0, false]);
  }
});
