import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AcceptedApprovedKnowledgeAdapter, approvedKnowledgeReceipt,
  providerAdvisoryFromDelivery } from "../gate4c/answer-context.mjs";
import { acceptedFixture, approvedEvent, NOW } from "../gate4c/fixtures.mjs";
import { SelectedCoreApplication } from "./application.mjs";
import { assertSelectedAuthority, selectedAuthorityStatus } from "./authority.mjs";
import { createCandidateHttpServer } from "./http-server.mjs";
import { ARTIFACT_FILE, buildArtifactManifest, verifyReleaseArtifact } from "./artifact.mjs";
import { KeycloakOnlineClient, OpenFgaChecker } from "./clients.mjs";
import { loadReleaseConfig } from "./release-config.mjs";

const target = "runaai-next:test-target";
const activeCutover = () => ({ phase: "promoted", revision: 7, authorityGeneration: target });
const steward = (overrides = {}) => ({ verified: true, principalId: "matthew-owner",
  role: "primary-steward", ageClass: "adult", authenticatedAt: "2026-08-21T19:58:00.000Z",
  expiresAt: "2026-08-21T21:00:00.000Z", methods: ["webauthn"], ...overrides });

function harness(overrides = {}) {
  const calls = { auth: [], authorization: [], answers: [], proposals: [], approvals: [], declines: [] };
  const application = new SelectedCoreApplication({ mode: "active", targetGeneration: target,
    cutoverStatus: async () => activeCutover(),
    answerService: { async answer(request) { calls.answers.push(request); return { answer: "ok", requestId: request.requestId }; } },
    actionService: {
      async propose(request) { calls.proposals.push(request); return { proposalId: "proposal-1", proposalDigest: "a".repeat(64) }; },
      async approveAndExecute(request, options) { calls.approvals.push({ request, options }); return { receiptId: "receipt-1" }; },
      async decline(request) { calls.declines.push(request); return { proposalId: request.proposalId, status: "declined" }; },
    },
    authenticator: { async authenticate(credential, options) { calls.auth.push({ credential, options }); return steward(); } },
    authorizer: { async authorize(input) { calls.authorization.push(input); return { allowed: true, reason: "allowed" }; } },
    now: () => new Date("2026-08-21T20:00:00.000Z"), ...overrides });
  return { application, calls };
}

test("shadow and legacy authority cannot enable selected routes", () => {
  assert.equal(selectedAuthorityStatus({ mode: "shadow", cutover: activeCutover(), targetGeneration: target }).enabled, false);
  assert.equal(selectedAuthorityStatus({ mode: "active", cutover: { ...activeCutover(), authorityGeneration: "legacy" }, targetGeneration: target }).enabled, false);
  assert.throws(() => assertSelectedAuthority({ mode: "active", cutover: { ...activeCutover(), phase: "reconciled" }, targetGeneration: target }),
    error => error.code === "candidate-shadow-authority");
});

test("active verified general answer is identity and relationship scoped", async () => {
  const { application, calls } = harness();
  const response = await application.answer({ credential: "opaque-token", body: {
    requestId: "answer-1", lane: "general", threadId: "thread-1", projectId: "runa:personal",
    message: "Hello", history: [], workspace: null,
  } });
  assert.equal(response.answer, "ok");
  assert.equal(calls.auth[0].options.requireOnline, false);
  assert.equal(calls.authorization[0].action, "chat-ephemeral");
  assert.equal(calls.answers[0].participant.principalId, "matthew-owner");
});

test("unverified general chat is ephemeral and cannot claim a project", async () => {
  const { application, calls } = harness();
  await application.answer({ body: { requestId: "guest-1", lane: "general", threadId: "guest-thread",
    projectId: "another-project", message: "Hello", history: [], workspace: null } });
  assert.equal(calls.auth.length, 0);
  assert.equal(calls.answers[0].participant.verified, false);
  assert.equal(calls.answers[0].project.projectId, "runa:ephemeral");
});

test("unverified workspace is denied before an answer service read", async () => {
  const { application, calls } = harness();
  await assert.rejects(application.answer({ body: { requestId: "guest-workspace", lane: "workspace",
    threadId: "guest-thread", message: "Read", history: [], workspace: { sources: [{ sourceId: "a", sectionId: "b" }] } } }),
  error => error.code === "workspace-authentication-required");
  assert.equal(calls.answers.length, 0);
});

test("shadow mode denies before authentication or application work", async () => {
  const { application, calls } = harness({ mode: "shadow" });
  await assert.rejects(application.answer({ credential: "PRIVATE_TOKEN_CANARY", body: {
    requestId: "answer-shadow", lane: "general", threadId: "thread", message: "Hello", history: [] } }),
  error => error.code === "candidate-shadow-authority");
  assert.equal(calls.auth.length, 0);
  assert.equal(calls.answers.length, 0);
});

test("setting proposal builds the exact governed request after authorization", async () => {
  const { application, calls } = harness();
  const result = await application.proposeSetting({ credential: "token", body: {
    requestId: "setting-1", projectId: "runa:personal", value: "High" } });
  assert.equal(result.proposalId, "proposal-1");
  assert.equal(calls.authorization[0].action, "propose-own-preference");
  assert.equal(calls.proposals[0].action.value, "High");
  assert.equal(calls.proposals[0].origin.type, "steward-request");
});

test("setting execution requires online identity and fresh WebAuthn", async () => {
  const { application, calls } = harness();
  await application.approveSetting({ credential: "token", body: { projectId: "runa:personal",
    approvalId: "approval-1", proposalId: "proposal-1", proposalDigest: "a".repeat(64), approvalPhrase: "approve" } });
  assert.equal(calls.auth[0].options.requireOnline, true);
  assert.equal(calls.authorization[0].action, "approve-workspace-action");
  assert.equal(calls.approvals[0].options, undefined);
});

test("stale or non-WebAuthn setting execution is denied", async () => {
  const stale = harness({ authenticator: { async authenticate() { return steward({ authenticatedAt: "2026-08-21T19:00:00.000Z" }); } } });
  await assert.rejects(stale.application.approveSetting({ credential: "token", body: {
    approvalId: "approval-1", proposalId: "proposal-1", proposalDigest: "a".repeat(64), approvalPhrase: "approve" } }),
  error => error.code === "fresh-step-up-required");
  const wrongMethod = harness({ authenticator: { async authenticate() { return steward({ methods: ["password"] }); } } });
  await assert.rejects(wrongMethod.application.approveSetting({ credential: "token", body: {
    approvalId: "approval-1", proposalId: "proposal-1", proposalDigest: "a".repeat(64), approvalPhrase: "approve" } }),
  error => error.code === "fresh-step-up-required");
});

test("request coordinator is the application idempotency boundary", async () => {
  let stored = null;
  const coordinator = { async runOnce(input) { if (stored) return stored; stored = await input.execute(); return stored; } };
  const { application, calls } = harness({ requestCoordinator: coordinator });
  const body = { requestId: "idempotent-1", lane: "general", threadId: "thread", message: "Hello", history: [] };
  const first = await application.answer({ credential: "token", body });
  const second = await application.answer({ credential: "token", body });
  assert.deepEqual(second, first);
  assert.equal(calls.answers.length, 1);
});

test("accepted approved knowledge adapter can deliver a validated non-persistent projection", async () => {
  const fixture = acceptedFixture(approvedEvent("release-lesson", { lesson: "Use repository evidence before migration decisions." }));
  const adapter = new AcceptedApprovedKnowledgeAdapter({ loadSource: async () => fixture.source,
    cipher: fixture.cipher, expectedSourceClassification: "synthetic-fixture",
    now: () => new Date(NOW) });
  const delivery = await adapter.select({ requestScope: { participantId: "matthew-owner",
    projectId: "runaai-next", capabilities: ["chat"] }, task: "Use repository evidence for this migration." });
  assert.equal(approvedKnowledgeReceipt(delivery).delivered, true);
  assert.equal(providerAdvisoryFromDelivery(delivery).mayAuthorizeAction, false);
});

test("accepted approved knowledge source classification mismatch fails closed", async () => {
  const fixture = acceptedFixture(approvedEvent("release-lesson", { lesson: "Repository evidence." }));
  const adapter = new AcceptedApprovedKnowledgeAdapter({ loadSource: async () => fixture.source,
    cipher: fixture.cipher, expectedSourceClassification: "protected-or-unknown",
    now: () => new Date(NOW) });
  const delivery = await adapter.select({ requestScope: { participantId: "matthew-owner",
    projectId: null, capabilities: ["chat"] }, task: "Repository evidence" });
  const receipt = approvedKnowledgeReceipt(delivery);
  assert.equal(receipt.delivered, false);
  assert.equal(receipt.errorCode, "approved-knowledge-source-classification-mismatch");
});

test("HTTP candidate exposes aggregate status and keeps shadow routes closed", async t => {
  const { application } = harness({ mode: "shadow" });
  const runtime = { schemaVersion: "runa2-gate6-runtime-status/v1",
    running: { releaseId: "gate6b-test", commit: "a".repeat(40) }, authorityGeneration: "legacy",
    cutover: { phase: "candidate-ready", revision: 1 }, selectedScopeVersion: "runa2-selected-core/2026-08-21" };
  const server = createCandidateHttpServer({ application, runtimeStatus: async () => runtime,
    readinessStatus: async () => ({ ready: true }), dependencyHealth: async () => ({ ready: true }),
    staticRoot: resolve("gate6b/public") });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const port = server.address().port;
  const status = await fetch(`http://127.0.0.1:${port}/api/runtime/status`).then(response => response.json());
  assert.equal(status.running.releaseId, "gate6b-test");
  const denied = await fetch(`http://127.0.0.1:${port}/api/selected/answer`, { method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer PRIVATE_TOKEN_CANARY" },
    body: JSON.stringify({ requestId: "http-shadow", lane: "general", threadId: "thread", message: "Hi" }) });
  assert.equal(denied.status, 423);
  const deniedBody = await denied.text();
  assert.match(deniedBody, /candidate-shadow-authority/);
  assert.doesNotMatch(deniedBody, /PRIVATE_TOKEN_CANARY/);
});

test("HTTP candidate reports authority-store loss as service unavailable", async t => {
  const { application } = harness({ cutoverStatus: async () => {
    throw Object.assign(new Error("private database detail"), { code: "ECONNREFUSED" });
  } });
  const server = createCandidateHttpServer({ application, runtimeStatus: async () => ({}),
    readinessStatus: async () => ({}), dependencyHealth: async () => ({ ready: false }),
    staticRoot: resolve("gate6b/public") });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/selected/answer`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: "authority-loss", lane: "general", threadId: "thread", message: "Hi" }),
  });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /cutover-authority-unavailable/);
  assert.doesNotMatch(body, /private database detail|ECONNREFUSED/);
});

test("release artifact verification detects changed and extra files", async t => {
  const root = await mkdtemp(join(tmpdir(), "runa-gate6b-artifact-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "application.mjs"), "export const release = true;\n", "utf8");
  const manifest = await buildArtifactManifest(root);
  await writeFile(join(root, ARTIFACT_FILE), `${JSON.stringify(manifest)}\n`, "utf8");
  const status = await verifyReleaseArtifact(root, manifest.artifactDigest);
  assert.equal(status.verified, true);
  assert.equal(status.fileCount, 1);
  await writeFile(join(root, "application.mjs"), "export const release = false;\n", "utf8");
  await assert.rejects(verifyReleaseArtifact(root, manifest.artifactDigest),
    error => error.code === "artifact-files-mismatch");
  await writeFile(join(root, "application.mjs"), "export const release = true;\n", "utf8");
  await writeFile(join(root, "unexpected.txt"), "unexpected\n", "utf8");
  await assert.rejects(verifyReleaseArtifact(root, manifest.artifactDigest),
    error => error.code === "artifact-files-mismatch");
});

test("release configuration is strict, digest-bound, and retains references only", async t => {
  const root = await mkdtemp(join(tmpdir(), "runa-gate6b-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = { version: "test", configurationDigest: "a".repeat(64) };
  const config = {
    schemaVersion: "runa2-gate6b-release-config/v1", profile: "release", mode: "shadow",
    bind: { host: "127.0.0.1", port: 9760 }, publicBaseUrl: "https://192.168.50.20:9761",
    releaseManifestPath: "release.json", sourceGeneration: "legacy-runaai:production",
    targetGeneration: "runaai-next:test", cutoverId: "candidate",
    databaseUrlRef: "file:secrets/database-url", keyRefs: {
      coreEncryption: "file:secrets/core-encryption", coreHmac: "file:secrets/core-hmac",
      learningEncryption: "file:secrets/learning-encryption", learningHmac: "file:secrets/learning-hmac",
      telemetryHmac: "file:secrets/telemetry-hmac",
    },
    keycloak: { issuer: "http://127.0.0.1:9762/realms/runaai-next", clientId: "runaai-next",
      clientCredentialRef: "file:secrets/keycloak-client" },
    openfga: { baseUrl: "http://127.0.0.1:9763", storeId: "store", modelId: "model",
      credentialRef: "file:secrets/openfga-token" },
    provider: { baseUrl: "http://127.0.0.1:1234/v1", modelId: "selected-model" },
    services: { postgresql: service, keycloak: service, openfga: service, caddy: service },
    limits: { maxRequestBytes: 262144, totalDeadlineMs: 30000, upstreamDeadlineMs: 10000 },
  };
  const path = join(root, "candidate.json");
  await writeFile(path, JSON.stringify(config), "utf8");
  const loaded = await loadReleaseConfig(path);
  assert.match(loaded.configurationDigest, /^[a-f0-9]{64}$/);
  assert.equal(loaded.value.mode, "shadow");
  await writeFile(path, `\uFEFF${JSON.stringify(config)}`, "utf8");
  assert.equal((await loadReleaseConfig(path)).configurationDigest, loaded.configurationDigest);
  await writeFile(path, JSON.stringify({ ...config, literalPassword: "forbidden" }), "utf8");
  await assert.rejects(loadReleaseConfig(path), error => error.code === "release-config-invalid");
});

test("Keycloak and OpenFGA clients use bounded authenticated online decisions", async t => {
  const calls = [];
  const server = (await import("node:http")).createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    calls.push({ url: request.url, authorization: request.headers.authorization ?? null, body });
    response.setHeader("content-type", "application/json");
    if (request.url.endsWith("/token/introspect")) response.end(JSON.stringify({ active: true,
      iss: "http://issuer", aud: ["runaai-next"], sub: "owner-subject", auth_time: 1_787_339_880,
      exp: 1_787_343_600, amr: ["webauthn"] }));
    else response.end(JSON.stringify({ allowed: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const identity = await new KeycloakOnlineClient({ issuer: baseUrl, clientId: "runaai-next",
    clientCredential: "PRIVATE_CLIENT_CANARY" }).inspect("PRIVATE_BEARER_CANARY");
  assert.equal(identity.active, true);
  assert.equal(identity.subject, "owner-subject");
  const decision = await new OpenFgaChecker({ baseUrl, storeId: "store", modelId: "model",
    credential: "PRIVATE_FGA_CANARY" }).check({ actorId: "owner", action: "chat-ephemeral",
    resource: "project:runa:personal" });
  assert.equal(decision.allowed, true);
  assert.match(calls[0].body, /client_secret=PRIVATE_CLIENT_CANARY/);
  assert.equal(calls[1].authorization, "Bearer PRIVATE_FGA_CANARY");
  assert.doesNotMatch(JSON.stringify(identity), /PRIVATE_/);
  assert.doesNotMatch(JSON.stringify(decision), /PRIVATE_/);
});

test("Control Caddy listeners are pinned to their exact interfaces", async () => {
  const script = await readFile(resolve(import.meta.dirname, "control", "Initialize-ControlShadow.ps1"), "utf8");
  assert.match(script, /https:\/\/\$PrivateAddress`:9761 \{\r?\n  bind \$PrivateAddress/);
  assert.match(script, /http:\/\/127\.0\.0\.1:9770 \{\r?\n  bind 127\.0\.0\.1/);
});

test("Control application startup retains logs and permits the full integrity scan", async () => {
  const script = await readFile(resolve(import.meta.dirname, "control", "Register-ControlShadow.ps1"), "utf8");
  assert.match(script, /application\.stdout\.log/);
  assert.match(script, /application\.stderr\.log/);
  assert.match(script, /AddMinutes\(10\)/);
});

test("Control backup proof is candidate-only, encrypted, exact, and disposable", async () => {
  const script = await readFile(resolve(import.meta.dirname, "control", "Invoke-ControlBackupRestoreProof.ps1"), "utf8");
  assert.match(script, /DataProtectionScope\]::CurrentUser/);
  assert.match(script, /candidate-backup-logical-restore-mismatch/);
  assert.match(script, /restoreproof_runa/);
  assert.match(script, /dropdb\.exe/);
  assert.match(script, /plaintextWorkRemoved/);
  assert.doesNotMatch(script, /C:\\AI\\Projects\\RunaAI/);
});
