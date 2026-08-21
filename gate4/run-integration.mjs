import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { PostgresGate4aStore } from "./adapters/postgres.mjs";
import { Gate4aMigrationService, Gate4aProjectChatRepository } from "./migration.mjs";
import { CHAT_A, CHAT_C, PARTICIPANT, PROJECT_ALPHA, disposableCipher, makeSnapshot } from "./fixtures.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate4a-project-chat");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
for (const tool of ["initdb.exe", "pg_ctl.exe"]) if (!existsSync(path.join(pgBin, tool))) throw new Error(`missing retained RunaLab tool: ${tool}`);
const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
const connectionString = "postgresql://postgres@127.0.0.1:9692/postgres";
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(path.dirname(evidencePath), { recursive: true });

function initializePostgres() {
  const result = spawnSync(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres",
    "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"],
  { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`initdb failed: ${result.stderr || result.stdout}`);
}
function startPostgres() {
  const result = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog,
    "-o", "-p 9692 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (result.status !== 0) throw new Error(`PostgreSQL start failed with status ${result.status}`);
}
function stopPostgres() {
  return spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"],
    { cwd: root, stdio: "ignore", windowsHide: true }).status === 0;
}

let store, postgresRunning = false, report, failure;
const cipher = disposableCipher();
try {
  initializePostgres(); startPostgres(); postgresRunning = true;
  store = new PostgresGate4aStore({ connectionString });
  await store.initialize({ reset: true });
  await store.pool.query("CREATE SCHEMA gate2; CREATE TABLE gate2.marker(id int); CREATE SCHEMA gate3; CREATE TABLE gate3.marker(id int)");
  const service = new Gate4aMigrationService({ store, cipher });
  const repository = new Gate4aProjectChatRepository({ store, cipher });
  const initialSnapshot = makeSnapshot({ privateCanary: "GATE4A_PRIVATE_WIRE_CANARY" });
  const concurrent = await Promise.all([
    service.migrate(initialSnapshot, { runId: "integration-initial" }),
    service.migrate(initialSnapshot, { runId: "integration-initial" }),
  ]);
  const initial = concurrent.find(result => !result.replayed);
  const chat = await repository.readChat(PARTICIPANT, PROJECT_ALPHA, CHAT_A);
  const initialAudit = await store.auditState(PARTICIPANT);

  const deltaSnapshot = makeSnapshot({ sourceSnapshotId: "integration-delta",
    predecessorManifestHmac: initial.manifestHmac, includeUnassigned: false,
    privateCanary: "GATE4A_PRIVATE_WIRE_CANARY" });
  let responseLossCode;
  try { await service.migrate(deltaSnapshot, { runId: "integration-delta", failAfterCommit: true }); }
  catch (error) { responseLossCode = error.code; }
  await store.close(); store = null;
  const stoppedForRestart = stopPostgres(); postgresRunning = false;
  startPostgres(); postgresRunning = true;
  store = new PostgresGate4aStore({ connectionString });
  const resumedService = new Gate4aMigrationService({ store, cipher });
  const resumedRepository = new Gate4aProjectChatRepository({ store, cipher });
  const resumed = await resumedService.migrate(deltaSnapshot, { runId: "integration-delta" });
  const deletedChat = await store.getRaw("chat", CHAT_C, PARTICIPANT);

  const finalSnapshot = makeSnapshot({ sourceSnapshotId: "integration-final",
    predecessorManifestHmac: resumed.manifestHmac, includeUnassigned: false,
    privateCanary: "GATE4A_PRIVATE_WIRE_CANARY",
    mutate: value => { value.projects[0].displayName = "Project Alpha Renamed"; return value; } });
  let beforeCommitCode;
  try { await resumedService.migrate(finalSnapshot, { runId: "integration-final", failBeforeCommit: true }); }
  catch (error) { beforeCommitCode = error.code; }
  const afterFailedCommit = await store.auditState(PARTICIPANT);
  const final = await resumedService.migrate(finalSnapshot, { runId: "integration-final" });
  const project = await resumedRepository.readProject(PARTICIPANT, PROJECT_ALPHA);
  const finalAudit = await store.auditState(PARTICIPANT);
  const pool = new pg.Pool({ connectionString });
  const privateLeak = (await pool.query(`SELECT
    EXISTS(SELECT 1 FROM runa_core.projects WHERE private_payload_envelope::text LIKE '%GATE4A_PRIVATE_WIRE_CANARY%') OR
    EXISTS(SELECT 1 FROM runa_core.chats WHERE title_envelope::text LIKE '%GATE4A_PRIVATE_WIRE_CANARY%') OR
    EXISTS(SELECT 1 FROM runa_core.chat_turns WHERE content_envelope::text LIKE '%GATE4A_PRIVATE_WIRE_CANARY%') OR
    EXISTS(SELECT 1 FROM runa_core.project_memory WHERE private_payload_envelope::text LIKE '%GATE4A_PRIVATE_WIRE_CANARY%') OR
    EXISTS(SELECT 1 FROM runa_migration.runs WHERE result_json::text LIKE '%GATE4A_PRIVATE_WIRE_CANARY%') leaked`)).rows[0].leaked;
  const hmacShape = (await pool.query(`SELECT bool_and(value ~ '^[a-f0-9]{64}$') ok FROM (
    SELECT payload_hmac value FROM runa_core.projects UNION ALL SELECT title_hmac FROM runa_core.chats
    UNION ALL SELECT content_hmac FROM runa_core.chat_turns UNION ALL SELECT payload_hmac FROM runa_core.project_memory) x`)).rows[0].ok;
  const ledgerHmacShape = (await pool.query(`SELECT bool_and(source_content_hmac ~ '^[a-f0-9]{64}$' AND
    target_content_hmac ~ '^[a-f0-9]{64}$') ok FROM runa_migration.items WHERE disposition='upserted'`)).rows[0].ok;
  const typedSchema = (await pool.query(`SELECT
    NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='runa_core' AND column_name='public_json') public_json_absent,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='runa_core' AND
      ((table_name='projects' AND column_name IN ('participant_id','project_id','private_payload_envelope')) OR
       (table_name='chats' AND column_name IN ('participant_id','chat_id','title_envelope')) OR
       (table_name='chat_turns' AND column_name IN ('participant_id','chat_id','turn_ordinal','content_envelope')) OR
       (table_name='project_memory' AND column_name IN ('participant_id','memory_id','project_id','private_payload_envelope')))) = 14 required_columns,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='runa_migration' AND
      ((table_name='runs' AND column_name IN ('domain','domain_version','source_snapshot_digest','source_commit','target_commit','status','verifier_result_json','started_at','completed_at')) OR
       (table_name='items' AND column_name IN ('source_content_hmac','target_content_hmac','recorded_at')))) = 12 required_ledger_columns`)).rows[0];
  await store.dropGate4aSchemas();
  const rollback = (await pool.query(`SELECT to_regnamespace('runa_core') IS NULL core_removed,
    to_regnamespace('runa_migration') IS NULL migration_removed,
    to_regclass('gate2.marker') IS NOT NULL gate2_retained,
    to_regclass('gate3.marker') IS NOT NULL gate3_retained`)).rows[0];
  await pool.end();

  const checks = {
    concurrentInitialOneCommit: concurrent.filter(result => result.replayed).length === 1 && initialAudit.runs === 1,
    initialCountsExact: initialAudit.projects === 2 && initialAudit.chats === 3 && initialAudit.turns === 4 && initialAudit.project_memory === 1,
    encryptedRoundTripExact: chat.title === "Plan GATE4A_PRIVATE_WIRE_CANARY" && chat.turns.length === 2,
    responseLossVisible: responseLossCode === "migration-response-lost",
    postgresRestartClean: stoppedForRestart,
    restartReplaySameRun: resumed.replayed && resumed.manifestHmac !== initialAudit.current_manifest_hmac,
    deletionApplied: deletedChat === null && resumed.tombstones === 2,
    beforeCommitFailureVisible: beforeCommitCode === "migration-simulated-before-commit",
    beforeCommitAtomic: afterFailedCommit.current_manifest_hmac === resumed.manifestHmac && afterFailedCommit.runs === 2,
    finalUpdateApplied: project.displayName === "Project Alpha Renamed" && final.committed,
    finalCountsExact: finalAudit.projects === 2 && finalAudit.chats === 2 && finalAudit.turns === 3 && finalAudit.project_memory === 1,
    ledgerCountsExact: finalAudit.runs === 3 && finalAudit.items === 28 && finalAudit.tombstones === 2,
    privateCanaryAbsentFromDatabaseText: !privateLeak,
    contentDigestsAreKeyedShape: hmacShape && ledgerHmacShape,
    approvedTypedSchemaPresent: typedSchema.public_json_absent && typedSchema.required_columns && typedSchema.required_ledger_columns,
    gate4RollbackIsolated: rollback.core_removed && rollback.migration_removed && rollback.gate2_retained && rollback.gate3_retained,
  };
  report = { schemaVersion: "runa2-gate4a-stub-integration/v1", runtime: process.version,
    selectedComposition: ["PostgreSQL runa_core authority", "PostgreSQL immutable migration ledger",
      "application AES-256-GCM envelopes", "external HMAC reconciliation keys"],
    syntheticOnly: true, protectedDataUsed: false, persistentServices: false,
    networking: "loopback-disposable-postgresql-only", inventoryExecuted: false,
    counts: { initial: { projects: initialAudit.projects, chats: initialAudit.chats,
      turns: initialAudit.turns, projectMemory: initialAudit.project_memory },
      final: { projects: finalAudit.projects, chats: finalAudit.chats,
        turns: finalAudit.turns, projectMemory: finalAudit.project_memory },
      runs: finalAudit.runs, items: finalAudit.items, tombstones: finalAudit.tombstones },
    recovery: { responseLossCode, beforeCommitCode, restartReplay: resumed.replayed },
    rollback, checks, passed: Object.values(checks).every(Boolean) };
  if (!report.passed) throw new Error(`Gate 4A integration checks failed: ${JSON.stringify(checks)}`);
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
if (failure) throw failure;
if (!report?.passed) process.exitCode = 1;
