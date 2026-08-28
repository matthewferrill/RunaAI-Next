import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, realpath, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { stageSandboxRuntime } from "../../../gate6b/sandbox-runtime.mjs";
import { MxcJavascriptExecutor } from "../../../gate7e/mxc-javascript-executor.mjs";

const root = await realpath(path.resolve(import.meta.dirname, "../../.."));
if (process.platform !== "win32" || path.dirname(root).toLowerCase() !== "c:\\ai\\runaai-next-candidate\\staging"
  || !/^m1-task-native-[a-f0-9]{32}$/.test(path.basename(root))) throw new Error("m1-native-proof-root-invalid");
const pgBin = "C:\\AI\\RunaAI-Next-Candidate\\tools\\postgresql\\pgsql\\bin";
const data = path.join(root, "disposable-postgres");
const nodeDirectory = path.join(root, "runtime"), sourceDirectory = path.join(root, "transient");
const nodeExecutable = path.join(nodeDirectory, "node.exe");
let running = false, watchdog = null, report = { schemaVersion: "runa-m1-control-native-proof/v1", passed: false,
  productionChanged: false, protectedDataRead: false, privateValuesIncluded: false };
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, timeout: 30_000,
    maxBuffer: 2_000_000, ...options });
  if (result.status !== 0) throw Object.assign(new Error("m1-native-child-failed"), { diagnostic: {
    executable: path.basename(exe), status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } });
  return result.stdout;
}
try {
  await mkdir(nodeDirectory); await mkdir(sourceDirectory);
  await copyFile(process.execPath, nodeExecutable);
  const runtimeRoot = await stageSandboxRuntime({ sourceRoot: root, nodeModulesRoot: path.join(root, "node_modules"), destinationRoot: root });
  const acl = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    path.join(import.meta.dirname, "Stage-OwnedNativeAccess.ps1"), "-OwnedRoot", root]);
  report.access = JSON.parse(acl.trim());
  const executor = new MxcJavascriptExecutor({ runtimeRoot, runnerPath: path.join(runtimeRoot, "quickjs-child.mjs"),
    nodeExecutable, temporaryRoot: sourceDirectory });
  const startup = await executor.preflight();
  report.startup = { ready: startup.ready, status: startup.receipt.status, errorCode: startup.receipt.errorCode,
    output: startup.receipt.output.stdout, isolationTier: startup.receipt.isolation.tier };
  if (!startup.ready) throw new Error("m1-native-startup-unavailable");
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const value = server.address().port;
      server.close(error => error ? reject(error) : resolve(value)); });
  });
  run(path.join(pgBin, "initdb.exe"), ["-D", data, "-U", "m1_synthetic", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--no-locale"]);
  run(path.join(pgBin, "pg_ctl.exe"), ["-D", data, "-l", path.join(root, "disposable-postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "start", "-w"], { stdio: "ignore" });
  running = true;
  watchdog = spawn(process.execPath, [path.join(import.meta.dirname, "control-native-watchdog.mjs"), data, String(process.pid)],
    { detached: true, windowsHide: true, stdio: "ignore" });
  watchdog.unref();
  const tests = run(nodeExecutable, ["--test", path.join(import.meta.dirname, "project.integration.test.mjs")], {
    timeout: 150_000, env: { ...process.env, M1_TASK_PG_URL: `postgresql://m1_synthetic@127.0.0.1:${port}/postgres`,
      M1_PROJECT_ADAPTER: path.join(root, "gate7f/function-first/project/adapter.mjs"),
      M1_EXECUTOR_RUNTIME_ROOT: runtimeRoot, M1_EXECUTOR_RUNNER_PATH: path.join(runtimeRoot, "quickjs-child.mjs"),
      M1_EXECUTOR_NODE_PATH: nodeExecutable, M1_EXECUTOR_TEMP_ROOT: sourceDirectory } });
  report.tests = tests;
  report.passed = /# tests 6[\r\n]/.test(tests) && /# pass 6[\r\n]/.test(tests) && /# fail 0[\r\n]/.test(tests);
} catch (error) { report.errorCode = error.message; if (error.diagnostic) report.diagnostic = error.diagnostic; }
finally {
  if (!running) {
    const status = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", data, "status"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
    running = status.status === 0;
  }
  try {
    if (running) run(path.join(pgBin, "pg_ctl.exe"), ["-D", data, "stop", "-m", "fast", "-w"], { stdio: "ignore" });
    if (watchdog) watchdog.kill();
    report.disposablePostgresStopped = true;
    for (const name of ["disposable-postgres", "runtime", "sandbox-runtime", "transient"]) {
      const target = path.resolve(root, name);
      if (path.dirname(target) !== root) throw new Error("m1-native-cleanup-scope-invalid");
      await rm(target, { recursive: true, force: true });
    }
    report.ownedRuntimeAndDatabaseRemoved = true;
  } catch (error) { report.cleanupError = error.message; report.passed = false; }
  process.stdout.write(JSON.stringify(report) + "\n");
  if (!report.passed) process.exitCode = 1;
}
