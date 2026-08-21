import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

import { Gate5AuthorizationService, Gate5IdentityService } from "./identity.mjs";
import { PostgresPrincipalStore } from "./postgres.mjs";
import { createAuthoritativeBackup, openAuthoritativeBackup } from "./recovery.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate5-operations-security");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
for (const tool of ["initdb.exe", "pg_ctl.exe"]) if (!existsSync(path.join(pgBin, tool))) throw new Error(`missing retained RunaLab tool: ${tool}`);
const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(path.dirname(evidencePath), { recursive: true });

function startPostgres() {
  const init = spawnSync(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const started = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog, "-o", "-p 9720 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (started.status !== 0) throw new Error(`PostgreSQL start failed with status ${started.status}`);
  return {
    connectionString: "postgresql://postgres@127.0.0.1:9720/postgres",
    stop: () => spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"], { cwd: root, stdio: "ignore", windowsHide: true }).status === 0,
  };
}

const fixedNow = () => new Date("2026-08-21T16:00:00.000Z");
const issuer = "https://identity.runa.private/realms/runa";
const audience = "runa-selected-core";
const syntheticToken = "gate5-disposable-token-not-retained";
const records = [
  { domain: "learning-events", schemaVersion: "v1", recordId: "e1", state: "active" },
  { domain: "principals", schemaVersion: "v1", recordId: "p1", role: "primary-steward" },
  { domain: "settings", schemaVersion: "v1", recordId: "s1", value: "High" },
];
const encryptionKey = Buffer.alloc(32, 7);
const digestKey = Buffer.alloc(32, 9);
const manifestDigest = manifest => createHmac("sha256", digestKey).update(JSON.stringify(manifest)).digest("hex");
const canonical = value => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const logicalDigest = value => createHmac("sha256", digestKey).update(canonical(value)).digest("hex");

let postgres, store, report, failure;
let postgresStopped = false;
try {
  postgres = startPostgres();
  store = new PostgresPrincipalStore({ connectionString: postgres.connectionString });
  await store.initialize({ reset: true });
  await store.seed({ principalId: "matthew", subject: "keycloak-subject-1", role: "primary-steward", ageClass: "adult", status: "active", recordVersion: 1 });

  const identity = new Gate5IdentityService({
    verifier: { verify: async token => token === syntheticToken ? {
      decided: true, signatureValid: true, issuer, audience: [audience], subject: "keycloak-subject-1",
      actorId: "matthew", authenticatedAt: "2026-08-21T15:58:00.000Z", expiresAt: "2026-08-21T16:30:00.000Z", methods: ["webauthn"],
    } : { decided: true, signatureValid: false } },
    introspector: { introspect: async token => ({ decided: true, active: token === syntheticToken, subject: "keycloak-subject-1" }) },
    principalStore: store, issuer, audience, now: fixedNow,
  });
  const participant = await identity.authenticate({ bearerToken: syntheticToken, actorId: "matthew", requireOnline: true });
  const authorization = new Gate5AuthorizationService({ checker: { check: async request => ({ ...request, decided: true, allowed: true }) }, now: fixedNow });
  const allowed = await authorization.authorize({ participant, action: "approve-global-lesson", resource: "household:runa" });

  const envelope = createAuthoritativeBackup({ records, sourceAuthority: "runa2/integration", sourceCommit: "2c38dd5", encryptionKey, digestKey, now: fixedNow, nonce: Buffer.alloc(12, 3) });
  const opened = openAuthoritativeBackup({ envelope, encryptionKey, digestKey, expectedAuthority: "runa2/integration", expectedCommit: "2c38dd5" });
  let injectedFailureCode;
  try { await store.restore({ runId: "gate5-failure", manifestDigest: manifestDigest(opened.manifest), records: opened.records, failAfter: 2 }); }
  catch (error) { injectedFailureCode = error.code; }
  const afterFailure = await store.counts();
  const restored = await store.restore({ runId: "gate5-success", manifestDigest: manifestDigest(opened.manifest), records: opened.records });
  const replay = await store.restore({ runId: "gate5-success", manifestDigest: manifestDigest(opened.manifest), records: opened.records });
  let changedRunCode;
  try { await store.restore({ runId: "gate5-success", manifestDigest: "0".repeat(64), records: opened.records }); }
  catch (error) { changedRunCode = error.code; }
  const readBack = await store.restoredRecords("gate5-success");
  const beforeRollback = await store.counts();
  const rollback = await store.rollbackRestore("gate5-success");
  const afterRollback = await store.counts();

  const privateScan = JSON.stringify({ participant, allowed, restored, replay, readBack, beforeRollback, afterRollback });
  const checks = {
    postgresPrincipalAuthority: participant.verified && participant.role === "primary-steward" && participant.tokenRolesTrusted === false,
    onlineIdentityRequired: participant.methods.includes("webauthn"),
    productAndRelationshipAuthorization: allowed.allowed === true && allowed.source === "runa-plus-openfga",
    authenticatedBackupManifest: envelope.manifest.recordCount === 3 && envelope.manifest.domains.length === 3,
    injectedRestoreAtomic: injectedFailureCode === "restore-injected-failure" && afterFailure.restore_runs === 0 && afterFailure.restored_records === 0,
    exactRestore: restored.restored === 3 && readBack.length === 3 && logicalDigest(readBack) === logicalDigest(records.slice().sort((a, b) => `${a.domain}/${a.recordId}`.localeCompare(`${b.domain}/${b.recordId}`))),
    retryIdempotent: replay.replayed === true && beforeRollback.restore_runs === 1 && beforeRollback.restored_records === 3,
    changedRunDenied: changedRunCode === "restore-run-changed",
    rollbackTargetOnly: rollback && afterRollback.restore_runs === 0 && afterRollback.restored_records === 0 && afterRollback.principals === 1,
    noPrivateValueRetained: !privateScan.includes(syntheticToken) && !privateScan.includes(envelope.ciphertext) && !privateScan.includes(encryptionKey.toString("hex")),
  };
  await store.rollbackGate5();
  const pool = new pg.Pool({ connectionString: postgres.connectionString });
  const gate5Removed = (await pool.query("SELECT to_regnamespace('gate5') IS NULL removed")).rows[0].removed;
  await pool.end();
  checks.gate5RollbackIsolated = gate5Removed;
  report = {
    schemaVersion: "runa2-gate5-stub-integration/v1",
    runtime: process.version,
    syntheticOnly: true,
    protectedDataUsed: false,
    networking: "loopback-disposable-postgresql-only",
    sourceRecordCount: records.length,
    restoredRecordCount: restored.restored,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
  if (!report.passed) throw new Error(`Gate 5 integration checks failed: ${JSON.stringify(checks)}`);
} catch (error) { failure = error; }
finally {
  await store?.close().catch(() => {});
  encryptionKey.fill(0);
  digestKey.fill(0);
  postgresStopped = postgres?.stop() ?? true;
}
if (report) {
  report.servicesStopped = { postgres: postgresStopped };
  report.keysDestroyed = encryptionKey.every(value => value === 0) && digestKey.every(value => value === 0);
  report.passed &&= postgresStopped && report.keysDestroyed;
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, checks: report.checks, servicesStopped: report.servicesStopped, keysDestroyed: report.keysDestroyed })}\n`);
}
await rm(outputRoot, { recursive: true, force: true }).catch(() => {});
if (failure) throw failure;
if (!report?.passed) process.exitCode = 1;
