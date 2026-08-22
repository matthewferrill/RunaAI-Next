import { randomBytes } from "node:crypto";

const coded = (code, message) => Object.assign(new Error(message), { code });

async function boundedJson(response, maximumBytes = 128_000) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maximumBytes) throw coded("dependency-output-limited", "A dependency response exceeded its byte ceiling.");
  try { return text ? JSON.parse(text) : {}; } catch { throw coded("dependency-response-invalid", "A dependency returned invalid JSON."); }
}

export class KeycloakOnlineClient {
  constructor({ issuer, clientId, clientCredential, timeoutMs = 5_000 }) {
    this.issuer = issuer.replace(/\/$/, "");
    this.clientId = clientId;
    this.clientCredential = clientCredential;
    this.timeoutMs = timeoutMs;
  }

  async inspect(token) {
    let response;
    try {
      response = await fetch(`${this.issuer}/protocol/openid-connect/token/introspect`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, client_id: this.clientId, client_secret: this.clientCredential }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw coded("identity-introspection-unavailable", "Revocable identity verification is unavailable."); }
    if (!response.ok) throw coded("identity-introspection-unavailable", "Revocable identity verification is unavailable.");
    const value = await boundedJson(response);
    const audience = Array.isArray(value.aud) ? value.aud : value.aud ? [value.aud] : [];
    const authenticated = Number(value.auth_time ?? value.iat);
    const expires = Number(value.exp);
    return Object.freeze({ decided: true, active: value.active === true, issuer: value.iss ?? null,
      audience, subject: value.sub ?? null,
      authenticatedAt: Number.isFinite(authenticated) ? new Date(authenticated * 1000).toISOString() : "invalid",
      expiresAt: Number.isFinite(expires) ? new Date(expires * 1000).toISOString() : "invalid",
      methods: Object.freeze(Array.isArray(value.amr) ? value.amr.filter(item => typeof item === "string") : []),
    });
  }
}

export class KeycloakVerifier {
  constructor({ client, principalStore }) { this.client = client; this.principalStore = principalStore; }
  async verify(token) {
    const decision = await this.client.inspect(token);
    if (!decision.active || !decision.subject) return { ...decision, signatureValid: false, actorId: null };
    const principal = await this.principalStore.bySubject(decision.subject);
    return { ...decision, signatureValid: true, actorId: principal.principalId };
  }
}

export class KeycloakIntrospector {
  constructor(client) { this.client = client; }
  async introspect(token) {
    const decision = await this.client.inspect(token);
    return { decided: decision.decided, active: decision.active, subject: decision.subject };
  }
}

export class DerivedActorAuthenticator {
  constructor({ identityService, verifier, principalStore }) {
    this.identityService = identityService;
    this.verifier = verifier;
    this.principalStore = principalStore;
  }
  async authenticate(token, { requireOnline = false } = {}) {
    const decision = await this.verifier.verify(token);
    if (!decision?.subject) throw coded("identity-subject-missing", "Identity subject is missing.");
    const principal = await this.principalStore.bySubject(decision.subject);
    return this.identityService.authenticate({ bearerToken: token, actorId: principal.principalId, requireOnline });
  }
}

export class OpenFgaChecker {
  constructor({ baseUrl, storeId, modelId, credential, timeoutMs = 5_000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.storeId = storeId;
    this.modelId = modelId;
    this.credential = credential;
    this.timeoutMs = timeoutMs;
  }
  async check({ actorId, action, resource }) {
    const relation = action.replaceAll("-", "_");
    let response;
    try {
      response = await fetch(`${this.baseUrl}/stores/${this.storeId}/check`, {
        method: "POST", headers: { "content-type": "application/json",
          ...(this.credential ? { authorization: `Bearer ${this.credential}` } : {}) },
        body: JSON.stringify({ tuple_key: { user: `user:${actorId}`, relation, object: resource },
          authorization_model_id: this.modelId }), signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw coded("authorization-service-unavailable", "Relationship authorization is unavailable."); }
    if (!response.ok) throw coded("authorization-service-unavailable", "Relationship authorization is unavailable.");
    const value = await boundedJson(response);
    return Object.freeze({ decisionId: randomBytes(12).toString("hex"), decided: typeof value.allowed === "boolean",
      allowed: value.allowed === true, actorId, action, resource, source: "openfga" });
  }
}
