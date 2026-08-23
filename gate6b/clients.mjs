import { randomBytes } from "node:crypto";

const coded = (code, message) => Object.assign(new Error(message), { code });

async function boundedJson(response, maximumBytes = 128_000) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maximumBytes) throw coded("dependency-output-limited", "A dependency response exceeded its byte ceiling.");
  try { return text ? JSON.parse(text) : {}; } catch { throw coded("dependency-response-invalid", "A dependency returned invalid JSON."); }
}

export class KeycloakOnlineClient {
  constructor({ issuer, backchannelIssuer = issuer, clientId, clientCredential, timeoutMs = 5_000 }) {
    this.issuer = issuer.replace(/\/$/, "");
    this.backchannelIssuer = backchannelIssuer.replace(/\/$/, "");
    this.clientId = clientId;
    this.clientCredential = clientCredential;
    this.timeoutMs = timeoutMs;
  }

  async inspect(token) {
    let response;
    try {
      response = await fetch(`${this.backchannelIssuer}/protocol/openid-connect/token/introspect`, {
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

  authorizationUrl({ clientId = this.clientId, redirectUri, state, codeChallenge,
    prompt = "login", maxAge = 0, action = null }) {
    const url = new URL(`${this.issuer}/protocol/openid-connect/auth`);
    url.search = new URLSearchParams({ response_type: "code", client_id: clientId,
      redirect_uri: redirectUri, scope: "openid", state, code_challenge: codeChallenge,
      code_challenge_method: "S256", prompt, max_age: String(maxAge) }).toString();
    if (action) url.searchParams.set("kc_action", action);
    return url.toString();
  }

  async exchangeCode({ code, verifier, clientId = this.clientId, redirectUri }) {
    let response;
    try {
      response = await fetch(`${this.backchannelIssuer}/protocol/openid-connect/token`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code,
          redirect_uri: redirectUri, client_id: clientId, client_secret: this.clientCredential,
          code_verifier: verifier }), signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw coded("identity-code-exchange-unavailable", "Browser identity exchange is unavailable."); }
    if (!response.ok) throw coded("identity-code-exchange-rejected", "Browser identity exchange was rejected.");
    const value = await boundedJson(response);
    if (typeof value.access_token !== "string" || !value.access_token.length
        || typeof value.refresh_token !== "string" || !value.refresh_token.length) {
      throw coded("identity-code-exchange-invalid", "Browser identity exchange returned no access credential.");
    }
    return Object.freeze({ accessToken: value.access_token, refreshToken: value.refresh_token });
  }

  async revoke(token, tokenType = "refresh_token") {
    let response;
    try {
      response = await fetch(`${this.backchannelIssuer}/protocol/openid-connect/revoke`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, token_type_hint: tokenType,
          client_id: this.clientId, client_secret: this.clientCredential }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw coded("identity-revocation-unavailable", "Browser identity revocation is unavailable."); }
    if (!response.ok) throw coded("identity-revocation-unavailable", "Browser identity revocation is unavailable.");
    return Object.freeze({ revoked: true });
  }

  async countPasswordless(token) {
    let response;
    try {
      response = await fetch(`${this.backchannelIssuer}/account/credentials?type=webauthn-passwordless&user-credentials=true`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw coded("identity-credential-inventory-unavailable", "Passkey inventory is unavailable."); }
    if (!response.ok) throw coded("identity-credential-inventory-unavailable", "Passkey inventory is unavailable.");
    const value = await boundedJson(response);
    if (!Array.isArray(value) || value.some(container => !container || typeof container !== "object")) {
      throw coded("identity-credential-inventory-invalid", "Passkey inventory is invalid.");
    }
    const matching = value.filter(container => container.type === "webauthn-passwordless");
    if (matching.length > 1 || (matching[0] && !Array.isArray(matching[0].userCredentialMetadatas))) {
      throw coded("identity-credential-inventory-invalid", "Passkey inventory is invalid.");
    }
    return Object.freeze({ decided: true, count: matching[0]?.userCredentialMetadatas.length ?? 0 });
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

export class MultiClientAuthenticator {
  constructor(authenticators) {
    if (!Array.isArray(authenticators) || authenticators.length < 2) {
      throw coded("identity-client-set-invalid", "At least two bounded identity clients are required.");
    }
    this.authenticators = Object.freeze([...authenticators]);
  }
  async authenticate(token, options = {}) {
    const failures = [];
    for (const authenticator of this.authenticators) {
      try { return await authenticator.authenticate(token, options); }
      catch (error) { failures.push(error); }
    }
    const unavailable = failures.find(error => ["identity-verifier-unavailable",
      "identity-introspection-unavailable"].includes(error?.code));
    if (unavailable) throw unavailable;
    throw coded("identity-authentication-failed", "No accepted identity client authenticated this session.");
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
    const separator = String(resource).indexOf(":");
    if (!String(actorId).trim() || separator <= 0 || separator === String(resource).length - 1) {
      throw coded("authorization-input-invalid", "Relationship authorization input is invalid.");
    }
    const resourceType = String(resource).slice(0, separator);
    if (!/^[a-z][a-z0-9_]*$/.test(resourceType)) {
      throw coded("authorization-input-invalid", "Relationship authorization input is invalid.");
    }
    let user; let object;
    try {
      user = `user:${encodeURIComponent(String(actorId))}`;
      object = `${resourceType}:${encodeURIComponent(String(resource).slice(separator + 1))}`;
    } catch {
      throw coded("authorization-input-invalid", "Relationship authorization input is invalid.");
    }
    let response;
    try {
      response = await fetch(`${this.baseUrl}/stores/${this.storeId}/check`, {
        method: "POST", headers: { "content-type": "application/json",
          ...(this.credential ? { authorization: `Bearer ${this.credential}` } : {}) },
        body: JSON.stringify({ tuple_key: { user, relation, object },
          authorization_model_id: this.modelId }), signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw coded("authorization-service-unavailable", "Relationship authorization is unavailable."); }
    if (!response.ok) throw coded("authorization-service-unavailable", "Relationship authorization is unavailable.");
    const value = await boundedJson(response);
    return Object.freeze({ decisionId: randomBytes(12).toString("hex"), decided: typeof value.allowed === "boolean",
      allowed: value.allowed === true, actorId, action, resource, source: "openfga" });
  }
}
