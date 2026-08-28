import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, realpath, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { stageSandboxRuntime } from "../../../gate6b/sandbox-runtime.mjs";
import { MxcJavascriptExecutor } from "../../../gate7e/mxc-javascript-executor.mjs";
import { assertOwnedStage, fail, QDRANT_PIN } from "./runner-contract.mjs";

const pgBin = "C:\\AI\\RunaAI-Next-Candidate\\tools\\postgresql\\pgsql\\bin";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function fileSha256(file) {
  const digest = createHash("sha256"); for await (const bytes of createReadStream(file)) digest.update(bytes); return digest.digest("hex");
}
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 2_000_000, ...options });
  if (result.status !== 0) throw Object.assign(fail("m1-owned-process-failed"), { diagnostic: {
    executable: path.basename(exe), status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } });
  return result.stdout;
}
async function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
}
async function removeOwned(root, name) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root || !["disposable-postgres", "runtime", "sandbox-runtime", "transient", "q", "data"].includes(name)) throw fail("m1-owned-cleanup-invalid");
  const entry = await lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (!entry) return;
  if (entry.isSymbolicLink() || await realpath(target) !== target) throw fail("m1-owned-cleanup-reparse");
  await rm(target, { recursive: true, force: false });
}

// All writable resources are newly-created beneath this unique, exact owned stage.
// Production binaries/dependencies may be read, but no production connection string,
// store, service, ACL, configuration or model-residency operation is accepted here.
export async function createOwnedControlResources({ root: suppliedRoot, maximumMs = 300000 }) {
  if (process.platform !== "win32" || maximumMs < 1000 || maximumMs > 3600000) throw fail("m1-control-resource-boundary-invalid");
  const root = assertOwnedStage(suppliedRoot);
  if (await realpath(root) !== root || (await lstat(root)).isSymbolicLink()) throw fail("m1-owned-stage-reparse");
  const qdrantExecutable = path.join(root, "tools/qdrant/bin/qdrant.exe");
  if ((await stat(qdrantExecutable)).size !== QDRANT_PIN.bytes || await fileSha256(qdrantExecutable) !== QDRANT_PIN.sha256) throw fail("m1-qdrant-artifact-mismatch");
  const pgData = path.join(root, "disposable-postgres"), nodeDirectory = path.join(root, "runtime"), transient = path.join(root, "transient");
  const nodeExecutable = path.join(nodeDirectory, "node.exe"), qRoot = path.join(root, "q"), dataDirectory = path.join(root, "data");
  let postgresRunning = false, qdrant = null, pool = null, watchdog = null, closed = false;
  const report = { schemaVersion: "runaai-m1-owned-resources/v1", productionChanged: false, protectedDataRead: false,
    qdrantArtifact: QDRANT_PIN, modelResidencyChanged: false, cleanup: null };
  async function close() {
    if (closed) return report.cleanup; closed = true;
    await pool?.end();
    if (qdrant && qdrant.exitCode === null) { const exited = once(qdrant, "exit"); qdrant.kill(); await Promise.race([exited, pause(5000)]);
      if (qdrant.exitCode === null && qdrant.signalCode === null) throw fail("m1-owned-qdrant-stop-unconfirmed"); }
    if (!postgresRunning) postgresRunning = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "status"], { windowsHide: true, stdio: "ignore", timeout: 5000 }).status === 0;
    if (postgresRunning) run(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"], { stdio: "ignore" });
    watchdog?.kill();
    for (const name of ["disposable-postgres", "runtime", "sandbox-runtime", "transient", "q", "data"]) await removeOwned(root, name);
    report.cleanup = { stoppedOwnedPostgres: true, stoppedOwnedQdrant: true, removedOwnedRuntimeAndSyntheticData: true,
      sourceAndEvidenceRetained: true, productionChanged: false };
    return report.cleanup;
  }
  try {
    for (const directory of [nodeDirectory, transient, qRoot, dataDirectory]) await mkdir(directory);
    await copyFile(process.execPath, nodeExecutable);
    const runtimeRoot = await stageSandboxRuntime({ sourceRoot: root, nodeModulesRoot: path.join(root, "node_modules"), destinationRoot: root });
    report.access = JSON.parse(run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
      path.join(root, "gate7f/function-first/tasks/Stage-OwnedNativeAccess.ps1"), "-OwnedRoot", root]).trim());
    report.nodeSha256 = await fileSha256(nodeExecutable);
    const executor = new MxcJavascriptExecutor({ runtimeRoot, runnerPath: path.join(runtimeRoot, "quickjs-child.mjs"), nodeExecutable, temporaryRoot: transient });
    const preflight = await executor.preflight(); report.nativePreflight = preflight;
    if (!preflight.ready) throw fail("m1-native-preflight-unavailable");
    const pgPort = await freePort(), qPort = await freePort(), qGrpcPort = await freePort();
    if (new Set([pgPort, qPort, qGrpcPort]).size !== 3) throw fail("m1-owned-port-race");
    run(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "m1_synthetic", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--no-locale"]);
    run(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", path.join(root, "disposable-postgres.log"), "-o", `-p ${pgPort} -h 127.0.0.1`, "start", "-w"], { stdio: "ignore" }); postgresRunning = true;
    qdrant = spawn(qdrantExecutable, ["--disable-telemetry"], { cwd: qRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
        QDRANT__SERVICE__HOST: "127.0.0.1", QDRANT__SERVICE__HTTP_PORT: String(qPort), QDRANT__SERVICE__GRPC_PORT: String(qGrpcPort),
        QDRANT__STORAGE__STORAGE_PATH: path.join(qRoot, "db"), QDRANT__LOG_LEVEL: "WARN", QDRANT__TELEMETRY_DISABLED: "true" } });
    const logs = []; let bytes = 0;
    for (const stream of [qdrant.stdout, qdrant.stderr]) stream.on("data", chunk => { bytes += chunk.length; if (bytes <= 256000) logs.push(chunk.toString("utf8")); });
    qdrant.on("error", error => { report.qdrantSpawnError = error.code ?? "spawn-failed"; });
    watchdog = spawn(process.execPath, [path.join(import.meta.dirname, "owned-control-watchdog.mjs"), root, String(process.pid), String(qdrant.pid), String(maximumMs)],
      { detached: true, windowsHide: true, stdio: "ignore" }); watchdog.unref();
    const endpoint = `http://127.0.0.1:${qPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (qdrant.exitCode !== null || report.qdrantSpawnError) break;
      ready = await fetch(`${endpoint}/readyz`, { signal: AbortSignal.timeout(500), redirect: "error" }).then(response => response.ok, () => false);
      if (ready) break; await pause(250);
    }
    report.qdrantReady = ready; report.qdrantLogs = logs.join("");
    if (!ready) throw fail("m1-owned-qdrant-unavailable");
    pool = new pg.Pool({ connectionString: `postgresql://m1_synthetic@127.0.0.1:${pgPort}/postgres`, connectionTimeoutMillis: 2000, max: 12 });
    report.ports = { postgres: pgPort, qdrantHttp: qPort, qdrantGrpc: qGrpcPort };
    return { root, executor, pool, qdrantEndpoint: endpoint, dataDirectory, report, close,
      workerResources: { root, postgresPort: pgPort, dataDirectory,
        native: { runtimeRoot, runnerPath: path.join(runtimeRoot, "quickjs-child.mjs"), nodeExecutable, temporaryRoot: transient } } };
  } catch (error) { error.resourceReport = report; await close().catch(cleanup => { report.cleanupError = cleanup.code ?? cleanup.message; }); throw error; }
}
