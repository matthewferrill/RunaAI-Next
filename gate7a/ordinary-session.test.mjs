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
