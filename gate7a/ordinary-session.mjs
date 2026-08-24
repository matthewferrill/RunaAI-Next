import { createHash, randomBytes } from "node:crypto";
import { publicProfileFromClaims } from "../gate6b/clients.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const b64url = value => Buffer.from(value).toString("base64url");
const sha256b64 = value => createHash("sha256").update(value).digest("base64url");
const passkeyMethods = new Set(["webauthn", "passkey", "fido2", "windows-hello"]);
const passwordRoles = new Set(["adult-member", "minor-member", "guest"]);
const methods = new Set(["password", "passkey"]);
const safeCode = value => typeof value === "string" && value.length >= 8 && value.length <= 8_192;

function fresh(value, now, maximumAgeMs) {
  const observed = Date.parse(value);
  return Number.isFinite(observed) && observed <= now.getTime() + 30_000
    && now.getTime() - observed >= 0 && now.getTime() - observed <= maximumAgeMs;
}

function selectedMethod(values, expected) {
  const retained = new Set(Array.isArray(values) ? values : []);
  if (expected === "password") return retained.has("pwd") || retained.has("password") ? "password" : null;
  return [...passkeyMethods].find(value => retained.has(value)) ?? null;
}

export class OrdinaryBrowserSessionService {
  constructor({ store, passwordOidc, passkeyOidc, principalStore, bindingDigest, publicBaseUrl,
    passwordClientId, passkeyClientId, now = () => new Date(), random = randomBytes,
    flowLifetimeMs = 10 * 60_000, sessionLifetimeMs = 8 * 60 * 60_000,
    authenticationMaximumAgeMs = 5 * 60_000 }) {
    if (!/^[a-f0-9]{64}$/.test(bindingDigest ?? "")) {
      throw coded("gate7a-ordinary-binding-invalid", "The ordinary-session release binding is invalid.");
    }
    this.store = store;
    this.passwordOidc = passwordOidc;
    this.passkeyOidc = passkeyOidc;
    this.principalStore = principalStore;
    this.bindingDigest = bindingDigest;
    this.publicBaseUrl = String(publicBaseUrl).replace(/\/$/, "");
    this.passwordClientId = passwordClientId;
    this.passkeyClientId = passkeyClientId;
    this.now = now;
    this.random = random;
    this.flowLifetimeMs = flowLifetimeMs;
    this.sessionLifetimeMs = sessionLifetimeMs;
    this.authenticationMaximumAgeMs = authenticationMaximumAgeMs;
    this.redirectUri = `${this.publicBaseUrl}/session/user/callback`;
  }

  async initialize() { await this.store.initialize({ bindingDigest: this.bindingDigest }); }

  async start(method = "password") {
    if (!methods.has(method)) throw coded("gate7a-ordinary-method-invalid", "The requested sign-in method is unavailable.");
    const verifier = b64url(this.random(48));
    const state = b64url(this.random(32));
    const now = this.now();
    await this.store.createFlow({ bindingDigest: this.bindingDigest, state, method, verifier,
      expiresAt: new Date(now.getTime() + this.flowLifetimeMs).toISOString() });
    const oidc = method === "password" ? this.passwordOidc : this.passkeyOidc;
    const clientId = method === "password" ? this.passwordClientId : this.passkeyClientId;
    const redirectUrl = oidc.authorizationUrl({ clientId, redirectUri: this.redirectUri,
      state, codeChallenge: sha256b64(verifier), prompt: "login", maxAge: 0 });
    return Object.freeze({ schemaVersion: "runa2-gate7a-ordinary-session-start/v1",
      method, redirectUrl, privateValuesIncluded: false });
  }

  async callback({ state, code }) {
    if (!safeCode(state) || !safeCode(code)) {
      throw coded("gate7a-ordinary-callback-invalid", "The ordinary sign-in callback is invalid.");
    }
    const now = this.now();
    const flow = await this.store.consumeFlow({ bindingDigest: this.bindingDigest, state, now });
    const oidc = flow.method === "password" ? this.passwordOidc : this.passkeyOidc;
    const clientId = flow.method === "password" ? this.passwordClientId : this.passkeyClientId;
    const credential = await oidc.exchangeCode({ code, verifier: flow.verifier,
      clientId, redirectUri: this.redirectUri });
    if (typeof credential?.accessToken !== "string" || !credential.accessToken
        || typeof credential?.refreshToken !== "string" || !credential.refreshToken) {
      throw coded("gate7a-ordinary-credential-invalid", "The ordinary identity exchange returned incomplete credentials.");
    }
    let decision;
    try { decision = await oidc.inspect(credential.accessToken); }
    catch (error) { await oidc.revoke(credential.refreshToken).catch(() => {}); throw error; }
    const method = selectedMethod(decision.methods, flow.method);
    if (decision.active !== true || decision.issuer !== oidc.issuer
        || !Array.isArray(decision.audience) || !decision.audience.includes(clientId)
        || typeof decision.subject !== "string" || !decision.subject || !method
        || !fresh(decision.authenticatedAt, now, this.authenticationMaximumAgeMs)) {
      await oidc.revoke(credential.refreshToken).catch(() => {});
      throw coded("gate7a-ordinary-authentication-invalid", "The ordinary sign-in did not meet its exact authentication contract.");
    }
    let principal;
    try { principal = await this.principalStore.bySubject(decision.subject); }
    catch (error) { await oidc.revoke(credential.refreshToken).catch(() => {}); throw error; }
    if (principal.status !== "active" || (flow.method === "password" && !passwordRoles.has(principal.role))) {
      await oidc.revoke(credential.refreshToken).catch(() => {});
      throw coded("gate7a-ordinary-role-denied", "This identity cannot use the ordinary password sign-in path.");
    }
    const tokenExpiry = Date.parse(decision.expiresAt);
    if (!Number.isFinite(tokenExpiry) || tokenExpiry <= now.getTime()) {
      await oidc.revoke(credential.refreshToken).catch(() => {});
      throw coded("gate7a-ordinary-credential-expired", "The ordinary identity credential is expired.");
    }
    const expiresAt = new Date(Math.min(tokenExpiry, now.getTime() + this.sessionLifetimeMs)).toISOString();
    const sessionId = b64url(this.random(32));
    await this.store.saveSession({ bindingDigest: this.bindingDigest, sessionId,
      principalId: principal.principalId, subject: decision.subject,
      accessToken: credential.accessToken, refreshToken: credential.refreshToken,
      authenticatedAt: decision.authenticatedAt, expiresAt, method, clientId });
    return Object.freeze({ schemaVersion: "runa2-gate7a-ordinary-session-callback/v1",
      sessionId, principalId: principal.principalId, method, privateValuesIncluded: false });
  }

  async credentialForSession(sessionId) {
    if (!safeCode(sessionId)) throw coded("gate7a-ordinary-session-invalid", "The ordinary browser session is invalid.");
    return this.store.sessionCredential({ bindingDigest: this.bindingDigest, sessionId, now: this.now() });
  }

  async profileForSession(sessionId) {
    if (!safeCode(sessionId)) throw coded("gate7a-ordinary-session-invalid", "The ordinary browser session is invalid.");
    const retained = await this.store.sessionCredentials({ bindingDigest: this.bindingDigest,
      sessionId, now: this.now() });
    const oidc = retained.clientId === this.passwordClientId ? this.passwordOidc : this.passkeyOidc;
    const decision = await oidc.inspect(retained.accessToken);
    if (decision.active !== true) throw coded("gate7a-ordinary-session-invalid", "The ordinary identity session is no longer active.");
    return decision.publicProfile ?? publicProfileFromClaims({}, retained.principalId);
  }

  async revoke(sessionId) {
    if (!safeCode(sessionId)) throw coded("gate7a-ordinary-session-invalid", "The ordinary browser session is invalid.");
    const retained = await this.store.sessionCredentials({ bindingDigest: this.bindingDigest,
      sessionId, now: this.now() });
    const oidc = retained.clientId === this.passwordClientId ? this.passwordOidc : this.passkeyOidc;
    await oidc.revoke(retained.refreshToken);
    const decision = await oidc.inspect(retained.accessToken);
    if (decision.active === true) throw coded("gate7a-ordinary-revocation-invalid", "The ordinary identity session remained active after revocation.");
    await this.store.revokeSession({ bindingDigest: this.bindingDigest, sessionId, now: this.now() });
    return Object.freeze({ schemaVersion: "runa2-gate7a-ordinary-session-revocation/v1",
      revoked: true, privateValuesIncluded: false });
  }
}

export class MemoryOrdinarySessionStore {
  constructor() { this.bindings = new Set(); this.flows = new Map(); this.sessions = new Map(); }
  async initialize({ bindingDigest }) { this.bindings.add(bindingDigest); }
  async createFlow(record) {
    if (!this.bindings.has(record.bindingDigest) || this.flows.has(record.state)) {
      throw coded("gate7a-ordinary-flow-conflict", "The ordinary browser flow already exists or is unbound.");
    }
    this.flows.set(record.state, { ...structuredClone(record), consumed: false });
  }
  async consumeFlow({ bindingDigest, state, now }) {
    const value = this.flows.get(state);
    if (!value || value.bindingDigest !== bindingDigest || value.consumed
        || Date.parse(value.expiresAt) <= now.getTime()) {
      throw coded("gate7a-ordinary-flow-invalid", "The ordinary browser flow is missing, expired, or already used.");
    }
    value.consumed = true;
    return structuredClone(value);
  }
  async saveSession(record) { this.sessions.set(record.sessionId, structuredClone(record)); }
  async sessionCredential({ bindingDigest, sessionId, now }) {
    const value = this.sessions.get(sessionId);
    if (!value || value.bindingDigest !== bindingDigest || value.revokedAt
        || Date.parse(value.expiresAt) <= now.getTime()) {
      throw coded("gate7a-ordinary-session-invalid", "The ordinary browser session is missing, expired, or revoked.");
    }
    return value.accessToken;
  }
  async sessionCredentials({ bindingDigest, sessionId, now }) {
    await this.sessionCredential({ bindingDigest, sessionId, now });
    return structuredClone(this.sessions.get(sessionId));
  }
  async revokeSession({ bindingDigest, sessionId, now }) {
    const value = this.sessions.get(sessionId);
    if (!value || value.bindingDigest !== bindingDigest || value.revokedAt) return false;
    value.revokedAt = now.toISOString();
    return true;
  }
}
