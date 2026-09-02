import test from "node:test";
import assert from "node:assert/strict";
import { SelectedCoreApplication } from "../../gate6b/application.mjs";
import { createCandidateHttpServer } from "../../gate6b/http-server.mjs";
import { resolve } from "node:path";

function application(overrides = {}) {
  const calls = [];
  const continuity = {
    settingValues: async participantId => ({ theme: "system", participantId }),
    setSetting: async (participantId, key, value) => ({ participantId, key, value, revision: 2,
      updatedAt: "2026-09-02T12:00:00.000Z" }),
    manageConversation: async (participantId, operation) => ({ participantId, ...operation }),
    ...overrides.continuity,
  };
  const app = new SelectedCoreApplication({ mode: "active", targetGeneration: "next",
    cutoverStatus: async () => ({ phase: "closed", authorityGeneration: "next" }),
    answerService: {}, actionService: {}, continuity,
    authenticator: { authenticate: async () => ({ verified: true, principalId: "person-1" }) },
    authorizer: { authorize: async value => { calls.push(value); return { allowed: true }; } },
    systemStatus: async input => ({ schemaVersion: "status/v1", ...input }),
  });
  return { app, calls };
}

test("authenticated conversation lifecycle is participant scoped", async () => {
  const { app, calls } = application();
  const result = await app.manageConversation({ credential: "opaque", body: {
    action: "rename", requestId: "request-1", experience: "chat", chatId: "chat-1", title: "New title",
  } });
  assert.deepEqual(result, { participantId: "person-1", action: "rename", requestId: "request-1",
    experience: "chat", chatId: "chat-1", title: "New title" });
  assert.equal(calls.at(-1).resource, "project:runa:personal");
});

test("editable settings persist while intelligence remains governed", async () => {
  const { app } = application();
  const read = await app.settings({ credential: "opaque", body: { action: "read" } });
  assert.equal(read.values.theme, "system");
  const changed = await app.settings({ credential: "opaque", body: {
    action: "set", requestId: "setting-1", key: "theme", value: "dark",
  } });
  assert.equal(changed.key, "theme");
  assert.equal(changed.value, "dark");
  await assert.rejects(app.settings({ credential: "opaque", body: {
    action: "set", requestId: "setting-2", key: "defaultIntelligenceLevel", value: "High",
  } }), error => error.code === "setting-approval-required");
});

test("system status authenticates and derives browser connectivity from the successful request", async () => {
  const { app } = application();
  const status = await app.systemStatus({ credential: "opaque", body: { clientConnected: false } });
  assert.deepEqual(status.client, { connected: true });
});

test("new product routes remain exact-origin, marked and ordinary-session scoped", async t => {
  const calls = [];
  const application = Object.fromEntries([["manageConversation", "conversation"], ["settings", "settings"],
    ["systemStatus", "system"]].map(([method, kind]) => [method, async input => {
      calls.push({ kind, input }); return { kind, privateValuesIncluded: false };
    }]));
  const ordinarySessions = { publicBaseUrl: "https://runa.example",
    credentialForSession: async value => value === "session-1" ? "opaque" : Promise.reject(new Error("bad session")) };
  const server = createCandidateHttpServer({ application, ordinarySessions,
    runtimeStatus: async () => ({}), readinessStatus: async () => ({}),
    dependencyHealth: async () => ({ ready: true }), staticRoot: resolve("gate6b/public") });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise(resolveClose => server.close(resolveClose)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", "x-runa-workspace": "1",
    origin: "https://runa.example", cookie: "__Host-runa_user_session=session-1" };
  for (const path of ["conversation/manage", "user-settings", "system/status"]) {
    const response = await fetch(`${base}/api/selected/${path}`, { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(calls.map(item => item.kind), ["conversation", "settings", "system"]);
  assert.ok(calls.every(item => item.input.credential === "opaque"));
  const unmarked = await fetch(`${base}/api/selected/user-settings`, { method: "POST",
    headers: { ...headers, "x-runa-workspace": "0" }, body: "{}" });
  assert.equal(unmarked.status, 400);
  const wrongOrigin = await fetch(`${base}/api/selected/system/status`, { method: "POST",
    headers: { ...headers, origin: "https://other.example" }, body: "{}" });
  assert.equal(wrongOrigin.status, 400);
});
