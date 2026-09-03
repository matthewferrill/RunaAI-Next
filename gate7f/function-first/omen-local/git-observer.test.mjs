import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConfigFromPolicy } from "@microsoft/mxc-sdk";
import { fixedArguments, inspectRepositoryConfig, OmenGitObserver, sanitizeRemoteUrl,
  structuredResult } from "./git-observer.mjs";

const POLICY_TEMPLATE_SHA256 = "7d7eb3da575a5fcf1566081395b0b27c8ba7d9d8c9531785bdd313cdbde10f27";

class FakeChild extends EventEmitter {
  constructor(stdout) {
    super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter();
    this.stdin = { on() {}, end() {} };
    queueMicrotask(() => { this.stdout.emit("data", Buffer.from(stdout)); this.emit("close", 0); });
  }
  kill() { this.emit("close", 1); }
}

class ControlledChild extends EventEmitter {
  constructor({ output = Buffer.alloc(0), exitCode = null, stderr = Buffer.alloc(0) } = {}) {
    super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter();
    this.stdin = { on() {}, end() {} }; this.exitCode = exitCode;
    queueMicrotask(() => {
      if (output.length) this.stdout.emit("data", output);
      if (stderr.length) this.stderr.emit("data", stderr);
      if (exitCode !== null) this.emit("close", exitCode);
    });
  }
  kill() { /* deliberately does not close, exercising the terminal deadline */ }
}

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
  const pairs = new Map();
  for (let index = 4; index < args.indexOf("diff"); index += 2) {
    assert.equal(args[index], "-c");
    const [key, ...value] = args[index + 1].split("=");
    pairs.set(key, value.join("="));
  }
  assert.deepEqual(Object.fromEntries(pairs), {
    "core.hooksPath": "NUL", "credential.helper": "", "credential.interactive": "false",
    "core.askPass": "", "core.fsmonitor": "false", "diff.external": "",
    "core.attributesFile": "NUL", "core.excludesFile": "NUL", "interactive.diffFilter": "",
    "protocol.allow": "never", "maintenance.auto": "false", "gc.auto": "0",
    "fetch.writeCommitGraph": "false", "core.untrackedCache": "false",
    "core.preloadIndex": "false", "safe.directory": resolve(root),
  });
  assert.deepEqual(args.slice(args.indexOf("diff")),
    ["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--", "."]);
});

test("observer authors a fixed deny-all MXC request and parses NUL output", async t => {
  const directory = await mkdtemp(join(tmpdir(), "runa-git-observer-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const gitPath = join(directory, "git.exe"); await writeFile(gitPath, "synthetic pinned executable");
  const mxcPath = join(directory, "wxc-exec.exe"); await writeFile(mxcPath, "synthetic mxc executable");
  const expectedGitSha256 = createHash("sha256").update("synthetic pinned executable").digest("hex");
  const expectedMxcSha256 = createHash("sha256").update("synthetic mxc executable").digest("hex");
  const expectedNativeScriptSha256 = "a".repeat(64);
  const systemConfig = join(directory, "system-gitconfig"), systemAttributes = join(directory, "system-gitattributes");
  await writeFile(systemConfig, "system config"); await writeFile(systemAttributes, "system attributes");
  const systemConfigSha = createHash("sha256").update("system config").digest("hex");
  const systemAttributesSha = createHash("sha256").update("system attributes").digest("hex");
  let policy, generated, spawnCount = 0, mutateAfterChildClose = false;
  const sdk = {
    getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
      isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
    createConfigFromPolicy: (value, kind, id) => { policy = value;
      return generated = createConfigFromPolicy(value, kind, id); },
    spawnSandboxFromConfig: value => { spawnCount += 1; assert.equal(value, generated);
      const child = new FakeChild("# branch.head main\0? notes.txt\0");
      if (mutateAfterChildClose) {
        mutateAfterChildClose = false;
        child.once("close", exitCode => {
          assert.equal(exitCode, 0);
          setTimeout(() => writeFileSync(join(directory, "mutated-after-child-close.txt"), "changed"), 50);
        });
      }
      return child; },
  };
  const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: directory,
    gitFinalPath: join(directory, ".git"), displayName: "fixture", volumeId: "00000001",
    fileId: "0000000000000001", privateValuesIncluded: true }) };
  const nativeBridge = { verifyRelease: async () => ({ scriptSha256: expectedNativeScriptSha256,
    powershellPath: gitPath, powershellSha256: expectedGitSha256 }),
  holdGit: async () => ({ rootFinalPath: directory, gitFinalPath: join(directory, ".git"), release: async () => {} }),
  safeRead: async (_root, path) => {
    if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0\n"
      + "[remote \"origin\"]\nurl = https://person:secret@example.test/org/repo.git");
    throw Object.assign(new Error("missing"), { code: "native-open-denied" });
  } };
  const observer = new OmenGitObserver({ rootStore, nativeBridge, gitPath, expectedGitSha256,
    gitInstallRoot: directory, mxcExecutorPath: mxcPath, expectedMxcSha256,
    expectedNativeScriptSha256, expectedPowerShellSha256: expectedGitSha256,
    gitSystemConfigPath: systemConfig, expectedGitSystemConfigSha256: systemConfigSha,
    gitSystemAttributesPath: systemAttributes, expectedGitSystemAttributesSha256: systemAttributesSha,
    expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256, sdk });
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
    const gitPath = join(directory, "git.exe"); await writeFile(gitPath, "synthetic pinned executable");
    const mxcPath = join(directory, "wxc-exec.exe"); await writeFile(mxcPath, "synthetic mxc executable");
    const expectedGitSha256 = createHash("sha256").update("synthetic pinned executable").digest("hex");
    const expectedMxcSha256 = createHash("sha256").update("synthetic mxc executable").digest("hex");
    const expectedNativeScriptSha256 = "a".repeat(64);
    const systemConfig = join(directory, "system-gitconfig"), systemAttributes = join(directory, "system-gitattributes");
    await writeFile(systemConfig, "system config"); await writeFile(systemAttributes, "system attributes");
    const systemConfigSha = createHash("sha256").update("system config").digest("hex");
    const systemAttributesSha = createHash("sha256").update("system attributes").digest("hex");
    const sdk = {
      getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
        isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
      createConfigFromPolicy,
      spawnSandboxFromConfig: () => new FakeChild(Buffer.from([0xc3, 0x28])),
    };
    const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: directory,
      gitFinalPath: join(directory, ".git") }) };
    const nativeBridge = { verifyRelease: async () => ({ scriptSha256: expectedNativeScriptSha256,
      powershellPath: gitPath, powershellSha256: expectedGitSha256 }),
    holdGit: async () => ({ rootFinalPath: directory, gitFinalPath: join(directory, ".git"), release: async () => {} }),
    safeRead: async (_root, path) => {
      if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0");
      throw Object.assign(new Error("missing"), { code: "native-open-denied" });
    } };
    const observer = new OmenGitObserver({ rootStore, nativeBridge, gitPath, expectedGitSha256,
      gitInstallRoot: directory, mxcExecutorPath: mxcPath, expectedMxcSha256,
      expectedNativeScriptSha256, expectedPowerShellSha256: expectedGitSha256,
      gitSystemConfigPath: systemConfig, expectedGitSystemConfigSha256: systemConfigSha,
      gitSystemAttributesPath: systemAttributes, expectedGitSystemAttributesSha256: systemAttributesSha,
      expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256, sdk });
    await assert.rejects(observer.observe("root-1", "status"), { code: "omen-git-output-invalid" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("output termination is bounded and raw stderr never crosses the diagnostic contract", async t => {
  const directory = await mkdtemp(join(tmpdir(), "runa-git-terminal-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const gitPath = join(directory, "git.exe"), mxcPath = join(directory, "wxc-exec.exe");
  await writeFile(gitPath, "synthetic pinned executable"); await writeFile(mxcPath, "synthetic mxc executable");
  const gitSha = createHash("sha256").update("synthetic pinned executable").digest("hex");
  const mxcSha = createHash("sha256").update("synthetic mxc executable").digest("hex");
  const nativeSha = "a".repeat(64);
  const systemConfig = join(directory, "system-gitconfig"), systemAttributes = join(directory, "system-gitattributes");
  await writeFile(systemConfig, "system config"); await writeFile(systemAttributes, "system attributes");
  const systemConfigSha = createHash("sha256").update("system config").digest("hex");
  const systemAttributesSha = createHash("sha256").update("system attributes").digest("hex");
  const rootStore = { localRootForGit: async () => ({ rootId: "root-1", path: directory,
    gitFinalPath: join(directory, ".git") }) };
  const nativeBridge = { verifyRelease: async () => ({ scriptSha256: nativeSha, powershellPath: gitPath,
    powershellSha256: gitSha }),
    holdGit: async () => ({ rootFinalPath: directory, gitFinalPath: join(directory, ".git"), release: async () => {} }),
    safeRead: async (_root, path) => {
      if (path === ".git\\config") return Buffer.from("[core]\nrepositoryformatversion = 0");
      throw Object.assign(new Error("missing"), { code: "native-open-denied" });
    } };
  const makeObserver = childFactory => new OmenGitObserver({ rootStore, nativeBridge, gitPath,
    expectedGitSha256: gitSha, gitInstallRoot: directory, mxcExecutorPath: mxcPath,
    expectedMxcSha256: mxcSha, expectedNativeScriptSha256: nativeSha,
    expectedPowerShellSha256: gitSha, gitSystemConfigPath: systemConfig,
    expectedGitSystemConfigSha256: systemConfigSha, gitSystemAttributesPath: systemAttributes,
    expectedGitSystemAttributesSha256: systemAttributesSha,
    expectedPolicyTemplateSha256: POLICY_TEMPLATE_SHA256, terminalGraceMs: 20, sdk: {
      getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
        isolationTier: "appcontainer-dacl", isolationWarnings: ["AppContainer + DACL tier selected: unit"] }),
      createConfigFromPolicy, spawnSandboxFromConfig: () => childFactory(),
    } });
  await assert.rejects(makeObserver(() => new ControlledChild({ output: Buffer.alloc(300_000, 65) }))
    .observe("root-1", "status"), { code: "omen-git-terminal-exit-missed" });
  const secret = Buffer.from("private path and token must not escape");
  const failure = await makeObserver(() => new ControlledChild({ stderr: secret, exitCode: 1 }))
    .observe("root-1", "status").then(() => null, error => error);
  assert.equal(failure.code, "omen-git-process-failed");
  assert.equal(failure.stderrBytes, secret.length);
  assert.equal(failure.stderrSha256, createHash("sha256").update(secret).digest("hex"));
  assert.equal(Object.hasOwn(failure, "diagnostic"), false);
  assert.doesNotMatch(JSON.stringify(failure), /private path|token/u);
});
