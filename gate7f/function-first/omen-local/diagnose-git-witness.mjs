import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";
import { createContainedGitConfig, fixedArguments, OmenGitObserver, policyTemplateDigest }
  from "./git-observer.mjs";
import { OmenRootStore, WindowsNativeBridge } from "./native-bridge.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";

const coded = code => Object.assign(new Error(code), { code });
const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));

async function waitForFile(path, maximumMs = 5_000) {
  const deadline = Date.now() + maximumMs;
  while (!existsSync(path) && Date.now() < deadline) await delay(20);
  if (!existsSync(path)) throw coded("diagnostic-process-audit-ready-timeout");
}

async function treeDigest(root) {
  const hash = createHash("sha256");
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const full = join(path, entry.name);
      const name = relative(root, full).replaceAll("\\", "/");
      hash.update(`${entry.isDirectory() ? "d" : "f"}\0${name}\0`);
      if (entry.isDirectory()) await visit(full);
      else hash.update(await readFile(full));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

function bounded(promise, maximumMs, code) {
  let timer;
  return Promise.race([promise, new Promise((_done, fail) => {
    timer = setTimeout(() => fail(coded(code)), maximumMs);
  })]).finally(() => clearTimeout(timer));
}

function startClassifier(powershellPath, classifierPath, repository) {
  const child = spawn(powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
    "Bypass", "-File", classifierPath, "-Root", repository],
  { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), readySettled = false, resultSettled = false;
  let resolveReady, rejectReady, resolveResult, rejectResult;
  const ready = new Promise((done, fail) => { resolveReady = done; rejectReady = fail; });
  const result = new Promise((done, fail) => { resolveResult = done; rejectResult = fail; });
  ready.catch(() => {}); result.catch(() => {});
  const exit = new Promise(done => child.once("close", code => done(code)));
  const failPending = code => {
    const error = coded(code);
    if (!readySettled) { readySettled = true; rejectReady(error); }
    if (!resultSettled) { resultSettled = true; rejectResult(error); }
  };
  child.once("error", () => failPending("diagnostic-watcher-process-error"));
  child.stderr.on("data", chunk => {
    stderr = Buffer.concat([stderr, Buffer.from(chunk)]);
    if (stderr.length > 64 * 1024) {
      failPending("diagnostic-watcher-output-limited");
      try { child.kill(); } catch {}
    }
  });
  child.stdout.on("data", chunk => {
    stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
    if (stdout.length + stderr.length > 64 * 1024) {
      failPending("diagnostic-watcher-output-limited");
      try { child.kill(); } catch {}
      return;
    }
    for (;;) {
      const newline = stdout.indexOf(0x0a);
      if (newline < 0) break;
      const line = stdout.subarray(0, newline).toString("utf8").replace(/\r$/u, "");
      stdout = stdout.subarray(newline + 1);
      let value;
      try { value = JSON.parse(line); } catch { failPending("diagnostic-watcher-output-invalid"); continue; }
      if (value?.schemaVersion === "runa-omen-repository-event-witness-ready/v1" && !readySettled) {
        readySettled = true; resolveReady();
      } else if (value?.schemaVersion === "runa-omen-repository-event-witness-result/v1" && !resultSettled) {
        resultSettled = true; resolveResult(value);
      } else failPending("diagnostic-watcher-output-invalid");
    }
  });
  child.once("close", () => failPending("diagnostic-watcher-closed"));
  return {
    child, ready, result, exit,
    stop: () => { if (!child.stdin.destroyed) child.stdin.end("complete\n"); },
    terminate: () => { try { child.kill(); } catch {} },
  };
}

function validateClassifierResult(value) {
  const keys = ["name", "content", "metadata", "security", "errors"];
  if (!value || value.schemaVersion !== "runa-omen-repository-event-witness-result/v1"
      || value.privateValuesIncluded !== false || typeof value.securityEqual !== "boolean"
      || !Number.isSafeInteger(value.securityEntries) || value.securityEntries < 1
      || !value.counts || Object.keys(value.counts).sort().join("\0") !== [...keys].sort().join("\0")
      || !keys.every(key => Number.isSafeInteger(value.counts[key]) && value.counts[key] >= 0)) {
    throw coded("diagnostic-watcher-result-invalid");
  }
}

export async function diagnoseGitWitness({ userProfilePath = homedir() } = {}) {
  if (process.platform !== "win32") throw coded("diagnostic-platform-invalid");
  const pins = await loadOmenReleasePins();
  const classifierPath = resolve(import.meta.dirname, "Classify-RunaRepositoryEvents.ps1");
  const quiescencePath = resolve(import.meta.dirname, "../acceptance/Wait-R15WatcherQuiescence.ps1");
  for (const path of [pins.powershellPath, pins.gitPath, pins.gitInstallRoot, pins.gitSystemConfigPath,
    pins.gitSystemAttributesPath, pins.nativeScriptPath, pins.mxcExecutorPath, pins.processMonitorPath,
    classifierPath, quiescencePath, userProfilePath]) {
    if (!path || !existsSync(path)) throw coded("diagnostic-prerequisite-missing");
  }
  const pinnedFiles = [
    [pins.nativeScriptPath, pins.nativeScriptSha256], [pins.powershellPath, pins.powershellSha256],
    [pins.gitPath, pins.gitSha256], [pins.gitSystemConfigPath, pins.gitSystemConfigSha256],
    [pins.gitSystemAttributesPath, pins.gitSystemAttributesSha256],
    [pins.mxcExecutorPath, pins.mxcExecutorSha256],
    [pins.processMonitorPath, pins.processMonitorSha256],
  ];
  const pinnedBytes = await Promise.all(pinnedFiles.map(([path]) => readFile(path)));
  if (!pinnedFiles.every(([, digest], index) =>
    createHash("sha256").update(pinnedBytes[index]).digest("hex") === digest)) {
    throw coded("diagnostic-release-pin-mismatch");
  }
  const templateRoot = resolve(tmpdir(), "runa-m1-omen-git-policy-template-root");
  const templateConfig = createContainedGitConfig({ createConfigFromPolicy }, {
    root: templateRoot, gitInstallRoot: resolve(pins.gitInstallRoot), gitPath: resolve(pins.gitPath),
    args: fixedArguments("status", {}, templateRoot), containerId: "runa-omen-policy-template-verification",
  });
  if (policyTemplateDigest(templateConfig) !== pins.policyTemplateSha256) {
    throw coded("diagnostic-policy-template-pin-mismatch");
  }

  const root = await mkdtemp(join(tmpdir(), "runa-m1-omen-git-diagnostic-"));
  const exactRoot = await realpath(root), repository = join(root, "repository");
  const statePath = join(root, "state", "roots.dpapi");
  let stage = "create-owned-repository", failure = null, classifier = null, processMonitor = null;
  let processMonitorExit = null, processMonitorTerminal = null, processStopPath = null;
  const aggregate = { observerCode: null, containedExitCode: null, containedChildren: 0,
    nameEvents: null, contentEvents: null, metadataEvents: null, securityEvents: null,
    watcherErrors: null, treeEqual: false, securityEqual: false, securityEntries: null,
    nativeGuardReleased: false, nativeGuardSurvived: null, watcherExitCode: null,
    processDescendants: null, processSurvivors: null, processTreeValid: false,
    ownedFixtureRemoved: false };
  try {
    await mkdir(repository);
    const git = args => {
      const outcome = spawnSync(pins.gitPath, args, { cwd: repository, windowsHide: true,
        encoding: "utf8", timeout: 15_000,
        env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: resolve(pins.gitInstallRoot) } });
      if (outcome.status !== 0) throw coded("diagnostic-fixture-command-failed");
    };
    git(["init", "--initial-branch=main"]);
    await writeFile(join(repository, "notes.txt"), "initial\n", { flag: "wx" });
    git(["add", "--", "notes.txt"]);
    git(["-c", "user.name=Runa diagnostic", "-c", "user.email=runa@example.invalid",
      "commit", "-m", "Initial"]);
    await writeFile(join(repository, "notes.txt"), "initial\nworking change\n");

    const bridge = new WindowsNativeBridge({ powershellPath: resolve(pins.powershellPath),
      scriptPath: pins.nativeScriptPath, expectedScriptSha256: pins.nativeScriptSha256,
      expectedPowerShellSha256: pins.powershellSha256 });
    const holdGit = bridge.holdGit.bind(bridge);
    bridge.holdGit = async (...args) => {
      const guard = await holdGit(...args);
      return Object.freeze({ ...guard, release: async () => {
        await guard.release();
        aggregate.nativeGuardReleased = true;
        try { process.kill(guard.processId, 0); aggregate.nativeGuardSurvived = true; }
        catch { aggregate.nativeGuardSurvived = false; }
      } });
    };
    const roots = new OmenRootStore({ statePath, nativeBridge: bridge,
      userProfilePath: resolve(userProfilePath),
      protectedSystemPaths: ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"] });
    stage = "confirm-owned-git-root";
    const candidate = await roots.inspectSelectedRoot(repository);
    await roots.confirm(candidate);

    const childRecords = [];
    const processReadyPath = join(root, "process-audit.ready");
    const processRootPidPath = join(root, "process-audit.pid");
    processStopPath = join(root, "process-audit.stop");
    const processResultPath = join(root, "process-audit.json");
    stage = "start-process-audit";
    processMonitor = spawn(pins.powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive",
      "-ExecutionPolicy", "Bypass", "-File", pins.processMonitorPath,
      "-ReadyPath", processReadyPath, "-RootPidPath", processRootPidPath,
      "-StopPath", processStopPath, "-ResultPath", processResultPath, "-MaximumMs", "20000"],
    { windowsHide: true, stdio: "ignore" });
    processMonitorTerminal = new Promise(done => processMonitor.once("close", done));
    const processMonitorError = new Promise((_done, fail) =>
      processMonitor.once("error", () => fail(coded("diagnostic-process-audit-error"))));
    processMonitorExit = bounded(Promise.race([processMonitorTerminal, processMonitorError]), 25_000,
      "diagnostic-process-audit-exit-timeout");
    processMonitorExit.catch(() => {});
    await waitForFile(processReadyPath);
    const sdk = { createConfigFromPolicy, getPlatformSupport,
      spawnSandboxFromConfig: (config, options, cwd) => {
        const child = spawnSandboxFromConfig(config, options, cwd);
        const record = { processId: child.pid, exitCode: null, closed: false };
        childRecords.push(record);
        child.once("close", exitCode => { record.exitCode = exitCode; record.closed = true; });
        writeFileSync(processRootPidPath, String(child.pid), { flag: "wx" });
        return child;
      } };
    const observer = new OmenGitObserver({ rootStore: roots, nativeBridge: bridge,
      gitPath: pins.gitPath, expectedGitSha256: pins.gitSha256, gitInstallRoot: pins.gitInstallRoot,
      mxcExecutorPath: pins.mxcExecutorPath, expectedMxcSha256: pins.mxcExecutorSha256,
      expectedNativeScriptSha256: pins.nativeScriptSha256,
      expectedPowerShellSha256: pins.powershellSha256,
      gitSystemConfigPath: pins.gitSystemConfigPath,
      expectedGitSystemConfigSha256: pins.gitSystemConfigSha256,
      gitSystemAttributesPath: pins.gitSystemAttributesPath,
      expectedGitSystemAttributesSha256: pins.gitSystemAttributesSha256,
      expectedPolicyTemplateSha256: pins.policyTemplateSha256, sdk });

    stage = "start-category-witness";
    classifier = startClassifier(pins.powershellPath, classifierPath, repository);
    await bounded(classifier.ready, 10_000, "diagnostic-watcher-ready-timeout");
    const treeBefore = await treeDigest(repository);
    stage = "single-contained-git-status";
    try { await observer.observe(candidate.rootId, "status"); }
    catch (error) { aggregate.observerCode = error?.code ?? "unknown"; }
    const treeAfter = await treeDigest(repository);
    aggregate.treeEqual = treeBefore === treeAfter;
    aggregate.containedChildren = childRecords.length;
    if (childRecords.length === 1 && childRecords[0].closed) {
      aggregate.containedExitCode = childRecords[0].exitCode;
    }

    stage = "finish-process-audit";
    await writeFile(processStopPath, "stop", { flag: "wx" });
    const processExitCode = await processMonitorExit;
    processMonitor = null; processMonitorExit = null; processStopPath = null;
    await waitForFile(processResultPath);
    const processAudit = JSON.parse(await readFile(processResultPath, "utf8"));
    const descendants = Array.isArray(processAudit.descendants) ? processAudit.descendants
      : processAudit.descendants ? [processAudit.descendants] : [];
    const survivors = Array.isArray(processAudit.survivorProcessIds) ? processAudit.survivorProcessIds
      : processAudit.survivorProcessIds ? [processAudit.survivorProcessIds] : [];
    aggregate.processDescendants = descendants.length;
    aggregate.processSurvivors = survivors.length;
    const rootProcessValid = processAudit.rootProcess
      && resolve(processAudit.rootProcess.executablePath ?? "C:\\missing") === resolve(pins.mxcExecutorPath)
      && processAudit.rootProcess.executableSha256 === pins.mxcExecutorSha256;
    aggregate.processTreeValid = processExitCode === 0
      && processAudit.schemaVersion === "runa-omen-process-tree-audit/v1"
      && processAudit.timedOut === false && childRecords.length === 1
      && processAudit.rootPid === childRecords[0].processId && rootProcessValid
      && descendants.length >= 1
      && descendants.every(process => String(process.processName).toLowerCase() === "git.exe"
        && resolve(process.executablePath ?? "C:\\missing") === resolve(pins.gitPath)
        && process.executableSha256 === pins.gitSha256)
      && survivors.length === 0;

    stage = "finish-category-witness";
    classifier.stop();
    const witness = await bounded(classifier.result, 15_000, "diagnostic-watcher-result-timeout");
    validateClassifierResult(witness);
    aggregate.nameEvents = witness.counts.name;
    aggregate.contentEvents = witness.counts.content;
    aggregate.metadataEvents = witness.counts.metadata;
    aggregate.securityEvents = witness.counts.security;
    aggregate.watcherErrors = witness.counts.errors;
    aggregate.securityEqual = witness.securityEqual;
    aggregate.securityEntries = witness.securityEntries;
    aggregate.watcherExitCode = await bounded(classifier.exit, 5_000, "diagnostic-watcher-exit-timeout");
    classifier = null;
    if (aggregate.containedChildren !== 1 || aggregate.containedExitCode !== 0
        || aggregate.watcherExitCode !== 0 || !aggregate.nativeGuardReleased
        || aggregate.nativeGuardSurvived !== false || !aggregate.processTreeValid
        || aggregate.watcherErrors !== 0) {
      throw coded("diagnostic-lifecycle-invalid");
    }
  } catch (error) {
    error.stage ??= stage;
    failure = error;
  } finally {
    let cleanupFailure = null;
    if (processMonitor) {
      try { if (processStopPath && !existsSync(processStopPath)) await writeFile(processStopPath, "stop"); } catch {}
      let terminal = false;
      try { await bounded(processMonitorTerminal, 2_000, "diagnostic-process-audit-cleanup-timeout"); terminal = true; }
      catch { try { processMonitor.kill(); } catch {} }
      if (!terminal) {
        try { await bounded(processMonitorTerminal, 2_000, "diagnostic-process-audit-terminal-missed"); }
        catch (error) { error.stage = "cleanup-process-audit"; cleanupFailure = error; }
      }
    }
    if (classifier) {
      classifier.stop();
      let terminal = false;
      try { await bounded(classifier.exit, 2_000, "diagnostic-watcher-cleanup-timeout"); terminal = true; }
      catch { classifier.terminate(); }
      if (!terminal) {
        try { await bounded(classifier.exit, 2_000, "diagnostic-watcher-terminal-missed"); }
        catch (error) { error.stage = "cleanup-category-witness"; cleanupFailure ??= error; }
      }
    }
    if (cleanupFailure) throw cleanupFailure;
    if (resolve(root) !== resolve(exactRoot) || !resolve(root).startsWith(resolve(tmpdir()) + sep)
        || !root.includes("runa-m1-omen-git-diagnostic-")) throw coded("diagnostic-cleanup-root-invalid");
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    aggregate.ownedFixtureRemoved = !existsSync(root);
  }
  if (failure) throw failure;
  return { schemaVersion: "runaai-m1-omen-git-witness-diagnostic/v1", aggregate,
    privateValuesIncluded: false, productionChanged: false, modelCalled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  diagnoseGitWitness().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runaai-m1-omen-git-witness-diagnostic-error/v1",
      errorCode: error?.code ?? "diagnostic-failed", stage: error?.stage ?? "unknown",
      privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}
