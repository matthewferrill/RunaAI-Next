import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

import { PostgresCutoverStore } from "./adapters/postgres.mjs";
import { createInitialCutoverState, Gate6CutoverCoordinator } from "./cutover.mjs";
import { exactApprovedKnowledge, exactDomains, greenReadiness, liveChecks, liveStatus,
  SOURCE_GENERATION, syntheticRelease, TARGET_GENERATION } from "./fixtures.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate6-selected-core-cutover");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
for (const tool of ["initdb.exe", "pg_ctl.exe"]) if (!existsSync(path.join(pgBin, tool))) throw new Error(`missing retained RunaLab tool: ${tool}`);
const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
const connectionString = "postgresql://postgres@127.0.0.1:9736/postgres";
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
    "-o", "-p 9736 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (result.status !== 0) throw new Error(`PostgreSQL start failed with status ${result.status}`);
}
function stopPostgres() {
  return spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"],
    { cwd: root, stdio: "ignore", windowsHide: true }).status === 0;
}

const manifest = syntheticRelease();
let clock = new Date("2026-08-21T19:00:00.000Z");
const now = () => new Date(clock);
const privateCanary = "GATE6_PRIVATE_INPUT_CANARY_DO_NOT_RETAIN";

async function promote(coordinator, suffix) {
  const domains = exactDomains(suffix);
  await coordinator.recordCandidateReadiness(`ready-${suffix}`, greenReadiness("candidate", manifest));
  await coordinator.freezeSelectedWrites(`freeze-${suffix}`, { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION, privateCanary });
  await coordinator.verifyBackup(`backup-${suffix}`, { backupVerified: true, distinctRestoreVerified: true,
    sourceGeneration: SOURCE_GENERATION, manifestDigest: manifest.artifactDigest });
  await coordinator.commitFinalDelta(`delta-${suffix}`, { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains });
  await coordinator.reconcile(`reconcile-${suffix}`, { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains,
    approvedKnowledge: exactApprovedKnowledge(suffix), oneDeedOneReceipt: true,
    deferredStoresUntouched: true });
  await coordinator.recordPromotionReadiness(`promotion-ready-${suffix}`, greenReadiness("promotion", manifest));
  return coordinator.promote(`promote-${suffix}`, { sourceStillFrozen: true,
    expectedAuthorityGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION });
}

let postgresRunning = false;
let primaryStore, restartStore, rollbackStore, report, failure;
let stoppedForRestart = false;
try {
  initializePostgres(); startPostgres(); postgresRunning = true;
  const pool = new pg.Pool({ connectionString });
  await pool.query("CREATE SCHEMA gate5_retained; CREATE TABLE gate5_retained.marker(id int)");
  await pool.end();

  const cutoverId = "gate6-integration-close";
  const initial = createInitialCutoverState({ cutoverId, manifest,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION });
  primaryStore = new PostgresCutoverStore({ connectionString, cutoverId,
    responseLossAfterCommit: ["promote-close"] });
  await primaryStore.initialize(initial, { reset: true });
  let responseLossCode;
  try { await promote(new Gate6CutoverCoordinator({ store: primaryStore, manifest, now }), "close"); }
  catch (error) { responseLossCode = error.code; }
  const resumedPromotion = await new Gate6CutoverCoordinator({ store: primaryStore, manifest, now })
    .promote("promote-close", { sourceStillFrozen: true, expectedAuthorityGeneration: SOURCE_GENERATION,
      targetGeneration: TARGET_GENERATION });
  const beforeRestart = await primaryStore.audit();
  await primaryStore.close(); primaryStore = null;
  stoppedForRestart = stopPostgres(); postgresRunning = false;
  startPostgres(); postgresRunning = true;

  restartStore = new PostgresCutoverStore({ connectionString, cutoverId });
  const resumed = new Gate6CutoverCoordinator({ store: restartStore, manifest, now });
  let failedLiveCode;
  const wrongStatus = liveStatus(manifest); wrongStatus.running.artifactDigest = "0".repeat(64);
  try { await resumed.verifyLive("live-wrong", { runtimeStatus: wrongStatus, checks: liveChecks }); }
  catch (error) { failedLiveCode = error.code; }
  const afterFailedLive = await restartStore.audit();
  await resumed.verifyLive("live-close", { runtimeStatus: liveStatus(manifest), checks: liveChecks });
  await resumed.startObservation("observe-close", { selectedWritesRemainFrozen: true, durationMinutes: 60 });
  clock = new Date(clock.getTime() + 61 * 60_000);
  await resumed.close("close-close", { healthGreenForEntireWindow: true,
    selectedWritesStayedFrozen: true, finalReconciliationExact: true });
  const closed = await restartStore.audit();

  const rollbackId = "gate6-integration-rollback";
  const rollbackInitial = createInitialCutoverState({ cutoverId: rollbackId, manifest,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION });
  rollbackStore = new PostgresCutoverStore({ connectionString, cutoverId: rollbackId });
  await rollbackStore.initialize(rollbackInitial);
  const rollbackCoordinator = new Gate6CutoverCoordinator({ store: rollbackStore, manifest, now });
  await promote(rollbackCoordinator, "rollback");
  await rollbackCoordinator.rollback("rollback-target", { legacyRuntimeVerified: true,
    selectedWritesNeverUnfrozen: true, targetSessionsAndCapabilitiesRevoked: true });
  const rolledBack = await rollbackStore.audit();

  const scanPool = new pg.Pool({ connectionString });
  const privateLeak = (await scanPool.query(`SELECT EXISTS(
    SELECT 1 FROM gate6.cutover_state WHERE state_json::text LIKE $1
    UNION ALL SELECT 1 FROM gate6.operations WHERE state_json::text LIKE $1 OR result_json::text LIKE $1
  ) leaked`, [`%${privateCanary}%`])).rows[0].leaked;
  const shape = (await scanPool.query(`SELECT
    bool_and(input_digest ~ '^[a-f0-9]{64}$') digests,
    count(*)::int operations FROM gate6.operations`)).rows[0];
  await restartStore.close(); restartStore = null;
  await rollbackStore.close(); rollbackStore = null;
  const cleanupStore = new PostgresCutoverStore({ connectionString, cutoverId });
  await cleanupStore.dropGate6Schema();
  await cleanupStore.close();
  const cleanup = (await scanPool.query(`SELECT to_regnamespace('gate6') IS NULL gate6_removed,
    to_regclass('gate5_retained.marker') IS NOT NULL prior_gate_retained`)).rows[0];
  await scanPool.end();

  const checks = {
    durableStatePersisted: beforeRestart.phase === "promoted" && beforeRestart.revision === 7,
    responseLossVisible: responseLossCode === "cutover-response-lost",
    responseLossRetryIdempotent: resumedPromotion.replayed === true && beforeRestart.operations === 7,
    postgresRestartClean: stoppedForRestart,
    failedLiveIdentityAtomic: failedLiveCode === "cutover-live-identity-mismatch"
      && afterFailedLive.phase === "promoted" && afterFailedLive.revision === 7,
    restartResumeAndClose: closed.phase === "closed" && closed.authorityGeneration === TARGET_GENERATION
      && closed.revision === 10 && closed.operations === 10,
    rollbackReturnsLegacyAuthority: rolledBack.phase === "rolled-back"
      && rolledBack.authorityGeneration === SOURCE_GENERATION && rolledBack.revision === 8,
    aggregateLedgerOnly: shape.digests && shape.operations === 18 && !privateLeak,
    gate6RollbackIsolated: cleanup.gate6_removed && cleanup.prior_gate_retained,
  };
  report = {
    schemaVersion: "runa2-gate6-stub-integration/v1",
    runtime: process.version,
    syntheticOnly: true,
    protectedDataUsed: false,
    productionTrafficChanged: false,
    persistentServices: false,
    networking: "loopback-disposable-postgresql-only",
    counts: { closedOperations: closed.operations, rollbackOperations: rolledBack.operations,
      totalOperations: shape.operations },
    recovery: { responseLossCode, resumedPromotionReplayed: resumedPromotion.replayed,
      postgresRestarted: stoppedForRestart, rollbackAuthority: rolledBack.authorityGeneration },
    checks,
    passed: Object.values(checks).every(Boolean),
  };
  if (!report.passed) throw new Error(`Gate 6 integration checks failed: ${JSON.stringify(checks)}`);
} catch (error) { failure = error; }
finally {
  await primaryStore?.close().catch(() => {});
  await restartStore?.close().catch(() => {});
  await rollbackStore?.close().catch(() => {});
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
