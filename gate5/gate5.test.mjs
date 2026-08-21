import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";

import {
  Gate5AuthorizationService, Gate5IdentityService, HOUSEHOLD_ACTIONS, HOUSEHOLD_ROLES,
  summarizeHouseholdPolicy, unverifiedParticipant,
} from "./identity.mjs";
import { MemoryCapabilityStore, OneTimeCapabilityService } from "./capability.mjs";
import {
  allowlistedSecurityAttributes, dependencyDecision, keyedReference, renderCaddyContract,
  secretReferenceStatus, validateReleaseBoundary,
} from "./operations.mjs";
import {
  MemoryRecoveryTarget, createAuthoritativeBackup, legacySecurityDisposition,
  openAuthoritativeBackup, ownerRecoveryPlan,
} from "./recovery.mjs";

const NOW = new Date("2026-08-21T16:00:00.000Z");
const now = () => new Date(NOW);
const expectedIssuer = "https://identity.runa.private/realms/runa";
const expectedAudience = "runa-selected-core";
const validDecision = overrides => ({
  decided: true,
  signatureValid: true,
  issuer: expectedIssuer,
  audience: [expectedAudience],
  subject: "keycloak-subject-1",
  actorId: "matthew",
  authenticatedAt: "2026-08-21T15:58:00.000Z",
  expiresAt: "2026-08-21T16:30:00.000Z",
  methods: ["webauthn"],
  tokenRoles: ["realm-admin", "primary-steward"],
  ...overrides,
});
const principal = overrides => ({ principalId: "matthew", role: "primary-steward", ageClass: "adult", status: "active", ...overrides });

function identityService({ decision = validDecision(), online = { decided: true, active: true, subject: "keycloak-subject-1" }, record = principal(), verifierError = null, introspectionError = null } = {}) {
  return new Gate5IdentityService({
    verifier: { verify: async () => { if (verifierError) throw verifierError; return structuredClone(decision); } },
    introspector: { introspect: async () => { if (introspectionError) throw introspectionError; return structuredClone(online); } },
    principalStore: { bySubject: async subject => subject === "keycloak-subject-1" ? structuredClone(record) : null },
    issuer: expectedIssuer,
    audience: expectedAudience,
    now,
  });
}

const allowChecker = { check: async ({ actorId, action, resource }) => ({ decided: true, allowed: true, actorId, action, resource }) };
const participant = overrides => ({
  verified: true,
  principalId: "matthew",
  role: "primary-steward",
  ageClass: "adult",
  authenticatedAt: "2026-08-21T15:58:00.000Z",
  expiresAt: "2026-08-21T16:30:00.000Z",
  methods: ["webauthn"],
  tokenRolesTrusted: false,
  ...overrides,
});

test("Gate 5 preserves the exact household policy vocabulary", () => {
  const policy = summarizeHouseholdPolicy();
  assert.deepEqual(Object.keys(policy.roles), HOUSEHOLD_ROLES);
  assert.equal(HOUSEHOLD_ACTIONS.length, 20);
  assert.deepEqual(policy.unimplemented, ["activate-stewardship-succession"]);
  assert.equal(policy.authority, "runa-product-policy");
});

test("unverified identity is limited to ephemeral chat", async () => {
  const service = new Gate5AuthorizationService({ checker: allowChecker, now });
  assert.equal((await service.authorize({ participant: unverifiedParticipant(), action: "chat-ephemeral", resource: "household:runa" })).allowed, true);
  const denied = await service.authorize({ participant: unverifiedParticipant(), action: "read-local-workspace", resource: "project:test" });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "participant-authentication-required");
  assert.equal(denied.relationChecked, false);
});

test("valid OIDC evidence binds to PostgreSQL-owned product principal", async () => {
  const result = await identityService().authenticate({ bearerToken: "synthetic-token-never-returned", actorId: "matthew" });
  assert.equal(result.verified, true);
  assert.equal(result.role, "primary-steward");
  assert.equal(result.tokenRolesTrusted, false);
  assert.match(result.principalRef, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token|realm-admin/);
});

test("OIDC rejection matrix fails closed", async t => {
  const cases = [
    ["signature", validDecision({ signatureValid: false }), "identity-signature-invalid"],
    ["issuer", validDecision({ issuer: "https://forged.invalid" }), "identity-issuer-mismatch"],
    ["audience", validDecision({ audience: ["other-client"] }), "identity-audience-mismatch"],
    ["actor", validDecision({ actorId: "someone-else" }), "identity-actor-mismatch"],
    ["expired", validDecision({ expiresAt: "2026-08-21T15:59:59.000Z" }), "identity-expired"],
    ["missing-subject", validDecision({ subject: "" }), "identity-subject-missing"],
  ];
  for (const [name, decision, code] of cases) await t.test(name, async () => {
    await assert.rejects(() => identityService({ decision }).authenticate({ bearerToken: "x", actorId: "matthew" }), error => error.code === code);
  });
});

test("identity verifier and principal authority loss deny", async () => {
  await assert.rejects(() => identityService({ verifierError: new Error("down") }).authenticate({ bearerToken: "x", actorId: "matthew" }), error => error.code === "identity-verifier-unavailable");
  await assert.rejects(() => identityService({ record: principal({ status: "disabled" }) }).authenticate({ bearerToken: "x", actorId: "matthew" }), error => error.code === "principal-inactive");
});

test("online introspection is required for immediately revocable operations", async () => {
  const service = identityService({ online: { decided: true, active: false, subject: "keycloak-subject-1" } });
  await assert.rejects(() => service.authenticate({ bearerToken: "revoked", actorId: "matthew", requireOnline: true }), error => error.code === "identity-revoked");
  await assert.doesNotReject(() => service.authenticate({ bearerToken: "offline-still-signed", actorId: "matthew", requireOnline: false }));
  await assert.rejects(() => identityService({ introspectionError: new Error("down") }).authenticate({ bearerToken: "x", actorId: "matthew", requireOnline: true }), error => error.code === "identity-introspection-unavailable");
});

test("every household role follows the preserved product matrix", async () => {
  const policy = summarizeHouseholdPolicy();
  const service = new Gate5AuthorizationService({ checker: allowChecker, now });
  for (const role of HOUSEHOLD_ROLES) {
    const ageClass = role === "minor-member" ? "minor" : "adult";
    for (const action of HOUSEHOLD_ACTIONS) {
      const result = await service.authorize({ participant: participant({ role, ageClass }), action, resource: "household:runa" });
      const expected = action !== "activate-stewardship-succession" && policy.roles[role].includes(action);
      assert.equal(result.allowed, expected, `${role} / ${action}`);
    }
  }
});

test("minor protection overrides an adult-capable role", async () => {
  const service = new Gate5AuthorizationService({ checker: allowChecker, now });
  const result = await service.authorize({ participant: participant({ role: "primary-steward", ageClass: "minor" }), action: "approve-global-lesson", resource: "household:runa" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "minor-protective-boundary");
});

test("fresh approved method is required for step-up actions", async () => {
  const service = new Gate5AuthorizationService({ checker: allowChecker, now });
  const stale = await service.authorize({ participant: participant({ authenticatedAt: "2026-08-21T15:40:00.000Z" }), action: "approve-global-lesson", resource: "household:runa" });
  assert.equal(stale.reason, "fresh-step-up-required");
  const weak = await service.authorize({ participant: participant({ methods: ["password"] }), action: "approve-global-lesson", resource: "household:runa" });
  assert.equal(weak.reason, "step-up-method-required");
  assert.equal((await service.authorize({ participant: participant(), action: "approve-global-lesson", resource: "household:runa" })).allowed, true);
});

test("OpenFGA cannot override product-policy denial", async () => {
  let checks = 0;
  const service = new Gate5AuthorizationService({ checker: { check: async request => { checks += 1; return { ...request, decided: true, allowed: true }; } }, now });
  const result = await service.authorize({ participant: participant({ role: "guest" }), action: "approve-workspace-action", resource: "project:test" });
  assert.equal(result.reason, "role-capability-not-granted");
  assert.equal(checks, 0);
});

test("OpenFGA mismatch, denial, uncertainty, and loss deny", async t => {
  const cases = [
    ["mismatch", async request => ({ ...request, actorId: "other", decided: true, allowed: true }), "authorization-decision-mismatch"],
    ["denial", async request => ({ ...request, decided: true, allowed: false }), "authorization-denied"],
    ["uncertain", async request => ({ ...request, decided: false, allowed: true }), "authorization-uncertain"],
    ["loss", async () => { throw new Error("down"); }, "authorization-service-unavailable"],
  ];
  for (const [name, check, reason] of cases) await t.test(name, async () => {
    const service = new Gate5AuthorizationService({ checker: { check }, now });
    const result = await service.authorize({ participant: participant(), action: "read-local-workspace", resource: "project:test" });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, reason);
  });
});

function capabilityFixture({ clock = now, authorize = async () => ({ allowed: true, reason: "test-allowed" }) } = {}) {
  let id = 0;
  return new OneTimeCapabilityService({ store: new MemoryCapabilityStore(), authorize, now: clock, ids: () => `synthetic-id-${++id}` });
}
const approvalDigest = "a".repeat(64);
const capRequest = overrides => ({
  requestId: "request-1", participant: participant(), action: "approve-workspace-action", resource: "project:test/settings",
  arguments: { settingKey: "defaultIntelligenceLevel", value: "High" }, approvalId: "approval-1", approvalDigest, ...overrides,
});

test("one-time capability binds exact approved intent", async () => {
  const service = capabilityFixture();
  const issued = await service.issue(capRequest());
  assert.equal(issued.status, "pending");
  let effects = 0;
  const receipt = await service.execute({ capabilityId: issued.capabilityId, participant: participant(), action: issued.action, resource: issued.resource, arguments: capRequest().arguments, effect: async () => ({ changed: ++effects }) });
  assert.equal(effects, 1);
  assert.equal(receipt.replayed, false);
  const replay = await service.execute({ capabilityId: issued.capabilityId, participant: participant(), action: issued.action, resource: issued.resource, arguments: capRequest().arguments, effect: async () => ({ changed: ++effects }) });
  assert.equal(replay.replayed, true);
  assert.equal(effects, 1);
});

test("capability request replay is exact and changed intent is refused", async () => {
  const service = capabilityFixture();
  const first = await service.issue(capRequest());
  assert.equal((await service.issue(capRequest())).capabilityId, first.capabilityId);
  await assert.rejects(() => service.issue(capRequest({ arguments: { settingKey: "defaultIntelligenceLevel", value: "Low" } })), error => error.code === "capability-request-changed");
});

test("capability actor, action, resource, arguments, revocation, and expiry fail closed", async t => {
  const mismatch = [
    ["actor", { participant: participant({ principalId: "other" }) }, "capability-actor-mismatch"],
    ["action", { action: "propose-workspace-action" }, "capability-action-mismatch"],
    ["resource", { resource: "project:other" }, "capability-resource-mismatch"],
    ["arguments", { arguments: { value: "Low" } }, "capability-argument-mismatch"],
  ];
  for (const [name, overrides, code] of mismatch) await t.test(name, async () => {
    const service = capabilityFixture();
    const issued = await service.issue(capRequest());
    await assert.rejects(() => service.execute({ capabilityId: issued.capabilityId, participant: participant(), action: issued.action, resource: issued.resource, arguments: capRequest().arguments, effect: async () => ({}), ...overrides }), error => error.code === code);
  });
  const revokedService = capabilityFixture();
  const revoked = await revokedService.issue(capRequest());
  assert.equal(revokedService.revoke(revoked.capabilityId), true);
  await assert.rejects(() => revokedService.execute({ capabilityId: revoked.capabilityId, participant: participant(), action: revoked.action, resource: revoked.resource, arguments: capRequest().arguments, effect: async () => ({}) }), error => error.code === "capability-revoked");
  const late = () => new Date("2026-08-21T16:10:00.000Z");
  const expiring = capabilityFixture({ clock: (() => { let calls = 0; return () => calls++ === 0 ? now() : late(); })() });
  const expired = await expiring.issue(capRequest());
  await assert.rejects(() => expiring.execute({ capabilityId: expired.capabilityId, participant: participant({ expiresAt: "2026-08-21T17:00:00.000Z" }), action: expired.action, resource: expired.resource, arguments: capRequest().arguments, effect: async () => ({}) }), error => error.code === "capability-expired");
});

test("concurrent capability use creates one effect", async () => {
  const service = capabilityFixture();
  const issued = await service.issue(capRequest());
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let effects = 0;
  const execute = () => service.execute({ capabilityId: issued.capabilityId, participant: participant(), action: issued.action, resource: issued.resource, arguments: capRequest().arguments, effect: async () => { effects += 1; await blocked; return { effects }; } });
  const first = execute();
  await assert.rejects(execute(), error => error.code === "capability-already-reserved");
  release();
  await first;
  assert.equal(effects, 1);
});

test("response-loss retry resumes through effect idempotency key", async () => {
  const service = capabilityFixture();
  const issued = await service.issue(capRequest());
  const deeds = new Map();
  let lose = true;
  const effect = async ({ idempotencyKey }) => {
    if (!deeds.has(idempotencyKey)) deeds.set(idempotencyKey, { changed: true });
    if (lose) { lose = false; throw Object.assign(new Error("response lost"), { code: "response-lost" }); }
    return deeds.get(idempotencyKey);
  };
  await assert.rejects(() => service.execute({ capabilityId: issued.capabilityId, participant: participant(), action: issued.action, resource: issued.resource, arguments: capRequest().arguments, effect }), /response lost/);
  const receipt = await service.execute({ capabilityId: issued.capabilityId, participant: participant(), action: issued.action, resource: issued.resource, arguments: capRequest().arguments, effect });
  assert.equal(receipt.replayed, false);
  assert.equal(deeds.size, 1);
});

const releaseConfig = overrides => ({
  profile: "release", bindHost: "192.168.1.20", port: 443, scheme: "https",
  tls: { mode: "internal", clientAuth: "require-and-verify" }, clientAuthenticationRequired: true,
  effectRetries: 0, deadlines: { totalMs: 5_000, upstreamMs: 2_000 }, maxRequestBytes: 262_144,
  provider: { expectedModel: "qwen3-coder", presentedModel: "qwen3-coder", baseUrl: "http://127.0.0.1:1234" },
  secretRefs: { oidcClient: "env:RUNA_OIDC_CLIENT_SECRET", backupKey: "secret-store:runa/backup-key" },
  ...overrides,
});

test("release preflight accepts private TLS and renders zero-retry Caddy contract", () => {
  assert.equal(validateReleaseBoundary(releaseConfig()).passed, true);
  const rendered = renderCaddyContract(releaseConfig());
  assert.match(rendered, /https:\/\/192\.168\.1\.20:443/);
  assert.match(rendered, /lb_retries 0/);
  assert.doesNotMatch(rendered, /RUNA_OIDC_CLIENT_SECRET|backup-key/);
});

test("release transport rejection matrix fails closed", () => {
  const cases = [
    [releaseConfig({ bindHost: "0.0.0.0" }), "bind-not-private"],
    [releaseConfig({ scheme: "http" }), "private-tls-required"],
    [releaseConfig({ effectRetries: 1 }), "effect-retries-must-be-zero"],
    [releaseConfig({ deadlines: { totalMs: 5_000, upstreamMs: 5_000 } }), "upstream-deadline-invalid"],
    [releaseConfig({ maxRequestBytes: 2_000_000 }), "request-limit-invalid"],
    [releaseConfig({ provider: { expectedModel: "a", presentedModel: "b", baseUrl: "http://127.0.0.1:1" } }), "provider-model-identity-mismatch"],
    [releaseConfig({ secretRefs: { oidcClient: "literal-secret-value" } }), "secret-reference-invalid:oidcClient"],
  ];
  for (const [config, reason] of cases) assert.ok(validateReleaseBoundary(config).problems.includes(reason), reason);
});

test("development transport is loopback only", () => {
  const config = releaseConfig({ profile: "development", bindHost: "127.0.0.1", scheme: "http", tls: { mode: "off" }, clientAuthenticationRequired: false });
  assert.equal(validateReleaseBoundary(config).passed, true);
  assert.ok(validateReleaseBoundary({ ...config, bindHost: "192.168.1.20" }).problems.includes("development-loopback-required"));
});

test("security telemetry is allowlisted and identifiers are keyed", () => {
  const ref = keyedReference("matthew", "synthetic-telemetry-key", "participant");
  assert.match(ref, /^[a-f0-9]{64}$/);
  assert.deepEqual(allowlistedSecurityAttributes({ component: "gate5", "verdict.code": "allowed", "participant.ref": ref }), { component: "gate5", "verdict.code": "allowed", "participant.ref": ref });
  assert.throws(() => allowlistedSecurityAttributes({ token: "secret" }), error => error.code === "telemetry-attribute-forbidden");
  assert.throws(() => allowlistedSecurityAttributes({ component: { nested: true } }), error => error.code === "telemetry-value-invalid");
});

test("secret status retains references only as keyed aggregate", () => {
  const status = secretReferenceStatus(releaseConfig().secretRefs, "synthetic-secret-status-key");
  assert.equal(status.configured, true);
  assert.equal(status.valuesRetained, false);
  assert.doesNotMatch(JSON.stringify(status), /RUNA_OIDC|backup-key/);
});

test("dependency loss denies authority and permits only scoped derived fallback", () => {
  for (const dependency of ["postgres", "keycloak", "openfga"]) assert.equal(dependencyDecision({ dependency, operation: "effect" }).allowed, false);
  assert.deepEqual(dependencyDecision({ dependency: "qdrant", operation: "approved-knowledge-read", scopedDirectSelectorAvailable: true }), { allowed: true, degraded: true, reason: "scoped-direct-selector-fallback" });
  assert.equal(dependencyDecision({ dependency: "qdrant", operation: "approved-knowledge-read", scopedDirectSelectorAvailable: false }).allowed, false);
});

const records = [
  { domain: "principals", schemaVersion: "v1", recordId: "p1", role: "primary-steward" },
  { domain: "settings", schemaVersion: "v1", recordId: "s1", value: "High" },
  { domain: "learning-events", schemaVersion: "v1", recordId: "e1", state: "active" },
];
const encryptionKey = Buffer.alloc(32, 7);
const digestKey = Buffer.alloc(32, 9);
const makeBackup = () => createAuthoritativeBackup({ records, sourceAuthority: "runa2/integration", sourceCommit: "2c38dd5", encryptionKey, digestKey, now, nonce: Buffer.alloc(12, 3) });

test("authenticated backup restores exact authoritative records", () => {
  const envelope = makeBackup();
  assert.equal(envelope.manifest.recordCount, 3);
  assert.deepEqual(envelope.manifest.derivedStores, ["qdrant"]);
  const opened = openAuthoritativeBackup({ envelope, encryptionKey, digestKey, expectedAuthority: "runa2/integration", expectedCommit: "2c38dd5" });
  const target = new MemoryRecoveryTarget();
  assert.deepEqual(target.restore({ runId: "restore-1", opened }), { restored: 3, replayed: false });
  assert.deepEqual(target.restore({ runId: "restore-1", opened }), { restored: 3, replayed: true });
  assert.deepEqual(target.rows, records);
  assert.deepEqual(records[0], { domain: "principals", schemaVersion: "v1", recordId: "p1", role: "primary-steward" });
});

test("tamper, authority mismatch, nonempty target, and restore failure leave no partial target", () => {
  const envelope = makeBackup();
  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` };
  assert.throws(() => openAuthoritativeBackup({ envelope: tampered, encryptionKey, digestKey, expectedAuthority: "runa2/integration", expectedCommit: "2c38dd5" }), error => error.code === "backup-authentication-failed");
  assert.throws(() => openAuthoritativeBackup({ envelope, encryptionKey, digestKey, expectedAuthority: "other", expectedCommit: "2c38dd5" }), error => error.code === "backup-authority-mismatch");
  const opened = openAuthoritativeBackup({ envelope, encryptionKey, digestKey, expectedAuthority: "runa2/integration", expectedCommit: "2c38dd5" });
  assert.throws(() => new MemoryRecoveryTarget([{ existing: true }]).restore({ runId: "restore-1", opened }), error => error.code === "restore-target-not-empty");
  const target = new MemoryRecoveryTarget();
  assert.throws(() => target.restore({ runId: "restore-1", opened, failAfter: 2 }), error => error.code === "restore-injected-failure");
  assert.equal(target.count(), 0);
});

test("recovery rollback removes only the restored target run", () => {
  const opened = openAuthoritativeBackup({ envelope: makeBackup(), encryptionKey, digestKey, expectedAuthority: "runa2/integration", expectedCommit: "2c38dd5" });
  const target = new MemoryRecoveryTarget();
  target.restore({ runId: "restore-1", opened });
  assert.equal(target.rollback("other"), false);
  assert.equal(target.count(), 3);
  assert.equal(target.rollback("restore-1"), true);
  assert.equal(target.count(), 0);
});

test("owner recovery re-enrols and never imports Windows-bound authority", () => {
  const plan = ownerRecoveryPlan({ principalRef: "principal-keyed-ref", oldCredentialRef: "credential-keyed-ref" });
  assert.equal(plan.productRecordsPreserved, true);
  assert.equal(plan.protectedDeletionAuthorized, false);
  for (const forbidden of ["session", "token", "private-key", "dpapi-ciphertext", "device-vault", "recovery-secret"]) assert.ok(plan.forbiddenImports.includes(forbidden));
  const disposition = legacySecurityDisposition();
  assert.match(disposition.e4, /re-enrolment/);
  assert.match(disposition.deviceVault, /do-not-copy-ciphertext/);
  assert.equal(disposition.e3, "defer-one-unresolved-record");
  assert.equal(disposition.e5, "retire-absent-store");
});

