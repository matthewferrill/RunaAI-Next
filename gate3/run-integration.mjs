import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { PostgresContinuityStore } from "../gate2/adapters/postgres.mjs";
import { PostgresGovernedActionStore } from "./adapters/postgres.mjs";
import { Gate3GovernedActionService } from "./core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate3-governed-action");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
for (const tool of ["initdb.exe", "pg_ctl.exe"]) {
  if (!existsSync(path.join(pgBin, tool))) throw new Error(`missing retained RunaLab tool: ${tool}`);
}
const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(path.dirname(evidencePath), { recursive: true });

function startPostgres() {
  const init = spawnSync(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres",
    "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"],
  { cwd: root, encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const started = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog,
    "-o", "-p 9690 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (started.status !== 0) throw new Error(`PostgreSQL start failed with status ${started.status}`);
  return {
    connectionString: "postgresql://postgres@127.0.0.1:9690/postgres",
    stop() { return spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"],
      { cwd: root, stdio: "ignore", windowsHide: true }).status === 0; },
  };
}

function runWorker(phase, connectionString, approval) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(import.meta.dirname, "integration-worker.mjs")], {
      cwd: root, windowsHide: true, env: { ...process.env, GATE3_PHASE: phase, GATE3_PG_URL: connectionString,
        GATE3_APPROVAL_JSON: JSON.stringify(approval) }, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    child.once("close", code => {
      if (code !== 0) return reject(new Error(`${phase} worker failed ${code}: ${output.slice(-5_000)}`));
      try { resolve(JSON.parse(output.trim().split(/\r?\n/).filter(Boolean).at(-1))); }
      catch (error) { reject(new Error(`${phase} output invalid: ${error.message}; ${output.slice(-2_000)}`)); }
    });
  });
}

const steward = { principalId: "synthetic-steward", verified: true };
const projectId = "synthetic-project-a";
const proposalRequest = ({ requestId, value, rollbackOfReceiptId = null }) => ({
  schemaVersion: "runa2-action-proposal-request/v1", requestId, participant: steward,
  project: { projectId }, origin: { type: "steward-request", reference: null },
  action: { kind: "participant-setting.set-default-intelligence-level",
    settingKey: "defaultIntelligenceLevel", value }, rollbackOfReceiptId,
});
const approvalRequest = (proposal, approvalId) => ({ schemaVersion: "runa2-action-approval-request/v1",
  approvalId, participant: steward, proposalId: proposal.proposalId,
  proposalDigest: proposal.proposalDigest, approvalPhrase: "approve" });

let postgres, continuity, store, report, failure;
let postgresStopped = false;
try {
  postgres = startPostgres();
  continuity = new PostgresContinuityStore({ connectionString: postgres.connectionString });
  store = new PostgresGovernedActionStore({ connectionString: postgres.connectionString });
  const service = new Gate3GovernedActionService({ store });
  await continuity.initialize({ reset: true });
  await continuity.seedProject({ projectId, participantId: steward.principalId,
    displayName: "Synthetic Gate 3", status: "managed", environments: ["disposable-loopback"] });
  await store.initialize({ reset: true });

  const forward = await service.propose(proposalRequest({ requestId: "g3-forward", value: "High" }));
  const forwardApproval = approvalRequest(forward, "approval-forward");
  const outcomes = {};
  outcomes.interrupt = await runWorker("interrupt", postgres.connectionString, forwardApproval);
  outcomes.resume = await runWorker("resume", postgres.connectionString, forwardApproval);
  outcomes.workflowReplay = await runWorker("workflow-replay", postgres.connectionString, forwardApproval);
  outcomes.directReplay = await runWorker("direct-replay", postgres.connectionString, forwardApproval);
  outcomes.concurrentReplay = await runWorker("concurrent-replay", postgres.connectionString, forwardApproval);
  const forwardReceipt = outcomes.resume.receipt;

  const tampered = await service.propose(proposalRequest({ requestId: "g3-tampered", value: "Low" }));
  const tamperPool = new pg.Pool({ connectionString: postgres.connectionString });
  await tamperPool.query(`UPDATE gate3.proposals SET proposal_json=jsonb_set(proposal_json,
    '{action,value}',to_jsonb('Medium'::text)) WHERE proposal_id=$1`, [tampered.proposalId]);
  await tamperPool.end();
  let tamperedCode;
  try { await service.approveAndExecute(approvalRequest(tampered, "approval-tampered")); }
  catch (error) { tamperedCode = error.code; }

  const failureBefore = await service.propose(proposalRequest({ requestId: "g3-fail-before", value: "Low" }));
  let failureBeforeCode;
  try { await service.approveAndExecute(approvalRequest(failureBefore, "approval-fail-before"), { failBeforeEffect: true }); }
  catch (error) { failureBeforeCode = error.code; }
  const valueAfterBeforeFailure = (await continuity.settingValues(steward.principalId)).defaultIntelligenceLevel;

  const failureAfter = await service.propose(proposalRequest({ requestId: "g3-fail-after", value: "Low" }));
  let failureAfterCode;
  try { await service.approveAndExecute(approvalRequest(failureAfter, "approval-fail-after"), { failAfterEffectBeforeRecord: true }); }
  catch (error) { failureAfterCode = error.code; }
  const valueAfterAtomicFailure = (await continuity.settingValues(steward.principalId)).defaultIntelligenceLevel;

  const stale = await service.propose(proposalRequest({ requestId: "g3-stale", value: "Low" }));
  await continuity.setSetting(steward.principalId, "defaultIntelligenceLevel", "Medium");
  let staleCode;
  try { await service.approveAndExecute(approvalRequest(stale, "approval-stale")); }
  catch (error) { staleCode = error.code; }
  await continuity.setSetting(steward.principalId, "defaultIntelligenceLevel", "High");

  const rollback = await service.propose(proposalRequest({ requestId: "g3-rollback", value: "Medium",
    rollbackOfReceiptId: forwardReceipt.receiptId }));
  outcomes.rollback = await runWorker("approve", postgres.connectionString, approvalRequest(rollback, "approval-rollback"));
  const finalSetting = (await continuity.settingValues(steward.principalId)).defaultIntelligenceLevel;
  const counts = await store.auditState();
  const pool = new pg.Pool({ connectionString: postgres.connectionString });
  const database = (await pool.query(`SELECT
    (SELECT count(*)::int FROM gate3.receipts) receipts,
    (SELECT count(*)::int FROM gate3.capabilities) capabilities,
    (SELECT count(*)::int FROM gate3.outbox) outbox,
    (SELECT count(*)::int FROM gate3.proposals WHERE status='executed') executed_proposals,
    (SELECT count(*)::int FROM gate3.attempts) failed_attempts,
    (SELECT count(*)::int FROM checkpoints) checkpoints`)).rows[0];
  const receiptRows = (await pool.query("SELECT receipt_json FROM gate3.receipts ORDER BY executed_at")).rows.map(row => row.receipt_json);
  await pool.query("DROP SCHEMA gate3 CASCADE");
  const rollbackCheck = (await pool.query(`SELECT
    to_regnamespace('gate3') IS NULL gate3_removed,
    to_regclass('gate2.settings') IS NOT NULL gate2_retained,
    (SELECT setting_value FROM gate2.settings WHERE participant_id=$1 AND setting_key='defaultIntelligenceLevel') final_setting`,
  [steward.principalId])).rows[0];
  await pool.end();

  const receiptIds = [outcomes.resume.receipt, outcomes.workflowReplay.receipt,
    outcomes.directReplay.receipt, ...outcomes.concurrentReplay.receipts].map(item => item.receiptId);
  const checks = {
    proposalInertBeforeApproval: forward.beforeValue === "Medium" && /Nothing has happened yet/.test(forward.preview),
    interruptedAfterCommittedReceipt: outcomes.interrupt.interrupted && outcomes.interrupt.counts.receipts === 1,
    freshWorkerResumeSameReceipt: outcomes.resume.receipt.receiptId === forwardReceipt.receiptId,
    workflowReplaySameReceipt: outcomes.workflowReplay.receipt.receiptId === forwardReceipt.receiptId,
    directAndConcurrentReplayOneDeed: new Set(receiptIds).size === 1 && outcomes.concurrentReplay.counts.receipts === 1,
    oneForwardCapabilityReceiptOutbox: outcomes.concurrentReplay.counts.receipts === 1 &&
      outcomes.concurrentReplay.counts.capabilities === 1 && outcomes.concurrentReplay.counts.outbox === 1,
    failBeforeEffectClean: failureBeforeCode === "action-simulated-before-effect" && valueAfterBeforeFailure === "High",
    failAfterEffectAtomicRollback: failureAfterCode === "action-simulated-atomic-rollback" && valueAfterAtomicFailure === "High",
    staleStateDenied: staleCode === "action-stale-state",
    tamperedProposalDenied: tamperedCode === "action-proposal-tampered",
    rollbackGovernedAndExact: outcomes.rollback.receipt.rollbackOfReceiptId === forwardReceipt.receiptId && finalSetting === "Medium",
    finalCountsExact: counts.receipts === 2 && counts.capabilities === 2 && counts.outbox === 2 && database.executed_proposals === 2,
    failedOutcomesRecorded: counts.failed_attempts === 3 && database.failed_attempts === 3,
    receiptsBoundEffects: receiptRows.length === 2 && receiptRows[0].beforeValue === "Medium" &&
      receiptRows[0].afterValue === "High" && receiptRows[1].beforeValue === "High" && receiptRows[1].afterValue === "Medium",
    checkpointsPresent: database.checkpoints > 0,
    gate3RollbackIsolated: rollbackCheck.gate3_removed && rollbackCheck.gate2_retained && rollbackCheck.final_setting === "Medium",
  };
  report = { schemaVersion: "runa2-gate3-stub-integration/v1", runtime: process.version,
    selectedComposition: ["LangGraph/PostgreSQL checkpoints", "PostgreSQL proposal/idempotency/outbox/postcondition",
      "one-time scoped capability", "Gate 2 PostgreSQL setting continuity"], syntheticOnly: true,
    protectedDataUsed: false, networking: "loopback-disposable-postgresql-only", actionKinds: [forward.action.kind],
    outcomes, failureBeforeCode, failureAfterCode, staleCode, tamperedCode, finalSetting, counts, database,
    receiptDigest: sha256(JSON.stringify(receiptRows)), rollback: rollbackCheck, checks,
    passed: Object.values(checks).every(Boolean) };
  if (!report.passed) throw new Error(`Gate 3 integration checks failed: ${JSON.stringify(checks)}`);
} catch (error) { failure = error; }
finally {
  await store?.close().catch(() => {});
  await continuity?.close().catch(() => {});
  postgresStopped = postgres?.stop() ?? true;
}
if (report) {
  report.servicesStopped = { postgres: postgresStopped };
  report.rollbackClean = postgresStopped;
  report.passed &&= postgresStopped;
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, checks: report.checks,
    servicesStopped: report.servicesStopped, database: report.database, finalSetting: report.finalSetting })}\n`);
}
if (failure) throw failure;
if (!report?.passed) process.exitCode = 1;
