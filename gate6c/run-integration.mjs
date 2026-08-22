import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { makeSnapshot as makeProjectChat, testCipher as coreTestCipher } from "../gate4/fixtures.mjs";
import { makeSnapshot as makeLearning, testCipher as learningTestCipher } from "../gate4b/fixtures.mjs";
import { bindingDigest, digestEvidence } from "./contracts.mjs";
import { advanceOwnerCeremony, createOwnerCeremonyState } from "./ceremony.mjs";
import { issueFreezeLease } from "./freeze.mjs";
import { GATE6C_BACKUP_VERSION, GATE6C_BINDING_VERSION, GATE6C_INVENTORY_VERSION,
  GATE6C_OWNER_STEPS } from "./formats.mjs";
import { buildGate6cFinalDeltaPlan, Gate6cFinalDeltaService } from "./migration.mjs";
import { PostgresGate6cStore } from "./adapters/postgres.mjs";
import { PostgresBrowserCeremonyStore } from "./adapters/postgres-browser.mjs";
import { BrowserOwnerCeremonyService } from "./browser-ceremony.mjs";
import { verifyRetainedFinalDelta } from "./control-maintenance.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate6c-protected-staging");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
for (const tool of ["initdb.exe", "pg_ctl.exe"]) if (!existsSync(path.join(pgBin, tool))) throw new Error(`missing retained RunaLab tool: ${tool}`);
const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
const connectionString = "postgresql://postgres@127.0.0.1:9756/postgres";
const sourceGeneration = "b4db04090d8f0df87234fab573b396e7824c5354";
const targetCommit = "77f3017d10f4e4670ad551b3d000cc2569c1dfdb";
const nowValue = new Date("2026-08-21T22:00:00.000Z");
const coreCanary = "PRIVATE_CHAT_CANARY_4A";
const learningCanary = "PRIVATE_LEARNING_CANARY_4B";
const browserTokenCanary = "PRIVATE_BROWSER_SESSION_CANARY_6C";
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(path.dirname(evidencePath), { recursive: true });

function initializePostgres() {
  const result = spawnSync(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres",
    "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`initdb failed: ${result.stderr || result.stdout}`);
}
function startPostgres() {
  const result = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog,
    "-o", "-p 9756 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (result.status !== 0) throw new Error(`PostgreSQL start failed with status ${result.status}`);
}
function stopPostgres() {
  return spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"],
    { cwd: root, stdio: "ignore", windowsHide: true }).status === 0;
}

const binding = { schemaVersion: GATE6C_BINDING_VERSION, cutoverId: "gate6c-integration",
  releaseId: "runaai-next-selected-core-2026-08-21-77f3017", releaseCommit: targetCommit,
  artifactDigest: "a7fcc146b40c4522f10b1f11c81aafc320800482bd70efc81f6d02ce880599e2",
  sourceGeneration, targetGeneration: "runaai-next-control-candidate-v1",
  participantRefHmac: "a".repeat(64) };
function ownerCeremony() {
  let state = createOwnerCeremonyState(binding);
  for (const [index, command] of GATE6C_OWNER_STEPS.entries()) {
    const method = ["enroll-primary-credential", "verify-sign-in", "verify-fresh-step-up",
      "enroll-recovery-credential", "verify-recovery"].includes(command) ? { method: "webauthn" } : {};
    const revoked = command === "verify-revocation" ? { sessionsRevoked: true, capabilitiesRevoked: true } : {};
    state = advanceOwnerCeremony(state, { operationId: `integration-owner-${index + 1}`, command,
      evidence: { passed: true, evidenceDigest: digestEvidence({ command, synthetic: true }), ...method, ...revoked },
      observedAt: new Date(nowValue.getTime() - (10 - index) * 1_000).toISOString() });
  }
  return state;
}

const coreCipher = coreTestCipher();
const learningCipher = learningTestCipher();
const reconciliationKey = Buffer.alloc(32, 91);
const projectChatSnapshot = makeProjectChat();
const learningSnapshot = makeLearning();
learningSnapshot.participantId = projectChatSnapshot.participantId;
const baseInput = { runId: "gate6c-integration-run", binding, projectChatSnapshot, learningSnapshot,
  legacySetting: { schemaVersion: "runa-settings-store/v1", values: { defaultIntelligenceLevel: "High" } },
  selectedReceipts: [{ schemaVersion: "runa2-gate6c-selected-receipt-source/v1",
    sourceReceiptDigest: "c".repeat(64), occurredAt: "2026-08-21T21:00:00.000Z",
    beforeValue: "Medium", afterValue: "High", status: "executed" }] };
const prepared = buildGate6cFinalDeltaPlan(baseInput, { coreCipher, learningCipher, reconciliationKey });
const input = { ...baseInput, ownerCeremony: ownerCeremony(),
  backupProof: { schemaVersion: GATE6C_BACKUP_VERSION, bindingDigest: bindingDigest(binding),
    scheduleActive: true, encryptedBackupCount: 3, plaintextBackupCount: 0,
    manifestDigest: "b".repeat(64), distinctRestoreVerified: true,
    verifiedAt: new Date(nowValue.getTime() - 60_000).toISOString(), privateValuesIncluded: false },
  freezeLease: issueFreezeLease({ binding, leaseId: "integration-freeze", now: nowValue }),
  inventory: { schemaVersion: GATE6C_INVENTORY_VERSION, bindingDigest: bindingDigest(binding),
    sourceCommit: sourceGeneration, sourceBranch: "main", trackedClean: true, sourcePinsVerified: true,
    twoPassDeterministic: true, settingValueAllowed: true, selectedReceiptClassified: true,
    domains: prepared.domains, deferredStoresOpened: false, sourceModified: false,
    privateValuesIncluded: false } };

let postgresRunning = false;
let store = null;
let report = null;
let failure = null;
let browserSessionId = null;
let browserService = null;
let browserCredentialAfterRestart = null;
let randomCounter = 31;
const browserActive = new Set();
const browserRefresh = "PRIVATE_BROWSER_REFRESH_CANARY_6C";
const browserOidc = {
  issuer: "http://127.0.0.1:9757/realms/synthetic",
  authorizationUrl(input) { return `http://127.0.0.1:9757/auth?state=${encodeURIComponent(input.state)}&code_challenge=${encodeURIComponent(input.codeChallenge)}`; },
  async exchangeCode() { browserActive.add(browserTokenCanary); return { accessToken: browserTokenCanary,
    refreshToken: browserRefresh }; },
  async inspect(token) { return { active: browserActive.has(token), issuer: this.issuer,
    audience: ["runaai-next"], subject: "synthetic-owner-subject", authenticatedAt: nowValue.toISOString(),
    expiresAt: new Date(nowValue.getTime() + 10 * 60_000).toISOString(), methods: ["webauthn"] }; },
  async revoke(token) { if (token === browserRefresh) browserActive.delete(browserTokenCanary); return { revoked: true }; },
};
const principalStore = { async bySubject() { return { principalId: "matthew-owner", status: "active" }; } };
try {
  initializePostgres(); startPostgres(); postgresRunning = true;
  store = new PostgresGate6cStore({ connectionString, coreCipher, learningCipher });
  await store.initialize();
  const browserStore = new PostgresBrowserCeremonyStore({ pool: store.pool, cipher: coreCipher });
  browserService = new BrowserOwnerCeremonyService({ store: browserStore, oidc: browserOidc,
    principalStore, binding, publicBaseUrl: "https://127.0.0.1:9758", clientId: "runaai-next",
    expectedPrincipalId: "matthew-owner", now: () => nowValue,
    random: size => Buffer.alloc(size, ++randomCounter) });
  await browserService.initialize();
  await browserStore.advanceCeremony({ binding, operationId: "integration-recovery-authority",
    command: "verify-recovery-authority", evidence: { passed: true,
      evidenceDigest: digestEvidence({ command: "verify-recovery-authority", synthetic: true }) },
    observedAt: nowValue.toISOString() });
  await browserStore.advanceCeremony({ binding, operationId: "integration-primary-enrollment",
    command: "enroll-primary-credential", evidence: { passed: true, method: "webauthn",
      evidenceDigest: digestEvidence({ command: "enroll-primary-credential", synthetic: true }) },
    observedAt: nowValue.toISOString() });
  const browserStart = await browserService.start("verify-sign-in");
  const browserCallback = await browserService.callback({ state: new URL(browserStart.redirectUrl).searchParams.get("state"),
    code: "synthetic-browser-code" });
  browserSessionId = browserCallback.sessionId;
  const service = new Gate6cFinalDeltaService({ store, coreCipher, learningCipher, reconciliationKey,
    now: () => nowValue });
  const first = await service.stage(input);
  const retainedVerification = await verifyRetainedFinalDelta({ plan: prepared, learningSnapshot,
    store, coreCipher, learningCipher, reconciliationKey, now: nowValue });
  const beforeRestart = await store.audit(projectChatSnapshot.participantId);
  await store.close(); store = null;
  const stoppedForRestart = stopPostgres(); postgresRunning = false;
  startPostgres(); postgresRunning = true;
  store = new PostgresGate6cStore({ connectionString, coreCipher, learningCipher });
  await store.initialize();
  browserService = new BrowserOwnerCeremonyService({
    store: new PostgresBrowserCeremonyStore({ pool: store.pool, cipher: coreCipher }), oidc: browserOidc,
    principalStore, binding, publicBaseUrl: "https://127.0.0.1:9758", clientId: "runaai-next",
    expectedPrincipalId: "matthew-owner", now: () => nowValue,
    random: size => Buffer.alloc(size, ++randomCounter) });
  await browserService.initialize();
  browserCredentialAfterRestart = await browserService.credentialForSession(browserSessionId);
  const resumed = new Gate6cFinalDeltaService({ store, coreCipher, learningCipher, reconciliationKey,
    now: () => nowValue });
  const replay = await resumed.stage(input);
  const afterRestart = await store.audit(projectChatSnapshot.participantId);
  const pool = new pg.Pool({ connectionString });
  const privateLeak = (await pool.query(`SELECT EXISTS(
    SELECT 1 FROM runa_core.projects WHERE private_payload_envelope::text LIKE $1 OR private_payload_envelope::text LIKE $2
    UNION ALL SELECT 1 FROM runa_core.chats WHERE title_envelope::text LIKE $1 OR title_envelope::text LIKE $2
    UNION ALL SELECT 1 FROM runa_core.chat_turns WHERE content_envelope::text LIKE $1 OR content_envelope::text LIKE $2
    UNION ALL SELECT 1 FROM runa_learning.journal_entries WHERE private_envelope::text LIKE $1 OR private_envelope::text LIKE $2
    UNION ALL SELECT 1 FROM runa_gate6c.runs WHERE receipt_json::text LIKE $1 OR receipt_json::text LIKE $2 OR receipt_json::text LIKE $3
    UNION ALL SELECT 1 FROM gate6c.browser_flows WHERE private_envelope::text LIKE $3
    UNION ALL SELECT 1 FROM gate6c.browser_sessions WHERE private_envelope::text LIKE $3 OR private_envelope::text LIKE $4
  ) leaked`, [`%${coreCanary}%`, `%${learningCanary}%`, `%${browserTokenCanary}%`, `%${browserRefresh}%`])).rows[0].leaked;
  await pool.end();
  const rollback = await resumed.rollback({ runId: input.runId, targetAuthoritative: false,
    legacyRuntimeVerified: true, selectedWritesStillFrozen: true });
  const afterRollback = await store.audit(projectChatSnapshot.participantId);
  const checks = {
    fourDomainsCommitted: first.committed && Object.keys(first.domains).length === 4,
    retainedRowsReconciled: retainedVerification.exact === true
      && retainedVerification.approvedKnowledge.sourceActive
        === retainedVerification.approvedKnowledge.targetActive,
    exactCounts: beforeRestart.projects === projectChatSnapshot.projects.length
      && beforeRestart.chats === projectChatSnapshot.chats.length
      && beforeRestart.learning === learningSnapshot.entries.length
      && beforeRestart.settings === 1 && beforeRestart.receipts === 1,
    restartPersistent: stoppedForRestart && afterRestart.runStatus === "completed"
      && JSON.stringify(afterRestart) === JSON.stringify(beforeRestart),
    idempotentReplay: replay.replayed === true,
    privateCanariesAbsent: privateLeak === false,
    browserSessionEncryptedAndRestartPersistent: browserCredentialAfterRestart === browserTokenCanary
      && privateLeak === false && (await browserService.status()).nextStep === "verify-fresh-step-up",
    targetOnlyRollback: rollback.legacyModified === false && afterRollback.projects === 0
      && afterRollback.chats === 0 && afterRollback.turns === 0 && afterRollback.learning === 0
      && afterRollback.settings === 0 && afterRollback.receipts === 0
      && afterRollback.runStatus === "rolled-back",
  };
  report = { schemaVersion: "runa2-gate6c-stub-integration/v1", runtime: process.version,
    syntheticOnly: true, protectedDataUsed: false, ownerCredentialEnrolled: false,
    legacyWriteFreezeActivated: false, productionTrafficChanged: false,
    networking: "loopback-disposable-postgresql-only", checks,
    counts: { projectRecords: beforeRestart.projects, chats: beforeRestart.chats,
      turns: beforeRestart.turns, learningEntries: beforeRestart.learning,
      settings: beforeRestart.settings, receipts: beforeRestart.receipts },
    passed: Object.values(checks).every(Boolean) };
  if (!report.passed) throw new Error(`Gate 6C integration checks failed: ${JSON.stringify(checks)}`);
} catch (error) { failure = error; }
finally {
  await store?.close().catch(() => {});
  if (postgresRunning) postgresRunning = !stopPostgres();
}
if (report) {
  report.servicesStopped = { postgres: !postgresRunning };
  report.passed &&= !postgresRunning;
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, checks: report.checks,
    counts: report.counts, servicesStopped: report.servicesStopped })}\n`);
}
await rm(outputRoot, { recursive: true, force: true }).catch(() => {});
if (failure) throw failure;
if (!report?.passed) process.exitCode = 1;
