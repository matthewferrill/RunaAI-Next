import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";
import { canonicalJson, LOCAL_CONTEXT_SCHEMAS } from "../local-context-contract.mjs";
import { startRepositoryWitness, startUiWitness } from "./windows-witness.mjs";

const coded = (code, message = code) => Object.assign(new Error(message), { code });
const OUTPUT_LIMIT = 256 * 1024;
const TIMEOUT_MS = 15_000;
const COMMIT = /^[a-f0-9]{7,64}$/u;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const acceptedWarnings = [/^BaseContainer tier not selected, and AppContainer \+ BFS is not compiled into this binary;/u,
  /^AppContainer \+ DACL tier selected:/u];
const quote = value => `"${String(value).replaceAll('"', '\\"')}"`;
function bounded(promise, maximumMs, code) {
  let timer;
  return Promise.race([promise, new Promise((_done, fail) => {
    timer = setTimeout(() => fail(coded(code)), maximumMs);
  })]).finally(() => clearTimeout(timer));
}

function supportFor(sdk) {
  const support = sdk.getPlatformSupport();
  if (support?.isSupported !== true || !(support.availableMethods ?? []).includes("processcontainer")) {
    throw coded("omen-git-containment-unavailable");
  }
  if (support.isolationTier !== "appcontainer-dacl"
      || (support.isolationWarnings ?? []).some(warning => !acceptedWarnings.some(pattern => pattern.test(warning)))) {
    throw coded("omen-git-containment-warning");
  }
  return support;
}

function fixedArguments(operation, input = {}, selectedRoot) {
  if (!isAbsolute(selectedRoot ?? "")) throw coded("omen-git-operation-invalid");
  const shared = ["--no-optional-locks", "--no-replace-objects", "--no-lazy-fetch", "--no-pager",
    "-c", "core.hooksPath=NUL", "-c", "credential.helper=", "-c", "credential.interactive=false",
    "-c", "core.askPass=", "-c", "core.fsmonitor=false", "-c", "diff.external=",
    "-c", "core.attributesFile=NUL", "-c", "core.excludesFile=NUL", "-c", "interactive.diffFilter=",
    "-c", "protocol.allow=never", "-c", "maintenance.auto=false", "-c", "gc.auto=0",
    "-c", "fetch.writeCommitGraph=false", "-c", "core.untrackedCache=false",
    "-c", "core.preloadIndex=false", "-c", `safe.directory=${resolve(selectedRoot)}`];
  const specific = {
    status: ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=normal", "--ignore-submodules=all"],
    log: ["log", "-z", "--format=%H%x00%ct%x00%s", "-n", "40"],
    diffstat: ["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--", "."],
    branches: ["for-each-ref", "--count=500", "--format=%(refname:short)%00%(objectname)%00", "refs/heads/"],
    show: ["show", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all",
      "--format=%H%x00%ct%x00%s%x00", "--numstat", "-z", input.commit],
  }[operation];
  if (!specific || (operation === "show" && !COMMIT.test(input.commit ?? ""))) throw coded("omen-git-operation-invalid");
  return [...shared, ...specific];
}

function configValue(raw) {
  if (raw === undefined) return "true";
  const value = raw.trim();
  if (value.startsWith('"')) {
    const quoted = /^"((?:[^"\\]|\\["\\ntb])*)"\s*(?:[#;].*)?$/u.exec(value);
    if (!quoted) throw coded("omen-git-config-denied");
    return quoted[1].replace(/\\(["\\ntb])/gu, (_all, escaped) =>
      ({ '"': '"', "\\": "\\", n: "\n", t: "\t", b: "\b" })[escaped]);
  }
  if (value.endsWith("\\")) throw coded("omen-git-config-denied");
  return value.replace(/\s+[#;].*$/u, "").trim();
}

function sanitizeRemoteUrl(raw) {
  const value = String(raw).trim();
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw coded("omen-git-remote-invalid");
  }
  let host, repository;
  const scp = /^(?:[^@/:\s]+@)?([^/:\s]+):([^\s]+)$/u.exec(value);
  if (scp && !value.includes("://") && !/^[A-Za-z]:/u.test(value)) {
    host = scp[1]; repository = scp[2];
  } else {
    let parsed;
    try { parsed = new URL(value); } catch { parsed = null; }
    if (parsed && ["https:", "http:", "ssh:", "git:"].includes(parsed.protocol)) {
      host = parsed.hostname;
      try { repository = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/gu, ""); }
      catch { throw coded("omen-git-remote-invalid"); }
    } else if (isAbsolute(value)) {
      host = "local"; repository = value.replaceAll("\\", "/").split("/").filter(Boolean).at(-1);
    } else throw coded("omen-git-remote-invalid");
  }
  repository = repository?.replace(/\.git$/iu, "");
  if (!host || !repository || host.length > 253 || repository.length > 1_024
      || /[\u0000-\u001f\u007f@]/u.test(`${host}${repository}`)) throw coded("omen-git-remote-invalid");
  return `${host.toLowerCase()}/${repository}`;
}

function inspectRepositoryConfig(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > OUTPUT_LIMIT
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw coded("omen-git-config-denied");
  const lines = text.split(/\r?\n/u);
  let section = null;
  const remotes = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const heading = /^\[([A-Za-z][A-Za-z0-9.-]*)(?:\s+"((?:[^"\\]|\\["\\])*)")?\]\s*(?:[#;].*)?$/u.exec(line);
    if (heading) {
      const name = heading[1].toLowerCase();
      const subsection = heading[2]?.replace(/\\(["\\])/gu, "$1") ?? null;
      if (name.includes(".") || name === "include" || name === "includeif" || subsection?.length > 200
          || subsection !== null && /[\u0000-\u001f\u007f]/u.test(subsection)) throw coded("omen-git-config-denied");
      section = { name, subsection };
      continue;
    }
    if (!section) throw coded("omen-git-config-denied");
    const match = /^([A-Za-z][A-Za-z0-9-]*)(?:\s*=\s*(.*))?$/u.exec(line);
    if (!match) throw coded("omen-git-config-denied");
    const name = match[1].toLowerCase(), value = configValue(match[2]);
    if (/[\u0000-\u001f\u007f]/u.test(value)) throw coded("omen-git-config-denied");
    const key = `${section.name}.${section.subsection ? `${section.subsection.toLowerCase()}.` : ""}${name}`;
    if (/\.(?:helper|command|process|clean|smudge|fsmonitor|external|textconv|worktree)$/u.test(key)
        || key === "extensions.partialclone" || key === "extensions.worktreeconfig"
        || section.name === "remote" && ["promisor", "partialclonefilter"].includes(name)) {
      throw coded("omen-git-config-denied");
    }
    if (section.name === "remote" && section.subsection && ["url", "pushurl"].includes(name)) {
      remotes.push(Object.freeze({ name: section.subsection, direction: name === "url" ? "fetch" : "push",
        display: sanitizeRemoteUrl(value) }));
    }
  }
  if (remotes.length > 100) throw coded("omen-git-config-denied");
  return Object.freeze({ remotes: Object.freeze(remotes) });
}

function decodeUtf8(bytes, code) {
  try { return strictUtf8.decode(bytes); }
  catch { throw coded(code); }
}

function safeField(value, maximum = 4_096, { tabs = false } = {}) {
  if (typeof value !== "string" || value.length > maximum
      || (tabs ? /[\u0000-\u0008\u000a-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value)) {
    throw coded("omen-git-output-invalid");
  }
  return value;
}

const fullHash = value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
const mode = value => /^[0-7]{6}$/u.test(value);
function safePath(value) {
  safeField(value, 1_024);
  if (isAbsolute(value) || value.includes("\\") || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw coded("omen-git-output-invalid");
  }
  return value;
}

function nulFields(bytes, { formattedLines = false } = {}) {
  const stdout = decodeUtf8(bytes, "omen-git-output-invalid");
  const values = stdout.split("\0");
  const remainder = values.pop();
  if (remainder !== "" && !(formattedLines && /^\r?\n$/u.test(remainder))) throw coded("omen-git-output-invalid");
  const fields = values.map((value, index) => formattedLines && index > 0 ? value.replace(/^\r?\n/u, "") : value);
  if (fields.length > 2_000 || fields.some(value => value === "")) throw coded("omen-git-output-invalid");
  return fields;
}

function validateNumstat(fields, start = 0) {
  let paths = 0;
  for (let index = start; index < fields.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/u.exec(safeField(fields[index], 5_120, { tabs: true }));
    if (!match) throw coded("omen-git-output-invalid");
    if (match[1] !== "-" && BigInt(match[1]) > BigInt(Number.MAX_SAFE_INTEGER)
        || match[2] !== "-" && BigInt(match[2]) > BigInt(Number.MAX_SAFE_INTEGER)) throw coded("omen-git-output-invalid");
    if (match[3]) { safePath(match[3]); paths += 1; }
    else {
      if (index + 2 >= fields.length) throw coded("omen-git-output-invalid");
      safePath(fields[++index]); safePath(fields[++index]); paths += 2;
    }
    if (paths > 500) throw coded("omen-git-output-invalid");
  }
}

function policyTemplateDigest(config) {
  const normalized = JSON.parse(JSON.stringify(config));
  normalized.containerId = "<CONTAINER_ID>";
  normalized.process.commandLine = "<COMMAND_LINE>";
  normalized.process.cwd = "<SELECTED_ROOT>";
  normalized.filesystem.readonlyPaths = ["<SELECTED_ROOT>", "<GIT_INSTALL_ROOT>"];
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

function createContainedGitConfig(sdk, { root, gitInstallRoot, gitPath, args, containerId }) {
  const config = sdk.createConfigFromPolicy({ version: "0.8.0-alpha",
    filesystem: { readonlyPaths: [root, gitInstallRoot], readwritePaths: [], deniedPaths: [],
      clearPolicyOnExit: true },
    network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } },
    ui: { allowWindows: true, clipboard: "none", allowInputInjection: false }, timeoutMs: TIMEOUT_MS,
  }, "process", containerId);
  config.fallback = { allowDaclMutation: true };
  config.process.commandLine = [quote(gitPath), ...args.map(quote)].join(" ");
  config.process.cwd = root;
  return config;
}

function structuredResult(operation, stdoutBytes) {
  if (!Buffer.isBuffer(stdoutBytes) || stdoutBytes.length > OUTPUT_LIMIT) throw coded("omen-git-output-invalid");
  const fields = nulFields(stdoutBytes, { formattedLines: operation !== "status" });
  if (operation === "status") {
    let paths = 0;
    for (let index = 0; index < fields.length; index += 1) {
      const field = safeField(fields[index], 2_048);
      if (/^# branch\.oid (?:\(initial\)|[a-f0-9]{40}|[a-f0-9]{64})$/u.test(field)
          || /^# branch\.(?:head|upstream) [^\s].*$/u.test(field)
          || /^# branch\.ab \+\d+ -\d+$/u.test(field)) continue;
      if (/^\? .+$/u.test(field)) { safePath(field.slice(2)); paths += 1; continue; }
      const type = field[0], parts = field.split(" ");
      if (type === "1" && parts.length >= 9 && /^[.MADRCUTX?]{2}$/u.test(parts[1])
          && /^[.NSCMU?]{4}$/u.test(parts[2]) && parts.slice(3, 6).every(mode)
          && parts.slice(6, 8).every(fullHash)) { safePath(parts.slice(8).join(" ")); paths += 1; continue; }
      if (type === "2" && parts.length >= 10 && index + 1 < fields.length
          && /^[.MADRCUTX?]{2}$/u.test(parts[1]) && /^[.NSCMU?]{4}$/u.test(parts[2])
          && parts.slice(3, 6).every(mode) && parts.slice(6, 8).every(fullHash)
          && /^[RC]\d{1,3}$/u.test(parts[8])) {
        safePath(parts.slice(9).join(" ")); safePath(fields[++index]); paths += 2; continue;
      }
      if (type === "u" && parts.length >= 11 && /^[.MADRCUTX?]{2}$/u.test(parts[1])
          && /^[.NSCMU?]{4}$/u.test(parts[2]) && parts.slice(3, 7).every(mode)
          && parts.slice(7, 10).every(fullHash)) { safePath(parts.slice(10).join(" ")); paths += 1; continue; }
      throw coded("omen-git-output-invalid");
    }
    if (paths > 500) throw coded("omen-git-output-invalid");
  } else if (operation === "log") {
    if (fields.length % 3 !== 0 || fields.length > 120) throw coded("omen-git-output-invalid");
    for (let index = 0; index < fields.length; index += 3) {
      if (!fullHash(fields[index]) || !/^\d{1,20}$/u.test(fields[index + 1])) {
        throw coded("omen-git-output-invalid");
      }
      safeField(fields[index + 2], 1_024);
    }
  } else if (operation === "branches") {
    if (fields.length % 2 !== 0 || fields.length > 1_000) throw coded("omen-git-output-invalid");
    for (let index = 0; index < fields.length; index += 2) {
      const branch = safeField(fields[index], 1_024);
      if (branch.startsWith("-") || branch.endsWith(".") || branch.endsWith("/") || branch.includes("..")
          || branch.includes("@{") || /[ ~^:?*[\\]/u.test(branch) || !fullHash(fields[index + 1])) {
        throw coded("omen-git-output-invalid");
      }
    }
  } else if (operation === "diffstat") validateNumstat(fields);
  else if (operation === "show") {
    if (fields.length < 3 || !fullHash(fields[0]) || !/^\d{1,20}$/u.test(fields[1])) {
      throw coded("omen-git-output-invalid");
    }
    safeField(fields[2], 1_024); validateNumstat(fields, 3);
  } else {
    throw coded("omen-git-operation-invalid");
  }
  return Object.freeze({ operation, fields: Object.freeze(fields), truncated: false });
}

export class OmenGitObserver {
  constructor({ rootStore, nativeBridge, gitPath, expectedGitSha256, gitInstallRoot, mxcExecutorPath,
    expectedMxcSha256, expectedNativeScriptSha256, expectedPowerShellSha256,
    gitSystemConfigPath, expectedGitSystemConfigSha256, gitSystemAttributesPath,
    expectedGitSystemAttributesSha256, expectedPolicyTemplateSha256,
    repositoryWitnessPath, expectedRepositoryWitnessSha256, uiWitnessPath, expectedUiWitnessSha256,
    repositoryWitnessFactory = startRepositoryWitness, uiWitnessFactory = startUiWitness,
    terminalGraceMs = 2_000,
    sdk = { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } }) {
    if (![gitPath, gitInstallRoot, mxcExecutorPath, repositoryWitnessPath, uiWitnessPath]
          .every(value => isAbsolute(value ?? ""))
        || ![gitSystemConfigPath, gitSystemAttributesPath].every(value => isAbsolute(value ?? ""))
        || ![expectedGitSha256, expectedMxcSha256, expectedNativeScriptSha256, expectedPowerShellSha256,
          expectedGitSystemConfigSha256, expectedGitSystemAttributesSha256, expectedPolicyTemplateSha256,
          expectedRepositoryWitnessSha256, expectedUiWitnessSha256]
          .every(value => /^[a-f0-9]{64}$/u.test(value ?? ""))
        || !Number.isSafeInteger(terminalGraceMs) || terminalGraceMs < 10 || terminalGraceMs > 2_000) {
      throw coded("omen-git-release-invalid");
    }
    this.rootStore = rootStore; this.nativeBridge = nativeBridge; this.gitPath = resolve(gitPath);
    this.expectedGitSha256 = expectedGitSha256; this.gitInstallRoot = resolve(gitInstallRoot);
    this.mxcExecutorPath = resolve(mxcExecutorPath); this.expectedMxcSha256 = expectedMxcSha256;
    this.expectedNativeScriptSha256 = expectedNativeScriptSha256;
    this.expectedPowerShellSha256 = expectedPowerShellSha256;
    this.gitSystemConfigPath = resolve(gitSystemConfigPath);
    this.expectedGitSystemConfigSha256 = expectedGitSystemConfigSha256;
    this.gitSystemAttributesPath = resolve(gitSystemAttributesPath);
    this.expectedGitSystemAttributesSha256 = expectedGitSystemAttributesSha256;
    this.expectedPolicyTemplateSha256 = expectedPolicyTemplateSha256;
    this.repositoryWitnessPath = resolve(repositoryWitnessPath);
    this.expectedRepositoryWitnessSha256 = expectedRepositoryWitnessSha256;
    this.uiWitnessPath = resolve(uiWitnessPath); this.expectedUiWitnessSha256 = expectedUiWitnessSha256;
    this.repositoryWitnessFactory = repositoryWitnessFactory; this.uiWitnessFactory = uiWitnessFactory;
    this.terminalGraceMs = terminalGraceMs; this.sdk = sdk;
  }

  async #verifyReleaseBeforeUse() {
    const gitSha256 = createHash("sha256").update(await readFile(this.gitPath)).digest("hex");
    if (gitSha256 !== this.expectedGitSha256) throw coded("omen-git-binary-digest-mismatch");
    const mxcSha256 = createHash("sha256").update(await readFile(this.mxcExecutorPath)).digest("hex");
    if (mxcSha256 !== this.expectedMxcSha256) throw coded("omen-git-mxc-digest-mismatch");
    const nativeRelease = await this.nativeBridge.verifyRelease();
    if (nativeRelease.scriptSha256 !== this.expectedNativeScriptSha256) throw coded("omen-git-native-digest-mismatch");
    const powershellSha256 = nativeRelease.powershellSha256;
    if (powershellSha256 !== this.expectedPowerShellSha256) throw coded("omen-git-powershell-digest-mismatch");
    const gitSystemConfigSha256 = createHash("sha256").update(await readFile(this.gitSystemConfigPath)).digest("hex");
    if (gitSystemConfigSha256 !== this.expectedGitSystemConfigSha256) throw coded("omen-git-system-config-digest-mismatch");
    const gitSystemAttributesSha256 = createHash("sha256")
      .update(await readFile(this.gitSystemAttributesPath)).digest("hex");
    if (gitSystemAttributesSha256 !== this.expectedGitSystemAttributesSha256) {
      throw coded("omen-git-system-attributes-digest-mismatch");
    }
    const repositoryWitnessSha256 = createHash("sha256")
      .update(await readFile(this.repositoryWitnessPath)).digest("hex");
    if (repositoryWitnessSha256 !== this.expectedRepositoryWitnessSha256) {
      throw coded("omen-git-repository-witness-digest-mismatch");
    }
    const uiWitnessSha256 = createHash("sha256").update(await readFile(this.uiWitnessPath)).digest("hex");
    if (uiWitnessSha256 !== this.expectedUiWitnessSha256) throw coded("omen-git-ui-witness-digest-mismatch");
    return Object.freeze({ gitSha256, mxcSha256, nativeRelease, powershellSha256,
      gitSystemConfigSha256, gitSystemAttributesSha256, repositoryWitnessSha256, uiWitnessSha256 });
  }

  async manifest(rootId) {
    const release = await this.#verifyReleaseBeforeUse();
    const root = await this.rootStore.localRootForGit(rootId);
    const configBytes = await this.nativeBridge.safeRead(root.path, ".git\\config", root);
    const repositoryConfig = inspectRepositoryConfig(decodeUtf8(configBytes, "omen-git-config-denied"));
    try {
      const packedRefs = decodeUtf8(await this.nativeBridge.safeRead(root.path, ".git\\packed-refs", root),
        "omen-git-metadata-denied");
      if (/(?:^|\n)[^\n]*\srefs\/replace\//u.test(packedRefs)) throw coded("omen-git-metadata-denied");
    } catch (error) {
      if (error?.code !== "native-open-denied") throw error;
    }
    const manifest = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.containment, package: "@microsoft/mxc-sdk",
      packageVersion: "0.8.0", policyVersion: "0.8.0-alpha", gitPath: this.gitPath,
      gitSha256: release.gitSha256, gitInstallRoot: this.gitInstallRoot,
      gitSystemConfigPath: this.gitSystemConfigPath, gitSystemConfigSha256: release.gitSystemConfigSha256,
      gitSystemAttributesPath: this.gitSystemAttributesPath,
      gitSystemAttributesSha256: release.gitSystemAttributesSha256,
      mxcExecutorPath: this.mxcExecutorPath, mxcSha256: release.mxcSha256,
      nativeScriptSha256: release.nativeRelease.scriptSha256,
      powershellPath: release.nativeRelease.powershellPath,
      powershellSha256: release.powershellSha256, policyTemplateSha256: this.expectedPolicyTemplateSha256,
      repositoryWitnessPath: this.repositoryWitnessPath,
      repositoryWitnessSha256: release.repositoryWitnessSha256,
      uiWitnessPath: this.uiWitnessPath, uiWitnessSha256: release.uiWitnessSha256,
      rootId, network: "deny-all",
      filesystem: "read-only-selected-root-and-git-runtime", stdin: "closed",
      customEnvironment: "omitted", executableExtensionPoints: "closed", timeoutMs: TIMEOUT_MS,
      ui: "windows-allowed-container-isolated-no-clipboard-input-system-control-settings-ime" };
    return Object.freeze({ ...manifest,
      releaseDigest: createHash("sha256").update(canonicalJson(manifest)).digest("hex"), localRoot: root,
      repositoryConfig });
  }

  async observe(rootId, operation, input = {}) {
    const support = supportFor(this.sdk);
    const initialManifest = await this.manifest(rootId);
    const operationId = randomUUID();
    let guard = null, childRecord = null, repositoryWitness = null, uiWitness = null;
    let repositoryFinished = false, uiFinished = operation === "remotes", uiBound = false, witnessFailure = null;
    let stopActiveChild = null, resolveWitnessFailure;
    const firstAbort = new Promise(done => { resolveWitnessFailure = done; });
    const recordWitnessFailure = error => {
      if (!witnessFailure) { witnessFailure = error; resolveWitnessFailure(error); }
      if (stopActiveChild) stopActiveChild("witness-abort");
      return error;
    };
    const attachAbort = witness => { witness.abort.then(recordWitnessFailure); };
    const finishWitnesses = async () => {
      if (repositoryWitness && !repositoryFinished) {
        repositoryWitness.complete();
        const repositoryResult = await bounded(repositoryWitness.result, 10_000,
          "omen-git-witness-result-timeout");
        const repositoryExit = await bounded(repositoryWitness.exit, 2_000, "omen-git-witness-exit-timeout");
        repositoryFinished = true;
        if (repositoryExit !== 0 || repositoryResult.counts.name !== 0
            || repositoryResult.counts.content !== 0 || repositoryResult.counts.metadata !== 0
            || repositoryResult.counts.errors !== 0 || repositoryResult.securityEqual !== true) {
          throw coded("omen-git-source-changed");
        }
      }
      if (uiWitness && !uiFinished) {
        if (!uiBound) {
          uiWitness.cancelBeforeBind();
          const uiExit = await bounded(uiWitness.exit, 2_000, "omen-git-ui-witness-exit-timeout");
          uiFinished = true;
          if (uiExit !== 0) throw coded("omen-git-ui-exposure");
        } else {
          uiWitness.complete();
          const uiResult = await bounded(uiWitness.result, 10_000, "omen-git-ui-witness-result-timeout");
          const uiExit = await bounded(uiWitness.exit, 2_000, "omen-git-ui-witness-exit-timeout");
          uiFinished = true;
          if (uiExit !== 0 || uiResult.attributableWindowEvents !== 0 || uiResult.errors !== 0
              || uiResult.overflow !== false || uiResult.survivorObserved !== false) {
            throw coded("omen-git-ui-exposure");
          }
        }
      }
      if (witnessFailure) throw witnessFailure;
    };
    let response = null, primaryError = null;
    try {
      repositoryWitness = this.repositoryWitnessFactory({
        powershellPath: initialManifest.powershellPath, scriptPath: this.repositoryWitnessPath,
        operationId, root: initialManifest.localRoot,
      });
      attachAbort(repositoryWitness);
      await bounded(repositoryWitness.ready, 10_000, "omen-git-witness-ready-timeout");
      if (witnessFailure) throw witnessFailure;
      guard = await this.nativeBridge.holdGit(initialManifest.localRoot.path, initialManifest.localRoot);
      if (guard.rootFinalPath !== initialManifest.localRoot.path
          || guard.gitFinalPath !== initialManifest.localRoot.gitFinalPath) throw coded("omen-root-identity-changed");
      const manifest = await this.manifest(rootId);
      if (manifest.releaseDigest !== initialManifest.releaseDigest
          || canonicalJson(manifest.repositoryConfig) !== canonicalJson(initialManifest.repositoryConfig)) {
        throw coded("omen-git-manifest-changed");
      }
      if (witnessFailure) throw witnessFailure;
      if (operation === "remotes") {
        await this.rootStore.localRootForGit(rootId);
        await new Promise(done => setTimeout(done, 25));
        const result = Object.freeze({ schemaVersion: "runa-omen-git-result/v1", rootId, operation,
          remotes: manifest.repositoryConfig.remotes, truncated: false,
          isolation: Object.freeze({ provider: "windows-native-config", tier: support.isolationTier,
            releaseDigest: manifest.releaseDigest, network: "not-invoked" }), privateValuesIncluded: true });
        await guard.release(); guard = null;
        await finishWitnesses();
        response = result;
      } else {
        const args = fixedArguments(operation, input, manifest.localRoot.path);
        const config = createContainedGitConfig(this.sdk, { root: manifest.localRoot.path,
          gitInstallRoot: this.gitInstallRoot, gitPath: this.gitPath, args,
          containerId: `runa-omen-git-${randomUUID()}` });
        const exactConfig = JSON.parse(JSON.stringify(config));
        const actualPolicyTemplateSha256 = policyTemplateDigest(exactConfig);
        if (actualPolicyTemplateSha256 !== this.expectedPolicyTemplateSha256) {
          throw coded("omen-git-policy-template-digest-mismatch");
        }
        const policyDigest = createHash("sha256").update(canonicalJson(exactConfig)).digest("hex");
        const operationManifest = { ...manifest, policyDigest,
          commandDigest: createHash("sha256").update(config.process.commandLine).digest("hex") };
        delete operationManifest.localRoot; delete operationManifest.repositoryConfig;
        const manifestDigest = createHash("sha256").update(canonicalJson(operationManifest)).digest("hex");
        uiWitness = this.uiWitnessFactory({
          powershellPath: initialManifest.powershellPath, scriptPath: this.uiWitnessPath, operationId,
          mxcImage: this.mxcExecutorPath, gitImage: this.gitPath,
        });
        attachAbort(uiWitness);
        await bounded(uiWitness.ready, 10_000, "omen-git-ui-witness-ready-timeout");
        await Promise.resolve();
        if (witnessFailure) throw witnessFailure;
        const child = this.sdk.spawnSandboxFromConfig(config,
          { usePty: false, executablePath: this.mxcExecutorPath }, manifest.localRoot.path);
        child.stdin?.on("error", () => {}); child.stdin?.end();
        let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), stopReason = null, stopChild;
        let actuallyClosed = false, resolveClose;
        const closePromise = new Promise(done => { resolveClose = done; });
        child.once("close", exitCode => { actuallyClosed = true; resolveClose(exitCode); });
        const outcomePromise = new Promise(done => {
          let settled = false, terminalTimer = null, deadlineTimer = null;
          const finish = value => {
            if (settled) return; settled = true; clearTimeout(deadlineTimer); clearTimeout(terminalTimer); done(value);
          };
          stopChild = reason => {
            if (stopReason) return; stopReason = reason;
            terminalTimer = setTimeout(() => finish({ kind: "terminal-missed" }), this.terminalGraceMs);
            try { child.kill(); } catch { /* bounded terminal timer remains authoritative */ }
          };
          child.once("error", () => stopChild("process-error"));
          closePromise.then(exitCode => finish({ kind: "close", exitCode }));
          deadlineTimer = setTimeout(() => stopChild("timeout"), TIMEOUT_MS + 500);
        });
        childRecord = { child, outcome: outcomePromise, close: closePromise,
          isClosed: () => actuallyClosed };
        stopActiveChild = stopChild;
        if (!Number.isSafeInteger(child.pid) || child.pid < 1 || child.pid > 0xffff_ffff) {
          stopChild("process-error"); throw coded("omen-git-process-error");
        }
        function capture(channel, chunk) {
          if (stopReason) return;
          const prior = channel === "stdout" ? stdout : stderr;
          const next = Buffer.concat([prior, Buffer.from(chunk)]);
          if (stdout.length + stderr.length + Buffer.byteLength(chunk) > OUTPUT_LIMIT) {
            stopChild("output-limited"); return;
          }
          if (channel === "stdout") stdout = next; else stderr = next;
        }
        child.stdout?.on("data", chunk => capture("stdout", chunk));
        child.stderr?.on("data", chunk => capture("stderr", chunk));
        await Promise.resolve();
        if (witnessFailure) {
          stopChild("witness-abort");
          await bounded(closePromise, 5_000, "omen-git-terminal-exit-missed");
          throw witnessFailure;
        }
        uiWitness.bindWrapper(child.pid); uiBound = true;
        const raced = await Promise.race([outcomePromise.then(outcome => ({ outcome })),
          firstAbort.then(error => ({ error }))]);
        let outcome;
        if (raced.error) {
          stopChild("witness-abort");
          await bounded(closePromise, 5_000, "omen-git-terminal-exit-missed");
          throw raced.error;
        }
        outcome = raced.outcome;
        stopActiveChild = null;
        if (outcome.kind === "terminal-missed") throw coded("omen-git-terminal-exit-missed");
        await new Promise(done => setTimeout(done, 25));
        await this.rootStore.localRootForGit(rootId);
        await guard.release(); guard = null;
        await finishWitnesses();
        if (stopReason === "process-error") throw coded("omen-git-process-error");
        if (stopReason === "timeout") throw coded("omen-git-timeout");
        if (stopReason === "output-limited") throw coded("omen-git-output-limited");
        if (outcome.exitCode !== 0) throw Object.assign(coded("omen-git-process-failed"), {
          exitCode: outcome.exitCode, stderrBytes: stderr.length,
          stderrSha256: createHash("sha256").update(stderr).digest("hex"),
        });
        const result = structuredResult(operation, stdout);
        response = Object.freeze({ schemaVersion: "runa-omen-git-result/v1", rootId, operation,
          ...result, isolation: Object.freeze({ provider: "microsoft-mxc", tier: support.isolationTier,
            releaseDigest: manifest.releaseDigest, policyDigest, policyTemplateSha256: actualPolicyTemplateSha256,
            manifestDigest, network: "deny-all" }), privateValuesIncluded: true });
      }
    } catch (error) { primaryError = error; }
    let cleanupError = null;
    try {
      if (childRecord && !childRecord.isClosed()) {
        try { childRecord.child.kill(); } catch {}
        try { await bounded(childRecord.close, 5_000, "omen-git-terminal-exit-missed"); }
        catch (error) { cleanupError ??= error; }
      }
      stopActiveChild = null;
      if (guard) {
        try { await guard.release(); guard = null; }
        catch (error) { cleanupError ??= error; }
      }
      if (!guard && (!repositoryFinished || !uiFinished)) {
        try { await finishWitnesses(); }
        catch (error) { cleanupError ??= error; }
      }
      if (repositoryWitness && !repositoryFinished) {
        repositoryWitness.terminate();
        try { await bounded(repositoryWitness.exit, 2_000, "omen-git-witness-exit-timeout"); }
        catch (error) { cleanupError ??= error; }
      }
      if (uiWitness && !uiFinished) {
        uiWitness.terminate();
        try { await bounded(uiWitness.exit, 2_000, "omen-git-ui-witness-exit-timeout"); }
        catch (error) { cleanupError ??= error; }
      }
    } catch (error) { cleanupError ??= error; }
    if (primaryError) {
      if (cleanupError && Object.isExtensible(primaryError)) {
        try { primaryError.cleanupCode = cleanupError.code ?? "omen-git-cleanup-failed"; } catch {}
      }
      throw primaryError;
    }
    if (cleanupError) throw cleanupError;
    return response;
  }
}

export { createContainedGitConfig, fixedArguments, inspectRepositoryConfig, policyTemplateDigest,
  sanitizeRemoteUrl, structuredResult };
