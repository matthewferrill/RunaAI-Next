import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import pg from "pg";
import { browserKeyThumbprint, browserProofInput, LOCAL_CONTEXT_SCHEMAS, localSha256 }
  from "./local-context-contract.mjs";
import { LocalContextControlService, PostgresLocalContextStore, signDeviceMessage }
  from "./local-context-control.mjs";

const exportedPublicKey = key => key.export({ format: "der", type: "spki" }).toString("base64url");

export async function runLocalContextPostgresProof({ pgBin } = {}) {
  if (!pgBin) throw new Error("local-context-pg-tool-path-required");
  for (const file of ["initdb.exe", "pg_ctl.exe"]) if (!existsSync(join(pgBin, file))) {
    throw new Error("local-context-pg-tool-missing");
  }
  const root = await mkdtemp(join(tmpdir(), "runa-m1-local-context-pg-"));
  const exactRoot = await realpath(root), data = join(root, "data"), log = join(root, "postgres.log");
  const listener = createServer();
  await new Promise((done, fail) => { listener.once("error", fail); listener.listen(0, "127.0.0.1", done); });
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  const command = (file, args, stage) => {
    const result = spawnSync(join(pgBin, file), args, { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    if (result.status !== 0) throw Object.assign(new Error("local-context-pg-command-failed"), {
      code: "local-context-pg-command-failed", stage, command: file, exitStatus: result.status,
      signal: result.signal ?? null, stderr: String(result.stderr ?? "").slice(-2000),
      stdout: String(result.stdout ?? "").slice(-2000),
    });
  };
  const start = stage => command("pg_ctl.exe", ["-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "start", "-w"], stage);
  const stop = stage => command("pg_ctl.exe", ["-D", data, "stop", "-m", "fast", "-w"], stage);
  let running = false, pool, store;
  const checks = {};
  let failure;
  let clock = new Date("2026-09-02T15:00:00.000Z");
  const issuer = generateKeyPairSync("ed25519"), device = generateKeyPairSync("ed25519"),
    browser = generateKeyPairSync("ed25519");
  const browserPublicKey = exportedPublicKey(browser.publicKey), devicePublicKey = exportedPublicKey(device.publicKey);
  const bootEpoch = "a".repeat(64), participantId = "participant-1", projectId = "project-1", deviceId = "omen-1";
  const open = () => {
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
      connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    pool.on("error", () => {});
    store = new PostgresLocalContextStore({ pool, now: () => clock });
  };
  const enable = async (connectionId, rootId) => {
    await store.createConnection({ participantId, projectId, connectionId, deviceId, rootId,
      safeLabel: connectionId, allowedOperations: ["tree", "text-read", "connection-test"] });
    for (const [expected, next] of [["known", "configured"], ["configured", "connected"],
      ["connected", "tested"], ["tested", "enabled"]]) {
      await store.transition({ participantId, connectionId, expected, next });
    }
  };
  const makeService = () => new LocalContextControlService({ store, issuerPrivateKey: issuer.privateKey,
    issuerPublicKey: issuer.publicKey, now: () => clock });
  const makeRequest = ({ issued, connectionId, rootId, operation = "text-read", args = { path: "notes.txt" },
    requestId = `request-${randomBytes(4).toString("hex")}` }) => {
    const request = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.request, requestId, connectionId, rootId,
      operation, arguments: args, controlCapability: issued.token,
      companionNonce: randomBytes(32).toString("base64url"), bootEpoch, browserPublicKey,
      browserKeyThumbprint: browserKeyThumbprint(browserPublicKey), browserProof: "pending" };
    request.browserProof = sign(null, Buffer.from(browserProofInput(request)), browser.privateKey).toString("base64url");
    return request;
  };
  const redeem = async ({ service, request }) => {
    const signedInput = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.redemption,
      capabilityId: issuedCapabilityId(request.controlCapability), requestId: request.requestId,
      argumentDigest: localSha256(request.arguments),
      bootEpoch: request.bootEpoch, browserKeyThumbprint: request.browserKeyThumbprint,
      startedAt: clock.toISOString() };
    return service.redeem({ request, startedAt: clock.toISOString(),
      deviceSignature: signDeviceMessage(signedInput, device.privateKey) });
  };
  const issuedCapabilityId = token => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).capabilityId;
  try {
    command("initdb.exe", ["-D", data, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"], "initialize-disposable-database");
    start("start-disposable-database"); running = true; open(); await store.initialize();
    await store.enrollDevice({ participantId, deviceId, publicKey: devicePublicKey,
      releaseDigest: "b".repeat(64), bootEpoch });
    await store.registerBrowser({ participantId, deviceId, browserPublicKey });
    await enable("connection-1", "root-1");
    const service = makeService();
    const issued = await service.issue({ participantId, projectId, connectionId: "connection-1", deviceId,
      rootId: "root-1", bootEpoch, browserPublicKey, operation: "text-read", arguments: { path: "notes.txt" } });
    const request = makeRequest({ issued, connectionId: "connection-1", rootId: "root-1" });
    const redemption = await redeem({ service, request });
    checks.authorizedIssueAndAtomicRedeem = redemption.status === "redeemed";
    await assert.rejects(redeem({ service, request }), error => ["local-redemption-denied", "local-redemption-replay"].includes(error.code));
    checks.replayDenied = true;
    const revoking = await store.revoke({ participantId, connectionId: "connection-1", localReachable: false });
    checks.inFlightRevocationDrains = revoking.lifecycle === "revoking" && revoking.cleanupState === "pending";
    const startedAt = clock.toISOString();
    clock = new Date(clock.getTime() + 1_000);
    const completionInput = { participantId, connectionId: "connection-1", redemptionId: redemption.redemptionId,
      deviceId, bootEpoch, outcomeCode: "ok", argumentDigest: localSha256(request.arguments),
      resultDigest: "c".repeat(64), startedAt, completedAt: clock.toISOString() };
    const signedCompletion = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.completion,
      redemptionId: completionInput.redemptionId, participantId, connectionId: "connection-1", deviceId,
      bootEpoch, outcomeCode: "ok", argumentDigest: completionInput.argumentDigest, resultDigest: completionInput.resultDigest,
      startedAt, completedAt: completionInput.completedAt };
    const completed = await service.complete({ ...completionInput,
      deviceSignature: signDeviceMessage(signedCompletion, device.privateKey) });
    const duplicate = await service.complete({ ...completionInput,
      deviceSignature: signDeviceMessage(signedCompletion, device.privateKey) });
    const afterDrain = (await store.listConnections(participantId, projectId))[0];
    checks.completionIsIdempotentAndFinishesRevoke = completed.status === "completion-accepted"
      && duplicate.status === "completion-already-finalized" && afterDrain.lifecycle === "revoked";
    await assert.rejects(service.issue({ participantId, projectId, connectionId: "connection-1", deviceId,
      rootId: "root-1", bootEpoch, browserPublicKey, operation: "text-read", arguments: { path: "notes.txt" } }),
    { code: "local-capability-authorization-denied" });
    checks.revokedCannotIssue = true;

    await enable("connection-2", "root-2");
    const issued2 = await service.issue({ participantId, projectId, connectionId: "connection-2", deviceId,
      rootId: "root-2", bootEpoch, browserPublicKey, operation: "text-read", arguments: { path: "notes.txt" } });
    const request2 = makeRequest({ issued: issued2, connectionId: "connection-2", rootId: "root-2" });
    await store.revoke({ participantId, connectionId: "connection-2", localReachable: true });
    await assert.rejects(redeem({ service, request: request2 }), { code: "local-redemption-denied" });
    checks.revokeBeforeRedeemWins = true;

    await enable("connection-3", "root-3");
    const issued3 = await service.issue({ participantId, projectId, connectionId: "connection-3", deviceId,
      rootId: "root-3", bootEpoch, browserPublicKey, operation: "text-read", arguments: { path: "notes.txt" } });
    const request3 = makeRequest({ issued: issued3, connectionId: "connection-3", rootId: "root-3" });
    await redeem({ service, request: request3 });
    await store.revoke({ participantId, connectionId: "connection-3", localReachable: false });
    clock = new Date(clock.getTime() + 26_001);
    checks.expiredInFlightAbandoned = await store.abandonExpired(clock) === 1
      && (await store.listConnections(participantId, projectId)).find(item => item.connectionId === "connection-3").lifecycle === "revoked";

    await pool.end(); pool = null; stop("restart-stop"); running = false;
    start("restart-start"); running = true; open(); await store.initialize();
    const retained = await store.listConnections(participantId, projectId);
    checks.restartRetainsLifecycleAndNonceHistory = retained.length === 3
      && retained.every(item => item.lifecycle === "revoked")
      && Number((await pool.query("SELECT count(*) count FROM runa_local.capabilities")).rows[0].count) === 3;
  } catch (error) { failure = error; }
  finally {
    if (pool) await pool.end().catch(() => {});
    if (running) {
      try { stop("cleanup-stop"); running = false; }
      catch (cleanupError) { if (!failure) failure = cleanupError; }
    }
    if (failure && existsSync(log)) failure.postgresLog = String(await readFile(log, "utf8").catch(() => "")).slice(-4000);
    if (resolve(root) !== resolve(exactRoot) || !resolve(root).startsWith(resolve(tmpdir()) + sep)
        || !root.includes("runa-m1-local-context-pg-")) throw new Error("local-context-cleanup-root-invalid");
    await rm(root, { recursive: true, force: true });
    checks.ownedDatabaseStoppedAndRemoved = !running && !existsSync(root);
  }
  if (failure) throw failure;
  return { schemaVersion: "runaai-m1-local-context-postgres-proof/v1",
    passed: Object.values(checks).every(Boolean), checks, privateValuesIncluded: false,
    productionChanged: false, modelCalled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const index = process.argv.indexOf("--pg-bin");
  runLocalContextPostgresProof({ pgBin: index < 0 ? undefined : resolve(process.argv[index + 1]) })
    .then(result => { process.stdout.write(`${JSON.stringify(result)}\n`); if (!result.passed) process.exitCode = 1; },
      error => { process.stderr.write(`${JSON.stringify({ schemaVersion: "runaai-m1-local-context-postgres-error/v1",
        errorCode: error?.code ?? "local-context-pg-proof-failed", stage: error?.stage ?? "application-proof",
        command: error?.command ?? null, exitStatus: error?.exitStatus ?? null, signal: error?.signal ?? null,
        stderr: error?.stderr ?? null, stdout: error?.stdout ?? null, postgresLog: error?.postgresLog ?? null,
        privateValuesIncluded: false })}\n`); process.exitCode = 1; });
}
