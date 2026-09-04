import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { canonicalJson } from "../../gate4/canonical.mjs";
import { buildReleaseManifest } from "../../gate6/release.mjs";
import { ARTIFACT_FILE, buildArtifactManifest } from "../../gate6b/artifact.mjs";
import { createProductionComposition } from "../../gate6b/composition.mjs";
import { loadReleaseConfig } from "../../gate6b/release-config.mjs";
import { releaseModelIdentity } from "../../gate6b/model-role-providers.mjs";
import { stageSandboxRuntime } from "../../gate6b/sandbox-runtime.mjs";
import { CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION } from "./tasks/contracts.mjs";
import { startSyntheticPostgres } from "./synthetic-postgres.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const artifactParent = path.join(repositoryRoot, "artifacts/runs/native-gate3-production-resource-ownership");
const localModules = path.join(repositoryRoot, "node_modules");
const dependencyRoot = "D:/Projects/Runalab/runaai-next-m1-gemma-primary/node_modules";
const nodeExecutable = "C:/Program Files/nodejs/node.exe";
const toolRoot = "D:/Projects/Runalab/artifacts/tools";
const expectedNodeSha256 = "bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb";
const fixedFilePins = new Map([
  [path.join(repositoryRoot, "package-lock.json"), "cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308"],
  [path.join(dependencyRoot, "pg/package.json"), "e42dd36cba6e9dd8dbb6f773a2f7be8a8c3c273e18b155e42e75961a4cb8bc28"],
  [path.join(dependencyRoot, "zod/package.json"), "c630bd10b52dcf71c112a2bf78dbf2734b9db58d62de663b8d86c2ec2c8cda2e"],
  [path.join(toolRoot, "postgresql/bin/pgsql/bin/postgres.exe"), "af5b897cb69c9ce692a4a15ecd022b540db85db1add0f66d2b9f0697be2451a0"],
  [path.join(toolRoot, "postgresql/bin/pgsql/bin/initdb.exe"), "68195f0c6f22694660ba86d914ae8c74bcd38e71eb342f98e065b1962311142e"],
  [path.join(toolRoot, "postgresql/bin/pgsql/bin/pg_ctl.exe"), "552049183df455921657c8e498e9745e8508bf77d2c2e5cb9c21b2cbdc798822"],
  [path.join(toolRoot, "postgresql/bin/pgsql/bin/pg_isready.exe"), "2eb622a9f68f239ff9555c4c47291527a6c01c1d22bf912fb0a3228879e2814e"],
]);
const syntheticPostgresBounds = Object.freeze({ statementTimeoutMs: 30_000, lockTimeoutMs: 5_000,
  idleInTransactionSessionTimeoutMs: 30_000, processExitTimeoutMs: 30_000, includeProcessEvidence: true });

const sha256File = async file => createHash("sha256").update(await readFile(file)).digest("hex");

async function reserveThenReleaseLoopbackPort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, port = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(port);
    };
    const timer = setTimeout(() => {
      const error = new Error("resource-ownership-qdrant-port-timeout");
      if (server.listening) server.close(() => finish(error)); else finish(error);
    }, 5_000);
    server.once("error", error => finish(error));
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string" || !Number.isSafeInteger(address.port)) {
        server.close(() => finish(new Error("resource-ownership-qdrant-port-invalid")));
        return;
      }
      server.close(error => finish(error, address.port));
    });
  });
}

async function assertLoopbackPortRefused(port) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("resource-ownership-qdrant-refusal-probe-timeout"));
    }, 2_000);
    socket.once("connect", () => {
      clearTimeout(timer); socket.destroy(); reject(new Error("resource-ownership-qdrant-port-became-served"));
    });
    socket.once("error", error => {
      clearTimeout(timer); socket.destroy();
      try {
        assert.equal(error.code, "ECONNREFUSED");
        assert.equal(error.syscall, "connect");
        assert.equal(error.address, "127.0.0.1");
        assert.equal(error.port, port);
        resolve();
      } catch (assertionError) { reject(assertionError); }
    });
  });
}

const samePath = (left, right) => path.resolve(left).toUpperCase() === path.resolve(right).toUpperCase();

async function assertFixedToolchain() {
  assert.equal(process.version, "v22.22.0");
  assert.equal(samePath(await realpath(process.execPath), await realpath(nodeExecutable)), true);
  const nodeStat = await lstat(nodeExecutable);
  assert.equal(nodeStat.isFile() && !nodeStat.isSymbolicLink(), true);
  assert.equal(await sha256File(nodeExecutable), expectedNodeSha256);
  const dependencyStat = await lstat(dependencyRoot);
  assert.equal(dependencyStat.isDirectory() && !dependencyStat.isSymbolicLink(), true);
  const localModulesStat = await lstat(localModules);
  assert.equal(localModulesStat.isSymbolicLink(), true);
  assert.equal(samePath(await realpath(localModules), await realpath(dependencyRoot)), true);
  for (const [file, expected] of fixedFilePins) assert.equal(await sha256File(file), expected);
  assert.equal(execFileSync(path.join(toolRoot, "postgresql/bin/pgsql/bin/postgres.exe"), ["--version"],
    { encoding: "utf8", windowsHide: true, timeout: 5_000 }).trim(), "postgres (PostgreSQL) 18.6");
}

async function removeOwnedFixture(root, identity) {
  const parent = await realpath(artifactParent);
  const stat = await lstat(root);
  const resolved = await realpath(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(resolved, root) || !samePath(path.dirname(resolved), parent)
      || !path.basename(resolved).startsWith("fixture-") || stat.dev !== identity.dev || stat.ino !== identity.ino
      || stat.birthtimeMs !== identity.birthtimeMs) {
    throw new Error("resource-ownership-fixture-cleanup-target-invalid");
  }
  await rm(root, { recursive: true, force: false });
}

function releaseConfiguration(qdrantPort) {
  const service = { version: "synthetic-actual", configurationDigest: "a".repeat(64) };
  const provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: "http://127.0.0.1:1234/v1",
    models: { chat: "gemma-4-26b-a4b-it-qat", research: "qwen3.6-27b-mtp",
      code: "qwen3-coder-30b-a3b-instruct", review: "qwen3.6-27b-mtp", agent: "gemma-4-26b-a4b-it-qat" } };
  return {
    schemaVersion: "runa2-gate6b-release-config/v2", profile: "release", mode: "shadow",
    bind: { host: "127.0.0.1", port: 9760 }, publicBaseUrl: "https://runa.bridgebuildersai.com",
    releaseManifestPath: "release.json", sourceGeneration: "legacy-runaai:resource-proof",
    targetGeneration: "runaai-next:resource-proof", cutoverId: "native-gate3-resource-ownership",
    databaseUrlRef: "file:secrets/database-url",
    keyRefs: { coreEncryption: "file:secrets/core-encryption", coreHmac: "file:secrets/core-hmac",
      learningEncryption: "file:secrets/learning-encryption", learningHmac: "file:secrets/learning-hmac",
      telemetryHmac: "file:secrets/telemetry-hmac" },
    keycloak: { issuer: "https://runa.bridgebuildersai.com/auth/realms/runaai-next",
      backchannelIssuer: "http://127.0.0.1:9762/realms/runaai-next", clientId: "runaai-next",
      clientCredentialRef: "file:secrets/keycloak-client" },
    gate6c: { enabled: true, legacyCommit: "b".repeat(40), expectedPrincipalId: "synthetic-owner" },
    gate7a: { enabled: true, canonicalOrigin: "https://runa.bridgebuildersai.com",
      relyingPartyId: "runa.bridgebuildersai.com", predecessorManifestDigest: "c".repeat(64),
      ordinaryClient: { clientId: "runaai-next-user",
        redirectUri: "https://runa.bridgebuildersai.com/session/user/callback",
        clientCredentialRef: "file:secrets/ordinary-client" } },
    openfga: { baseUrl: "http://127.0.0.1:9763", storeId: "synthetic-store", modelId: "synthetic-model",
      credentialRef: "file:secrets/openfga-token" },
    provider, services: { postgresql: service, keycloak: service, openfga: service, caddy: service },
    limits: { maxRequestBytes: 262_144, totalDeadlineMs: 30_000, upstreamDeadlineMs: 10_000 },
    functionFirst: { schemaVersion: "runaai-m1-functions/v1", enabled: true,
      scope: "supplied-text-and-disposable-javascript", capabilitySetVersion: CAPABILITY_SET_VERSION,
      capabilitySetDigest: CAPABILITY_SET_DIGEST,
      requestControls: Object.fromEntries(["chat", "research", "code", "review", "agent"]
        .map(role => [role, { reasoningEffort: null }])),
      qdrant: { endpoint: `http://127.0.0.1:${qdrantPort}`, collection: "m1_resource_ownership" },
      embedding: { baseUrl: "http://127.0.0.1:9770/v1",
        modelId: "text-embedding-nomic-embed-text-v1.5", dimension: 768 },
      reranker: { baseUrl: "http://127.0.0.1:8412", windowCharacters: 2_000,
        overlapCharacters: 300, batchSize: 32 } },
  };
}

test("production composition releases its actual PostgreSQL pool after a pre-transfer M1 failure",
  { timeout: 180_000 }, async t => {
  assert.equal(process.env.RUNAAI_GATE3_RESOURCE_PROOF_METHOD,
    "runaai-native-gate3-resource-ownership-operator/v1");
  await mkdir(artifactParent, { recursive: true });
  const canonicalParent = await realpath(artifactParent);
  const fixtureRoot = await mkdtemp(path.join(canonicalParent, "fixture-"));
  const fixtureStat = await lstat(fixtureRoot);
  const fixtureIdentity = Object.freeze({ dev: fixtureStat.dev, ino: fixtureStat.ino,
    birthtimeMs: fixtureStat.birthtimeMs });
  let database = null;
  let witness = null;
  let earlyComposition = null;
  let lateComposition = null;
  let deniedRoleCreated = false;
  let proofPassed = false;
  t.after(async () => {
    const failures = [];
    for (const owned of [lateComposition, earlyComposition]) {
      if (owned) {
        try { await owned.close(); } catch (error) { failures.push(error); }
      }
    }
    if (witness && deniedRoleCreated) {
      try { await witness.query("DROP ROLE IF EXISTS runa_resource_denied"); deniedRoleCreated = false; }
      catch (error) { failures.push(error); }
    }
    try { await witness?.end(); } catch (error) { failures.push(error); }
    let stopReceipt = null;
    if (database) {
      try {
        stopReceipt = await database.stop();
        assert.deepEqual(stopReceipt, { stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false,
          schemaVersion: "runaai-synthetic-postgres-stop-receipt/v1",
          postgresProcessId: database.postgresProcessId, controlledStopRequested: true,
          terminalExitConfirmed: true, exitCode: 0, signal: null });
        console.log(`RUNAAI_SYNTHETIC_POSTGRES_STOP_RECEIPT ${JSON.stringify(stopReceipt)}`);
      } catch (error) { failures.push(error); }
    }
    if (proofPassed && failures.length === 0) {
      try { await removeOwnedFixture(fixtureRoot, fixtureIdentity); } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "resource-ownership-proof-cleanup-failed");
  });

  await assertFixedToolchain();
  database = await startSyntheticPostgres({
    toolRoot,
    artifactRoot: path.join(fixtureRoot, "postgres"), ...syntheticPostgresBounds,
  });
  const qdrantPort = await reserveThenReleaseLoopbackPort();
  await assertLoopbackPortRefused(qdrantPort);
  const configurationRoot = path.join(fixtureRoot, "configuration");
  const releaseRoot = path.join(fixtureRoot, "release");
  const secretsRoot = path.join(configurationRoot, "secrets");
  await Promise.all([mkdir(secretsRoot, { recursive: true }), mkdir(path.join(releaseRoot, "runtime"), { recursive: true })]);
  await copyFile(nodeExecutable, path.join(releaseRoot, "runtime", "node.exe"));
  await stageSandboxRuntime({ sourceRoot: repositoryRoot, nodeModulesRoot: dependencyRoot, destinationRoot: releaseRoot });
  await writeFile(path.join(releaseRoot, "application.mjs"), "export const resourceOwnershipProof = true;\n", "utf8");

  const deniedConnection = new URL(database.connectionString);
  deniedConnection.username = "runa_resource_denied";
  const secretValues = new Map([
    ["database-url", deniedConnection.toString()], ["core-encryption", Buffer.alloc(32, 1).toString("base64")],
    ["core-hmac", Buffer.alloc(32, 2).toString("base64")],
    ["learning-encryption", Buffer.alloc(32, 3).toString("base64")],
    ["learning-hmac", Buffer.alloc(32, 4).toString("base64")],
    ["telemetry-hmac", Buffer.alloc(32, 5).toString("base64")], ["keycloak-client", "synthetic-client"],
    ["ordinary-client", "synthetic-ordinary-client"], ["openfga-token", "synthetic-openfga-token"],
  ]);
  await Promise.all([...secretValues].map(([name, value]) => writeFile(path.join(secretsRoot, name), value, "utf8")));

  const config = releaseConfiguration(qdrantPort);
  const configPath = path.join(configurationRoot, "candidate.json");
  await writeFile(configPath, canonicalJson(config), "utf8");
  const loadedConfig = await loadReleaseConfig(configPath);
  const artifact = await buildArtifactManifest(releaseRoot);
  await writeFile(path.join(releaseRoot, ARTIFACT_FILE), `${canonicalJson(artifact)}\n`, "utf8");
  const release = buildReleaseManifest({ releaseId: "native-gate3-resource-ownership", commit: "d".repeat(40),
    artifactDigest: artifact.artifactDigest, configurationDigest: loadedConfig.configurationDigest,
    applicationEntryPoint: "gate6b/server.mjs", model: releaseModelIdentity(config.provider),
    services: Object.entries(config.services).map(([name, identity]) => ({ name, ...identity })) },
  { schemaVersion: "runa2-gate6-release/v2" });
  await writeFile(path.join(configurationRoot, "release.json"), canonicalJson(release), "utf8");

  witness = new pg.Client({ connectionString: database.connectionString,
    application_name: "runaai-next-resource-ownership-witness" });
  await witness.connect();
  await witness.query("CREATE ROLE runa_resource_denied LOGIN");
  deniedRoleCreated = true;
  let earlyFailure = null;
  try { earlyComposition = await createProductionComposition({ loadedConfig, releaseRoot }); }
  catch (error) { earlyFailure = error; }
  assert.ok(earlyFailure);
  assert.equal(earlyFailure.code, "42501");
  assert.match(earlyFailure.message, /permission denied for database/);
  assert.equal(Number((await witness.query(`SELECT count(*) AS count FROM pg_stat_activity
    WHERE datname=current_database() AND application_name='runaai-next-candidate'`)).rows[0].count), 0);
  assert.equal((await witness.query("SELECT to_regnamespace('runa_core') AS schema")).rows[0].schema, null);
  await witness.query("DROP ROLE runa_resource_denied");
  deniedRoleCreated = false;
  await writeFile(path.join(secretsRoot, "database-url"), database.connectionString, "utf8");
  await assertLoopbackPortRefused(qdrantPort);

  let observedFailure = null;
  try { lateComposition = await createProductionComposition({ loadedConfig, releaseRoot }); }
  catch (error) { observedFailure = error; }
  assert.ok(observedFailure);
  assert.equal(observedFailure.message, "fetch failed");
  assert.equal(observedFailure.cause?.code, "ECONNREFUSED");
  assert.equal(observedFailure.cause?.syscall, "connect");
  assert.equal(observedFailure.cause?.address, "127.0.0.1");
  assert.equal(observedFailure.cause?.port, qdrantPort);
  const schemas = (await witness.query(`SELECT nspname FROM pg_namespace
    WHERE nspname = ANY($1::text[]) ORDER BY nspname`,
  [["runa_core", "runa_governance", "runa_learning", "runa_learning_migration", "runa_migration",
    "runa_runtime", "runa_workspace"]])).rows.map(row => row.nspname);
  assert.deepEqual(schemas, ["runa_core", "runa_governance", "runa_learning", "runa_learning_migration",
    "runa_migration", "runa_runtime", "runa_workspace"]);
  const activeCandidateSessions = Number((await witness.query(`SELECT count(*) AS count FROM pg_stat_activity
    WHERE datname=current_database() AND application_name='runaai-next-candidate'`)).rows[0].count);
  assert.equal(activeCandidateSessions, 0);
  proofPassed = true;
});
