import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical.mjs";
import { createEnvelopeCipher } from "./envelope.mjs";
import { createGate4aDpapiProtector } from "./dpapi.mjs";
import { readLegacyProjectChatDomain } from "./inventory.mjs";
import { Gate4aMigrationService, Gate4aProjectChatRepository } from "./migration.mjs";
import { PostgresGate4aStore } from "./adapters/postgres.mjs";
import { assertApprovedProtectedSnapshot, assertPrivateValuesAbsent,
  createScopedEncryptedBackup, expectedTargetProjection, logicalProjectionDigest,
  privateValuesForScan, verifyScopedEncryptedBackup } from "./protected-rehearsal.mjs";

const APPROVED_ROOT = resolve("C:\\AI\\RunaAI-Gate4A-Protected-Rehearsal");
const EXPECTED_MANIFEST = "40d395b8b70641df4d862b73b1e20832b63fd71b684d99f5a2a3e032417cbdc2";
const PORT = 9693;
const PACKAGE_FILES = [
  "SOURCE-PINS.json", "canonical.mjs", "contracts.mjs", "dpapi.mjs", "envelope.mjs", "formats.mjs",
  "inventory.mjs", "migration.mjs", "protected-rehearsal.mjs", "run-protected-rehearsal.mjs",
  "runa-gate4a-windows-dpapi.ps1", "adapters/postgres.mjs",
];
const coded = code => Object.assign(new Error("The protected rehearsal failed closed."), { code });

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw coded("protected-argument-missing");
  return process.argv[index + 1];
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true,
    timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function assertNextAuthority(nextRepo, expectedCommit) {
  const commit = git(nextRepo, ["rev-parse", "HEAD"]);
  const upstream = git(nextRepo, ["rev-parse", "@{upstream}"]);
  const branch = git(nextRepo, ["branch", "--show-current"]);
  const tracked = git(nextRepo, ["status", "--porcelain", "--untracked-files=no"]);
  if (commit !== expectedCommit || upstream !== expectedCommit ||
      branch !== "runa2/gate-4a-project-chat-plan" || tracked) throw coded("protected-next-authority-mismatch");
  return { commit, branch };
}

function assertPackageMatches(nextRepo) {
  const packageGate4 = resolve(import.meta.dirname);
  const rows = [];
  for (const name of PACKAGE_FILES) {
    const packaged = resolve(packageGate4, name);
    const reviewed = resolve(nextRepo, "gate4", name);
    if (!existsSync(packaged) || !existsSync(reviewed) ||
        relative(packageGate4, packaged).startsWith("..") ||
        !readFileSync(packaged).equals(readFileSync(reviewed))) throw coded("protected-package-source-mismatch");
    rows.push({ name, sha256: sha256(readFileSync(packaged)) });
  }
  return { verifiedFiles: rows.length, packageSha256: sha256(canonicalJson(rows)) };
}

function assertDependencyVersions(packageRoot) {
  const read = name => JSON.parse(readFileSync(join(packageRoot, "node_modules", name, "package.json"), "utf8")).version;
  const versions = { pg: read("pg"), zod: read("zod") };
  if (versions.pg !== "8.23.0" || versions.zod !== "4.4.3") throw coded("protected-dependency-version-mismatch");
  return versions;
}

function run(executable, args, code, cwd = undefined) {
  const result = spawnSync(executable, args, { cwd, stdio: "ignore", windowsHide: true, timeout: 60_000 });
  if (result.status !== 0) throw coded(code);
}

async function assertPortAvailable() {
  await new Promise((accept, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => reject(coded("protected-postgres-port-unavailable")));
    server.listen({ host: "127.0.0.1", port: PORT, exclusive: true }, () => server.close(accept));
  });
}

function expectedChat(chat) {
  return {
    chatId: chat.catalog.chatId, projectId: chat.catalog.projectId,
    parentChatId: chat.catalog.parentChatId, branchFromTurn: chat.catalog.branchFromTurn,
    turnCount: chat.catalog.turnCount, archived: chat.catalog.archived, unread: chat.catalog.unread,
    createdAt: chat.catalog.createdAt, updatedAt: chat.catalog.updatedAt, title: chat.catalog.title,
    turns: chat.turns.map((turn, turnOrdinal) => ({ chatId: chat.catalog.chatId, turnOrdinal,
      occurredAt: turn.at, route: turn.route, originRequestId: null,
      user: turn.user, assistant: turn.assistant })),
  };
}

async function readExactTarget(repository, snapshot) {
  const projection = [];
  for (const chat of [...snapshot.chats].sort((a, b) => a.catalog.chatId.localeCompare(b.catalog.chatId))) {
    const target = await repository.readChat(snapshot.participantId, null, chat.catalog.chatId);
    if (canonicalJson(target) !== canonicalJson(expectedChat(chat))) throw coded("protected-roundtrip-mismatch");
    projection.push(target);
  }
  return projection;
}

let store = null;
let postgresRunning = false;
let keyMaterial = null;
let report = null;
let safeErrorCode = null;
try {
  const legacyRepo = resolve(argument("--legacy-repo"));
  const nextRepo = resolve(argument("--next-repo"));
  const expectedLegacyCommit = argument("--expected-legacy-commit");
  const expectedNextCommit = argument("--expected-next-commit");
  const rehearsalRoot = resolve(argument("--rehearsal-root"));
  if (rehearsalRoot !== APPROVED_ROOT || !existsSync(rehearsalRoot)) throw coded("protected-rehearsal-root-invalid");
  const packageRoot = resolve(import.meta.dirname, "..");
  const postgresRoot = resolve(rehearsalRoot, "tools", "pgsql");
  const pgBin = resolve(postgresRoot, "bin");
  const pgData = resolve(rehearsalRoot, "postgres-data");
  const pgLog = resolve(rehearsalRoot, "postgres.log");
  const backupRoot = resolve(rehearsalRoot, "backup");
  const wrappedKeyPath = resolve(rehearsalRoot, "target-keys.dpapi");
  for (const target of [postgresRoot, pgData, pgLog, backupRoot, wrappedKeyPath]) {
    if (!target.startsWith(`${rehearsalRoot}\\`)) throw coded("protected-rehearsal-root-invalid");
  }
  const initdb = join(pgBin, "initdb.exe");
  const pgCtl = join(pgBin, "pg_ctl.exe");
  if (!existsSync(initdb) || !existsSync(pgCtl)) throw coded("protected-postgres-runtime-missing");
  if (existsSync(pgData) || existsSync(pgLog) || existsSync(backupRoot) || existsSync(wrappedKeyPath)) {
    throw coded("protected-rehearsal-residue-present");
  }

  const nextAuthority = assertNextAuthority(nextRepo, expectedNextCommit);
  const packageAuthority = assertPackageMatches(nextRepo);
  const dependencyVersions = assertDependencyVersions(packageRoot);
  await assertPortAvailable();
  const backup = createScopedEncryptedBackup({ legacyRepo, backupRoot, expectedChatFiles: 26 });

  const dpapi = createGate4aDpapiProtector();
  keyMaterial = randomBytes(64);
  const sealed = dpapi.protect(keyMaterial);
  writeFileSync(wrappedKeyPath, sealed, { flag: "wx", mode: 0o600 });
  sealed.fill(0);
  keyMaterial.fill(0); keyMaterial = null;

  const sourcePinsPath = resolve(import.meta.dirname, "SOURCE-PINS.json");
  const sourceRead = await readLegacyProjectChatDomain({ legacyRepo, expectedCommit: expectedLegacyCommit, sourcePinsPath });
  const approved = assertApprovedProtectedSnapshot({ snapshot: sourceRead.snapshot,
    diagnostics: sourceRead.diagnostics, expectedManifest: EXPECTED_MANIFEST });

  run(initdb, ["-D", pgData, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"],
    "protected-postgres-init-failed", rehearsalRoot);
  const start = () => {
    run(pgCtl, ["-D", pgData, "-l", pgLog, "-o", `-h 127.0.0.1 -p ${PORT}`, "start", "-w"],
      "protected-postgres-start-failed", rehearsalRoot); postgresRunning = true;
  };
  const stop = () => {
    run(pgCtl, ["-D", pgData, "stop", "-m", "fast", "-w"], "protected-postgres-stop-failed", rehearsalRoot);
    postgresRunning = false;
  };
  start();
  const connectionString = `postgresql://postgres@127.0.0.1:${PORT}/postgres`;

  const unsealCipher = (onDecrypt = null) => {
    const raw = dpapi.unprotect(readFileSync(wrappedKeyPath));
    if (raw.length !== 64) { raw.fill(0); throw coded("protected-key-shape-invalid"); }
    const cipher = createEnvelopeCipher({ encryptionKey: raw.subarray(0, 32), hmacKey: raw.subarray(32),
      keyId: "gate4a-protected-rehearsal-20260821", onDecrypt });
    raw.fill(0);
    return cipher;
  };

  let cipher = unsealCipher();
  store = new PostgresGate4aStore({ connectionString });
  await store.initialize({ reset: true });
  let service = new Gate4aMigrationService({ store, cipher });

  let beforeCommitCode = null;
  try { await service.migrate(sourceRead.snapshot, { runId: "protected-before-commit",
    mode: "protected-rehearsal", sourceCommit: expectedLegacyCommit,
    targetCommit: expectedNextCommit, failBeforeCommit: true }); }
  catch (error) { beforeCommitCode = error.code; }
  const afterFailedCommit = await store.auditState(sourceRead.snapshot.participantId);
  const beforeCommitAtomic = beforeCommitCode === "migration-simulated-before-commit" &&
    afterFailedCommit.projects === 0 && afterFailedCommit.chats === 0 && afterFailedCommit.turns === 0 &&
    afterFailedCommit.project_memory === 0 && afterFailedCommit.runs === 0 && afterFailedCommit.items === 0;
  if (!beforeCommitAtomic) throw coded("protected-before-commit-not-atomic");

  const runId = "protected-rehearsal-20260821";
  const concurrent = await Promise.all([
    service.migrate(sourceRead.snapshot, { runId, mode: "protected-rehearsal",
      sourceCommit: expectedLegacyCommit, targetCommit: expectedNextCommit }),
    service.migrate(sourceRead.snapshot, { runId, mode: "protected-rehearsal",
      sourceCommit: expectedLegacyCommit, targetCommit: expectedNextCommit }),
  ]);
  if (concurrent.filter(result => result.replayed).length !== 1) throw coded("protected-concurrent-replay-mismatch");
  const committed = concurrent.find(result => !result.replayed);

  const changed = structuredClone(sourceRead.snapshot);
  changed.chats[0].catalog.archived = !changed.chats[0].catalog.archived;
  let changedReplayCode = null;
  try { await service.migrate(changed, { runId, mode: "protected-rehearsal",
    sourceCommit: expectedLegacyCommit, targetCommit: expectedNextCommit }); }
  catch (error) { changedReplayCode = error.code; }
  if (changedReplayCode !== "migration-run-conflict") throw coded("protected-changed-replay-not-refused");

  await store.close(); store = null;
  stop();
  cipher = unsealCipher();
  start();
  store = new PostgresGate4aStore({ connectionString });
  service = new Gate4aMigrationService({ store, cipher });
  const replay = await service.migrate(sourceRead.snapshot, { runId, mode: "protected-rehearsal",
    sourceCommit: expectedLegacyCommit, targetCommit: expectedNextCommit });
  if (!replay.replayed || replay.manifestHmac !== committed.manifestHmac) throw coded("protected-restart-replay-mismatch");

  const repository = new Gate4aProjectChatRepository({ store, cipher });
  const targetProjection = await readExactTarget(repository, sourceRead.snapshot);
  const expectedProjection = expectedTargetProjection(sourceRead.snapshot);
  const sourceLogicalDigest = logicalProjectionDigest(expectedProjection);
  const targetLogicalDigest = logicalProjectionDigest(targetProjection);
  if (sourceLogicalDigest !== targetLogicalDigest) throw coded("protected-logical-digest-mismatch");

  let scopeDecrypts = 0;
  const scopedRepository = new Gate4aProjectChatRepository({ store, cipher: unsealCipher(() => { scopeDecrypts += 1; }) });
  let wrongParticipantCode = null;
  let wrongProjectCode = null;
  try { await scopedRepository.readChat("wrong-participant", null, sourceRead.snapshot.chats[0].catalog.chatId); }
  catch (error) { wrongParticipantCode = error.code; }
  try { await scopedRepository.readChat(sourceRead.snapshot.participantId, "wrong-project", sourceRead.snapshot.chats[0].catalog.chatId); }
  catch (error) { wrongProjectCode = error.code; }
  if (wrongParticipantCode !== "project-chat-scope-denied" || wrongProjectCode !== "project-chat-scope-denied" || scopeDecrypts !== 0) {
    throw coded("protected-scope-denial-failed");
  }

  const audit = await store.auditState(sourceRead.snapshot.participantId);
  if (audit.projects !== 0 || audit.chats !== 25 || audit.turns !== 75 || audit.project_memory !== 0 ||
      audit.runs !== 1 || audit.items !== 100 || audit.tombstones !== 0 ||
      audit.current_manifest_hmac !== committed.manifestHmac) throw coded("protected-target-count-mismatch");

  const privateRows = await store.pool.query(`SELECT title_envelope::text value FROM runa_core.chats
    UNION ALL SELECT content_envelope::text FROM runa_core.chat_turns
    UNION ALL SELECT result_json::text FROM runa_migration.runs
    UNION ALL SELECT verifier_result_json::text FROM runa_migration.runs`);
  const typed = (await store.pool.query(`SELECT
    NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='runa_core' AND
      column_name IN ('title','user_text','assistant_text','content','private_json','public_json')) no_plaintext_columns,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='runa_core' AND
      ((table_name='chats' AND column_name IN ('participant_id','chat_id','title_envelope')) OR
       (table_name='chat_turns' AND column_name IN ('participant_id','chat_id','turn_ordinal','content_envelope')))) = 7 required_columns`)).rows[0];
  const hmacShape = (await store.pool.query(`SELECT bool_and(value ~ '^[a-f0-9]{64}$') ok FROM (
    SELECT title_hmac value FROM runa_core.chats UNION ALL SELECT content_hmac FROM runa_core.chat_turns
    UNION ALL SELECT source_content_hmac FROM runa_migration.items WHERE disposition='upserted') x`)).rows[0].ok;
  const privateValues = privateValuesForScan(sourceRead.snapshot, 8);
  const postgresLog = existsSync(pgLog) ? readFileSync(pgLog, "utf8") : "";
  assertPrivateValuesAbsent(privateValues, [privateRows.rows.map(row => row.value).join("\n"), postgresLog]);
  if (!typed.no_plaintext_columns || !typed.required_columns || !hmacShape) throw coded("protected-database-shape-invalid");

  const finalRead = await readLegacyProjectChatDomain({ legacyRepo, expectedCommit: expectedLegacyCommit, sourcePinsPath });
  const finalApproved = assertApprovedProtectedSnapshot({ snapshot: finalRead.snapshot,
    diagnostics: finalRead.diagnostics, expectedManifest: EXPECTED_MANIFEST });
  const backupAfter = verifyScopedEncryptedBackup({ legacyRepo, backupRoot, original: backup });

  await store.dropGate4aSchemas();
  const removed = (await store.pool.query(`SELECT to_regnamespace('runa_core') IS NULL core_removed,
    to_regnamespace('runa_migration') IS NULL migration_removed`)).rows[0];
  if (!removed.core_removed || !removed.migration_removed) throw coded("protected-target-rollback-failed");
  await store.close(); store = null;
  stop();
  rmSync(pgData, { recursive: true, force: true });
  rmSync(pgLog, { force: true });
  rmSync(wrappedKeyPath, { force: true });
  if (existsSync(pgData) || existsSync(pgLog) || existsSync(wrappedKeyPath)) throw coded("protected-target-cleanup-failed");

  report = {
    schemaVersion: "runa2-gate4a-protected-rehearsal/v1",
    sourceCommit: expectedLegacyCommit, targetCommit: nextAuthority.commit,
    sourceInventoryManifest: approved.inventory.digests.domainManifest,
    finalSourceInventoryManifest: finalApproved.inventory.digests.domainManifest,
    backup: { fileCount: backup.fileCount, bytes: backup.bytes,
      manifestSha256: backupAfter.manifestSha256, verified: backupAfter.unchanged, legacyKeyCopied: false },
    counts: { projects: audit.projects, chats: audit.chats, turns: audit.turns,
      projectMemory: audit.project_memory, runs: audit.runs, items: audit.items, tombstones: audit.tombstones },
    routes: approved.inventory.turnsByRoute,
    digests: { sourceLogical: sourceLogicalDigest, targetLogical: targetLogicalDigest,
      targetManifestHmac: committed.manifestHmac },
    authority: { verifiedSourcePins: sourceRead.authority.verifiedSourcePins,
      sourcePinsSha256: sourceRead.authority.sourcePinsSha256,
      verifiedPackageFiles: packageAuthority.verifiedFiles, packageSha256: packageAuthority.packageSha256 },
    runtime: { node: process.version, postgres: "18.6", dependencies: dependencyVersions,
      networking: "loopback-only", host: "RUNA-CONTROL" },
    checks: { sourceExactBefore: true, scopedBackupExact: true, beforeCommitAtomic,
      concurrentDuplicateOneCommit: true, changedReplayRefused: true, postgresRestarted: true,
      dpapiKeyRecovery: true, restartReplay: true, exactRoundTrip: true, logicalDigestsEqual: true,
      participantAndProjectScopeDeniedBeforeDecrypt: true, typedEncryptedSchema: true,
      privateValueScanPassed: true, sourceExactAfter: true, backupExactAfter: true,
      targetSchemasRemoved: true, postgresStopped: true, targetDataDeleted: true,
      wrappedKeyDeleted: true, backupReadyForCleanup: true },
    disallowedFieldsEmitted: false,
    passed: true,
  };
} catch (error) {
  safeErrorCode = /^[a-z0-9-]{1,100}$/.test(String(error?.code ?? "")) ? error.code : "protected-rehearsal-failed";
} finally {
  if (keyMaterial) keyMaterial.fill(0);
  await store?.close().catch(() => {});
  if (postgresRunning) {
    const root = process.argv.includes("--rehearsal-root") ? resolve(argument("--rehearsal-root")) : null;
    const pgCtl = root ? resolve(root, "tools", "pgsql", "bin", "pg_ctl.exe") : null;
    const pgData = root ? resolve(root, "postgres-data") : null;
    if (pgCtl && pgData && existsSync(pgCtl) && existsSync(pgData)) {
      spawnSync(pgCtl, ["-D", pgData, "stop", "-m", "fast", "-w"], { stdio: "ignore", windowsHide: true, timeout: 60_000 });
    }
  }
}

if (report) process.stdout.write(`${JSON.stringify(report)}\n`);
else {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate4a-protected-rehearsal/v1",
    errorCode: safeErrorCode ?? "protected-rehearsal-failed", disallowedFieldsEmitted: false, passed: false })}\n`);
  process.exitCode = 1;
}
