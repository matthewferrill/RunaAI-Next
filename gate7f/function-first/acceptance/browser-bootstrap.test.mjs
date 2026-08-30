import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { withSyntheticBootstrap } from "./browser-bootstrap.mjs";

test("loopback browser observation endpoint accepts one exact live receipt and consumes it", async t => {
  const shipped = createServer((_request, response) => { response.writeHead(404); response.end(); });
  const identities = { publicBaseUrl: null }, events = [];
  const wrapper = withSyntheticBootstrap(shipped, { identities,
    getLedger: () => ({ evidence(source, kind, data) { events.push({ source, kind, data }); } }) });
  wrapper.server.listen(0, "127.0.0.1"); await once(wrapper.server, "listening");
  t.after(() => new Promise(resolve => { wrapper.server.close(resolve); wrapper.server.closeAllConnections(); }));
  identities.publicBaseUrl = `http://127.0.0.1:${wrapper.server.address().port}`;
  const checkpointId = "11111111-2222-4333-8444-555555555555";
  const endpoint = wrapper.createBrowserObservation(checkpointId, Date.now() + 5000);
  const ack = { schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId, evidence: [], checks: [] };
  const response = await fetch(endpoint.url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.token, ack }) });
  assert.equal(response.status, 204);
  const retained = wrapper.readBrowserObservation(checkpointId);
  assert.deepEqual(JSON.parse(retained.raw), ack); assert(Number.isFinite(retained.receivedAtMs));
  const replay = await fetch(endpoint.url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId, token: endpoint.token, ack }) });
  assert.equal(replay.status, 403); assert.equal(events.filter(value => value.kind === "browser-observation-received").length, 1);
  wrapper.consumeBrowserObservation(checkpointId);
  assert.throws(() => wrapper.readBrowserObservation(checkpointId), error => error.code === "ENOENT");
});
