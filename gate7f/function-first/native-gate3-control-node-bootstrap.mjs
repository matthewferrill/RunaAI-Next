import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_ROOT = "C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc";
const NODE_SHA256 = "bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb";
const RUNNER_SHA256 = "64ea2e039e4ec703c681753464d28414d41b4afbfb79b36796f610443962e112";
const EXECUTOR_SHA256 = "e6ab59285cf63ad6bdf4643b63727a7b5e5d863ef642ee283166f59d0fc3988a";
const CONTRACTS_SHA256 = "46c7640befa34e75332712a1bb400e9265f6b65b5d02294ff244a2c2d02b3976";
const LOCK_SHA256 = "cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308";
const DEPENDENCY_SHA256 = "13f70f797da871b78e092b07eac2c7e70a23188319bea9ffab041a81d3913203";
const CONTROL_SOURCE_ROOT = "C:\\AI\\Projects\\RunaAI-Next-supervisor-8783643";
const GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const ADMISSION_MS = 5_000;
const coded = code => Object.assign(new Error(code), { code });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const samePath = (left, right) => path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();

const sourceRoot = path.resolve(import.meta.dirname, "../..");
const nodeExecutable = path.join(RELEASE_ROOT, "runtime", "node.exe");
const runnerPath = path.join(RELEASE_ROOT, "sandbox-runtime", "quickjs-child.mjs");
const executorPath = path.join(sourceRoot, "gate7e", "mxc-javascript-executor.mjs");
const contractsPath = path.join(sourceRoot, "gate7e", "contracts.mjs");
const lockPath = path.join(sourceRoot, "package-lock.json");
const operatorPath = path.join(import.meta.dirname, "run-native-gate3-mxc-eligibility-control.mjs");
const deploymentRoot = path.join(import.meta.dirname, "control", "deployment");
const watchdogPath = path.join(deploymentRoot, "watchdog.mjs");
const hostPath = path.join(deploymentRoot, "Watchdog-Host.mjs");
const wrapperPath = path.join(deploymentRoot, "Invoke-ClosedCompanionWatchdog.ps1");
const helperPath = path.join(deploymentRoot, "ClosedCompanionJob.cs");

async function stableFile(filename, maximumBytes = 1024 * 1024) {
  const item = await lstat(filename);
  if (!item.isFile() || item.isSymbolicLink() || item.size < 1 || item.size > maximumBytes
      || !samePath(await realpath(filename), filename)) throw coded("native-gate3-eligibility-file-invalid");
  const handle = await open(filename, "r");
  try {
    const before = await handle.stat();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size) {
      throw coded("native-gate3-eligibility-file-drift");
    }
    return bytes;
  } finally { await handle.close(); }
}

async function exactFile(filename, expectedSha256, maximumBytes) {
  const bytes = await stableFile(filename, maximumBytes);
  if (digest(bytes) !== expectedSha256) throw coded("native-gate3-eligibility-file-drift");
  return bytes;
}

function gitText(arguments_, code) {
  const result = spawnSync(GIT, ["-c", `safe.directory=${CONTROL_SOURCE_ROOT}`, ...arguments_], {
    cwd: sourceRoot, encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 16_384,
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe", GIT_CONFIG_GLOBAL: "NUL", GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C", SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
  });
  if (result.status !== 0 || result.signal !== null || result.error || result.stderr !== "") throw coded(code);
  return result.stdout.trim();
}

export async function sourceAuthority() {
  if (!samePath(sourceRoot, CONTROL_SOURCE_ROOT) || !samePath(await realpath(sourceRoot), CONTROL_SOURCE_ROOT)) {
    throw coded("native-gate3-eligibility-source-root-invalid");
  }
  const sourceCommit = gitText(["rev-parse", "--verify", "HEAD"], "native-gate3-eligibility-source-commit-invalid");
  const sourceTree = gitText(["rev-parse", "--verify", "HEAD^{tree}"], "native-gate3-eligibility-source-tree-invalid");
  const tracked = [operatorPath, import.meta.filename, watchdogPath, hostPath, wrapperPath, helperPath,
    executorPath, contractsPath, lockPath]
    .map(filename => path.relative(sourceRoot, filename).replaceAll("\\", "/"));
  const trackedResult = gitText(["ls-files", "--error-unmatch", "--", ...tracked],
    "native-gate3-eligibility-source-membership-invalid").split(/\r?\n/u).sort();
  if (!/^[a-f0-9]{40,64}$/u.test(sourceCommit)) throw coded("native-gate3-eligibility-source-commit-format");
  if (!/^[a-f0-9]{40,64}$/u.test(sourceTree)) throw coded("native-gate3-eligibility-source-tree-format");
  if (trackedResult.length !== tracked.length
      || trackedResult.some((value, index) => value !== tracked.slice().sort()[index])) {
    throw coded("native-gate3-eligibility-source-membership-mismatch");
  }
  const authority = Object.freeze({ schemaVersion: "runaai-native-gate3-source-authority/v1", sourceCommit, sourceTree,
    operatorSha256: digest(await stableFile(operatorPath)), bootstrapSha256: digest(await stableFile(import.meta.filename)),
    watchdogSha256: digest(await stableFile(watchdogPath)),
    hostSha256: digest(await stableFile(hostPath)), wrapperSha256: digest(await stableFile(wrapperPath)),
    helperSha256: digest(await stableFile(helperPath)), privateValuesIncluded: false });
  return Object.freeze({ ...authority, sourceAuthoritySha256: digest(Buffer.from(JSON.stringify(authority), "utf8")) });
}

async function dependencyManifestSha256() {
  const dependencyRoot = path.join(sourceRoot, "node_modules");
  if (!samePath(await realpath(dependencyRoot), dependencyRoot)) {
    throw coded("native-gate3-eligibility-dependency-root-invalid");
  }
  const manifest = createHash("sha256");
  const roots = ["@microsoft/mxc-sdk", "node-pty", "semver", "zod"];
  const compare = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
  async function walk(root, relative = "") {
    const base = path.join(dependencyRoot, root, ...relative.split("/").filter(Boolean));
    const children = await readdir(base, { withFileTypes: true });
    children.sort((left, right) => compare(left.name, right.name));
    for (const child of children) {
      const next = path.posix.join(relative, child.name);
      const filename = path.join(dependencyRoot, root, ...next.split("/"));
      const item = await lstat(filename);
      if (item.isSymbolicLink()) throw coded("native-gate3-eligibility-dependency-link");
      if (item.isDirectory()) {
        manifest.update(`d\0${root}/${next}\n`, "utf8");
        await walk(root, next);
      } else if (item.isFile()) {
        const bytes = await readFile(filename);
        manifest.update(`f\0${root}/${next}\0${bytes.length}\0${digest(bytes)}\n`, "utf8");
      } else throw coded("native-gate3-eligibility-dependency-type");
    }
  }
  for (const root of roots) await walk(root);
  const actual = manifest.digest("hex");
  if (actual !== DEPENDENCY_SHA256) throw coded("native-gate3-eligibility-dependency-drift");
  return actual;
}

export async function eligibilityEnvelopeSha256() {
  const authority = await sourceAuthority();
  await exactFile(nodeExecutable, NODE_SHA256, 100 * 1024 * 1024);
  await exactFile(runnerPath, RUNNER_SHA256, 1024 * 1024);
  await exactFile(executorPath, EXECUTOR_SHA256, 1024 * 1024);
  await exactFile(contractsPath, CONTRACTS_SHA256, 1024 * 1024);
  await exactFile(lockPath, LOCK_SHA256, 4 * 1024 * 1024);
  await dependencyManifestSha256();
  const resolvedSdk = import.meta.resolve("@microsoft/mxc-sdk");
  if (!resolvedSdk.startsWith(pathToFileURL(path.join(sourceRoot, "node_modules", "@microsoft", "mxc-sdk")).href)) {
    throw coded("native-gate3-eligibility-ambient-dependency");
  }
  const material = Object.freeze({ schemaVersion: "runaai-native-gate3-mxc-eligibility-envelope/v1",
    nodeSha256: NODE_SHA256, runnerSha256: RUNNER_SHA256, executorSha256: EXECUTOR_SHA256,
    contractsSha256: CONTRACTS_SHA256, packageLockSha256: LOCK_SHA256,
    dependencyManifestSha256: DEPENDENCY_SHA256, sourceAuthoritySha256: authority.sourceAuthoritySha256,
    privateValuesIncluded: false });
  return digest(Buffer.from(JSON.stringify(material), "utf8"));
}

async function readAdmission() {
  const chunks = [];
  let total = 0;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(coded("native-gate3-eligibility-admission-timeout")), ADMISSION_MS);
    timer.unref?.();
  });
  const reader = (async () => {
    for await (const chunk of process.stdin) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > 64) { bytes.fill(0); throw coded("native-gate3-eligibility-admission-oversized"); }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, total);
  })();
  try { return await Promise.race([reader, deadline]); }
  finally { clearTimeout(timer); process.stdin.destroy(); for (const bytes of chunks) bytes.fill(0); }
}

async function writeEvidence(filename, value) {
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64" || process.version !== "v22.22.0"
      || !samePath(process.execPath, nodeExecutable) || process.argv.length !== 2
      || process.execArgv.length !== 1 || process.execArgv[0] !== "--no-warnings"
      || process.env.RUNAAI_GATE3_CONTROL_PHASE !== "eligibility"
      || process.env.RUNAAI_GATE3_EXPECTED_ELIGIBILITY_SEAL_SHA256 !== undefined) {
    throw coded("native-gate3-eligibility-runtime-invalid");
  }
  const envelopeSha256 = await eligibilityEnvelopeSha256();
  if (process.env.RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256 !== envelopeSha256) {
    throw coded("native-gate3-eligibility-envelope-mismatch");
  }
  const authority = await sourceAuthority();
  if (process.env.RUNAAI_GATE3_RESOURCE_PROOF_METHOD !== authority.sourceAuthoritySha256.slice(0, 32)) {
    throw coded("native-gate3-eligibility-source-authority-mismatch");
  }
  const scratchRoot = path.dirname(path.resolve(process.env.LOCALAPPDATA ?? ""));
  const temporaryRoot = path.join(scratchRoot, "transient");
  const evidencePath = path.join(scratchRoot, "eligibility-child.json");
  if (!/^m1-g3-eligibility-[a-f0-9]{32}$/u.test(path.basename(path.dirname(scratchRoot)))
      || path.basename(scratchRoot) !== "scratch" || path.basename(temporaryRoot) !== "transient"
      || !samePath(process.env.TEMP, path.join(scratchRoot, "temp")) || process.env.TEMP !== process.env.TMP) {
    throw coded("native-gate3-eligibility-scratch-invalid");
  }

  let wire = await readAdmission();
  let expected = null;
  try {
    if (wire.length !== 64 || !/^[1-9][0-9]{0,9}$/u.test(process.env.RUNAAI_GATE3_CONTROL_LAUNCHER_PID ?? "")
        || Number(process.env.RUNAAI_GATE3_CONTROL_LAUNCHER_PID) !== process.ppid) {
      throw coded("native-gate3-eligibility-admission-invalid");
    }
    const secret = wire.subarray(0, 32);
    const mac = wire.subarray(32);
    const binding = Buffer.from(["runaai-native-gate3-control-launch-capability/v1", "eligibility",
      envelopeSha256, "-", String(process.ppid), String(process.pid)].join("\0"), "ascii");
    expected = createHmac("sha256", secret).update(binding).digest();
    if (!timingSafeEqual(mac, expected)) throw coded("native-gate3-eligibility-admission-authentication-failed");

    const { MxcJavascriptExecutor } = await import(pathToFileURL(executorPath).href);
    const executor = new MxcJavascriptExecutor({ runtimeRoot: path.join(RELEASE_ROOT, "sandbox-runtime"),
      runnerPath, nodeExecutable, temporaryRoot });
    const preflight = await executor.preflight();
    const receipt = preflight?.receipt;
    const passed = preflight?.ready === true && receipt?.status === "executed" && receipt?.errorCode === null
      && receipt?.exitCode === 0 && receipt?.output?.stdout === "runa2-sandbox-ready\n"
      && receipt?.output?.stderr === "" && receipt?.output?.combinedBytes === 20
      && receipt?.isolation?.provider === "microsoft-mxc" && receipt?.isolation?.method === "processcontainer"
      && receipt?.isolation?.network === "deny-all" && receipt?.isolation?.environment === "empty"
      && Array.isArray(receipt?.effects) && receipt.effects.length === 0;
    if (await eligibilityEnvelopeSha256() !== envelopeSha256) {
      throw coded("native-gate3-eligibility-use-time-drift");
    }
    const safeErrorCode = receipt?.errorCode === null ? null
      : /^[a-z0-9-]{1,100}$/u.test(receipt?.errorCode ?? "") ? receipt.errorCode : "sandbox-unavailable";
    const safeTier = new Set(["unavailable", "base-container", "appcontainer-bfs", "appcontainer-dacl"])
      .has(receipt?.isolation?.tier) ? receipt.isolation.tier : "unavailable";
    await writeEvidence(evidencePath, Object.freeze({
      schemaVersion: "runaai-native-gate3-mxc-eligibility-result/v1", passed,
      status: ["executed", "unavailable", "failed", "timed-out", "output-limited"].includes(receipt?.status)
        ? receipt.status : "unavailable",
      errorCode: safeErrorCode,
      exitCode: Number.isInteger(receipt?.exitCode) ? receipt.exitCode : null,
      isolationTier: safeTier,
      combinedBytes: Number.isSafeInteger(receipt?.output?.combinedBytes)
        && receipt.output.combinedBytes >= 0 && receipt.output.combinedBytes <= 160_000
        ? receipt.output.combinedBytes : 0,
      databaseAttempted: false, modelInvoked: false, browserInvoked: false,
      productionChanged: false, privateValuesIncluded: false,
    }));
    if (!passed) throw coded("native-gate3-eligibility-preflight-failed");

    const capabilitySha256 = digest(wire);
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-supervisor-child-ack/v1", phase: "eligibility",
      envelopeSha256, eligibilitySealSha256: null,
      supervisorProcessId: Number(process.env.RUNAAI_GATE3_CONTROL_LAUNCHER_PID), childProcessId: process.pid,
      capabilitySha256, manifestSha256: process.env.RUNAAI_GATE3_MANIFEST_SHA256,
      packageSha256: process.env.RUNAAI_GATE3_PACKAGE_SHA256, nodeVersion: process.version,
      consumed: true, eofObserved: true, privateValuesIncluded: false })}\n`);
  } finally { expected?.fill(0); wire.fill(0); wire = null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${/^[a-z0-9-]{1,100}$/u.test(error?.code ?? "")
      ? error.code : "native-gate3-eligibility-failed"}\n`);
    process.exitCode = 1;
  });
}
