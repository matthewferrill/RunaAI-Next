import assert from "node:assert/strict";
import test from "node:test";
import { MemoryOrdinarySessionStore, OrdinaryBrowserSessionService } from "./ordinary-session.mjs";

const NOW = new Date("2026-08-23T18:00:00.000Z");
const bindingDigest = "a".repeat(64);
const clients = { password: "runaai-next-user", passkey: "runaai-next" };

function oidc({ method, active = true, principalSubject = "member-subject", revoked = false } = {}) {
  const issuer = "https://runa.example.com/auth/realms/runaai-next";
  const clientId = method === "password" ? clients.password : clients.passkey;
  return {
    issuer,
    authorizationUrl(input) { return `https://id.example.test/${method}?state=${input.state}&client_id=${input.clientId}`; },
    async exchangeCode() { return { accessToken: `${method}-access`, refreshToken: `${method}-refresh` }; },
    async inspect() { return { active: revoked ? false : active, issuer, audience: [clientId],
      subject: principalSubject, authenticatedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
      methods: method === "password" ? ["pwd"] : ["webauthn"] }; },
    async revoke() { revoked = true; },
  };
}

function harness({ role = "adult-member", passwordOidc = oidc({ method: "password" }),
  passkeyOidc = oidc({ method: "passkey" }) } = {}) {
  const store = new MemoryOrdinarySessionStore();
  const service = new OrdinaryBrowserSessionService({ store, passwordOidc, passkeyOidc,
    principalStore: { async bySubject() { return { principalId: "personal-test", role,
      ageClass: "adult", status: "active" }; } }, bindingDigest,
    publicBaseUrl: "https://runa.example.com", passwordClientId: clients.password,
    passkeyClientId: clients.passkey, now: () => NOW, random: size => Buffer.alloc(size, 7) });
  return { service, store };
}

async function expiringHarness({ refreshed = {}, refreshFailure = null, sessionLifetimeMs } = {}) {
  let clock = new Date(NOW);
  let refreshes = 0;
  const issuer = "https://runa.example.com/auth/realms/runaai-next";
  const client = {
    issuer,
    authorizationUrl(input) { return `https://id.example.test/password?state=${input.state}&client_id=${input.clientId}`; },
    async exchangeCode() { return { accessToken: "access-1", refreshToken: "refresh-1",
      refreshExpiresInSeconds: 8 * 60 * 60 }; },
    async refresh() {
      refreshes += 1;
      if (refreshFailure && (typeof refreshFailure !== "function" || refreshFailure(refreshes))) {
        throw Object.assign(new Error("synthetic refresh failure"), { code: typeof refreshFailure === "string"
          ? refreshFailure : "identity-refresh-unavailable" });
      }
      return { accessToken: "access-2", refreshToken: "refresh-2", refreshExpiresInSeconds: 7 * 60 * 60 };
    },
    async inspect(token) {
      if (token === "access-1") return { active: clock.getTime() < NOW.getTime() + 60_000,
        issuer, audience: [clients.password], subject: "member-subject", authenticatedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), methods: ["pwd"] };
      return { active: true, issuer, audience: [clients.password], subject: "member-subject",
        authenticatedAt: NOW.toISOString(), expiresAt: new Date(clock.getTime() + 60 * 60_000).toISOString(),
        methods: ["pwd"], ...refreshed };
    },
    async revoke() {},
  };
  const store = new MemoryOrdinarySessionStore();
  const service = new OrdinaryBrowserSessionService({ store, passwordOidc: client,
    passkeyOidc: oidc({ method: "passkey" }), principalStore: { async bySubject() {
      return { principalId: "personal-test", role: "adult-member", ageClass: "adult", status: "active" };
    } }, bindingDigest, publicBaseUrl: "https://runa.example.com", passwordClientId: clients.password,
    passkeyClientId: clients.passkey, now: () => clock, random: size => Buffer.alloc(size, 11),
    ...(sessionLifetimeMs ? { sessionLifetimeMs } : {}) });
  await service.initialize();
  const started = await service.start("password");
  const result = await service.callback({ state: new URL(started.redirectUrl).searchParams.get("state"),
    code: "ordinary-code" });
  return { service, store, result, advance(ms) { clock = new Date(NOW.getTime() + ms); },
    refreshCount() { return refreshes; } };
}

test("a distinct ordinary member signs in with a username and password", async () => {
  const { service } = harness();
  await service.initialize();
  const started = await service.start("password");
  assert.equal(started.method, "password");
  assert.match(started.redirectUrl, /client_id=runaai-next-user/);
  const state = new URL(started.redirectUrl).searchParams.get("state");
  const result = await service.callback({ state, code: "ordinary-code" });
  assert.equal(result.principalId, "personal-test");
  assert.equal(result.method, "password");
  assert.equal(await service.credentialForSession(result.sessionId), "password-access");
});

test("a normal member may choose a passkey without making passkeys mandatory", async () => {
  const { service } = harness();
  await service.initialize();
  const started = await service.start("passkey");
  assert.match(started.redirectUrl, /client_id=runaai-next/);
  const result = await service.callback({ state: new URL(started.redirectUrl).searchParams.get("state"),
    code: "passkey-code" });
  assert.equal(result.method, "webauthn");
});

test("the protected owner identity cannot fall back to the ordinary password path", async () => {
  const { service } = harness({ role: "primary-steward" });
  await service.initialize();
  const started = await service.start("password");
  await assert.rejects(service.callback({ state: new URL(started.redirectUrl).searchParams.get("state"),
    code: "owner-password" }), { code: "gate7a-ordinary-role-denied" });
});

test("authentication method confusion and replay fail closed", async () => {
  const confused = oidc({ method: "password" });
  confused.inspect = async () => ({ active: true, issuer: confused.issuer, audience: [clients.password],
    subject: "member-subject", authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), methods: ["webauthn"] });
  const { service } = harness({ passwordOidc: confused });
  await service.initialize();
  const started = await service.start("password");
  const state = new URL(started.redirectUrl).searchParams.get("state");
  await assert.rejects(service.callback({ state, code: "wrong-method" }),
    { code: "gate7a-ordinary-authentication-invalid" });
  await assert.rejects(service.callback({ state, code: "replay-code" }),
    { code: "gate7a-ordinary-flow-invalid" });
});

test("logout revokes both the provider token and the retained browser session", async () => {
  const { service } = harness();
  await service.initialize();
  const started = await service.start("password");
  const result = await service.callback({ state: new URL(started.redirectUrl).searchParams.get("state"),
    code: "ordinary-code" });
  assert.equal((await service.revoke(result.sessionId)).revoked, true);
  await assert.rejects(service.credentialForSession(result.sessionId),
    { code: "gate7a-ordinary-session-invalid" });
});

test("an ordinary session refreshes one expired access token without extending its absolute lifetime", async () => {
  let clock = new Date(NOW);
  let refreshes = 0;
  const issuer = "https://runa.example.com/auth/realms/runaai-next";
  const client = {
    issuer,
    authorizationUrl(input) { return `https://id.example.test/password?state=${input.state}&client_id=${input.clientId}`; },
    async exchangeCode() { return { accessToken: "access-1", refreshToken: "refresh-1",
      refreshExpiresInSeconds: 8 * 60 * 60 }; },
    async refresh({ refreshToken }) {
      assert.equal(refreshToken, "refresh-1");
      refreshes += 1;
      return { accessToken: "access-2", refreshToken: "refresh-2", refreshExpiresInSeconds: 7 * 60 * 60 };
    },
    async inspect(token) {
      const second = token === "access-2";
      return { active: second || clock.getTime() < NOW.getTime() + 60_000, issuer,
        audience: [clients.password], subject: "member-subject", authenticatedAt: NOW.toISOString(),
        expiresAt: new Date(second ? clock.getTime() + 60 * 60_000 : NOW.getTime() + 60_000).toISOString(),
        methods: ["pwd"] };
    },
    async revoke() {},
  };
  const store = new MemoryOrdinarySessionStore();
  const service = new OrdinaryBrowserSessionService({ store, passwordOidc: client,
    passkeyOidc: oidc({ method: "passkey" }), principalStore: { async bySubject() {
      return { principalId: "personal-test", role: "adult-member", ageClass: "adult", status: "active" };
    } }, bindingDigest, publicBaseUrl: "https://runa.example.com", passwordClientId: clients.password,
    passkeyClientId: clients.passkey, now: () => clock, random: size => Buffer.alloc(size, 9) });
  await service.initialize();
  const started = await service.start("password");
  const result = await service.callback({ state: new URL(started.redirectUrl).searchParams.get("state"),
    code: "ordinary-code" });
  const retainedBefore = await store.sessionCredentials({ bindingDigest, sessionId: result.sessionId, now: clock });
  assert.equal(retainedBefore.expiresAt, new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString());
  clock = new Date(NOW.getTime() + 2 * 60_000);
  const credentials = await Promise.all([
    service.credentialForSession(result.sessionId), service.credentialForSession(result.sessionId),
  ]);
  assert.deepEqual(credentials, ["access-2", "access-2"]);
  assert.equal(refreshes, 1);
  const retainedAfter = await store.sessionCredentials({ bindingDigest, sessionId: result.sessionId, now: clock });
  assert.equal(retainedAfter.refreshToken, "refresh-2");
  assert.equal(retainedAfter.expiresAt, retainedBefore.expiresAt);
});

test("renewal fails closed when issuer, audience, subject, or authentication method changes", async t => {
  for (const [name, refreshed] of [
    ["issuer", { issuer: "https://wrong.example.test/realm" }],
    ["audience", { audience: ["wrong-client"] }],
    ["subject", { subject: "different-member" }],
    ["method", { methods: ["webauthn"] }],
  ]) await t.test(name, async () => {
    const context = await expiringHarness({ refreshed });
    context.advance(2 * 60_000);
    await assert.rejects(context.service.credentialForSession(context.result.sessionId),
      { code: "gate7a-ordinary-session-invalid" });
    await assert.rejects(context.store.sessionCredentials({ bindingDigest,
      sessionId: context.result.sessionId, now: new Date(NOW.getTime() + 2 * 60_000) }),
    { code: "gate7a-ordinary-session-invalid" });
  });
});

test("rejected renewal fails closed while a transient outage remains retryable", async () => {
  const rejected = await expiringHarness({ refreshFailure: "identity-refresh-rejected" });
  rejected.advance(2 * 60_000);
  await assert.rejects(rejected.service.credentialForSession(rejected.result.sessionId),
    { code: "gate7a-ordinary-session-invalid" });

  const transient = await expiringHarness({ refreshFailure: count => count === 1 });
  transient.advance(2 * 60_000);
  await assert.rejects(transient.service.credentialForSession(transient.result.sessionId),
    { code: "identity-refresh-unavailable" });
  assert.equal(await transient.service.credentialForSession(transient.result.sessionId), "access-2");
  assert.equal(transient.refreshCount(), 2);
});

test("the absolute ordinary-session ceiling blocks renewal", async () => {
  const context = await expiringHarness({ sessionLifetimeMs: 5 * 60_000 });
  context.advance(6 * 60_000);
  await assert.rejects(context.service.credentialForSession(context.result.sessionId),
    { code: "gate7a-ordinary-session-invalid" });
  assert.equal(context.refreshCount(), 0);
});
