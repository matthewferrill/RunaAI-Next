import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { withSyntheticBootstrap } from "./browser-bootstrap.mjs";
import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE,
  browserDomBindingSha256, browserWitnessSha256 } from "./browser-witness.mjs";

test("loopback endpoint binds one on-time witness to one matching acknowledgement", async t => {
  const shipped = createServer((_request, response) => { response.writeHead(404); response.end(); });
  const identities = { publicBaseUrl: null }, events = [];
  const wrapper = withSyntheticBootstrap(shipped, { identities,
    getLedger: () => ({ evidence(source, kind, data) { events.push({ source, kind, data }); } }) });
  wrapper.server.listen(0, "127.0.0.1"); await once(wrapper.server, "listening");
  t.after(() => new Promise(resolve => { wrapper.server.close(resolve); wrapper.server.closeAllConnections(); }));
  identities.publicBaseUrl = `http://127.0.0.1:${wrapper.server.address().port}`;
  const checkpointId = "11111111-2222-4333-8444-555555555555";
  const expected = { taskId: "task-1", projectId: "project-1", experience: "code",
    taskObjective: "Repair exercise", cancellationAt: "2026-09-01T00:00:00.000Z" };
  const endpoint = wrapper.createBrowserObservation(checkpointId, Date.now() + 5000, Date.now() + 10000, expected);
  const domBinding = { ...expected, witnessedUrl: `${identities.publicBaseUrl}/` };
  const witness = { boundedDrain: AGENT05_BOUNDED_DRAIN, claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, taskStatus: "cancelled" };
  const ack = { schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId,
    evidence: [{ data: { ...witness, ...expected, url: domBinding.witnessedUrl } }], checks: [] };
  const wrongWitnessToken = await fetch(endpoint.witnessUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: "0".repeat(64), witness, domBinding }) });
  assert.equal(wrongWitnessToken.status, 403);
  const wrongTask = await fetch(endpoint.witnessUrl, { method: "POST", headers: { "content-type": "application/json", origin: identities.publicBaseUrl },
    body: JSON.stringify({ checkpointId, token: endpoint.witnessToken, witness, domBinding: { ...domBinding, taskId: "different-task" } }) });
  assert.equal(wrongTask.status, 403);
  const witnessResponse = await fetch(endpoint.witnessUrl, { method: "POST", headers: { "content-type": "application/json", origin: identities.publicBaseUrl },
    body: JSON.stringify({ checkpointId, token: endpoint.witnessToken, witness, domBinding }) });
  assert.equal(witnessResponse.status, 204);
  const witnessed = wrapper.readBrowserWitness(checkpointId);
  assert.deepEqual(witnessed.witness, witness); assert.equal(witnessed.witnessSha256, browserWitnessSha256(witness));
  assert.deepEqual(witnessed.domBinding, domBinding); assert.equal(witnessed.domBindingSha256, browserDomBindingSha256(domBinding));
  const checkpointStatus = await (await fetch(`${identities.publicBaseUrl}/__acceptance/browser-observation-status?checkpointId=${checkpointId}`)).json();
  assert.equal(checkpointStatus.checkpointId, checkpointId); assert.equal(checkpointStatus.witnessAccepted, true);
  assert.equal(checkpointStatus.acknowledgementAccepted, false); assert.equal(checkpointStatus.witnessSha256, witnessed.witnessSha256);
  assert.equal(JSON.stringify(checkpointStatus).includes(endpoint.witnessToken), false);
  const wrongDigest = await fetch(endpoint.ackUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.ackToken, witnessSha256: "0".repeat(64), domBindingSha256: witnessed.domBindingSha256, ack }) });
  assert.equal(wrongDigest.status, 403);
  const response = await fetch(endpoint.ackUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.ackToken, witnessSha256: witnessed.witnessSha256, domBindingSha256: witnessed.domBindingSha256, ack }) });
  assert.equal(response.status, 204);
  const retained = wrapper.readBrowserObservation(checkpointId);
  assert.deepEqual(JSON.parse(retained.raw), ack); assert(Number.isFinite(retained.receivedAtMs));
  assert(Number.isFinite(retained.witnessReceivedAtMs)); assert(retained.witnessReceivedAtMs <= retained.receivedAtMs);
  const completedStatus = await (await fetch(`${identities.publicBaseUrl}/__acceptance/browser-observation-status?checkpointId=${checkpointId}`)).json();
  assert.equal(completedStatus.acknowledgementAccepted, true);
  const replay = await fetch(endpoint.witnessUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.witnessToken, witness, domBinding }) });
  assert.equal(replay.status, 403);
  const ackReplay = await fetch(endpoint.ackUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.ackToken, witnessSha256: retained.witnessSha256, domBindingSha256: retained.domBindingSha256, ack }) });
  assert.equal(ackReplay.status, 204, "an exact acknowledgement retry repairs a live-publication/audit-file crash gap");
  const changedAck = structuredClone(ack); changedAck.evidence[0].data.extra = true;
  const changedReplay = await fetch(endpoint.ackUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.ackToken, witnessSha256: retained.witnessSha256, domBindingSha256: retained.domBindingSha256, ack: changedAck }) });
  assert.equal(changedReplay.status, 403);
  const wrongMethod = await fetch(endpoint.witnessUrl);
  assert.equal(wrongMethod.status, 403);
  const malformed = await fetch(endpoint.witnessUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 403);
  const missingCheckpoint = await fetch(endpoint.witnessUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId: "99999999-2222-4333-8444-555555555555", token: endpoint.witnessToken, witness, domBinding }) });
  assert.equal(missingCheckpoint.status, 403);
  const expiringId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const expiring = wrapper.createBrowserObservation(expiringId, Date.now() + 5, Date.now() + 5000, expected);
  await new Promise(resolve => setTimeout(resolve, 10));
  const expired = await fetch(expiring.witnessUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId: expiringId, token: expiring.witnessToken, witness, domBinding }) });
  assert.equal(expired.status, 403);
  const status = await (await fetch(`${identities.publicBaseUrl}/__acceptance/bootstrap-status`)).json();
  assert.equal(status.browserWitnessDenials["token-invalid"], 1);
  assert.equal(status.browserWitnessDenials["binding-invalid"], 1);
  assert.equal(status.browserWitnessDenials.replay, 1);
  assert.equal(status.browserWitnessDenials["method-or-remote"], 1);
  assert.equal(status.browserWitnessDenials["body-invalid"], 1);
  assert.equal(status.browserWitnessDenials["checkpoint-unknown"], 1);
  assert.equal(status.browserWitnessDenials.expired, 1);
  assert.equal(status.browserObservationDenials["binding-invalid"], 1);
  assert.equal(status.browserObservationDenials.replay, 1);
  assert.equal(JSON.stringify(status).includes(endpoint.witnessToken), false);
  assert.equal(JSON.stringify(status).includes(endpoint.ackToken), false);
  assert.equal(events.filter(value => value.kind === "browser-observation-witness-received").length, 1);
  assert.equal(events.filter(value => value.kind === "browser-observation-received").length, 1);
  wrapper.consumeBrowserObservation(checkpointId);
  assert.throws(() => wrapper.readBrowserObservation(checkpointId), error => error.code === "ENOENT");
});
