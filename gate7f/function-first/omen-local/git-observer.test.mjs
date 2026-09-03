import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConfigFromPolicy } from "@microsoft/mxc-sdk";
import { classifyGitFatal, fixedArguments, inspectRepositoryConfig, OmenGitObserver, sanitizeRemoteUrl,
  structuredResult } from "./git-observer.mjs";

const POLICY_TEMPLATE_SHA256 = "8682225c5cfaf71445f2e3e7969fef580ed7130a55a5ea63b2e2c4ada2c85e9b";

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function witnessFactories({ repositoryNameEvents = () => 0 } = {}) {
  const repository = () => {
    const result = deferred();
    return { ready: Promise.resolve(), abort: new Promise(() => {}), result: result.promise,
      exit: Promise.resolve(0), complete() { result.resolve({ counts: { name: repositoryNameEvents(), content: 0,
        metadata: 0, security: 2, errors: 0 }, securityEntries: 3, securityEqual: true }); }, terminate() {} };
  };
  const ui = () => {
    const result = deferred();
    return { ready: Promise.resolve(), abort: new Promise(() => {}), result: result.promise,
      exit: Promise.resolve(0), bindWrapper() {}, complete() { result.resolve({ inputDesktopEvents: 0,
        attributableWindowEvents: 0, errors: 0, overflow: false, survivorObserved: false }); },
      cancelBeforeBind() {}, terminate() {} };
  };
  return { repository, ui };
}

function witnessOptions(systemConfig, systemConfigSha, systemAttributes, systemAttributesSha, factories) {
  return { repositoryWitnessPath: systemConfig, expectedRepositoryWitnessSha256: systemConfigSha,
    uiWitnessPath: systemAttributes, expectedUiWitnessSha256: systemAttributesSha,
    repositoryWitnessFactory: factories.repository, uiWitnessFactory: factories.ui };
}

class FakeChild extends EventEmitter {
  constructor(stdout) {
    super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter();
    this.pid = 4321;
    this.stdin = { on() {}, end() {} };
    queueMicrotask(() => { this.stdout.emit("data", Buffer.from(stdout)); this.emit("close", 0); });
  }
  kill() { this.emit("close", 1); }
}

class ControlledChild extends EventEmitter {
  constructor({ output = Buffer.alloc(0), exitCode = null, stderr = Buffer.alloc(0), closeOnKill = null } = {}) {
    super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter();
    this.pid = 4321;
    this.stdin = { on() {}, end() {} }; this.exitCode = exitCode; this.killCount = 0;
    this.closeOnKill = closeOnKill;
    queueMicrotask(() => {
      if (output.length) this.stdout.emit("data", output);
      if (stderr.length) this.stderr.emit("data", stderr);
      if (exitCode !== null) this.emit("close", exitCode);
    });
  }
  kill() { this.killCount += 1;
    if (this.closeOnKill === this.killCount) queueMicrotask(() => this.emit("close", 1)); }
}

async function lifecycleHarness(t, { repositoryFactory, uiFactory, createPolicy = createConfigFromPolicy,
  spawnFactory = () => new FakeChild("# branch.head main\0"), terminalGraceMs = 20 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "runa-git-lifecycle-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const selectedRoot = join(directory, "repository"), runtimeRoot = join(directory, "git-runtime");
  await Promise.all([mkdir(selectedRoot), mkdir(runtimeRoot)]);
  const gitPath = join(runtimeRoot, "git.exe"), mxcPath = join(runtimeRoot, "wxc-exec.exe");
  const repositoryWitnessPath = join(runtimeRoot, "repository.ps1"), uiWitnessPath = join(runtimeRoot, "ui.ps1");
  await Promise.all([writeFile(gitPath, "git"), writeFile(mxcPath, "mxc"),
    writeFile(repositoryWitnessPath, "repository"), writeFile(uiWitnessPath, "ui")]);
  const digest = value => createHash("sha256").update(value).digest("hex");
  const gitSha = digest("git"), mxcSha = digest("mxc"), repositorySha = digest("repository"), uiSha = digest("ui");
  const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: selectedRoot,
    gitFinalPath: join(selectedRoot, ".git"), volumeId: "00000001", fileId: "0000000000000001" }) };
  const nativeBridge = { verifyRelease: async () => ({ scriptSha256: "a".repeat(64),
    powershellPath: gitPath, powershellSha256: gitSha }),
  holdGit: async () => ({ rootFinalPath: selectedRoot, gitFinalPath: join(selectedRoot, ".git"), release: async () => {} }),
  safeRead: async (_root, path) => {
    if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0");
    throw Object.assign(new Error("missing"), { code: "native-open-denied" });
  } };
  return new OmenGitObserver({ rootStore, nativeBridge, gitPath, expectedGitSha256: gitSha,
    gitInstallRoot: runtimeRoot, mxcExecutorPath: mxcPath, expectedMxcSha256: mxcSha,
    expectedNativeScriptSha256: "a".repeat(64), expectedPowerShellSha256: gitSha,
    gitSystemConfigPath: repositoryWitnessPath, expectedGitSystemConfigSha256: repositorySha,
    gitSystemAttributesPath: uiWitnessPath, expectedGitSystemAttributesSha256: uiSha,
    expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256,
    repositoryWitnessPath, expectedRepositoryWitnessSha256: repositorySha,
    uiWitnessPath, expectedUiWitnessSha256: uiSha, repositoryWitnessFactory: repositoryFactory,
    uiWitnessFactory: uiFactory, terminalGraceMs, sdk: {
      getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
        isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
      createConfigFromPolicy: createPolicy, spawnSandboxFromConfig: spawnFactory,
    } });
}

function trackedWitness(kind, state, abort = new Promise(() => {})) {
  const result = deferred(), exit = deferred();
  const finish = () => { if (state.finished) return; state.finished = true;
    result.resolve(kind === "repository" ? { counts: { name: 0, content: 0, metadata: 0, security: 0, errors: 0 },
      securityEntries: 1, securityEqual: true } : { inputDesktopEvents: 0, attributableWindowEvents: 0,
      errors: 0, overflow: false, survivorObserved: false }); exit.resolve(0); };
  return { ready: Promise.resolve(), abort, result: result.promise, exit: exit.promise,
    bindWrapper() { state.bound = true; }, complete() { state.completed = true; finish(); },
    cancelBeforeBind() { state.cancelled = true; exit.resolve(0); state.finished = true; },
    terminate() { state.terminated = true; exit.resolve(1); } };
}

test("a synchronous UI witness startup failure still closes the repository witness", async t => {
  const repositoryState = {};
  const observer = await lifecycleHarness(t, {
    repositoryFactory: () => trackedWitness("repository", repositoryState),
    uiFactory: () => { throw Object.assign(new Error("ui-start-failed"), { code: "ui-start-failed" }); },
  });
  await assert.rejects(observer.observe("root-1", "status"), { code: "ui-start-failed" });
  assert.equal(repositoryState.completed, true);
  assert.equal(repositoryState.finished, true);
});

test("a repository abort during policy construction prevents process spawn and cancels unbound UI", async t => {
  const repositoryState = {}, uiState = {}, abort = deferred(); let spawnCount = 0;
  const observer = await lifecycleHarness(t, {
    repositoryFactory: () => trackedWitness("repository", repositoryState, abort.promise),
    uiFactory: () => trackedWitness("ui", uiState),
    createPolicy: (...args) => { const config = createConfigFromPolicy(...args);
      abort.resolve(Object.assign(new Error("source changed"), { code: "omen-git-source-changed" })); return config; },
    spawnFactory: () => { spawnCount += 1; return new FakeChild("# branch.head main\0"); },
  });
  await assert.rejects(observer.observe("root-1", "status"), { code: "omen-git-source-changed" });
  assert.equal(spawnCount, 0);
  assert.equal(repositoryState.completed, true);
  assert.equal(uiState.cancelled, true);
  assert.equal(uiState.bound, undefined);
});

test("repository config denies executable, include and lazy-fetch surfaces", () => {
  assert.deepEqual(inspectRepositoryConfig("[core]\n\trepositoryformatversion = 0\n[remote \"origin\"]\n\turl = https://user:secret@example.test/org/repo.git").remotes,
    [{ name: "origin", direction: "fetch", display: "example.test/org/repo" }]);
  for (const config of ["[include]\npath = ../other", "[core]\nfsmonitor = helper.exe",
    "[filter \"x\"]\nprocess = helper.exe", "[credential]\nhelper = manager", "[remote \"x\"]\npromisor = true",
    "[remote \"x\"]\npromisor", "[include] # trailing comment\npath = ../other",
    "[extensions]\npartialClone = origin", "[remote.origin]\npromisor", "[core]\nvalue = one\\"]) {
    assert.throws(() => inspectRepositoryConfig(config), { code: "omen-git-config-denied" });
  }
});

test("remote sanitization removes credentials and rejects ambiguous local forms", () => {
  assert.equal(sanitizeRemoteUrl("git@example.test:org/repo.git"), "example.test/org/repo");
  assert.equal(sanitizeRemoteUrl("https://person:secret@example.test/org/repo.git"), "example.test/org/repo");
  assert.throws(() => sanitizeRemoteUrl("../outside/repo"), { code: "omen-git-remote-invalid" });
  assert.throws(() => inspectRepositoryConfig(`[remote "bad${String.fromCharCode(9)}name"]\nurl=https://example.test/repo`),
    { code: "omen-git-config-denied" });
});

test("operation-specific schemas reject malformed NUL records", () => {
  const hash = "a".repeat(40);
  assert.throws(() => structuredResult("status", Buffer.from("not-porcelain\0")), { code: "omen-git-output-invalid" });
  assert.throws(() => structuredResult("log", Buffer.from(`${hash}\0not-a-time\0subject\0`)), { code: "omen-git-output-invalid" });
  assert.throws(() => structuredResult("branches", Buffer.from(`main\0bad-hash\0`)), { code: "omen-git-output-invalid" });
  assert.throws(() => structuredResult("diffstat", Buffer.from("one\ttwo\tfile\0")), { code: "omen-git-output-invalid" });
  assert.throws(() => structuredResult("show", Buffer.from([hash, "1700000000", ""].join("\0"))),
    { code: "omen-git-output-invalid" });
  assert.throws(() => structuredResult("diffstat",
    Buffer.from(`${Array.from({ length: 501 }, (_unused, index) => `1\t0\tf-${index}.txt`).join("\0")}\0`)),
  { code: "omen-git-output-invalid" });
  assert.throws(() => structuredResult("status",
    Buffer.from(`${Array.from({ length: 501 }, (_unused, index) => `? f-${index}.txt`).join("\0")}\0`)),
  { code: "omen-git-output-invalid" });
});

test("operation-specific schemas accept the exact bounded machine records", () => {
  const hash = "a".repeat(40);
  assert.equal(structuredResult("status", Buffer.from(`# branch.oid ${hash}\0# branch.head main\0`
    + `1 .M N... 100644 100644 100644 ${hash} ${hash} notes.txt\0? new.txt\0`)).fields.length, 4);
  assert.equal(structuredResult("log", Buffer.from([hash, "1700000000", "subject", ""].join("\0"))).fields.length, 3);
  assert.equal(structuredResult("branches", Buffer.from(`main\0${hash}\0\n`)).fields.length, 2);
  assert.equal(structuredResult("diffstat", Buffer.from("1\t0\tnotes.txt\0")).fields.length, 1);
  assert.equal(structuredResult("show", Buffer.from([hash, "1700000000", "subject", "\n1\t0\tnotes.txt", ""].join("\0"))).fields.length, 4);
});

test("fixed Git argv exactly closes environment-replacement and executable extension surfaces", () => {
  const root = "C:\\Runa Git Fixture";
  const args = fixedArguments("diffstat", {}, root);
  assert.deepEqual(args.slice(0, 4),
    ["--no-optional-locks", "--no-replace-objects", "--no-lazy-fetch", "--no-pager"]);
  assert.deepEqual(args.slice(4, 6), [`--git-dir=${join(resolve(root), ".git")}`,
    `--work-tree=${resolve(root)}`]);
  assert.equal(args.includes("-C"), false);
  const pairs = new Map();
  for (let index = 6; index < args.indexOf("diff"); index += 2) {
    assert.equal(args[index], "-c");
    const [key, ...value] = args[index + 1].split("=");
    pairs.set(key, value.join("="));
  }
  assert.deepEqual(Object.fromEntries(pairs), {
    "core.hooksPath": "NUL", "credential.helper": "", "credential.interactive": "false",
    "core.askPass": "", "core.fsmonitor": "false", "diff.external": "",
    "core.attributesFile": "NUL", "core.excludesFile": "", "interactive.diffFilter": "",
    "protocol.allow": "never", "maintenance.auto": "false", "gc.auto": "0",
    "fetch.writeCommitGraph": "false", "core.untrackedCache": "false",
    "core.preloadIndex": "false", "core.safecrlf": "false", "safe.directory": resolve(root),
  });
  assert.deepEqual(args.slice(args.indexOf("diff")),
    ["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--", "."]);
});

test("observer authors a fixed deny-all MXC request and parses NUL output", async t => {
  const directory = await mkdtemp(join(tmpdir(), "runa-git-observer-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const selectedRoot = join(directory, "repository"), runtimeRoot = join(directory, "git-runtime");
  await Promise.all([mkdir(selectedRoot), mkdir(runtimeRoot)]);
  const gitPath = join(runtimeRoot, "git.exe"); await writeFile(gitPath, "synthetic pinned executable");
  const mxcPath = join(runtimeRoot, "wxc-exec.exe"); await writeFile(mxcPath, "synthetic mxc executable");
  const expectedGitSha256 = createHash("sha256").update("synthetic pinned executable").digest("hex");
  const expectedMxcSha256 = createHash("sha256").update("synthetic mxc executable").digest("hex");
  const expectedNativeScriptSha256 = "a".repeat(64);
  const systemConfig = join(runtimeRoot, "system-gitconfig"), systemAttributes = join(runtimeRoot, "system-gitattributes");
  await writeFile(systemConfig, "system config"); await writeFile(systemAttributes, "system attributes");
  const systemConfigSha = createHash("sha256").update("system config").digest("hex");
  const systemAttributesSha = createHash("sha256").update("system attributes").digest("hex");
  let policy, generated, spawnCount = 0, mutateAfterChildClose = false, mutatedAfterClose = false;
  const sdk = {
    getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
      isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
    createConfigFromPolicy: (value, kind, id) => { policy = value;
      return generated = createConfigFromPolicy(value, kind, id); },
    spawnSandboxFromConfig: (value, _options, workingDirectory) => { spawnCount += 1;
      assert.equal(value, generated); assert.equal(resolve(value.process.cwd), resolve(runtimeRoot));
      assert.equal(resolve(workingDirectory), resolve(runtimeRoot));
      const child = new FakeChild("# branch.head main\0? notes.txt\0");
      if (mutateAfterChildClose) {
        mutateAfterChildClose = false;
         child.once("close", exitCode => {
           assert.equal(exitCode, 0);
           mutatedAfterClose = true;
         });
      }
      return child; },
  };
  const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: selectedRoot,
    gitFinalPath: join(selectedRoot, ".git"), displayName: "fixture", volumeId: "00000001",
    fileId: "0000000000000001", privateValuesIncluded: true }) };
  const nativeBridge = { verifyRelease: async () => ({ scriptSha256: expectedNativeScriptSha256,
    powershellPath: gitPath, powershellSha256: expectedGitSha256 }),
  holdGit: async () => ({ rootFinalPath: selectedRoot, gitFinalPath: join(selectedRoot, ".git"), release: async () => {} }),
  safeRead: async (_root, path) => {
    if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0\n"
      + "[remote \"origin\"]\nurl = https://person:secret@example.test/org/repo.git");
    throw Object.assign(new Error("missing"), { code: "native-open-denied" });
  } };
  const observer = new OmenGitObserver({ rootStore, nativeBridge, gitPath, expectedGitSha256,
    gitInstallRoot: runtimeRoot, mxcExecutorPath: mxcPath, expectedMxcSha256,
    expectedNativeScriptSha256, expectedPowerShellSha256: expectedGitSha256,
    gitSystemConfigPath: systemConfig, expectedGitSystemConfigSha256: systemConfigSha,
    gitSystemAttributesPath: systemAttributes, expectedGitSystemAttributesSha256: systemAttributesSha,
    expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256,
    ...witnessOptions(systemConfig, systemConfigSha, systemAttributes, systemAttributesSha,
      witnessFactories({ repositoryNameEvents: () => mutatedAfterClose ? 1 : 0 })), sdk });
  const result = await observer.observe("root-1", "status");
  assert.deepEqual(result.fields, ["# branch.head main", "? notes.txt"]);
  assert.equal(policy.network.egress.default, "deny");
  assert.equal(policy.network.ingress.hostLoopback, "deny");
  assert.deepEqual(policy.filesystem.readwritePaths, []);
  assert.match(generated.process.commandLine, /--no-optional-locks/u);
  assert.match(generated.process.commandLine, /--no-replace-objects/u);
  assert.match(generated.process.commandLine, /--no-lazy-fetch/u);
  assert.match(generated.process.commandLine, /credential\.interactive=false/u);
  assert.match(generated.process.commandLine, /protocol\.allow=never/u);
  assert.match(generated.process.commandLine, /safe\.directory=/u);
  assert.equal(policy.timeoutMs, 15_000);
  assert.equal(policy.ui.allowWindows, true);
  assert.equal(generated.processContainer.ui.isolation, "container");
  assert.equal(generated.processContainer.ui.desktopSystemControl, false);
  assert.equal(generated.processContainer.ui.systemSettings, "none");
  assert.equal(generated.processContainer.ui.ime, false);
  assert.equal(generated.ui.clipboard, "none");
  assert.equal(generated.ui.injection, false);
  assert.equal(Object.hasOwn(generated.process, "env"), false);
  assert.equal(result.isolation.policyDigest.length, 64);
  assert.doesNotMatch(generated.process.commandLine, /"(?:fetch|pull|push|clone)"/u);
  const remotes = await observer.observe("root-1", "remotes");
  assert.deepEqual(remotes.remotes, [{ name: "origin", direction: "fetch", display: "example.test/org/repo" }]);
  assert.equal(spawnCount, 1);
  mutateAfterChildClose = true;
  await assert.rejects(observer.observe("root-1", "status"), { code: "omen-git-source-changed" });
});

test("Git output decoding rejects malformed UTF-8 instead of replacing bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runa-git-utf8-unit-"));
  try {
    const selectedRoot = join(directory, "repository"), runtimeRoot = join(directory, "git-runtime");
    await Promise.all([mkdir(selectedRoot), mkdir(runtimeRoot)]);
    const gitPath = join(runtimeRoot, "git.exe"); await writeFile(gitPath, "synthetic pinned executable");
    const mxcPath = join(runtimeRoot, "wxc-exec.exe"); await writeFile(mxcPath, "synthetic mxc executable");
    const expectedGitSha256 = createHash("sha256").update("synthetic pinned executable").digest("hex");
    const expectedMxcSha256 = createHash("sha256").update("synthetic mxc executable").digest("hex");
    const expectedNativeScriptSha256 = "a".repeat(64);
    const systemConfig = join(runtimeRoot, "system-gitconfig"), systemAttributes = join(runtimeRoot, "system-gitattributes");
    await writeFile(systemConfig, "system config"); await writeFile(systemAttributes, "system attributes");
    const systemConfigSha = createHash("sha256").update("system config").digest("hex");
    const systemAttributesSha = createHash("sha256").update("system attributes").digest("hex");
    const sdk = {
      getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
        isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
      createConfigFromPolicy,
      spawnSandboxFromConfig: () => new FakeChild(Buffer.from([0xc3, 0x28])),
    };
    const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: selectedRoot,
      gitFinalPath: join(selectedRoot, ".git") }) };
    const nativeBridge = { verifyRelease: async () => ({ scriptSha256: expectedNativeScriptSha256,
      powershellPath: gitPath, powershellSha256: expectedGitSha256 }),
    holdGit: async () => ({ rootFinalPath: selectedRoot, gitFinalPath: join(selectedRoot, ".git"), release: async () => {} }),
    safeRead: async (_root, path) => {
      if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0");
      throw Object.assign(new Error("missing"), { code: "native-open-denied" });
    } };
    const observer = new OmenGitObserver({ rootStore, nativeBridge, gitPath, expectedGitSha256,
      gitInstallRoot: runtimeRoot, mxcExecutorPath: mxcPath, expectedMxcSha256,
      expectedNativeScriptSha256, expectedPowerShellSha256: expectedGitSha256,
      gitSystemConfigPath: systemConfig, expectedGitSystemConfigSha256: systemConfigSha,
      gitSystemAttributesPath: systemAttributes, expectedGitSystemAttributesSha256: systemAttributesSha,
      expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256,
      ...witnessOptions(systemConfig, systemConfigSha, systemAttributes, systemAttributesSha, witnessFactories()), sdk });
    await assert.rejects(observer.observe("root-1", "status"), { code: "omen-git-output-invalid" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("output termination is bounded and raw stderr never crosses the diagnostic contract", async t => {
  const directory = await mkdtemp(join(tmpdir(), "runa-git-terminal-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const selectedRoot = join(directory, "repository"), runtimeRoot = join(directory, "git-runtime");
  await Promise.all([mkdir(selectedRoot), mkdir(runtimeRoot)]);
  const gitPath = join(runtimeRoot, "git.exe"), mxcPath = join(runtimeRoot, "wxc-exec.exe");
  await writeFile(gitPath, "synthetic pinned executable"); await writeFile(mxcPath, "synthetic mxc executable");
  const gitSha = createHash("sha256").update("synthetic pinned executable").digest("hex");
  const mxcSha = createHash("sha256").update("synthetic mxc executable").digest("hex");
  const nativeSha = "a".repeat(64);
  const systemConfig = join(runtimeRoot, "system-gitconfig"), systemAttributes = join(runtimeRoot, "system-gitattributes");
  await writeFile(systemConfig, "system config"); await writeFile(systemAttributes, "system attributes");
  const systemConfigSha = createHash("sha256").update("system config").digest("hex");
  const systemAttributesSha = createHash("sha256").update("system attributes").digest("hex");
  const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: selectedRoot,
    gitFinalPath: join(selectedRoot, ".git") }) };
  const nativeBridge = { verifyRelease: async () => ({ scriptSha256: nativeSha, powershellPath: gitPath,
    powershellSha256: gitSha }),
    holdGit: async () => ({ rootFinalPath: selectedRoot, gitFinalPath: join(selectedRoot, ".git"), release: async () => {} }),
    safeRead: async (_root, path) => {
      if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0");
      throw Object.assign(new Error("missing"), { code: "native-open-denied" });
    } };
  const makeObserver = childFactory => new OmenGitObserver({ rootStore, nativeBridge, gitPath,
    expectedGitSha256: gitSha, gitInstallRoot: runtimeRoot, mxcExecutorPath: mxcPath,
    expectedMxcSha256: mxcSha, expectedNativeScriptSha256: nativeSha,
    expectedPowerShellSha256: gitSha, gitSystemConfigPath: systemConfig,
    expectedGitSystemConfigSha256: systemConfigSha, gitSystemAttributesPath: systemAttributes,
    expectedGitSystemAttributesSha256: systemAttributesSha,
    expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256,
    ...witnessOptions(systemConfig, systemConfigSha, systemAttributes, systemAttributesSha, witnessFactories()),
    terminalGraceMs: 20, sdk: {
      getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
        isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
      createConfigFromPolicy, spawnSandboxFromConfig: () => childFactory(),
  } });
  let terminalMissedChild;
  const terminalStart = Date.now();
  await assert.rejects(makeObserver(() => (terminalMissedChild = new ControlledChild({
    output: Buffer.alloc(300_000, 65), closeOnKill: 2 })))
    .observe("root-1", "status"), { code: "omen-git-terminal-exit-missed" });
  assert.ok(Date.now() - terminalStart < 1_000, `terminal cleanup took ${Date.now() - terminalStart}ms`);
  assert.equal(terminalMissedChild.killCount, 2);
  const secret = Buffer.from("private path and token must not escape");
  const stderrStart = Date.now();
  const failure = await makeObserver(() => new ControlledChild({ stderr: secret, exitCode: 1 }))
    .observe("root-1", "status").then(() => null, error => error);
  assert.ok(Date.now() - stderrStart < 1_000, `stderr failure took ${Date.now() - stderrStart}ms`);
  assert.equal(failure.code, "omen-git-process-failed");
  assert.equal(failure.stderrBytes, secret.length);
  assert.equal(failure.stderrSha256, createHash("sha256").update(secret).digest("hex"));
  assert.equal(failure.failureKind, "unknown");
  assert.equal(Object.hasOwn(failure, "diagnostic"), false);
  assert.doesNotMatch(JSON.stringify(failure), /private path|token/u);
  const unexpected = await makeObserver(() => new ControlledChild({ stderr: secret, exitCode: 0 }))
    .observe("root-1", "status").then(() => null, error => error);
  assert.equal(unexpected.code, "omen-git-unexpected-stderr");
  assert.equal(unexpected.failureKind, "unknown");
  assert.doesNotMatch(JSON.stringify(unexpected), /private path|token/u);
});

test("Git fatal classifier publishes only fixed whole-buffer categories", () => {
  const privatePath = "C:\\Users\\private-owner\\owned-repository";
  const cases = [
    [`fatal: detected dubious ownership in repository at '${privatePath}'\n`, "dubious-ownership"],
    [`fatal: detected dubious ownership in repository at '${privatePath}'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory '${privatePath}'\n`, "dubious-ownership"],
    [`fatal: detected dubious ownership in repository at '${privatePath}'\n'${privatePath}' is on a file system that does not record ownership\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory '${privatePath}'\n`, "dubious-ownership"],
    ["fatal: not a git repository (or any of the parent directories): .git\n", "repository-not-found"],
    ["fatal: Unable to read current working directory: Access is denied\n", "working-directory"],
    ["fatal: unable to read config file C:/private/config: Permission denied\n", "configuration"],
    ["fatal: object abcdef cannot be read\n", "index-or-object-read"],
    ["fatal: unknown option `unsafe'\n", "option-or-usage"],
    ["unknown option: unsafe\nusage: git status [<options>]\n\t--short\tshow status\n", "option-or-usage"],
    ["fatal: cannot open C:/private/index: Permission denied\n", "permission-denied"],
  ];
  for (const [value, expected] of cases) assert.equal(classifyGitFatal(Buffer.from(value)), expected);
});

test("Git fatal classifier fails closed for malformed, ambiguous, or near-miss private text", () => {
  const privatePath = "C:\\Users\\private-owner\\secret-token";
  const values = [
    Buffer.from([]), Buffer.from([0xff]), Buffer.from("fatal: bad object abc"),
    Buffer.from("fatal: bad object abc\r"), Buffer.from("fatal: bad object abc\rbare\n"),
    Buffer.from("fatal: bad object abc\nextra\n"), Buffer.from("fatal: bad object abc\0\n"),
    Buffer.from(`fatal: detected dubious ownership in repository at '${privatePath}'\nTo add an exception for this directory, call:\n\n git config --global --add safe.directory '${privatePath}'\n`),
    Buffer.from(`fatal: detected dubious ownership in repository at '${privatePath}'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory 'C:\\different'\n`),
    Buffer.from(`fatal: detected dubious ownership in repository at '${privatePath}'\nfatal: cannot open ${privatePath}: Permission denied\n`),
    Buffer.from("fatal: cannot open index: Permission denied; Access is denied\n"),
    Buffer.from("fatal: Permission denied because Permission denied\n"),
    Buffer.from(`${"x".repeat(8_193)}\n`), Buffer.from(`${"x\n".repeat(17)}`),
  ];
  for (const value of values) assert.equal(classifyGitFatal(value), "unknown");
  const publicError = { errorCode: "omen-git-process-failed", failureKind: classifyGitFatal(values[8]) };
  assert.doesNotMatch(JSON.stringify(publicError), /private-owner|secret-token|different/u);
});
