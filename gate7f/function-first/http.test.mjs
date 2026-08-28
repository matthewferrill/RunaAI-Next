import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createCandidateHttpServer } from "../../gate6b/http-server.mjs";
import { M1FunctionSurface } from "./surface.mjs";
import { createConversationContext } from "./conversation-context.mjs";

async function fixture(t) {
  let revoked = false, captured = null; const calls = [];
  const application = { async authority() {},
    authenticator: { async authenticate(value) { assert.equal(value, "actual-server-token"); return { verified: true, principalId: "alice" }; } },
    authorizer: { async authorize() { return { allowed: true }; } },
    continuity: { async prepareAnswerContext(scope) {
      if (scope.projectId !== "alice-code" || scope.experience !== "code") throw Object.assign(new Error("foreign"), { code: "scope-denied" });
      return createConversationContext(scope);
    } } };
  const ordinarySessions = { publicBaseUrl: "https://runa.example.invalid",
    async credentialForSession(id) { calls.push(id); if (revoked || id !== "cookie-secret") throw Object.assign(new Error("no"), { code: "identity-session-invalid" });
      return "actual-server-token"; } };
  const surface = new M1FunctionSurface({ application, sources: {}, tasks: {
    async currentProject(context) { captured = context; return { projectId: context.projectId }; },
  } });
  const server = createCandidateHttpServer({ application, ordinarySessions, m1Functions: surface, staticRoot: import.meta.dirname,
    runtimeStatus: async () => ({}), readinessStatus: async () => ({}), dependencyHealth: async () => ({ ready: true }) });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", origin: ordinarySessions.publicBaseUrl,
    "x-runa-workspace": "1", cookie: "__Host-runa_user_session=cookie-secret" };
  const body = { projectId: "alice-code", experience: "code", operation: "project.current", input: {} };
  return { url, headers, body, calls, surface, captured: () => captured, revoke() { revoked = true; },
    async post({ overrideHeaders = {}, overrideBody = {} } = {}) {
      return fetch(`${url}/api/m1/workspace`, { method: "POST", headers: { ...headers, ...overrideHeaders }, body: JSON.stringify({ ...body, ...overrideBody }) });
    } };
}
test("real HTTP workspace binds the ordinary cookie and rechecks revocation before later effects", async t => {
  const f = await fixture(t); const response = await f.post(); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projectId: "alice-code" });
  assert.equal(f.captured().sessionId, `browser-${createHash("sha256").update("cookie-secret").digest("hex")}`);
  assert.equal(await f.surface.sessions.authorize(f.captured()), true);
  f.revoke(); assert.equal(await f.surface.sessions.authorize(f.captured()), false);
  assert.equal(f.calls.length, 3);
});
for (const [name, headers] of [
  ["foreign origin", { origin: "https://other.invalid" }], ["missing marker", { "x-runa-workspace": "" }],
  ["missing cookie", { cookie: "", authorization: "Bearer forged-token" }],
  ["owner cookie", { cookie: "__Host-runa_owner_session=owner; __Host-runa_user_session=cookie-secret" }],
]) test(`real HTTP rejects ${name} before any M1 operation`, async t => {
  const f = await fixture(t); const response = await f.post({ overrideHeaders: headers }); assert.notEqual(response.status, 200);
  const body = await response.json(); assert.equal(body.privateValuesIncluded, false); assert.equal(f.captured(), null); assert.equal(f.calls.length, 0);
});
test("real HTTP cannot use body identity or another project", async t => {
  const f = await fixture(t);
  assert.notEqual((await f.post({ overrideBody: { principalId: "bob" } })).status, 200);
  assert.equal((await f.post({ overrideBody: { projectId: "bob-code" } })).status, 403);
  assert.equal(f.captured(), null);
});
