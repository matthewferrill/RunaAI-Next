import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";
import { canonicalJson } from "../local-context-contract.mjs";
import { createContainedGitConfig, fixedArguments, OmenGitObserver, policyTemplateDigest,
  spawnSandboxWithPinnedCwd } from "./git-observer.mjs";
import { completedGitFatalDiagnostic, EMPTY_SHA256, failedGitFatalDiagnostic }
  from "./git-fatal-diagnostic-contract.mjs";
import { completedPermissionBoundaryDiagnostic, createPermissionBoundaryCoordinator,
  failedPermissionBoundaryDiagnostic }
  from "./git-permission-boundary-diagnostic-contract.mjs";
import { OmenRootStore, WindowsNativeBridge } from "./native-bridge.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";
import { startRepositoryWitness, startUiWitness } from "./windows-witness.mjs";

async function waitForFile(path, maximumMs = 5_000) {
  const deadline = Date.now() + maximumMs;
  while (!existsSync(path) && Date.now() < deadline) await new Promise(done => setTimeout(done, 20));
  if (!existsSync(path)) throw Object.assign(new Error("omen-process-audit-ready-timeout"),
    { code: "omen-process-audit-ready-timeout" });
}

async function waitForExit(child, maximumMs = 5_000) {
  return new Promise((done, fail) => {
    let settled = false, timer = null;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); done(value); } };
    child.once("error", fail); child.once("close", finish);
    timer = setTimeout(() => { try { child.kill(); } catch {} finish(null); }, maximumMs);
  });
}

async function requireTerminal(promise, maximumMs, code) {
  let timer;
  return Promise.race([promise, new Promise((_done, fail) => {
    timer = setTimeout(() => fail(Object.assign(new Error(code), { code })), maximumMs);
  })]).finally(() => clearTimeout(timer));
}

async function startProbe(host, name) {
  let connections = 0;
  const server = createServer(socket => { connections += 1; socket.destroy(); });
  server.listen(0, host); await once(server, "listening");
  return { name, host, port: server.address().port, server, connections: () => connections };
}

async function runNetworkChild(phase, repository, urls) {
  const source = resolve(import.meta.dirname, "actual-network-proof-child.mjs");
  const payload = Buffer.from(JSON.stringify({ phase, repository, urls })).toString("base64url");
  const child = spawn(process.execPath, [source, payload], { cwd: repository, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"] });
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
  child.stdout.on("data", chunk => { stdout = Buffer.concat([stdout, Buffer.from(chunk)]); });
  child.stderr.on("data", chunk => { stderr = Buffer.concat([stderr, Buffer.from(chunk)]); });
  const exitCode = await waitForExit(child, 60_000);
  if (exitCode !== 0 || stdout.length + stderr.length > 256 * 1024) {
    throw Object.assign(new Error("omen-network-child-failed"), { code: "omen-network-child-failed",
      stderrBytes: stderr.length, stderrSha256: createHash("sha256").update(stderr).digest("hex") });
  }
  let result;
  try { result = JSON.parse(stdout.toString("utf8")); } catch { throw Object.assign(
    new Error("omen-network-child-result-invalid"), { code: "omen-network-child-result-invalid" }); }
  if (result?.schemaVersion !== "runa-omen-network-child-proof/v1" || result.phase !== phase
      || result.passed !== true || result.attempts?.length !== 3) {
    throw Object.assign(new Error("omen-network-child-result-invalid"), { code: "omen-network-child-result-invalid" });
  }
  return result;
}

async function treeDigest(root) {
  const hash = createHash("sha256");
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(path, entry.name), name = relative(root, full).replaceAll("\\", "/");
      hash.update(`${entry.isDirectory() ? "d" : "f"}\0${name}\0`);
      if (entry.isDirectory()) await visit(full); else hash.update(await readFile(full));
    }
  }
  await visit(root); return hash.digest("hex");
}

export async function runActualOmenGitProof({ userProfilePath = homedir(), fatalDiagnostic = false,
  permissionBoundaryDiagnostic = false } = {}) {
  if (fatalDiagnostic && permissionBoundaryDiagnostic) throw Object.assign(
    new Error("omen-git-diagnostic-mode-invalid"), { code: "omen-git-diagnostic-mode-invalid" });
  const pins = await loadOmenReleasePins();
  for (const path of [pins.powershellPath, userProfilePath, pins.gitPath, pins.gitInstallRoot,
    pins.gitSystemConfigPath, pins.gitSystemAttributesPath, pins.nativeScriptPath,
    pins.mxcExecutorPath, pins.processMonitorPath, pins.repositoryWitnessPath, pins.uiWitnessPath]) {
    if (!path || !existsSync(path)) throw Object.assign(new Error("omen-git-prerequisite-missing"), { code: "omen-git-prerequisite-missing" });
  }
  const pinnedFiles = [
    [pins.nativeScriptPath, pins.nativeScriptSha256], [pins.powershellPath, pins.powershellSha256],
    [pins.gitPath, pins.gitSha256], [pins.gitSystemConfigPath, pins.gitSystemConfigSha256],
    [pins.gitSystemAttributesPath, pins.gitSystemAttributesSha256],
    [pins.mxcExecutorPath, pins.mxcExecutorSha256], [pins.processMonitorPath, pins.processMonitorSha256],
    [pins.repositoryWitnessPath, pins.repositoryWitnessSha256], [pins.uiWitnessPath, pins.uiWitnessSha256],
  ];
  const pinnedBytes = await Promise.all(pinnedFiles.map(([path]) => readFile(path)));
  if (!pinnedFiles.every(([, digest], index) =>
    createHash("sha256").update(pinnedBytes[index]).digest("hex") === digest)) {
    throw Object.assign(new Error("omen-git-release-pin-mismatch"), { code: "omen-git-release-pin-mismatch" });
  }
  const policyProbeRoot = "C:\\RunaPolicyDigestProbe";
  const policyProbe = createContainedGitConfig({ createConfigFromPolicy }, { root: policyProbeRoot,
    gitInstallRoot: resolve(pins.gitInstallRoot), gitPath: resolve(pins.gitPath),
    args: fixedArguments("status", {}, policyProbeRoot), containerId: "runa-omen-git-policy-digest-probe" });
  if (policyTemplateDigest(policyProbe, policyProbeRoot, pins.gitInstallRoot) !== pins.policyTemplateSha256) {
    throw Object.assign(new Error("omen-git-policy-template-digest-mismatch"),
      { code: "omen-git-policy-template-digest-mismatch" });
  }
  const root = await mkdtemp(join(tmpdir(), "runa-m1-omen-git-"));
  const exactRoot = await realpath(root), repository = join(root, "repository"),
    statePath = join(root, "state", "roots.dpapi");
  const checks = {};
  const probes = [];
  const guardAudits = [], childAudits = [], witnessAudits = [];
  let diagnosticObservation = null, diagnosticRepositoryUnchanged = false, diagnosticOperationCount = 0;
  let permissionCoordinator = null;
  let failure, stage = "create-owned-repository", activeMonitor = null, activeMonitorExit = null,
    activeAuditStop = null;
  const git = args => {
    const result = spawnSync(pins.gitPath, args, { cwd: repository, windowsHide: true, encoding: "utf8", timeout: 15_000,
      env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: resolve(pins.gitInstallRoot) } });
    if (result.status !== 0) throw Object.assign(new Error("omen-git-fixture-command-failed"),
      { code: "omen-git-fixture-command-failed", stage, diagnostic: String(result.stderr).slice(-2000) });
    return result.stdout.trim();
  };
  try {
    await mkdir(repository);
    git(["init", "--initial-branch=main"]);
    await writeFile(join(repository, "notes.txt"), "initial\n", { flag: "wx" });
    git(["add", "--", "notes.txt"]);
    git(["-c", "user.name=Runa actual test", "-c", "user.email=runa@example.invalid", "commit", "-m", "Initial"]);
    const initialCommit = git(["rev-parse", "HEAD"]);
    const lanAddress = Object.values(networkInterfaces()).flat().find(value =>
      value?.family === "IPv4" && value.internal === false)?.address;
    if (!lanAddress) throw Object.assign(new Error("omen-lan-probe-address-missing"), { code: "omen-lan-probe-address-missing" });
    await writeFile(join(repository, ".gitmodules"), `[submodule "probe"]\n\tpath = vendor/probe\n`
      + "\turl = http://127.0.0.1:1/runa/probe.git\n");
    git(["add", "--", ".gitmodules"]);
    git(["update-index", "--add", "--cacheinfo", `160000,${initialCommit},vendor/probe`]);
    git(["-c", "user.name=Runa actual test", "-c", "user.email=runa@example.invalid", "commit", "-m", "Add inert submodule marker"]);
    const commit = git(["rev-parse", "HEAD"]);
    git(["remote", "add", "origin", "https://fixture-user:fixture-secret@example.invalid/runa/owned.git"]);
    git(["remote", "add", "loopback-probe", "http://127.0.0.1:1/runa/probe.git"]);
    git(["remote", "add", "lan-probe", `http://${lanAddress}:1/runa/probe.git`]);
    git(["remote", "add", "public-probe", "https://github.com/octocat/Hello-World.git"]);
    await writeFile(join(repository, "notes.txt"), "initial\nworking change\n");
    const bridge = new WindowsNativeBridge({ powershellPath: resolve(pins.powershellPath),
      scriptPath: pins.nativeScriptPath, expectedScriptSha256: pins.nativeScriptSha256,
      expectedPowerShellSha256: pins.powershellSha256 });
    const holdGit = bridge.holdGit.bind(bridge);
    bridge.holdGit = async (...args) => {
      const guard = await holdGit(...args);
      const audit = { processId: guard.processId, executablePath: guard.executablePath,
        executableSha256: guard.executableSha256, released: false, releasePromise: null };
      guardAudits.push(audit);
      audit.release = async () => {
        audit.releasePromise ??= guard.release();
        await audit.releasePromise;
        try { process.kill(guard.processId, 0); } catch { audit.released = true; }
      };
      return Object.freeze({ ...guard, release: audit.release });
    };
    const roots = new OmenRootStore({ statePath, nativeBridge: bridge, userProfilePath: resolve(userProfilePath),
      protectedSystemPaths: ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"] });
    stage = "confirm-owned-git-root";
    const candidate = await roots.inspectSelectedRoot(repository); await roots.confirm(candidate);
    const capturedPolicies = [];
    let processAuditRootPidPath = null;
    let attemptIdentitySwap = false, attemptContentMutation = false,
      rootSwapBlocked = false, gitSwapBlocked = false, mutationChildCompleted = false,
      lateMutationApplied = false, lateMutationError = null;
    const sdk = { createConfigFromPolicy, getPlatformSupport,
      spawnSandboxFromConfig: (config, options, cwd) => {
        if (resolve(config?.process?.cwd ?? "") !== resolve(pins.gitInstallRoot)
            || resolve(cwd ?? "") !== resolve(pins.gitInstallRoot)) {
          throw Object.assign(new Error("omen-git-runtime-cwd-invalid"), { code: "omen-git-runtime-cwd-invalid" });
        }
        capturedPolicies.push({ config: JSON.parse(JSON.stringify(config)), options: { ...options }, cwd });
        const child = spawnSandboxFromConfig(config, options, cwd);
        let resolveTerminal;
        const audit = { child, terminal: false,
          terminalPromise: new Promise(done => { resolveTerminal = done; }) };
        childAudits.push(audit);
        child.once("close", exitCode => { audit.terminal = true; audit.exitCode = exitCode; resolveTerminal(exitCode); });
        if (attemptIdentitySwap) {
          attemptIdentitySwap = false;
          try { renameSync(repository, `${repository}-swap`); renameSync(`${repository}-swap`, repository); }
          catch { rootSwapBlocked = true; }
          try { renameSync(join(repository, ".git"), join(repository, ".git-swap"));
            renameSync(join(repository, ".git-swap"), join(repository, ".git")); }
          catch { gitSwapBlocked = true; }
        }
        if (attemptContentMutation) {
          attemptContentMutation = false;
          child.once("close", exitCode => {
            if (exitCode !== 0) return;
            mutationChildCompleted = true;
            setTimeout(() => {
              try {
                const mutationPath = join(repository, "notes.txt"), original = readFileSync(mutationPath);
                writeFileSync(mutationPath, "temporary mutate-and-restore witness probe\n");
                writeFileSync(mutationPath, original);
                lateMutationApplied = true;
              } catch (error) { lateMutationError = error; }
            }, 50);
          });
        }
        if (processAuditRootPidPath) writeFileSync(processAuditRootPidPath, String(child.pid), { flag: "wx" });
        return child;
      } };
    const trackedWitness = (kind, factory) => options => {
      const witness = factory(options), audit = { kind, witness, terminal: false };
      witnessAudits.push(audit);
      audit.terminalPromise = Promise.resolve(witness.exit).then(exitCode => {
        audit.terminal = true; audit.exitCode = exitCode; return exitCode;
      });
      audit.terminalPromise.catch(() => {});
      return witness;
    };
    const observer = new OmenGitObserver({ rootStore: roots, nativeBridge: bridge, gitPath: pins.gitPath,
      expectedGitSha256: pins.gitSha256, gitInstallRoot: pins.gitInstallRoot,
      mxcExecutorPath: pins.mxcExecutorPath, expectedMxcSha256: pins.mxcExecutorSha256,
      expectedNativeScriptSha256: pins.nativeScriptSha256, expectedPowerShellSha256: pins.powershellSha256,
      gitSystemConfigPath: pins.gitSystemConfigPath,
      expectedGitSystemConfigSha256: pins.gitSystemConfigSha256,
      gitSystemAttributesPath: pins.gitSystemAttributesPath,
      expectedGitSystemAttributesSha256: pins.gitSystemAttributesSha256,
      expectedPolicyTemplateSha256: pins.policyTemplateSha256,
      repositoryWitnessPath: pins.repositoryWitnessPath,
      expectedRepositoryWitnessSha256: pins.repositoryWitnessSha256,
      uiWitnessPath: pins.uiWitnessPath, expectedUiWitnessSha256: pins.uiWitnessSha256,
      repositoryWitnessFactory: trackedWitness("repository", startRepositoryWitness),
      uiWitnessFactory: trackedWitness("ui", startUiWitness), sdk });
    const unchanged = async (operation, input = {}) => {
      stage = `contained-git-${operation}`;
      const before = await treeDigest(repository);
      const result = await observer.observe(candidate.rootId, operation, input);
      const after = await treeDigest(repository);
      checks[`repositoryUnchangedAfter${operation[0].toUpperCase()}${operation.slice(1)}`] = before === after;
      return result;
    };
    if (fatalDiagnostic) {
      stage = "contained-git-status";
      const before = await treeDigest(repository);
      diagnosticOperationCount = 1;
      let observationError = null;
      try {
        await observer.observe(candidate.rootId, "status");
        diagnosticObservation = { outcome: "status-succeeded", exitCode: 0, failureKind: null,
          stderrBytes: 0, stderrSha256: EMPTY_SHA256 };
      } catch (error) {
        if (error?.code === "omen-git-process-failed") {
          diagnosticObservation = { outcome: "git-fatal", exitCode: error.exitCode,
            failureKind: error.failureKind, stderrBytes: error.stderrBytes, stderrSha256: error.stderrSha256 };
        } else observationError = error;
      }
      const after = await treeDigest(repository);
      diagnosticRepositoryUnchanged = before === after;
      if (observationError) throw observationError;
    } else if (permissionBoundaryDiagnostic) {
      const operations = [["branches", {}], ["show", { commit }], ["diffstat", {}], ["status", {}]];
      permissionCoordinator = createPermissionBoundaryCoordinator(await treeDigest(repository));
      for (const [operation, input] of operations) {
        stage = `contained-git-${operation}`;
        const before = await treeDigest(repository);
        permissionCoordinator.begin(operation, before);
        const childStart = childAudits.length, witnessStart = witnessAudits.length, guardStart = guardAudits.length;
        let observation = null, observationError = null;
        try {
          await observer.observe(candidate.rootId, operation, input);
          observation = { outcome: "succeeded", exitCode: 0, failureKind: null,
            stderrBytes: 0, stderrSha256: EMPTY_SHA256 };
        } catch (error) {
          if (error?.code === "omen-git-process-failed") {
            observation = { outcome: "git-fatal", exitCode: error.exitCode,
              failureKind: error.failureKind, stderrBytes: error.stderrBytes, stderrSha256: error.stderrSha256 };
          } else observationError = error;
        }
        const after = await treeDigest(repository);
        const operationChildren = childAudits.slice(childStart), operationWitnesses = witnessAudits.slice(witnessStart),
          operationGuards = guardAudits.slice(guardStart);
        if (observationError) throw observationError;
        const completed = permissionCoordinator.complete({ operation, observation, afterDigest: after,
          wrapperCount: operationChildren.length, witnessCount: operationWitnesses.length,
          guardCount: operationGuards.length, wrapperTerminal: operationChildren.every(audit => audit.terminal),
          witnessesTerminal: operationWitnesses.every(audit => audit.terminal),
          guardReleased: operationGuards.every(audit => audit.released) });
        if (completed.outcome === "git-fatal") break;
      }
      permissionCoordinator.finish(await treeDigest(repository));
    } else {
    const status = await unchanged("status");
    probes.push(await startProbe("127.0.0.1", "loopback"));
    probes.push(await startProbe(lanAddress, "lan"));
    const log = await unchanged("log");
    const diffstat = await unchanged("diffstat");
    const branches = await unchanged("branches");
    const remotes = await unchanged("remotes");
    const shown = await unchanged("show", { commit });
    checks.statusObserved = status.fields.some(value => value.includes("notes.txt"));
    checks.logObserved = log.fields.includes(commit) && log.fields.includes("Initial");
    checks.diffstatObserved = diffstat.fields.some(value => value.includes("notes.txt"));
    checks.branchObserved = branches.fields.includes("main") && branches.fields.includes(commit);
    checks.remoteSanitized = remotes.remotes.some(remote => remote.name === "origin"
      && remote.display === "example.invalid/runa/owned")
      && !JSON.stringify(remotes).includes("fixture-user") && !JSON.stringify(remotes).includes("fixture-secret");
    checks.commitObserved = shown.fields.includes(commit)
      && shown.fields.some(value => value.includes("Add inert submodule marker"));
    const containedResults = [status, log, diffstat, branches, shown];
    const expectedReleaseManifest = { schemaVersion: "runa-omen-git-readonly/v1",
      package: "@microsoft/mxc-sdk", packageVersion: "0.8.0", policyVersion: "0.8.0-alpha",
       gitPath: resolve(pins.gitPath), gitSha256: pins.gitSha256, gitInstallRoot: resolve(pins.gitInstallRoot),
       gitSystemConfigPath: resolve(pins.gitSystemConfigPath), gitSystemConfigSha256: pins.gitSystemConfigSha256,
       gitSystemAttributesPath: resolve(pins.gitSystemAttributesPath),
       gitSystemAttributesSha256: pins.gitSystemAttributesSha256,
       mxcExecutorPath: resolve(pins.mxcExecutorPath), mxcSha256: pins.mxcExecutorSha256,
      nativeScriptSha256: pins.nativeScriptSha256, powershellPath: resolve(pins.powershellPath),
       powershellSha256: pins.powershellSha256, policyTemplateSha256: pins.policyTemplateSha256,
       repositoryWitnessPath: resolve(pins.repositoryWitnessPath),
       repositoryWitnessSha256: pins.repositoryWitnessSha256,
       uiWitnessPath: resolve(pins.uiWitnessPath), uiWitnessSha256: pins.uiWitnessSha256,
       rootId: candidate.rootId, network: "deny-all",
       filesystem: "read-only-selected-root-and-git-runtime", stdin: "closed",
       runtimeWorkingDirectory: "pinned-git-install-root",
       customEnvironment: "omitted", executableExtensionPoints: "closed", timeoutMs: 15_000,
      ui: "windows-allowed-container-isolated-no-clipboard-input-system-control-settings-ime" };
    const expectedReleaseDigest = createHash("sha256").update(canonicalJson(expectedReleaseManifest)).digest("hex");
    checks.exactMxcManifest = containedResults.every(result =>
      result.isolation.provider === "microsoft-mxc" && result.isolation.tier === "appcontainer-dacl"
      && result.isolation.network === "deny-all" && result.isolation.releaseDigest === expectedReleaseDigest
      && /^[a-f0-9]{64}$/u.test(result.isolation.manifestDigest))
      && capturedPolicies.length === containedResults.length
      && capturedPolicies.every((capture, index) => {
        const config = capture.config;
        return capture.options.executablePath === pins.mxcExecutorPath
          && resolve(capture.cwd) === resolve(pins.gitInstallRoot)
          && Object.hasOwn(config.process, "env") === false
          && resolve(config.process.cwd) === resolve(pins.gitInstallRoot)
          && config.process.commandLine.startsWith(`"${pins.gitPath}"`)
          && config.filesystem.readonlyPaths.length === 2
          && config.filesystem.readonlyPaths[0] === resolve(repository)
          && config.filesystem.readonlyPaths[1] === resolve(pins.gitInstallRoot)
          && config.filesystem.readwritePaths.length === 0
          && config.filesystem.deniedPaths.length === 0
          && config.network.egress.default === "deny" && config.network.ingress.default === "deny"
          && config.network.ingress.hostLoopback === "deny"
           && containedResults[index].isolation.policyDigest
             === createHash("sha256").update(canonicalJson(config)).digest("hex")
           && containedResults[index].isolation.policyTemplateSha256 === pins.policyTemplateSha256;
       });
    checks.exactReleasePinsVerifiedBeforeFixture = true;

    stage = "held-root-and-git-swap-race";
    attemptIdentitySwap = true;
    await unchanged("status");
    checks.rootAndGitRenameBlockedDuringSpawn = rootSwapBlocked && gitSwapBlocked;

    stage = "recursive-watcher-mutate-and-restore";
    const watcherBefore = await treeDigest(repository); attemptContentMutation = true;
    let watcherCode = null;
    try { await observer.observe(candidate.rootId, "status"); } catch (error) { watcherCode = error?.code ?? null; }
    const watcherAfter = await treeDigest(repository);
    checks.recursiveWatcherSuppressesLateMutateAndRestore = watcherCode === "omen-git-source-changed"
      && mutationChildCompleted && lateMutationApplied && lateMutationError === null
      && watcherBefore === watcherAfter;

    stage = "process-tree-audit-setup";
    const auditLoad = join(repository, "audit-load"); await mkdir(auditLoad);
    for (let start = 0; start < 1_500; start += 150) {
      await Promise.all(Array.from({ length: 150 }, (_unused, offset) =>
        writeFile(join(auditLoad, `file-${String(start + offset).padStart(4, "0")}.txt`), "owned\n")));
    }
    git(["add", "--", "audit-load"]);
    git(["-c", "user.name=Runa actual test", "-c", "user.email=runa@example.invalid", "commit", "-m", "Process audit load"]);
    const auditReady = join(root, "process-audit.ready"), auditRootPid = join(root, "process-audit.pid"),
      auditStop = join(root, "process-audit.stop"), auditResult = join(root, "process-audit.json");
    const monitor = spawn(pins.powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
      "Bypass", "-File", pins.processMonitorPath, "-ReadyPath", auditReady, "-RootPidPath", auditRootPid,
      "-StopPath", auditStop, "-ResultPath", auditResult, "-MaximumMs", "20000"],
    { windowsHide: true, stdio: "ignore" });
    const monitorExitPromise = waitForExit(monitor, 25_000);
    activeMonitor = monitor; activeMonitorExit = monitorExitPromise; activeAuditStop = auditStop;
    await waitForFile(auditReady);
    processAuditRootPidPath = auditRootPid;
    const auditBefore = await treeDigest(repository);
    stage = "process-tree-audit-operation";
    let auditAfter, auditFailure = null, monitorExit;
    try { await observer.observe(candidate.rootId, "status"); auditAfter = await treeDigest(repository); }
    catch (error) { auditFailure = error; }
    finally {
      processAuditRootPidPath = null;
      if (!existsSync(auditStop)) await writeFile(auditStop, "stop", { flag: "wx" });
      monitorExit = await monitorExitPromise;
    }
    activeMonitor = null; activeMonitorExit = null; activeAuditStop = null;
    if (auditFailure) throw auditFailure;
    await waitForFile(auditResult);
    const processAudit = JSON.parse(await readFile(auditResult, "utf8"));
    const descendants = Array.isArray(processAudit.descendants) ? processAudit.descendants
      : processAudit.descendants ? [processAudit.descendants] : [];
    const survivors = Array.isArray(processAudit.survivorProcessIds) ? processAudit.survivorProcessIds
      : processAudit.survivorProcessIds ? [processAudit.survivorProcessIds] : [];
    checks.processTreeBounded = monitorExit === 0 && processAudit.schemaVersion === "runa-omen-process-tree-audit/v1"
      && processAudit.timedOut === false
      && resolve(processAudit.rootProcess?.executablePath ?? "C:\\missing") === resolve(pins.mxcExecutorPath)
      && processAudit.rootProcess?.executableSha256 === pins.mxcExecutorSha256 && descendants.length >= 1
      && descendants.every(process => String(process.processName).toLowerCase() === "git.exe"
        && resolve(process.executablePath) === resolve(pins.gitPath)
        && process.executableSha256 === pins.gitSha256)
      && survivors.length === 0 && auditBefore === auditAfter;

    stage = "process-tree-timeout-audit";
    const timeoutReady = join(root, "timeout-audit.ready"), timeoutRootPid = join(root, "timeout-audit.pid"),
      timeoutStop = join(root, "timeout-audit.stop"), timeoutResult = join(root, "timeout-audit.json");
    const timeoutMonitor = spawn(pins.powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
      "Bypass", "-File", pins.processMonitorPath, "-ReadyPath", timeoutReady, "-RootPidPath", timeoutRootPid,
      "-StopPath", timeoutStop, "-ResultPath", timeoutResult, "-MaximumMs", "22000"],
    { windowsHide: true, stdio: "ignore" });
    const timeoutMonitorExit = waitForExit(timeoutMonitor, 27_000);
    activeMonitor = timeoutMonitor; activeMonitorExit = timeoutMonitorExit; activeAuditStop = timeoutStop;
    await waitForFile(timeoutReady);
    const statusArgs = fixedArguments("status", {}, repository), prefix = statusArgs.slice(0, statusArgs.indexOf("status"));
    const timeoutConfig = createContainedGitConfig({ createConfigFromPolicy }, { root: repository,
      gitInstallRoot: pins.gitInstallRoot, gitPath: pins.gitPath, args: [...prefix, "hash-object", "--stdin"],
      containerId: "runa-omen-git-timeout-proof" });
    if (policyTemplateDigest(timeoutConfig, repository, pins.gitInstallRoot) !== pins.policyTemplateSha256) {
      throw Object.assign(new Error("omen-timeout-policy-drift"), { code: "omen-timeout-policy-drift" });
    }
    const timeoutStarted = Date.now();
    if (resolve(timeoutConfig.process.cwd) !== resolve(pins.gitInstallRoot)) {
      throw Object.assign(new Error("omen-timeout-runtime-cwd-invalid"), { code: "omen-timeout-runtime-cwd-invalid" });
    }
    const timeoutChild = spawnSandboxWithPinnedCwd(spawnSandboxFromConfig, timeoutConfig,
      { usePty: false, executablePath: pins.mxcExecutorPath }, pins.gitInstallRoot,
      "omen-timeout-runtime-cwd-invalid");
    writeFileSync(timeoutRootPid, String(timeoutChild.pid), { flag: "wx" });
    const timeoutExitCode = await waitForExit(timeoutChild, 19_000), timeoutElapsedMs = Date.now() - timeoutStarted;
    try { timeoutChild.stdin?.end(); } catch {}
    await writeFile(timeoutStop, "stop", { flag: "wx" });
    const timeoutMonitorCode = await timeoutMonitorExit; await waitForFile(timeoutResult);
    activeMonitor = null; activeMonitorExit = null; activeAuditStop = null;
    const timeoutAudit = JSON.parse(await readFile(timeoutResult, "utf8"));
    const timeoutDescendants = Array.isArray(timeoutAudit.descendants) ? timeoutAudit.descendants
      : timeoutAudit.descendants ? [timeoutAudit.descendants] : [];
    const timeoutSurvivors = Array.isArray(timeoutAudit.survivorProcessIds) ? timeoutAudit.survivorProcessIds
      : timeoutAudit.survivorProcessIds ? [timeoutAudit.survivorProcessIds] : [];
    checks.timeoutProcessTreeBounded = timeoutExitCode !== null && timeoutExitCode !== 0
      && timeoutElapsedMs >= 14_000 && timeoutElapsedMs <= 19_000 && timeoutMonitorCode === 0
      && resolve(timeoutAudit.rootProcess?.executablePath ?? "C:\\missing") === resolve(pins.mxcExecutorPath)
      && timeoutAudit.rootProcess?.executableSha256 === pins.mxcExecutorSha256
      && timeoutDescendants.length >= 1
      && timeoutDescendants.every(process => resolve(process.executablePath) === resolve(pins.gitPath)
        && process.executableSha256 === pins.gitSha256)
      && timeoutSurvivors.length === 0;

    stage = "first-run-and-post-restart-network-containment";
    const networkUrls = [`http://127.0.0.1:${probes[0].port}/runa/probe.git`,
      `http://${lanAddress}:${probes[1].port}/runa/probe.git`, "https://github.com/octocat/Hello-World.git"];
    const firstNetwork = await runNetworkChild("first-run", repository, networkUrls);
    const restartedNetwork = await runNetworkChild("post-restart", repository, networkUrls);
    checks.networkDeniedFirstRunAndPostRestart = firstNetwork.attempts.length === 3
      && restartedNetwork.attempts.length === 3
      && [...firstNetwork.attempts, ...restartedNetwork.attempts].every(value => value.attemptedConnection === true)
      && probes.every(probe => probe.connections() === 0);

    const expectDeniedUnchanged = async (name, action, expectedCodes, digestRoot = repository) => {
      stage = name;
      const before = await treeDigest(digestRoot);
      let code = null;
      try { await action(); } catch (error) { code = error?.code ?? null; }
      const after = await treeDigest(digestRoot);
      checks[name] = expectedCodes.includes(code) && before === after;
    };
    const configPath = join(repository, ".git", "config"), baseConfig = await readFile(configPath);
    const configCases = [
      ["implicitPromisorDenied", `${baseConfig}\n[remote \"hostile\"]\n\tpromisor\n`],
      ["legacyImplicitPromisorDenied", `${baseConfig}\n[remote.hostile]\n\tpromisor\n`],
      ["tabbedRemoteNameDenied", `${baseConfig}\n[remote \"hostile${String.fromCharCode(9)}name\"]\n\turl = https://example.invalid/repo.git\n`],
      ["commentedIncludeDenied", `${baseConfig}\n[include] # hostile\n\tpath = ../outside\n`],
      ["partialCloneDenied", `${baseConfig}\n[extensions]\n\tpartialClone = hostile\n`],
      ["executableHelperDenied", `${baseConfig}\n[filter \"hostile\"]\n\tprocess = helper.exe\n`],
      ["networkPromisorDenied", `${baseConfig}\n[remote \"hostile\"]\n\turl = http://127.0.0.1:${probes[0].port}/missing.git\n\tpromisor\n`],
    ];
    for (const [name, text] of configCases) {
      await writeFile(configPath, text);
      await expectDeniedUnchanged(name, () => observer.observe(candidate.rootId, "status"), ["omen-git-config-denied"]);
      await writeFile(configPath, baseConfig);
    }
    const attributesPath = join(repository, ".gitattributes");
    await writeFile(attributesPath, "*.txt filter=lfs\n");
    await expectDeniedUnchanged("repositoryAttributesDenied", () => observer.observe(candidate.rootId, "status"),
      ["native-git-attributes-denied"]);
    await unlink(attributesPath);
    const alternatesPath = join(repository, ".git", "objects", "info", "alternates");
    await writeFile(alternatesPath, "C:\\outside\n");
    await expectDeniedUnchanged("alternatesDenied", () => observer.observe(candidate.rootId, "status"),
      ["native-git-metadata-denied"]);
    await unlink(alternatesPath);
    const graftsPath = join(repository, ".git", "info", "grafts");
    await writeFile(graftsPath, `${commit}\n`);
    await expectDeniedUnchanged("graftsDenied", () => observer.observe(candidate.rootId, "status"),
      ["native-git-metadata-denied"]);
    await unlink(graftsPath);
    const replaceDirectory = join(repository, ".git", "refs", "replace");
    await mkdir(replaceDirectory, { recursive: true });
    const replacementPath = join(replaceDirectory, commit); await writeFile(replacementPath, `${commit}\n`);
    await expectDeniedUnchanged("looseReplacementDenied", () => observer.observe(candidate.rootId, "log"),
      ["native-git-replacement-denied"]);
    await unlink(replacementPath); await rm(replaceDirectory, { recursive: true, force: true });
    const packedRefsPath = join(repository, ".git", "packed-refs");
    const packedRefs = existsSync(packedRefsPath) ? await readFile(packedRefsPath) : null;
    await writeFile(packedRefsPath, `${packedRefs ?? ""}${commit} refs/replace/${commit}\n`);
    await expectDeniedUnchanged("packedReplacementDenied", () => observer.observe(candidate.rootId, "log"),
      ["omen-git-metadata-denied"]);
    if (packedRefs) await writeFile(packedRefsPath, packedRefs); else await unlink(packedRefsPath);
    const controlName = join(repository, "control\nname.txt"); await writeFile(controlName, "owned\n");
    await expectDeniedUnchanged("controlCharacterOutputDenied", () => observer.observe(candidate.rootId, "status"),
      ["omen-git-output-invalid"]);
    await unlink(controlName);
    const tree = git(["rev-parse", `${commit}^{tree}`]);
    const invalidCommit = Buffer.concat([Buffer.from(`tree ${tree}\nparent ${commit}\n`
      + "author Runa actual test <runa@example.invalid> 1700000000 +0000\n"
      + "committer Runa actual test <runa@example.invalid> 1700000000 +0000\n\ninvalid "),
    Buffer.from([0xff]), Buffer.from(" subject\n")]);
    const invalidResult = spawnSync(pins.gitPath, ["hash-object", "-t", "commit", "-w", "--stdin"], {
      cwd: repository, windowsHide: true, input: invalidCommit, encoding: "utf8", timeout: 15_000,
      env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: resolve(pins.gitInstallRoot) },
    });
    if (invalidResult.status !== 0 || !/^[a-f0-9]{40,64}\s*$/u.test(invalidResult.stdout)) {
      throw Object.assign(new Error("omen-invalid-commit-fixture-failed"), { code: "omen-invalid-commit-fixture-failed" });
    }
    const invalidCommitId = invalidResult.stdout.trim();
    await expectDeniedUnchanged("invalidUtf8OutputDenied",
      () => observer.observe(candidate.rootId, "show", { commit: invalidCommitId }), ["omen-git-output-invalid"]);
    const gitDirectory = join(repository, ".git"), heldGitDirectory = join(repository, ".git-held");
    await rename(gitDirectory, heldGitDirectory); await writeFile(gitDirectory, "gitdir: .git-held\n");
    await expectDeniedUnchanged("gitIndirectionDenied", () => observer.observe(candidate.rootId, "status"),
      ["omen-git-root-not-found", "native-open-denied"]);
    await unlink(gitDirectory); await symlink(heldGitDirectory, gitDirectory, "junction");
    await expectDeniedUnchanged("gitReparseDenied", () => observer.observe(candidate.rootId, "status"),
      ["omen-git-root-not-found", "native-reparse-denied"]);
    await unlink(gitDirectory); await rename(heldGitDirectory, gitDirectory);
    const heldRepository = `${repository}-held`;
    await rename(repository, heldRepository); await mkdir(repository);
    await expectDeniedUnchanged("replacedRootDenied", () => observer.observe(candidate.rootId, "status"),
      ["omen-root-identity-changed"], heldRepository);
    await rm(repository, { recursive: true, force: true }); await rename(heldRepository, repository);
    checks.nativeGuardsPinnedAndReleased = guardAudits.length > 0 && guardAudits.every(guard => guard.released
      && resolve(guard.executablePath) === resolve(pins.powershellPath)
      && guard.executableSha256 === pins.powershellSha256);
    checks.zeroProbeConnections = probes.every(probe => probe.connections() === 0);
    }
  } catch (error) { error.stage ??= stage; failure = error; }
  finally {
    let cleanupError = null;
    const retainCleanupError = error => { cleanupError ??= error; };
    if (activeMonitor) {
      try { if (activeAuditStop && !existsSync(activeAuditStop)) await writeFile(activeAuditStop, "stop"); }
      catch (error) { retainCleanupError(error); }
      try { await activeMonitorExit; }
      catch (error) { try { activeMonitor.kill(); } catch {} retainCleanupError(error); }
    }
    for (const audit of childAudits) {
      if (audit.terminal) continue;
      try { audit.child.kill(); } catch {}
      try { await requireTerminal(audit.terminalPromise, 5_000, "omen-git-cleanup-child-terminal-missed"); }
      catch (error) { retainCleanupError(error); }
    }
    for (const audit of witnessAudits) {
      if (audit.terminal) continue;
      try { audit.witness.terminate(); } catch {}
      try { await requireTerminal(audit.terminalPromise, 2_000, "omen-git-cleanup-witness-terminal-missed"); }
      catch (error) { retainCleanupError(error); }
    }
    for (const audit of guardAudits) {
      if (audit.released) continue;
      try { await requireTerminal(audit.release(), 5_000, "omen-git-cleanup-guard-terminal-missed"); }
      catch (error) { retainCleanupError(error); }
    }
    try { await Promise.all(probes.map(probe => new Promise(done => probe.server.close(done)))); }
    catch (error) { retainCleanupError(error); }
    const resourcesTerminal = childAudits.every(audit => audit.terminal)
      && witnessAudits.every(audit => audit.terminal) && guardAudits.every(audit => audit.released);
    if (!resourcesTerminal) retainCleanupError(Object.assign(new Error("omen-git-owned-resource-terminal-missed"),
      { code: "omen-git-owned-resource-terminal-missed" }));
    try {
      if (resolve(root) !== resolve(exactRoot) || !resolve(root).startsWith(resolve(tmpdir()) + sep)
          || !root.includes("runa-m1-omen-git-")) {
        throw Object.assign(new Error("omen-git-cleanup-root-invalid"), { code: "omen-git-cleanup-root-invalid" });
      }
      if (!cleanupError) {
        await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        checks.ownedFixtureRemoved = !existsSync(root);
      }
    } catch (error) { retainCleanupError(error); }
    if (cleanupError) {
      stage = "cleanup";
      cleanupError.stage = "cleanup";
      failure ??= cleanupError;
    }
  }
  const diagnosticState = { stage, operationCount: diagnosticOperationCount, successorStarted: false,
    repositoryUnchanged: diagnosticRepositoryUnchanged,
    wrapperCount: childAudits.length, witnessCount: witnessAudits.length, guardCount: guardAudits.length,
    wrapperTerminal: childAudits.every(audit => audit.terminal),
    witnessesTerminal: witnessAudits.every(audit => audit.terminal),
    guardReleased: guardAudits.every(audit => audit.released),
    fixtureRemoved: checks.ownedFixtureRemoved === true,
    fatalObservation: diagnosticObservation?.outcome === "git-fatal" ? diagnosticObservation : null };
  const permissionTransition = permissionCoordinator?.snapshot() ?? { operationCount: 0,
    successorAfterFailure: false, attempts: [], repositoryUnchanged: false };
  const permissionState = { stage, operationCount: permissionTransition.operationCount,
    successorAfterFailure: permissionTransition.successorAfterFailure, attempts: permissionTransition.attempts,
    repositoryUnchanged: permissionTransition.repositoryUnchanged,
    wrapperCount: childAudits.length, witnessCount: witnessAudits.length, guardCount: guardAudits.length,
    wrappersTerminal: childAudits.every(audit => audit.terminal),
    witnessesTerminal: witnessAudits.every(audit => audit.terminal),
    guardsReleased: guardAudits.every(audit => audit.released), fixtureRemoved: checks.ownedFixtureRemoved === true };
  if (fatalDiagnostic) {
    if (failure) throw Object.assign(failure, { diagnosticState });
    try { return completedGitFatalDiagnostic(diagnosticObservation, diagnosticState); }
    catch (error) { throw Object.assign(error, { diagnosticState: { ...diagnosticState, stage: "publication" } }); }
  }
  if (permissionBoundaryDiagnostic) {
    if (failure) throw Object.assign(failure, { permissionDiagnosticState: permissionState });
    try { return completedPermissionBoundaryDiagnostic(permissionTransition.attempts, permissionState); }
    catch (error) { throw Object.assign(error, { permissionDiagnosticState: { ...permissionState,
      stage: "publication" } }); }
  }
  if (failure) throw failure;
  return { schemaVersion: "runaai-m1-omen-git-proof/v1", passed: Object.values(checks).every(Boolean), checks,
    privateValuesIncluded: false, productionChanged: false, modelCalled: false };
}

export async function runActualOmenGitFatalDiagnostic(options = {}) {
  try { return await runActualOmenGitProof({ ...options, fatalDiagnostic: true }); }
  catch (error) {
    const state = error?.diagnosticState ?? { stage: "preflight", operationCount: 0, successorStarted: false,
      repositoryUnchanged: false, wrapperTerminal: false, witnessesTerminal: false, guardReleased: false,
      fixtureRemoved: false };
    let publicRecord;
    try { publicRecord = failedGitFatalDiagnostic(error, state); }
    catch { throw Object.assign(new Error("diagnostic-publication-refused"), { code: "diagnostic-publication-refused" }); }
    throw Object.assign(new Error("runaai-m1-omen-git-fatal-diagnostic-failed"), {
      code: "runaai-m1-omen-git-fatal-diagnostic-failed",
      publicRecord,
    });
  }
}

export async function runActualOmenGitPermissionBoundaryDiagnostic(options = {}) {
  try { return await runActualOmenGitProof({ ...options, permissionBoundaryDiagnostic: true }); }
  catch (error) {
    const state = error?.permissionDiagnosticState ?? { stage: "preflight", operationCount: 0,
      successorAfterFailure: false, attempts: [], wrapperCount: 0, witnessCount: 0, guardCount: 0,
      wrappersTerminal: true, witnessesTerminal: true, guardsReleased: true, fixtureRemoved: false };
    let publicRecord;
    try { publicRecord = failedPermissionBoundaryDiagnostic(error, state); }
    catch { throw Object.assign(new Error("diagnostic-publication-refused"), { code: "diagnostic-publication-refused" }); }
    throw Object.assign(new Error("runaai-m1-omen-git-permission-boundary-diagnostic-failed"), {
      code: "runaai-m1-omen-git-permission-boundary-diagnostic-failed", publicRecord,
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runActualOmenGitProof()
    .then(result => { process.stdout.write(`${JSON.stringify(result)}\n`); if (!result.passed) process.exitCode = 1; },
      error => { process.stderr.write(`${JSON.stringify({ schemaVersion: "runaai-m1-omen-git-error/v1",
        errorCode: error?.code ?? "omen-git-proof-failed", stage: error?.stage ?? "unknown",
        exitCode: error?.exitCode ?? null, stderrBytes: error?.stderrBytes ?? null,
        stderrSha256: error?.stderrSha256 ?? null,
        privateValuesIncluded: false })}\n`); process.exitCode = 1; });
}
