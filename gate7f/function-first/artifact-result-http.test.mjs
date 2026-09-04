import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createCandidateHttpServer } from "../../gate6b/http-server.mjs";

const STATUS = Object.freeze({
  "result-request-invalid": 400,
  "result-owner-not-found": 404,
  "result-not-ready": 409,
  "result-stale": 409,
  "result-owner-over-capacity": 413,
  "result-source-too-large": 413,
  "result-list-too-large": 413,
  "result-too-large": 413,
  "result-source-invalid": 503,
  "result-unavailable": 503,
});

async function fixture(t) {
  const ordinarySessions = { publicBaseUrl: "https://runa.example.invalid",
    async credentialForSession(sessionId) {
      assert.equal(sessionId, "ordinary-session"); return "credential";
    } };
  const m1Functions = { async dispatch({ body }) {
    if (body.input?.errorCode) throw Object.assign(new Error("private internal detail"), { code: body.input.errorCode });
    return { schemaVersion: "runaai-m1-result-list/v1", results: [] };
  } };
  const server = createCandidateHttpServer({ application: {}, ordinarySessions, m1Functions,
    staticRoot: import.meta.dirname, runtimeStatus: async () => ({}), readinessStatus: async () => ({}),
    dependencyHealth: async () => ({ ready: true }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/m1/workspace`;
  return errorCode => fetch(url, { method: "POST", headers: { "content-type": "application/json",
    origin: ordinarySessions.publicBaseUrl, "x-runa-workspace": "1",
    cookie: "__Host-runa_user_session=ordinary-session" },
  body: JSON.stringify({ projectId: "project-01", experience: "chat", operation: "result.list",
    input: errorCode ? { errorCode } : {} }) });
}

test("workspace HTTP maps every frozen public result error and preserves the closed envelope", async t => {
  const post = await fixture(t);
  for (const [errorCode, expectedStatus] of Object.entries(STATUS)) {
    const response = await post(errorCode);
    assert.equal(response.status, expectedStatus, errorCode);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const value = await response.json();
    assert.deepEqual(Object.keys(value), ["schemaVersion", "errorCode", "correlationId", "privateValuesIncluded"]);
    assert.equal(value.schemaVersion, "runa2-gate6b-error/v1");
    assert.equal(value.errorCode, errorCode);
    assert.match(value.correlationId, /^[a-f0-9]{24}$/u);
    assert.equal(value.privateValuesIncluded, false);
    assert.equal(JSON.stringify(value).includes("private internal detail"), false);
  }
});

test("workspace HTTP retains no-store/nosniff result success transport", async t => {
  const response = await (await fixture(t))();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { schemaVersion: "runaai-m1-result-list/v1", results: [] });
});
