import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { ScriptedProvider } from "../gate1/adapters/memory.mjs";
import { Gate2ReadOnlyService } from "../gate2/core.mjs";
import { Gate3GovernedActionService } from "../gate3/core.mjs";
import { PostgresGate4aStore } from "../gate4/adapters/postgres.mjs";
import { Gate4aMigrationService } from "../gate4/migration.mjs";
import { makeSnapshot, PROJECT_ALPHA, testCipher as coreTestCipher } from "../gate4/fixtures.mjs";
import { canonicalJson } from "../gate4/canonical.mjs";
import { PostgresGate4bStore } from "../gate4b/adapters/postgres.mjs";
import { Gate4bMigrationService } from "../gate4b/migration.mjs";
import { AcceptedApprovedKnowledgeAdapter } from "../gate4c/answer-context.mjs";
import { acceptedFixture, approvedEvent, NOW } from "../gate4c/fixtures.mjs";
import { SelectedCoreApplication, PERSONAL_SCOPE } from "./application.mjs";
import { PostgresSelectedActionStore } from "./adapters/postgres-action.mjs";
import { PostgresRequestCoordinator, PostgresSelectedContinuityStore,
  PostgresWorkspaceStore } from "./adapters/postgres-continuity.mjs";
import { PostgresAcceptedLearningSource } from "./adapters/postgres-learning.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate6b-release-composition");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
for (const tool of ["initdb.exe", "pg_ctl.exe"]) if (!existsSync(path.join(pgBin, tool))) throw new Error(`missing retained RunaLab tool: ${tool}`);
const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
const connectionString = "postgresql://postgres@127.0.0.1:9746/postgres";
const privateCanary = "GATE6B_PRIVATE_WORKSPACE_CANARY_DO_NOT_RETAIN";
const targetGeneration = "runaai-next:gate6b-synthetic";
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

function initializePostgres() {
  const result = spawnSync(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres",
    "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`initdb failed: ${result.stderr || result.stdout}`);
}
function startPostgres() {
  const result = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog,
    "-o", "-p 9746 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (result.status !== 0) throw new Error(`PostgreSQL start failed with status ${result.status}`);
}
function stopPostgres() {
  return spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"],
    { cwd: root, stdio: "ignore", windowsHide: true }).status === 0;
}

const coreCipher = coreTestCipher();
const learningFixture = acceptedFixture(approvedEvent("gate6b-global", {
  lesson: "Use explicit repository evidence when reviewing a migration.", scope: "global" }));
const participantId = learningFixture.snapshot.participantId;
let postgresRunning = false;
let runtime = null;
let report = null;
let failure = null;

async function buildRuntime() {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
  pool.on("error", () => {});
  const coreStore = new PostgresGate4aStore({ pool });
  const learningStore = new PostgresGate4bStore({ pool });
  const continuity = new PostgresSelectedContinuityStore({ pool, cipher: coreCipher,
    now: () => new Date("2026-08-21T20:00:00.000Z") });
  const workspace = new PostgresWorkspaceStore({ pool, cipher: coreCipher });
  const actionStore = new PostgresSelectedActionStore({ pool,
    now: () => new Date("2026-08-21T20:00:00.000Z") });
  await coreStore.initialize();
  await learningStore.initialize();
  await continuity.initialize();
  await workspace.initialize();
  await actionStore.initialize();
  const source = new PostgresAcceptedLearningSource({ pool, cipher: learningFixture.cipher });
  const approvedKnowledge = new AcceptedApprovedKnowledgeAdapter({ loadSource: options => source.load(options),
    cipher: learningFixture.cipher, expectedSourceClassification: "synthetic-fixture",
    now: () => new Date(NOW) });
  const providers = Object.fromEntries(["chat", "research", "code"].map(role => [role,
    new ScriptedProvider({ role, modelId: "qwen3-coder-30b-a3b-instruct",
      reply: ({ evidence, advisory }) => ({ answer: evidence.length
        ? `The explicit section ${evidence[0].sourceId} supports this answer.`
        : advisory?.lessonCount ? "The scoped approved guidance is available as advisory context."
          : "No selected record answers that question.",
      citations: evidence.length ? [{ sourceId: evidence[0].sourceId, sectionId: evidence[0].sectionId }] : [] }) })]));
  const answerService = new Gate2ReadOnlyService({ records: workspace, index: workspace, providers,
    continuity, workspaceResolver: workspace, approvedKnowledge,
    statusProvider: () => ({ provider: "scripted", retrieval: "postgres-direct", reranker: "postgres-direct" }) });
  const actionService = new Gate3GovernedActionService({ store: actionStore });
  const participant = { verified: true, principalId: participantId, role: "primary-steward",
    ageClass: "adult", authenticatedAt: "2026-08-21T19:58:00.000Z",
    expiresAt: "2026-08-21T21:00:00.000Z", methods: ["webauthn"] };
  const application = new SelectedCoreApplication({ mode: "active", targetGeneration,
    cutoverStatus: async () => ({ phase: "promoted", revision: 7, authorityGeneration: targetGeneration }),
    answerService, actionService,
    authenticator: { async authenticate() { return participant; } },
    authorizer: { async authorize(input) { return { allowed: true, reason: "synthetic-allow", ...input }; } },
    requestCoordinator: new PostgresRequestCoordinator({ pool }),
    now: () => new Date("2026-08-21T20:00:00.000Z") });
  return { pool, coreStore, learningStore, continuity, workspace, actionStore, providers, application,
    async close() { await pool.end(); } };
}

try {
  initializePostgres();
  startPostgres();
  postgresRunning = true;
  runtime = await buildRuntime();
  const coreSnapshot = makeSnapshot();
  coreSnapshot.participantId = participantId;
  await new Gate4aMigrationService({ store: runtime.coreStore, cipher: coreCipher })
    .migrate(coreSnapshot, { runId: "gate6b-core", mode: "synthetic", sourceCommit: coreSnapshot.sourceCommit,
      targetCommit: "a".repeat(40) });
  await new Gate4bMigrationService({ store: runtime.learningStore, cipher: learningFixture.cipher })
    .migrate(learningFixture.snapshot, { runId: "gate6b-learning" });
  await runtime.workspace.seedSource({ projectId: PROJECT_ALPHA, sourceId: "explicit-file",
    sectionId: "section-1", content: `${privateCanary} selected evidence.` });

  const answerBody = { requestId: "gate6b-answer-1", lane: "workspace", threadId: "gate6b-thread-1",
    projectId: PROJECT_ALPHA, message: "What does the explicit evidence support?", history: [],
    workspace: { sources: [{ sourceId: "explicit-file", sectionId: "section-1" }] } };
  const firstAnswer = await runtime.application.answer({ credential: "synthetic-token", body: answerBody });
  const replayAnswer = await runtime.application.answer({ credential: "synthetic-token", body: answerBody });
  const proposal = await runtime.application.proposeSetting({ credential: "synthetic-token", body: {
    requestId: "gate6b-setting-high", projectId: PERSONAL_SCOPE, value: "High" } });
  const receipt = await runtime.application.approveSetting({ credential: "synthetic-token", body: {
    projectId: PERSONAL_SCOPE, approvalId: "gate6b-approval-high", proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest, approvalPhrase: "approve" } });
  const receiptReplay = await runtime.application.approveSetting({ credential: "synthetic-token", body: {
    projectId: PERSONAL_SCOPE, approvalId: "gate6b-approval-high", proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest, approvalPhrase: "approve" } });
  const beforeRestart = { core: await runtime.coreStore.auditState(participantId),
    actions: await runtime.actionStore.auditState() };
  await runtime.close(); runtime = null;
  const stoppedForRestart = stopPostgres(); postgresRunning = false;
  startPostgres(); postgresRunning = true;
  runtime = await buildRuntime();
  const afterRestartAnswer = await runtime.application.answer({ credential: "synthetic-token", body: answerBody });
  const afterRestartReceipt = await runtime.application.approveSetting({ credential: "synthetic-token", body: {
    projectId: PERSONAL_SCOPE, approvalId: "gate6b-approval-high", proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest, approvalPhrase: "approve" } });
  const rollbackProposal = await runtime.application.proposeSetting({ credential: "synthetic-token", body: {
    requestId: "gate6b-setting-rollback", projectId: PERSONAL_SCOPE, value: "Medium",
    rollbackOfReceiptId: receipt.receiptId } });
  const rollbackReceipt = await runtime.application.approveSetting({ credential: "synthetic-token", body: {
    projectId: PERSONAL_SCOPE, approvalId: "gate6b-approval-rollback", proposalId: rollbackProposal.proposalId,
    proposalDigest: rollbackProposal.proposalDigest, approvalPhrase: "approve" } });
  const state = { core: await runtime.coreStore.auditState(participantId),
    learning: await runtime.learningStore.auditState(learningFixture.snapshot.participantId),
    actions: await runtime.actionStore.auditState(),
    settings: await runtime.continuity.settingValues(participantId) };
  const scan = (await runtime.pool.query(`SELECT
    EXISTS(SELECT 1 FROM runa_core.chats WHERE title_envelope::text LIKE $1
      UNION ALL SELECT 1 FROM runa_core.chat_turns WHERE content_envelope::text LIKE $1
      UNION ALL SELECT 1 FROM runa_workspace.source_sections WHERE content_envelope::text LIKE $1
      UNION ALL SELECT 1 FROM runa_runtime.route_responses WHERE response_json::text LIKE $1
      UNION ALL SELECT 1 FROM runa_governance.proposals WHERE proposal_json::text LIKE $1
      UNION ALL SELECT 1 FROM runa_governance.receipts WHERE receipt_json::text LIKE $1) leaked`,
  [`%${privateCanary}%`])).rows[0].leaked;
  await runtime.close(); runtime = null;
  const stoppedForLoss = stopPostgres(); postgresRunning = false;
  const unavailablePool = new pg.Pool({ connectionString, connectionTimeoutMillis: 500, query_timeout: 500 });
  unavailablePool.on("error", () => {});
  let dependencyDenied = false;
  try { await unavailablePool.query("SELECT 1"); } catch { dependencyDenied = true; }
  await unavailablePool.end();
  startPostgres(); postgresRunning = true;

  const checks = {
    workspaceExplicitSourceOnly: firstAnswer.workspace?.explicitSources === 1
      && firstAnswer.workspace?.resolvedSources === 1 && firstAnswer.workspace?.extraReads === 0,
    sourceCitationPreserved: firstAnswer.citations?.[0]?.sourceId === "explicit-file",
    approvedKnowledgeAdvisoryOnly: firstAnswer.approvedKnowledge?.delivered === true
      && firstAnswer.effects?.length === 0,
    answerReplayExact: canonicalJson(firstAnswer) === canonicalJson(replayAnswer)
      && canonicalJson(firstAnswer) === canonicalJson(afterRestartAnswer),
    selectedCoreAuthorityUnified: state.core.projects === 2 && state.core.chats === beforeRestart.core.chats
      && state.core.turns === beforeRestart.core.turns,
    settingOneDeedOneReceipt: receipt.receiptId === receiptReplay.receiptId
      && receipt.receiptId === afterRestartReceipt.receiptId && state.actions.receipts === 2
      && state.actions.capabilities === 2 && state.actions.settings === 1,
    governedRollbackExact: rollbackReceipt.beforeValue === "High" && rollbackReceipt.afterValue === "Medium"
      && state.settings.defaultIntelligenceLevel === "Medium",
    learningAuthorityDirect: state.learning.entries === learningFixture.snapshot.entries.length
      && state.learning.current_manifest_hmac === learningFixture.plan.manifestHmac,
    restartPersistent: stoppedForRestart && state.actions.proposals === 2,
    dependencyLossDenied: stoppedForLoss && dependencyDenied,
    privateCanaryAbsent: !scan,
  };
  report = { schemaVersion: "runa2-gate6b-stub-integration/v1", runtime: process.version,
    syntheticOnly: true, protectedDataUsed: false, productionTrafficChanged: false,
    persistentServices: false, networking: "loopback-disposable-postgresql-only",
    counts: { projectRecords: state.core.projects, chats: state.core.chats, turns: state.core.turns,
      learningEntries: state.learning.entries, proposals: state.actions.proposals,
      receipts: state.actions.receipts }, checks,
    passed: Object.values(checks).every(Boolean) };
  if (!report.passed) throw new Error(`Gate 6B integration checks failed: ${JSON.stringify(checks)}`);
} catch (error) { failure = error; }
finally {
  await runtime?.close().catch(() => {});
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
