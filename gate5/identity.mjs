import { createHash } from "node:crypto";

export const GATE5_IDENTITY_VERSION = "runa2-gate5-identity/v1";
export const HOUSEHOLD_ROLES = Object.freeze([
  "primary-steward", "household-steward", "successor-designate", "adult-member", "minor-member", "guest",
]);
export const HOUSEHOLD_ACTIONS = Object.freeze([
  "chat-ephemeral", "read-local-workspace", "use-local-workspace-evidence", "propose-workspace-learning",
  "propose-workspace-action", "approve-workspace-action", "view-own-profile", "propose-own-preference",
  "teach-personal", "propose-household-lesson", "approve-household-lesson", "approve-global-lesson",
  "manage-dependent-profile", "review-household-safety-event", "restore-household-access",
  "inspect-governance", "run-continuity-drill", "manage-household-roles", "change-household-security",
  "activate-stewardship-succession",
]);

const ROLE_ACTIONS = Object.freeze({
  "primary-steward": Object.freeze(HOUSEHOLD_ACTIONS.filter(action => action !== "activate-stewardship-succession")),
  "household-steward": Object.freeze([
    "chat-ephemeral", "view-own-profile", "propose-own-preference", "teach-personal",
    "propose-household-lesson", "approve-household-lesson", "manage-dependent-profile",
    "review-household-safety-event", "restore-household-access",
  ]),
  "successor-designate": Object.freeze([
    "chat-ephemeral", "view-own-profile", "propose-own-preference", "teach-personal",
    "propose-household-lesson", "inspect-governance", "run-continuity-drill",
  ]),
  "adult-member": Object.freeze([
    "chat-ephemeral", "view-own-profile", "propose-own-preference", "teach-personal", "propose-household-lesson",
  ]),
  "minor-member": Object.freeze(["chat-ephemeral", "view-own-profile", "propose-own-preference"]),
  guest: Object.freeze(["chat-ephemeral"]),
});

const MINOR_ACTIONS = new Set(["chat-ephemeral", "view-own-profile", "propose-own-preference"]);
const STEP_UP_ACTIONS = new Set([
  "approve-household-lesson", "approve-global-lesson", "manage-dependent-profile",
  "review-household-safety-event", "restore-household-access", "manage-household-roles",
  "change-household-security", "activate-stewardship-succession",
]);
const HIGH_RISK_ACTIONS = new Set([
  "propose-workspace-action", "approve-workspace-action", ...STEP_UP_ACTIONS,
]);
const ALLOWED_STEP_UP_METHODS = new Set(["webauthn", "passkey", "fido2", "windows-hello"]);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const isoTime = value => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw coded("identity-time-invalid", "Identity evidence contains an invalid time.");
  return time;
};

export function summarizeHouseholdPolicy() {
  return Object.freeze({
    roles: Object.freeze(Object.fromEntries(Object.entries(ROLE_ACTIONS).map(([role, actions]) => [role, [...actions]]))),
    stepUpActions: Object.freeze([...STEP_UP_ACTIONS].sort()),
    minorAllowedActions: Object.freeze([...MINOR_ACTIONS].sort()),
    unimplemented: Object.freeze(["activate-stewardship-succession"]),
    authority: "runa-product-policy",
  });
}

export function unverifiedParticipant() {
  return Object.freeze({
    schemaVersion: GATE5_IDENTITY_VERSION,
    verified: false,
    principalId: null,
    principalRef: null,
    role: "unverified",
    ageClass: "unknown",
    subjectRef: null,
    authenticatedAt: null,
    expiresAt: null,
    methods: Object.freeze([]),
    tokenRolesTrusted: false,
  });
}

function validatePrincipal(principal) {
  if (!principal || !SAFE_ID.test(principal.principalId ?? "")) throw coded("principal-invalid", "A stable product principal is required.");
  if (!HOUSEHOLD_ROLES.includes(principal.role)) throw coded("principal-role-invalid", "The product principal role is invalid.");
  if (!["adult", "minor", "unknown"].includes(principal.ageClass)) throw coded("principal-age-invalid", "The age class is invalid.");
  if (principal.role === "minor-member" && principal.ageClass !== "minor") throw coded("principal-minor-mismatch", "A minor role requires minor age handling.");
  if (principal.status !== "active") throw coded("principal-inactive", "The product principal is not active.");
  return principal;
}

function validateVerifierDecision(decision, { issuer, audience, nowMs, expectedActorId }) {
  if (!decision?.decided) throw coded("identity-uncertain", "Identity verification was not decided.");
  if (decision.signatureValid !== true) throw coded("identity-signature-invalid", "Identity signature verification failed.");
  if (decision.issuer !== issuer) throw coded("identity-issuer-mismatch", "Identity issuer does not match.");
  if (!Array.isArray(decision.audience) || !decision.audience.includes(audience)) throw coded("identity-audience-mismatch", "Identity audience does not match.");
  if (typeof decision.subject !== "string" || !decision.subject) throw coded("identity-subject-missing", "Identity subject is missing.");
  if (decision.actorId !== expectedActorId) throw coded("identity-actor-mismatch", "Identity actor does not match the request actor.");
  if (isoTime(decision.expiresAt) <= nowMs) throw coded("identity-expired", "Identity evidence is expired.");
  if (isoTime(decision.authenticatedAt) > nowMs) throw coded("identity-time-invalid", "Authentication time is in the future.");
  return decision;
}

export class Gate5IdentityService {
  constructor({ verifier, introspector, principalStore, issuer, audience, now = () => new Date(), pseudonymKey = "gate5-synthetic-pseudonym-key" }) {
    this.verifier = verifier;
    this.introspector = introspector;
    this.principalStore = principalStore;
    this.issuer = issuer;
    this.audience = audience;
    this.now = now;
    this.pseudonymKey = pseudonymKey;
  }

  async authenticate({ bearerToken, actorId, requireOnline = false }) {
    if (typeof bearerToken !== "string" || !bearerToken) throw coded("identity-token-missing", "A bearer token is required.");
    if (!SAFE_ID.test(actorId ?? "")) throw coded("identity-actor-invalid", "A stable request actor is required.");
    const nowMs = this.now().getTime();
    let decision;
    try {
      decision = await this.verifier.verify(bearerToken);
    } catch {
      throw coded("identity-verifier-unavailable", "Identity verification is unavailable.");
    }
    validateVerifierDecision(decision, { issuer: this.issuer, audience: this.audience, nowMs, expectedActorId: actorId });
    if (requireOnline) {
      let online;
      try {
        online = await this.introspector.introspect(bearerToken);
      } catch {
        throw coded("identity-introspection-unavailable", "Revocable identity verification is unavailable.");
      }
      if (!online?.decided || online.active !== true || online.subject !== decision.subject) {
        throw coded("identity-revoked", "The revocable identity session is not active.");
      }
    }
    let principal;
    try {
      principal = validatePrincipal(await this.principalStore.bySubject(decision.subject));
    } catch (error) {
      if (error?.code) throw error;
      throw coded("principal-store-unavailable", "Product principal authority is unavailable.");
    }
    if (principal.principalId !== actorId) throw coded("principal-actor-mismatch", "Product principal does not match the request actor.");
    return Object.freeze({
      schemaVersion: GATE5_IDENTITY_VERSION,
      verified: true,
      principalId: principal.principalId,
      principalRef: sha256(`${this.pseudonymKey}\0principal\0${principal.principalId}`),
      role: principal.role,
      ageClass: principal.ageClass,
      subjectRef: sha256(`${this.pseudonymKey}\0subject\0${decision.subject}`),
      authenticatedAt: decision.authenticatedAt,
      expiresAt: decision.expiresAt,
      methods: Object.freeze(Array.isArray(decision.methods) ? decision.methods.filter(value => typeof value === "string") : []),
      tokenRolesTrusted: false,
    });
  }
}

function productPolicy(participant, action, { nowMs, stepUpMaxAgeMs }) {
  if (!HOUSEHOLD_ACTIONS.includes(action)) return { allowed: false, reason: "action-unknown", requiresStepUp: false };
  const requiresStepUp = STEP_UP_ACTIONS.has(action);
  if (action === "activate-stewardship-succession") return { allowed: false, reason: "succession-activation-not-implemented", requiresStepUp };
  if (!participant?.verified) return {
    allowed: action === "chat-ephemeral",
    reason: action === "chat-ephemeral" ? "unverified-ephemeral-chat-only" : "participant-authentication-required",
    requiresStepUp,
  };
  if (isoTime(participant.expiresAt) <= nowMs) return { allowed: false, reason: "participant-session-expired", requiresStepUp };
  if (participant.ageClass === "minor" && !MINOR_ACTIONS.has(action)) return { allowed: false, reason: "minor-protective-boundary", requiresStepUp };
  if (!ROLE_ACTIONS[participant.role]?.includes(action)) return { allowed: false, reason: "role-capability-not-granted", requiresStepUp };
  if (requiresStepUp) {
    const age = nowMs - isoTime(participant.authenticatedAt);
    if (age < 0 || age > stepUpMaxAgeMs) return { allowed: false, reason: "fresh-step-up-required", requiresStepUp };
    if (!participant.methods.some(method => ALLOWED_STEP_UP_METHODS.has(method))) return { allowed: false, reason: "step-up-method-required", requiresStepUp };
  }
  return { allowed: true, reason: "verified-product-role", requiresStepUp };
}

export class Gate5AuthorizationService {
  constructor({ checker, now = () => new Date(), stepUpMaxAgeMs = 5 * 60 * 1000 }) {
    this.checker = checker;
    this.now = now;
    this.stepUpMaxAgeMs = stepUpMaxAgeMs;
  }

  async authorize({ participant, action, resource }) {
    const policy = productPolicy(participant, action, { nowMs: this.now().getTime(), stepUpMaxAgeMs: this.stepUpMaxAgeMs });
    if (!policy.allowed || !participant?.verified) return Object.freeze({ ...policy, source: "runa-product-policy", relationChecked: false });
    let relation;
    try {
      relation = await this.checker.check({ actorId: participant.principalId, action, resource });
    } catch {
      return Object.freeze({ allowed: false, reason: "authorization-service-unavailable", requiresStepUp: policy.requiresStepUp, source: "openfga", relationChecked: true });
    }
    if (!relation?.decided) return Object.freeze({ allowed: false, reason: "authorization-uncertain", requiresStepUp: policy.requiresStepUp, source: "openfga", relationChecked: true });
    if (relation.actorId !== participant.principalId || relation.action !== action || relation.resource !== resource) {
      return Object.freeze({ allowed: false, reason: "authorization-decision-mismatch", requiresStepUp: policy.requiresStepUp, source: "openfga", relationChecked: true });
    }
    if (relation.allowed !== true) return Object.freeze({ allowed: false, reason: "authorization-denied", requiresStepUp: policy.requiresStepUp, source: "openfga", relationChecked: true });
    return Object.freeze({ allowed: true, reason: "product-policy-and-relationship-allowed", requiresStepUp: policy.requiresStepUp, source: "runa-plus-openfga", relationChecked: true });
  }

  requiresOnlineIdentity(action) { return HIGH_RISK_ACTIONS.has(action); }
}
