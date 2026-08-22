import { createHash, randomBytes } from "node:crypto";
import { advanceOwnerCeremony } from "./ceremony.mjs";
import { assertBinding, bindingDigest, digestEvidence } from "./contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const enrollmentSteps = new Set(["enroll-primary-credential", "enroll-recovery-credential"]);
const resumePrefix = "resume-existing:";
const browserSteps = new Set([...enrollmentSteps, "verify-sign-in", "verify-fresh-step-up", "verify-recovery"]);
const userVerifiedMethods = new Set(["webauthn", "passkey", "fido2", "windows-hello"]);
const safeCode = value => typeof value === "string" && value.length >= 8 && value.length <= 8_192;
const b64url = value => Buffer.from(value).toString("base64url");
const sha256b64 = value => createHash("sha256").update(value).digest("base64url");

function selectedMethod(methods) {
  return (Array.isArray(methods) ? methods : []).find(method => userVerifiedMethods.has(method)) ?? null;
}

function freshAuthentication(value, now, maximumAgeMs) {
  const observed = Date.parse(value);
  return Number.isFinite(observed) && observed <= now.getTime() + 30_000
    && now.getTime() - observed >= 0 && now.getTime() - observed <= maximumAgeMs;
}

export class BrowserOwnerCeremonyService {
  constructor({ store, oidc, principalStore, binding, publicBaseUrl, clientId, expectedPrincipalId,
    capabilityRevoker = { async revokeAll() { return { revoked: 0, remaining: 0 }; } },
    now = () => new Date(), random = randomBytes, flowLifetimeMs = 15 * 60_000,
    sessionLifetimeMs = 15 * 60_000, stepUpMaximumAgeMs = 5 * 60_000 }) {
    this.store = store;
    this.oidc = oidc;
    this.principalStore = principalStore;
    this.binding = assertBinding(binding);
    this.publicBaseUrl = String(publicBaseUrl).replace(/\/$/, "");
    this.clientId = clientId;
    this.expectedPrincipalId = expectedPrincipalId;
    this.capabilityRevoker = capabilityRevoker;
    this.now = now;
    this.random = random;
    this.flowLifetimeMs = flowLifetimeMs;
    this.sessionLifetimeMs = sessionLifetimeMs;
    this.stepUpMaximumAgeMs = stepUpMaximumAgeMs;
    this.redirectUri = `${this.publicBaseUrl}/owner-ceremony/callback`;
  }

  async initialize() { await this.store.initialize({ binding: this.binding }); }

  async start(command, { resumeExisting = false } = {}) {
    if (!browserSteps.has(command)) throw coded("gate6c-browser-step-invalid", "This owner step is not browser-authenticated.");
    if (resumeExisting && !enrollmentSteps.has(command)) {
      throw coded("gate6c-browser-resume-invalid", "Only an interrupted credential enrollment can be resumed.");
    }
    const ceremony = await this.store.ceremonyState(this.binding);
    if (ceremony.nextStep !== command) throw coded("gate6c-owner-step-order-invalid", `Expected ${ceremony.nextStep}.`);
    const verifier = b64url(this.random(48));
    const state = b64url(this.random(32));
    const now = this.now();
    await this.store.createFlow({ binding: this.binding, state,
      command: resumeExisting ? `${resumePrefix}${command}` : command, verifier,
      expiresAt: new Date(now.getTime() + this.flowLifetimeMs).toISOString() });
    const url = this.oidc.authorizationUrl({ clientId: this.clientId, redirectUri: this.redirectUri,
      state, codeChallenge: sha256b64(verifier), prompt: "login", maxAge: 0,
      action: enrollmentSteps.has(command) && !resumeExisting ? "webauthn-register-passwordless" : null });
    return Object.freeze({ schemaVersion: "runa2-gate6c-browser-start/v1", redirectUrl: url,
      command, privateValuesIncluded: false });
  }

  async callback({ state, code, actionStatus = null }) {
    if (!safeCode(state) || !safeCode(code)) throw coded("gate6c-browser-callback-invalid", "The browser callback is invalid.");
    const now = this.now();
    const flow = await this.store.consumeFlow({ binding: this.binding, state, now });
    const resumedEnrollment = flow.command.startsWith(resumePrefix);
    const command = resumedEnrollment ? flow.command.slice(resumePrefix.length) : flow.command;
    if (resumedEnrollment && !enrollmentSteps.has(command)) {
      throw coded("gate6c-browser-resume-invalid", "The interrupted enrollment recovery is invalid.");
    }
    const credential = await this.oidc.exchangeCode({ code, verifier: flow.verifier,
      clientId: this.clientId, redirectUri: this.redirectUri });
    if (typeof credential?.accessToken !== "string" || !credential.accessToken
        || typeof credential?.refreshToken !== "string" || !credential.refreshToken) {
      throw coded("gate6c-browser-credential-invalid", "The browser identity exchange returned incomplete credentials.");
    }
    let decision;
    try { decision = await this.oidc.inspect(credential.accessToken); }
    catch (error) { await this.oidc.revoke(credential.refreshToken).catch(() => {}); throw error; }
    const enrollment = enrollmentSteps.has(command);
    const method = enrollment && !resumedEnrollment && actionStatus === "success"
      ? "webauthn" : selectedMethod(decision.methods);
    if (decision.active !== true || decision.issuer !== this.oidc.issuer
        || !Array.isArray(decision.audience) || !decision.audience.includes(this.clientId)
        || decision.subject === null || !method
        || (enrollment && !resumedEnrollment && actionStatus !== "success")
        || !freshAuthentication(decision.authenticatedAt, now, this.stepUpMaximumAgeMs)) {
      await this.oidc.revoke(credential.refreshToken).catch(() => {});
      throw coded("gate6c-browser-user-verification-required", "A fresh user-verified WebAuthn or passkey authentication is required.");
    }
    let principal;
    try { principal = await this.principalStore.bySubject(decision.subject); }
    catch (error) { await this.oidc.revoke(credential.refreshToken).catch(() => {}); throw error; }
    if (principal.principalId !== this.expectedPrincipalId || principal.status !== "active") {
      await this.oidc.revoke(credential.refreshToken).catch(() => {});
      throw coded("gate6c-browser-owner-binding-mismatch", "The authenticated subject is not the pre-bound target owner.");
    }
    const tokenExpiry = Date.parse(decision.expiresAt);
    if (!Number.isFinite(tokenExpiry) || tokenExpiry <= now.getTime()) {
      await this.oidc.revoke(credential.refreshToken).catch(() => {});
      throw coded("gate6c-browser-credential-expired", "The browser identity credential is expired.");
    }
    let credentialCount = null;
    if (enrollment) {
      const expectedCount = command === "enroll-primary-credential" ? 1 : 2;
      let inventory;
      try { inventory = await this.oidc.countPasswordless(credential.accessToken); }
      catch (error) { await this.oidc.revoke(credential.refreshToken).catch(() => {}); throw error; }
      if (inventory?.decided !== true || inventory.count !== expectedCount) {
        await this.oidc.revoke(credential.refreshToken).catch(() => {});
        throw coded("gate6c-browser-credential-count-invalid", "The exact distinct target passkey count was not proven.");
      }
      credentialCount = inventory.count;
    }
    const expiresAt = new Date(Math.min(tokenExpiry,
      now.getTime() + this.sessionLifetimeMs)).toISOString();
    const sessionId = b64url(this.random(32));
    await this.store.saveSession({ binding: this.binding, sessionId,
      principalId: principal.principalId, subject: decision.subject,
      accessToken: credential.accessToken, refreshToken: credential.refreshToken,
      authenticatedAt: decision.authenticatedAt,
      expiresAt, method });
    const evidence = { passed: true, method,
      evidenceDigest: digestEvidence({ command, principalRef: this.binding.participantRefHmac,
        authenticatedAt: decision.authenticatedAt, expiresAt, method,
        ...(credentialCount === null ? {} : { credentialCount }),
        ...(resumedEnrollment ? { interruptedEnrollmentResumed: true } : {}) }) };
    let ceremony;
    try {
      ceremony = await this.store.advanceCeremony({ binding: this.binding,
        operationId: `browser-${command}-${b64url(this.random(12))}`,
        command, evidence, observedAt: now.toISOString() });
    } catch (error) {
      await this.oidc.revoke(credential.refreshToken).catch(() => {});
      await this.store.revokeSession({ binding: this.binding, sessionId, now }).catch(() => {});
      throw error;
    }
    return Object.freeze({ schemaVersion: "runa2-gate6c-browser-callback/v1", sessionId,
      command, ceremonyRevision: ceremony.revision, nextStep: ceremony.nextStep,
      privateValuesIncluded: false });
  }

  async credentialForSession(sessionId) {
    if (!safeCode(sessionId)) throw coded("gate6c-browser-session-invalid", "The browser session is invalid.");
    return this.store.sessionCredential({ binding: this.binding, sessionId, now: this.now() });
  }

  async revokeAndVerify() {
    const ceremony = await this.store.ceremonyState(this.binding);
    if (ceremony.nextStep !== "verify-revocation") {
      throw coded("gate6c-owner-step-order-invalid", `Expected ${ceremony.nextStep}.`);
    }
    const active = await this.store.activeSessionCredentials({ binding: this.binding, now: this.now() });
    for (const session of active) await this.oidc.revoke(session.refreshToken);
    for (const session of active) {
      const decision = await this.oidc.inspect(session.accessToken);
      if (decision.active === true) throw coded("gate6c-owner-revocation-invalid", "An owner session remained active after revocation.");
    }
    const capabilities = await this.capabilityRevoker.revokeAll({ principalId: this.expectedPrincipalId });
    if (capabilities?.remaining !== 0) throw coded("gate6c-owner-revocation-invalid", "A pending owner capability remained after revocation.");
    await this.store.revokeSessions({ binding: this.binding, now: this.now() });
    const observedAt = this.now().toISOString();
    const evidence = { passed: true, sessionsRevoked: true, capabilitiesRevoked: true,
      evidenceDigest: digestEvidence({ command: "verify-revocation", sessionCount: active.length,
        capabilityCount: Number(capabilities?.revoked ?? 0), observedAt }) };
    return this.store.advanceCeremony({ binding: this.binding,
      operationId: `browser-verify-revocation-${b64url(this.random(12))}`,
      command: "verify-revocation", evidence, observedAt });
  }

  async status() {
    const ceremony = await this.store.ceremonyState(this.binding);
    return Object.freeze({ schemaVersion: "runa2-gate6c-browser-status/v1",
      bindingDigest: bindingDigest(this.binding), phase: ceremony.phase,
      nextStep: ceremony.nextStep, revision: ceremony.revision, complete: ceremony.complete,
      privateValuesIncluded: false });
  }
}

export class MemoryBrowserCeremonyStore {
  constructor() { this.ceremony = null; this.flows = new Map(); this.sessions = new Map(); }
  async initialize({ binding }) {
    const { createOwnerCeremonyState } = await import("./ceremony.mjs");
    this.ceremony ??= createOwnerCeremonyState(binding);
  }
  async ceremonyState() { return structuredClone(this.ceremony); }
  async advanceCeremony({ binding, ...input }) {
    this.ceremony = advanceOwnerCeremony(this.ceremony, input);
    return structuredClone(this.ceremony);
  }
  async createFlow(record) {
    if (this.flows.has(record.state)) throw coded("gate6c-browser-flow-conflict", "The browser flow already exists.");
    this.flows.set(record.state, { ...structuredClone(record), consumed: false });
  }
  async consumeFlow({ state, now }) {
    const value = this.flows.get(state);
    if (!value || value.consumed || Date.parse(value.expiresAt) <= now.getTime()) {
      throw coded("gate6c-browser-flow-invalid", "The browser flow is missing, expired, or already used.");
    }
    value.consumed = true;
    return structuredClone(value);
  }
  async saveSession(record) { this.sessions.set(record.sessionId, structuredClone(record)); }
  async sessionCredential({ sessionId, now }) {
    const value = this.sessions.get(sessionId);
    if (!value || value.revokedAt || Date.parse(value.expiresAt) <= now.getTime()) {
      throw coded("gate6c-browser-session-invalid", "The browser session is missing, expired, or revoked.");
    }
    return value.accessToken;
  }
  async activeSessionCredentials({ now }) {
    return [...this.sessions.values()].filter(value => !value.revokedAt && Date.parse(value.expiresAt) > now.getTime())
      .map(value => ({ sessionId: value.sessionId, accessToken: value.accessToken,
        refreshToken: value.refreshToken }));
  }
  async revokeSessions({ now }) {
    let count = 0;
    for (const value of this.sessions.values()) if (!value.revokedAt) { value.revokedAt = now.toISOString(); count += 1; }
    return count;
  }
  async revokeSession({ sessionId, now }) {
    const value = this.sessions.get(sessionId);
    if (!value || value.revokedAt) return false;
    value.revokedAt = now.toISOString();
    return true;
  }
}
