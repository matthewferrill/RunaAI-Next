import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { createConfigFromPolicy } from "@microsoft/mxc-sdk";
import { createContainedGitConfig, fixedArguments, policyTemplateDigest, spawnSandboxWithPinnedCwd,
  structuredResult } from "./git-observer.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";

async function treeDigest(root) {
  const hash = createHash("sha256");
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const full = join(path, entry.name), name = relative(root, full).replaceAll("\\", "/");
      hash.update(`${entry.isDirectory() ? "d" : "f"}\0${name}\0`);
      if (entry.isDirectory()) await visit(full); else hash.update(await readFile(full));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

const sha256File = async path => createHash("sha256").update(await readFile(path)).digest("hex");

test("decoupled Git cwd preserves all spawned public verb semantics without repository writes",
  { skip: process.platform !== "win32" }, async t => {
    const pins = await loadOmenReleasePins();
    assert.equal(await sha256File(pins.gitPath), pins.gitSha256);
    assert.equal(await sha256File(pins.gitSystemConfigPath), pins.gitSystemConfigSha256);
    assert.equal(await sha256File(pins.gitSystemAttributesPath), pins.gitSystemAttributesSha256);
    const owned = await mkdtemp(join(tmpdir(), "runa-git-cwd-equivalence-"));
    t.after(() => rm(owned, { recursive: true, force: true }));
    const repository = join(owned, "repository"), ambientExcludes = join(owned, "ambient-excludes"),
      ambientConfig = join(owned, "ambient-global-config");
    await writeFile(ambientExcludes, "ambient-ignore-sentinel.txt\n", { flag: "wx" });
    await writeFile(ambientConfig,
      `[core]\n\texcludesFile = ${ambientExcludes.replaceAll("\\", "/")}\n`, { flag: "wx" });
    await mkdir(repository);
    const env = { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: resolve(pins.gitInstallRoot),
      GIT_CONFIG_GLOBAL: ambientConfig };
    const run = (args, cwd) => spawnSync(pins.gitPath, args,
      { cwd, windowsHide: true, env, encoding: null, timeout: 15_000 });
    const fixture = args => {
      const result = run(["-c", "core.autocrlf=false", ...args], repository);
      assert.equal(result.status, 0, result.stderr?.toString("utf8"));
      assert.equal(result.stderr?.length, 0);
      return result.stdout.toString("utf8").trim();
    };
    fixture(["init", "--initial-branch=main"]);
    await writeFile(join(repository, "notes.txt"), "initial\n", { flag: "wx" });
    fixture(["add", "--", "notes.txt"]);
    fixture(["-c", "user.name=Runa cwd equivalence", "-c", "user.email=runa@example.invalid",
      "commit", "-m", "Initial"]);
    await writeFile(join(repository, "second.txt"), "second\n", { flag: "wx" });
    fixture(["add", "--", "second.txt"]);
    fixture(["-c", "user.name=Runa cwd equivalence", "-c", "user.email=runa@example.invalid",
      "commit", "-m", "Second"]);
    const commit = fixture(["rev-parse", "HEAD"]);
    await writeFile(join(repository, "notes.txt"), "initial\nworking change\n");
    await writeFile(join(repository, "ambient-ignore-sentinel.txt"), "untracked\n", { flag: "wx" });
    const before = await treeDigest(repository);

    const statusArgs = fixedArguments("status", {}, repository);
    const excludesIndex = statusArgs.indexOf("core.excludesFile=");
    assert.ok(excludesIndex > 0 && statusArgs[excludesIndex - 1] === "-c");
    const ambientArgs = [...statusArgs.slice(0, excludesIndex - 1), ...statusArgs.slice(excludesIndex + 1)];
    const ambientStatus = run(ambientArgs, pins.gitInstallRoot);
    assert.equal(ambientStatus.status, 0, ambientStatus.stderr?.toString("utf8"));
    assert.equal(ambientStatus.stderr?.length, 0);
    assert.equal(structuredResult("status", ambientStatus.stdout).fields
      .includes("? ambient-ignore-sentinel.txt"), false);
    const closedStatus = run(statusArgs, pins.gitInstallRoot);
    assert.equal(closedStatus.status, 0, closedStatus.stderr?.toString("utf8"));
    assert.equal(closedStatus.stderr?.length, 0);
    assert.equal(structuredResult("status", closedStatus.stdout).fields
      .includes("? ambient-ignore-sentinel.txt"), true);

    for (const [operation, input] of [["status", {}], ["log", {}], ["diffstat", {}], ["branches", {}],
      ["show", { commit }]]) {
      const explicit = fixedArguments(operation, input, repository);
      assert.equal(explicit.includes("-C"), false);
      assert.equal(explicit[4], `--git-dir=${join(resolve(repository), ".git")}`);
      assert.equal(explicit[5], `--work-tree=${resolve(repository)}`);
      const selectedCwd = [...explicit.slice(0, 4), ...explicit.slice(6)];
      const baseline = run(selectedCwd, repository), decoupled = run(explicit, pins.gitInstallRoot);
      assert.equal(baseline.status, 0, baseline.stderr?.toString("utf8"));
      assert.equal(decoupled.status, 0, decoupled.stderr?.toString("utf8"));
      assert.equal(baseline.stderr?.length, 0, operation);
      assert.equal(decoupled.stderr?.length, 0, operation);
      let decoupledFields, baselineFields;
      try {
        decoupledFields = structuredResult(operation, decoupled.stdout).fields;
        baselineFields = structuredResult(operation, baseline.stdout).fields;
      } catch (error) {
        assert.fail(`${operation}: ${error?.code ?? "unexpected-parse-error"}`);
      }
      assert.deepEqual(decoupledFields, baselineFields, operation);
    }
    assert.equal(await treeDigest(repository), before);

    const config = createContainedGitConfig({ createConfigFromPolicy }, { root: repository,
      gitInstallRoot: pins.gitInstallRoot, gitPath: pins.gitPath,
      args: fixedArguments("status", {}, repository), containerId: "runa-git-cwd-equivalence" });
    assert.equal(config.process.cwd, resolve(pins.gitInstallRoot));
    assert.deepEqual(config.filesystem.readonlyPaths, [resolve(repository), resolve(pins.gitInstallRoot)]);
    assert.deepEqual(config.filesystem.readwritePaths, []);
    assert.deepEqual(config.filesystem.deniedPaths, []);
    assert.equal(policyTemplateDigest(config, repository, pins.gitInstallRoot), pins.policyTemplateSha256);
    const invalidPolicies = [
      value => { value.process.cwd = repository; },
      value => { value.filesystem.readonlyPaths = [resolve(pins.gitInstallRoot)]; },
      value => { value.filesystem.readonlyPaths.push(resolve(owned)); },
      value => { value.filesystem.readonlyPaths.reverse(); },
      value => { value.filesystem.readonlyPaths[0] = `${resolve(repository)}\\.`; },
      value => { value.filesystem.readonlyPaths = [resolve(repository), resolve(repository)]; },
      value => { value.filesystem.readwritePaths = [resolve(owned)]; },
      value => { value.filesystem.deniedPaths = [resolve(owned)]; },
    ];
    for (const mutate of invalidPolicies) {
      const invalid = structuredClone(config); mutate(invalid);
      assert.throws(() => policyTemplateDigest(invalid, repository, pins.gitInstallRoot),
        { code: "omen-git-policy-cwd-invalid" });
    }
  });

test("observer, timeout, and network children bind inner and outer pinned runtime cwd", async () => {
  const [observer, proof, network] = await Promise.all([
    readFile(resolve(import.meta.dirname, "git-observer.mjs"), "utf8"),
    readFile(resolve(import.meta.dirname, "actual-git-proof.mjs"), "utf8"),
    readFile(resolve(import.meta.dirname, "actual-network-proof-child.mjs"), "utf8"),
  ]);
  const normalized = [observer, proof, network].map(source => source.replaceAll("\r\n", "\n"));
  const observerSpawn = `const child = spawnSandboxWithPinnedCwd(this.sdk.spawnSandboxFromConfig, config,\n`
    + `          { usePty: false, executablePath: this.mxcExecutorPath }, this.gitInstallRoot);`;
  const timeoutSpawn = `const timeoutChild = spawnSandboxWithPinnedCwd(spawnSandboxFromConfig, timeoutConfig,\n`
    + `      { usePty: false, executablePath: pins.mxcExecutorPath }, pins.gitInstallRoot,\n`
    + `      "omen-timeout-runtime-cwd-invalid");`;
  const networkSpawn = `const child = spawnSandboxWithPinnedCwd(spawnSandboxFromConfig, config,\n`
    + `      { usePty: false, executablePath: pins.mxcExecutorPath }, pins.gitInstallRoot,\n`
    + `      "omen-network-runtime-cwd-invalid");`;
  for (const [source, exact] of [[normalized[0], observerSpawn], [normalized[1], timeoutSpawn],
    [normalized[2], networkSpawn]]) assert.equal(source.split(exact).length - 1, 1);
  assert.match(observer, /config\.process\.cwd = runtimeRoot/u);
  assert.match(proof, /policyTemplateDigest\(timeoutConfig, repository, pins\.gitInstallRoot\)/u);
  assert.match(proof, /resolve\(timeoutConfig\.process\.cwd\) !== resolve\(pins\.gitInstallRoot\)/u);
  assert.match(network, /policyTemplateDigest\(config, payload\.repository, pins\.gitInstallRoot\)/u);
  assert.match(network, /resolve\(config\.process\.cwd\) !== resolve\(pins\.gitInstallRoot\)/u);
  for (const source of [proof, network]) {
    assert.match(source, /fixedArguments\("status", \{\}, (?:repository|payload\.repository)\)/u);
    assert.match(source, /statusArgs\.slice\(0, statusArgs\.indexOf\("status"\)\)/u);
  }

  const runtimeRoot = "C:\\Program Files\\Git", selectedRoot = "D:\\selected", returned = {};
  let captured;
  const spawn = (...args) => { captured = args; return returned; };
  const config = { process: { cwd: runtimeRoot } }, options = { usePty: false };
  assert.equal(spawnSandboxWithPinnedCwd(spawn, config, options, runtimeRoot), returned);
  assert.deepEqual(captured, [config, options, runtimeRoot]);
  for (const cwd of [selectedRoot, "C:\\other-runtime"]) {
    assert.throws(() => spawnSandboxWithPinnedCwd(spawn, { process: { cwd } }, options, runtimeRoot),
      { code: "omen-git-runtime-cwd-invalid" });
  }
});
