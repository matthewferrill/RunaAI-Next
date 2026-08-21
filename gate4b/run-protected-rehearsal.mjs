import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { createGate4aDpapiProtector } from "../gate4/dpapi.mjs";
import { createEnvelopeCipher } from "../gate4/envelope.mjs";
import { Gate4bMigrationService } from "./migration.mjs";
import { PostgresGate4bStore } from "./adapters/postgres.mjs";
import { assertOwnerInventoryAuthority } from "./owner-inspection.mjs";
import { assertPrivateLearningValuesAbsent, createScopedE6Backup, privateLearningValuesForScan,
  protectedLearningBoundaryManifest, readProtectedE6Snapshot, verifyScopedE6Backup } from "./protected-source.mjs";

const APPROVED_ROOT = resolve("C:\\AI\\RunaAI-Gate4B-Protected-Rehearsal");
const PORT = 9694;
const PACKAGE_FILES = [
  "package.json", "gate4/canonical.mjs", "gate4/dpapi.mjs", "gate4/envelope.mjs",
  "gate4/runa-gate4a-windows-dpapi.ps1", "gate4b/SOURCE-PINS.json", "gate4b/contracts.mjs",
  "gate4b/migration.mjs", "gate4b/owner-inspection.mjs", "gate4b/protected-source.mjs",
  "gate4b/run-protected-rehearsal.mjs", "gate4b/adapters/postgres.mjs",
];
const coded = code => Object.assign(new Error("The protected E6 rehearsal failed closed."), { code });

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw coded("protected-argument-missing");
  return process.argv[index + 1];
}
function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function assertPackageMatches(nextRepo, packageRoot) {
  const rows = [];
  for (const name of PACKAGE_FILES) {
    const packaged = resolve(packageRoot, name); const reviewed = resolve(nextRepo, name);
    if (!inside(packageRoot, packaged) || !inside(nextRepo, reviewed) || !existsSync(packaged)
        || !existsSync(reviewed) || !readFileSync(packaged).equals(readFileSync(reviewed))) {
      throw coded("protected-package-source-mismatch");
    }
    rows.push({ name, sha256: sha256(readFileSync(packaged)) });
  }
  return { verifiedFiles: rows.length, packageSha256: sha256(canonicalJson(rows)) };
}
function dependencies(packageRoot) {
  const read = name => JSON.parse(readFileSync(join(packageRoot, "node_modules", name, "package.json"), "utf8")).version;
  const versions = { pg: read("pg"), zod: read("zod") };
  if (versions.pg !== "8.23.0" || versions.zod !== "4.4.3") throw coded("protected-dependency-version-mismatch");
  return versions;
}
function run(file, args, code, cwd) {
  const result = spawnSync(file, args, { cwd, stdio: "ignore", windowsHide: true, timeout: 60_000 });
  if (result.status !== 0) throw coded(code);
}
async function portAvailable() {
  await new Promise((accept, reject) => {
    const server = net.createServer(); server.unref();
    server.once("error", () => reject(coded("protected-postgres-port-unavailable")));
    server.listen({ host: "127.0.0.1", port: PORT, exclusive: true }, () => server.close(accept));
  });
}
function postgresVersion(file) {
  const result = spawnSync(file, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  if (result.status !== 0) throw coded("protected-postgres-version-failed");
  return String(result.stdout).trim().replace(/^postgres \(PostgreSQL\) /, "");
}

let store = null; let postgresRunning = false; let keyMaterial = null; let report = null; let safeErrorCode = null;
let cleanup = null;
try {
  const legacyRepo = resolve(argument("--legacy-repo")); const nextRepo = resolve(argument("--next-repo"));
  const expectedLegacyCommit = argument("--expected-legacy-commit"); const expectedNextCommit = argument("--expected-next-commit");
  const rehearsalRoot = resolve(argument("--rehearsal-root"));
  if (rehearsalRoot !== APPROVED_ROOT || !existsSync(rehearsalRoot)) throw coded("protected-rehearsal-root-invalid");
  const packageRoot = resolve(import.meta.dirname, "..");
  const pgBin = resolve(rehearsalRoot, "tools", "pgsql", "bin");
  const pgData = resolve(rehearsalRoot, "postgres-data"); const pgLog = resolve(rehearsalRoot, "postgres.log");
  const backupRoot = resolve(rehearsalRoot, "backup-e6"); const wrappedKeyPath = resolve(rehearsalRoot, "target-keys.dpapi");
  for (const target of [pgBin, pgData, pgLog, backupRoot, wrappedKeyPath]) if (!inside(rehearsalRoot, target)) throw coded("protected-rehearsal-root-invalid");
  const initdb = join(pgBin, "initdb.exe"); const pgCtl = join(pgBin, "pg_ctl.exe"); const postgres = join(pgBin, "postgres.exe");
  if (![initdb, pgCtl, postgres].every(existsSync)) throw coded("protected-postgres-runtime-missing");
  if ([pgData, pgLog, backupRoot, wrappedKeyPath].some(existsSync)) throw coded("protected-rehearsal-residue-present");
  cleanup = { rehearsalRoot, pgData, pgLog, backupRoot, wrappedKeyPath, pgCtl };

  const sourcePins = JSON.parse(readFileSync(resolve(nextRepo, "gate4b", "SOURCE-PINS.json"), "utf8"));
  const authority = assertOwnerInventoryAuthority({ legacyRepo, nextRepo, expectedLegacyCommit,
    expectedNextCommit, sourcePins, exec: execFileSync });
  const packageAuthority = assertPackageMatches(nextRepo, packageRoot); const dependencyVersions = dependencies(packageRoot);
  await portAvailable();
  const boundaryBefore = protectedLearningBoundaryManifest(legacyRepo);
  if (!boundaryBefore.e6.present || !boundaryBefore.e3.present || !boundaryBefore.e4.present
      || boundaryBefore.e5.present || !boundaryBefore.deviceVault.present
      || !boundaryBefore.learningCenterCredential.present) throw coded("protected-source-scope-drift");
  const backup = createScopedE6Backup({ legacyRepo, backupRoot, expectedEntries: 90 });
  const sourceRead = await readProtectedE6Snapshot({ legacyRepo, expectedCommit: expectedLegacyCommit });
  const expectedKinds = { "learning-event": 63, "outcome-feedback": 0, lifecycle: 10, approval: 0, "approval-batch": 17 };
  if (sourceRead.aggregate.entries !== 90 || canonicalJson(sourceRead.aggregate.byKind) !== canonicalJson(expectedKinds)) {
    throw coded("protected-source-scope-drift");
  }

  const dpapi = createGate4aDpapiProtector(); keyMaterial = randomBytes(64);
  const sealed = dpapi.protect(keyMaterial); writeFileSync(wrappedKeyPath, sealed, { flag: "wx", mode: 0o600 });
  sealed.fill(0); keyMaterial.fill(0); keyMaterial = null;
  const unsealCipher = () => {
    const raw = dpapi.unprotect(readFileSync(wrappedKeyPath));
    if (raw.length !== 64) { raw.fill(0); throw coded("protected-key-shape-invalid"); }
    const cipher = createEnvelopeCipher({ encryptionKey: raw.subarray(0, 32), hmacKey: raw.subarray(32),
      keyId: "gate4b-protected-rehearsal-20260821" });
    raw.fill(0); return cipher;
  };

  run(initdb, ["-D", pgData, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"],
    "protected-postgres-init-failed", rehearsalRoot);
  const start = () => { run(pgCtl, ["-D", pgData, "-l", pgLog, "-o", `-h 127.0.0.1 -p ${PORT}`, "start", "-w"],
    "protected-postgres-start-failed", rehearsalRoot); postgresRunning = true; };
  const stop = () => { run(pgCtl, ["-D", pgData, "stop", "-m", "fast", "-w"],
    "protected-postgres-stop-failed", rehearsalRoot); postgresRunning = false; };
  start(); const connectionString = `postgresql://postgres@127.0.0.1:${PORT}/postgres`;
  let cipher = unsealCipher(); store = new PostgresGate4bStore({ connectionString }); await store.initialize({ reset: true });
  let service = new Gate4bMigrationService({ store, cipher });

  let beforeCommitCode = null;
  try { await service.migrate(sourceRead.snapshot, { runId: "gate4b-before-commit", failBeforeCommit: true }); }
  catch (error) { beforeCommitCode = error.code; }
  const afterFailed = await store.auditState(sourceRead.snapshot.participantId);
  if (beforeCommitCode !== "migration-simulated-before-commit" || afterFailed.entries !== 0 || afterFailed.indexes !== 0
      || afterFailed.runs !== 0 || afterFailed.items !== 0) throw coded("protected-before-commit-not-atomic");

  const runId = "gate4b-protected-rehearsal-20260821";
  const concurrent = await Promise.all([service.migrate(sourceRead.snapshot, { runId }), service.migrate(sourceRead.snapshot, { runId })]);
  if (concurrent.filter(item => item.replayed).length !== 1) throw coded("protected-concurrent-replay-mismatch");
  const committed = concurrent.find(item => !item.replayed);
  const changed = structuredClone(sourceRead.snapshot); changed.sourceSnapshotId = `${changed.sourceSnapshotId}:changed`;
  let changedCode = null;
  try { await service.migrate(changed, { runId }); } catch (error) { changedCode = error.code; }
  if (changedCode !== "migration-run-conflict") throw coded("protected-changed-replay-not-refused");

  await store.close(); store = null; stop(); cipher = unsealCipher(); start();
  store = new PostgresGate4bStore({ connectionString }); service = new Gate4bMigrationService({ store, cipher });
  const replay = await service.migrate(sourceRead.snapshot, { runId });
  if (!replay.replayed || replay.manifestHmac !== committed.manifestHmac) throw coded("protected-restart-replay-mismatch");

  const rows = await store.readRawRecords(sourceRead.snapshot.participantId);
  if (rows.length !== sourceRead.snapshot.entries.length) throw coded("protected-roundtrip-count-mismatch");
  const targetEntries = rows.map((row, index) => {
    if (row.sequence !== index + 1 || row.entry_kind !== sourceRead.snapshot.entries[index].kind) throw coded("protected-roundtrip-order-mismatch");
    return cipher.decrypt({ recordType: "learning-journal-entry", participantId: row.participant_id,
      recordId: row.target_id, field: "legacy-entry" }, row.private_envelope);
  });
  const sourceLogical = sha256(canonicalJson(sourceRead.snapshot.entries)); const targetLogical = sha256(canonicalJson(targetEntries));
  if (sourceLogical !== targetLogical) throw coded("protected-logical-digest-mismatch");
  const audit = await store.auditState(sourceRead.snapshot.participantId);
  if (audit.entries !== 90 || audit.indexes !== 90 || audit.runs !== 1 || audit.items !== 90
      || audit.current_manifest_hmac !== committed.manifestHmac) throw coded("protected-target-count-mismatch");
  const indexes = await store.readRawIndexes(sourceRead.snapshot.participantId);
  const schema = (await store.pool.query(`SELECT
    NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='runa_learning' AND
      column_name IN ('payload','lesson','statement','evidence','rationale','private_json','public_json')) no_plaintext_columns,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='runa_learning' AND
      ((table_name='journal_entries' AND column_name IN ('participant_id','sequence','private_envelope')) OR
       (table_name='journal_index' AND column_name IN ('participant_id','sequence','reference_hmac')))) = 6 required_columns`)).rows[0];
  const hmacShape = (await store.pool.query(`SELECT bool_and(value ~ '^[a-f0-9]{64}$') ok FROM (
    SELECT envelope_hmac value FROM runa_learning.journal_entries UNION ALL
    SELECT reference_hmac FROM runa_learning.journal_index) x`)).rows[0].ok;
  const privateValues = privateLearningValuesForScan(sourceRead.snapshot);
  const postgresLog = existsSync(pgLog) ? readFileSync(pgLog, "utf8") : "";
  assertPrivateLearningValuesAbsent(privateValues, [JSON.stringify(indexes), postgresLog]);
  if (!schema.no_plaintext_columns || !schema.required_columns || !hmacShape) throw coded("protected-database-shape-invalid");

  const finalSource = await readProtectedE6Snapshot({ legacyRepo, expectedCommit: expectedLegacyCommit });
  const backupAfter = verifyScopedE6Backup({ legacyRepo, backupRoot, original: backup });
  const boundaryAfter = protectedLearningBoundaryManifest(legacyRepo);
  if (canonicalJson(boundaryBefore) !== canonicalJson(boundaryAfter)
      || finalSource.aggregate.sourceManifest !== sourceRead.aggregate.sourceManifest) throw coded("protected-source-changed");

  await store.dropGate4bSchemas();
  const removed = (await store.pool.query(`SELECT to_regnamespace('runa_learning') IS NULL learning_removed,
    to_regnamespace('runa_learning_migration') IS NULL migration_removed`)).rows[0];
  if (!removed.learning_removed || !removed.migration_removed) throw coded("protected-target-rollback-failed");
  await store.close(); store = null; stop();
  rmSync(backupRoot, { recursive: true, force: true }); rmSync(pgData, { recursive: true, force: true });
  rmSync(pgLog, { force: true }); rmSync(wrappedKeyPath, { force: true });
  if ([backupRoot, pgData, pgLog, wrappedKeyPath].some(existsSync)) throw coded("protected-target-cleanup-failed");

  report = { schemaVersion: "runa2-gate4b-protected-rehearsal/v1", sourceCommit: expectedLegacyCommit,
    targetCommit: expectedNextCommit, scope: { migrated: "E6-complete-journal", entries: 90,
      e3: "untouched", e4: "untouched", e5: "absent-not-migrated", deviceVault: "untouched" },
    counts: { entries: audit.entries, indexes: audit.indexes, runs: audit.runs, items: audit.items, byKind: expectedKinds },
    backup: { fileCount: backup.fileCount, bytes: backup.bytes, manifestSha256: backupAfter.manifestSha256,
      verified: backupAfter.unchanged, learningCenterCredentialCopied: false, deviceVaultCopied: false },
    digests: { sourceLogical, targetLogical, targetManifestHmac: committed.manifestHmac },
    authority: { ownerIdentityVerified: authority.ownerIdentityVerified, sourcePinsVerified: authority.sourcePinsVerified,
      clean: authority.clean, verifiedPackageFiles: packageAuthority.verifiedFiles, packageSha256: packageAuthority.packageSha256 },
    runtime: { node: process.version, postgres: postgresVersion(postgres), dependencies: dependencyVersions,
      networking: "loopback-only", host: "RUNA-CONTROL" },
    checks: { completeE6ExactBefore: true, scopedEncryptedBackupExact: true, beforeCommitAtomic: true,
      concurrentDuplicateOneCommit: true, changedReplayRefused: true, postgresRestarted: true,
      restartReplay: true, exactOrderPreserved: true, exactEncryptedRoundTrip: true,
      logicalDigestsEqual: true, typedEncryptedSchema: true, privateValueScanPassed: true,
      projectionActivated: false, e3Unchanged: true, e4Unchanged: true, e5Absent: true,
      deviceVaultUnchanged: true, sourceExactAfter: true, backupExactAfter: true,
      targetSchemasRemoved: true, postgresStopped: true, targetDataDeleted: true,
      wrappedKeyDeleted: true, backupDeleted: true }, disallowedFieldsEmitted: false, passed: true };
} catch (error) {
  safeErrorCode = /^[a-z0-9-]{1,100}$/.test(String(error?.code ?? "")) ? error.code : "protected-rehearsal-failed";
} finally {
  keyMaterial?.fill(0); await store?.close().catch(() => {});
  if (postgresRunning && cleanup?.pgCtl && existsSync(cleanup.pgCtl) && existsSync(cleanup.pgData)) {
    spawnSync(cleanup.pgCtl, ["-D", cleanup.pgData, "stop", "-m", "fast", "-w"], { stdio: "ignore", windowsHide: true, timeout: 60_000 });
  }
}
if (report) process.stdout.write(`${JSON.stringify(report)}\n`);
else { process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate4b-protected-rehearsal/v1",
  errorCode: safeErrorCode ?? "protected-rehearsal-failed", disallowedFieldsEmitted: false, passed: false })}\n`); process.exitCode = 1; }
