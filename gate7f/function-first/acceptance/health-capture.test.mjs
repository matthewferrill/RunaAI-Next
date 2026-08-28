import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { startCaptureTransport, HEALTH_CAPTURE_LIMITS, healthCaptureDiagnostics } from "./capture-transport.mjs";
import { newObservation, ObservationLedger } from "./runner-contract.mjs";
import { MODEL_CASES } from "./cases.mjs";
import { enumerateCaseChecks, gradeCheck } from "./assertions.mjs";

const item = MODEL_CASES.find(value => value.id === "code-01-inspect-branch");
test("outside-attempt health journal remains exportable after close with explicit zero role credit", async () => {
  const capture = await startCaptureTransport({ mode: "controls", targetBaseUrl: "http://127.0.0.1:1", kind: "embedding", getLedger: () => null });
  await fetch(`${capture.baseUrl}/models`); await capture.close();
  const diagnostic = healthCaptureDiagnostics({ embedding: capture });
  assert.equal(diagnostic.category, "ungraded-health"); assert.equal(diagnostic.modelRoleCredit, false);
  assert.equal(diagnostic.inferenceCredit, false); assert.equal(diagnostic.transports.embedding.calls.length, 1);
  assert.equal(diagnostic.transports.embedding.calls[0].phase, "no-case");
  assert.equal(diagnostic.transports.embedding.activeCount, 0); assert.equal(diagnostic.transports.embedding.overflowCount, 0);
  assert.equal(diagnostic.transports.embedding.calls[0].upstreamContacted, false);
});
const ledger = () => new ObservationLedger(newObservation(item));
async function endpoint(handler) {
  const server = createServer(handler); server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { url: `http://127.0.0.1:${server.address().port}`, async close() {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  } };
}
function send(url, { path, method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { path, method, headers }, response => {
      const parts = []; response.on("data", chunk => parts.push(chunk));
      response.on("end", () => { const raw = Buffer.concat(parts).toString("utf8");
        resolve({ status: response.statusCode, raw, json: raw ? JSON.parse(raw) : null }); });
    }); request.on("error", reject); request.end(body);
  });
}

for (const [kind, route] of [["embedding", "/models"], ["reranker", "/health"]]) {
  test(`exact ${kind} health GET is actual bounded read evidence, never inference`, async () => {
    const calls = [], actual = { health: "actual-loopback-fixture", ready: true };
    const upstream = await endpoint(async (request, response) => {
      let body = ""; for await (const chunk of request) body += chunk;
      calls.push({ method: request.method, path: request.url, headers: request.headers, body });
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify(actual));
    });
    const l = ledger(), capture = await startCaptureTransport({ mode: "scored", kind, targetBaseUrl: upstream.url,
      modelId: "pinned", getLedger: () => l });
    try {
      const result = await send(capture.baseUrl, { path: route, headers: { authorization: "synthetic-secret", cookie: "synthetic-cookie" } });
      await capture.drain(); assert.equal(result.status, 200); assert.deepEqual(result.json, actual);
      assert.equal(calls.length, 1); assert.equal(calls[0].method, "GET"); assert.equal(calls[0].path, route);
      assert.equal(calls[0].body, ""); assert.equal(calls[0].headers.authorization, undefined); assert.equal(calls[0].headers.cookie, undefined);
      assert.equal(l.observation.health.calls.length, 1); assert.equal(capture.healthCalls.length, 1);
      assert.equal(l.observation.health.calls[0].inference, false); assert.equal(l.observation.health.calls[0].upstreamContacted, true);
      assert.deepEqual(l.observation.provider, { calls: [], unexpectedCalls: [] }); assert.deepEqual(l.observation.sources.indexOperations, []);
      assert.equal(l.observation.evidence[0].kind, "auxiliary-health-observation");
      const descriptor = enumerateCaseChecks(item).find(value => value.kind === "provider.role");
      assert.equal(gradeCheck(descriptor, l.observation, { expectedModelId: "pinned" }).status, "inconclusive");
    } finally { await capture.close(); await upstream.close(); }
  });
}

test("control mode retains unavailable health observations and makes zero upstream calls", async () => {
  let calls = 0; const upstream = await endpoint((_request, response) => { calls++; response.end("{}"); });
  try {
    for (const [kind, healthPath, inferencePath] of [["embedding", "/models", "/embeddings"], ["reranker", "/health", "/rerank"], ["provider", "/models", "/chat/completions"]]) {
      const l = ledger(), capture = await startCaptureTransport({ mode: "controls", kind, modelId: "pinned", targetBaseUrl: upstream.url, getLedger: () => l });
      try {
        const result = await send(capture.baseUrl, { path: healthPath });
        assert.equal(result.status, 503);
        assert.equal(result.json.errorCode, kind === "provider" ? "m1-capture-route-denied" : "m1-health-disabled-in-controls");
        assert.equal(l.observation.health.calls.length, kind === "provider" ? 0 : 1);
        const body = JSON.stringify({ model: "pinned", input: ["synthetic"], documents: ["synthetic"] });
        assert.equal((await send(capture.baseUrl, { path: inferencePath, method: "POST", body,
          headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } })).json.errorCode, "m1-inference-not-enabled");
        assert.equal(calls, 0);
      } finally { await capture.close(); }
    }
  } finally { await upstream.close(); }
});

test("health route recognition rejects alternate methods, bodies, queries, aliases and model commands", async () => {
  let calls = 0; const upstream = await endpoint((_request, response) => { calls++; response.end("{}"); });
  try {
    for (const [kind, route] of [["embedding", "/models"], ["reranker", "/health"]]) {
      const l = ledger(), capture = await startCaptureTransport({ mode: "scored", kind, modelId: "pinned", targetBaseUrl: upstream.url, getLedger: () => l });
      try {
        const invalid = [
          ...["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"].map(method => ({ path: route, method })),
          ...[`${route}?load=true`, `${route}/`, `${route}/load`, `${route}/unload`, "/unknown", "/api/v1/models/load",
            route === "/models" ? "/%6dodels" : "/%68ealth", `http://127.0.0.1${route}`].map(path => ({ path })),
          { path: route, headers: { "content-length": "1" }, body: "x" },
          { path: route, headers: { "transfer-encoding": "chunked" }, body: "x" },
        ];
        for (const value of invalid) assert.equal((await send(capture.baseUrl, value)).status, 503, JSON.stringify(value));
        assert.equal(calls, 0); assert.equal(l.observation.health.calls.length, 0);
        assert.equal(l.observation.provider.unexpectedCalls.length, invalid.length);
        assert(l.observation.provider.unexpectedCalls.every(value => value.errorCode === "m1-capture-route-denied"));
      } finally { await capture.close(); }
    }
  } finally { await upstream.close(); }
});

test("permitted health failure remains unavailable and never follows a redirect", async () => {
  let redirected = 0; const other = await endpoint((_request, response) => { redirected++; response.end("{}"); });
  const upstream = await endpoint((_request, response) => { response.writeHead(307, { location: other.url }); response.end(); });
  const l = ledger(), capture = await startCaptureTransport({ mode: "scored", kind: "embedding", modelId: "pinned", targetBaseUrl: upstream.url, getLedger: () => l });
  try {
    assert.equal((await send(capture.baseUrl, { path: "/models" })).status, 503);
    assert.equal(redirected, 0); assert.equal(l.observation.health.calls[0].errorCode, "m1-health-upstream-failed");
    assert.equal(l.observation.provider.unexpectedCalls.length, 0);
  } finally { await capture.close(); await upstream.close(); await other.close(); }
});

test("health stream is capped at 64KiB and timeout at the unchanged application health deadline", async () => {
  for (const mode of ["oversized", "timeout"]) {
    const upstream = await endpoint((_request, response) => { if (mode === "oversized") response.end("x".repeat(HEALTH_CAPTURE_LIMITS.maximumBytes + 1)); });
    const l = ledger(), capture = await startCaptureTransport({ mode: "scored", kind: "reranker", targetBaseUrl: upstream.url, getLedger: () => l });
    try {
      const started = Date.now(), result = await send(capture.baseUrl, { path: "/health" });
      assert.equal(result.status, 503);
      assert.equal(result.json.errorCode, mode === "oversized" ? "m1-health-output-limited" : "m1-health-upstream-failed");
      if (mode === "timeout") assert(Date.now() - started < 5000);
      assert.equal(l.observation.provider.unexpectedCalls.length, 0); assert.equal(l.observation.health.calls.length, 1);
      assert.equal(capture.healthCalls[0].response, undefined);
    } finally { await capture.close(); await upstream.close(); }
  }
});

test("health does not pollute a valid inference role or weaken the inference route allowlist", async () => {
  const seen = [], upstream = await endpoint(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    seen.push({ path: request.url, body }); response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url === "/models" ? { data: [] } : { model: "pinned", choices: [] }));
  });
  const l = ledger(), health = await startCaptureTransport({ mode: "scored", kind: "embedding", modelId: "pinned", targetBaseUrl: upstream.url, getLedger: () => l });
  const provider = await startCaptureTransport({ mode: "scored", kind: "provider", modelId: "pinned", targetBaseUrl: upstream.url, getLedger: () => l });
  try {
    await send(health.baseUrl, { path: "/models" });
    const body = JSON.stringify({ model: "pinned", messages: [{ role: "user", content: "synthetic request" }] });
    await send(provider.baseUrl, { path: "/chat/completions", method: "POST", body, headers: { "content-length": Buffer.byteLength(body) } });
    const descriptor = enumerateCaseChecks(item).find(value => value.kind === "provider.role");
    assert.equal(gradeCheck(descriptor, l.observation, { expectedModelId: "pinned" }).status, "pass");
    assert.equal(l.observation.provider.calls.length, 1); assert.equal(l.observation.health.calls.length, 1);
    assert.equal(seen[1].body, body);
    assert.equal((await send(provider.baseUrl, { path: "/chat/completions?health=true", method: "POST", body,
      headers: { "content-length": Buffer.byteLength(body) } })).json.errorCode, "m1-capture-route-denied");
    assert.equal(gradeCheck(descriptor, l.observation, { expectedModelId: "pinned" }).status, "fail");
    assert.equal(seen.length, 2);
  } finally { await provider.close(); await health.close(); await upstream.close(); }
});

test("health drain and close retain bounded transport evidence without mutating a completed attempt", async () => {
  let release, reached; const started = new Promise(resolve => { reached = resolve; });
  const upstream = await endpoint((_request, response) => { release = () => response.end("{}"); reached(); });
  const l = ledger(), capture = await startCaptureTransport({ mode: "scored", kind: "embedding", modelId: "pinned", targetBaseUrl: upstream.url, getLedger: () => l });
  try {
    const pending = send(capture.baseUrl, { path: "/models" }); await started;
    await assert.rejects(capture.drain({ maximumMs: 20 }), /transport-undrained/);
    l.observation.status = "completed"; release(); await pending; await capture.drain();
    assert.equal(capture.healthCalls.length, 1); assert.equal(l.observation.health.calls.length, 0);
    assert.equal(l.observation.provider.calls.length, 0); assert.equal(l.observation.evidence.length, 0);
  } finally { await capture.close(); await upstream.close(); }
});

test("control health journal has a finite cap and overflows fail unavailable with no upstream call", async () => {
  const l = ledger(), capture = await startCaptureTransport({ mode: "controls", kind: "embedding", modelId: "pinned", targetBaseUrl: "http://127.0.0.1:1", getLedger: () => l });
  try {
    for (let i = 0; i < HEALTH_CAPTURE_LIMITS.maximumRecords; i++) await send(capture.baseUrl, { path: "/models" });
    assert.equal((await send(capture.baseUrl, { path: "/models" })).json.errorCode, "m1-health-capture-limited");
    assert.equal(capture.healthOverflows, 1); assert.equal(capture.healthCalls.length, HEALTH_CAPTURE_LIMITS.maximumRecords);
    assert.equal(l.observation.health.calls.length, HEALTH_CAPTURE_LIMITS.maximumRecords);
    assert.equal(l.observation.provider.unexpectedCalls.length, 0);
  } finally { await capture.close(); }
});
