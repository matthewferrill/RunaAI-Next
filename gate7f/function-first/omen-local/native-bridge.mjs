import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, parse, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { assertReadableSource, LOCAL_CONTEXT_LIMITS, localSha256, protectedPathReason }
  from "../local-context-contract.mjs";

const coded = (code, message = code) => Object.assign(new Error(message), { code });
const NATIVE_RESULT = "runa-omen-native-result/v1";
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function strictBase64(value) {
  if (typeof value !== "string" || value.length > 1024 * 1024
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw coded("native-result-invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw coded("native-result-invalid");
  return bytes;
}

export class WindowsNativeBridge {
  constructor({ powershellPath, scriptPath = resolve(import.meta.dirname, "Invoke-RunaOmenNative.ps1"),
    expectedScriptSha256 = null, expectedPowerShellSha256 = null,
    timeoutMs = LOCAL_CONTEXT_LIMITS.operationDeadlineMs } = {}) {
    if (!isAbsolute(powershellPath ?? "") || !isAbsolute(scriptPath)) throw coded("native-release-path-invalid");
    this.powershellPath = resolve(powershellPath); this.scriptPath = resolve(scriptPath);
    this.expectedScriptSha256 = expectedScriptSha256;
    this.expectedPowerShellSha256 = expectedPowerShellSha256; this.timeoutMs = timeoutMs;
  }

  async verifyRelease() {
    const digest = createHash("sha256").update(await readFile(this.scriptPath)).digest("hex");
    if (this.expectedScriptSha256 && digest !== this.expectedScriptSha256) throw coded("native-release-digest-mismatch");
    const powershellSha256 = createHash("sha256").update(await readFile(this.powershellPath)).digest("hex");
    if (this.expectedPowerShellSha256 && powershellSha256 !== this.expectedPowerShellSha256) {
      throw coded("native-powershell-digest-mismatch");
    }
    return Object.freeze({ scriptSha256: digest, scriptPath: this.scriptPath,
      powershellPath: this.powershellPath, powershellSha256 });
  }

  async invoke(action, input) {
    await this.verifyRelease();
    const source = Buffer.from(JSON.stringify(input));
    if (source.length > LOCAL_CONTEXT_LIMITS.requestBytes) throw coded("native-input-too-large");
    const nativeArguments = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
      "Bypass", "-File", this.scriptPath, "-Action", action];
    const child = spawn(this.powershellPath, nativeArguments, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => {}); child.stdin.end(source);
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), stopReason = null, stopChild;
    const capture = channel => chunk => {
      if (stopReason) return;
      const next = Buffer.concat([channel === "stdout" ? stdout : stderr, Buffer.from(chunk)]);
      if (stdout.length + stderr.length + Buffer.byteLength(chunk) > LOCAL_CONTEXT_LIMITS.responseBytes) {
        stopChild("output-limited"); return;
      }
      if (channel === "stdout") stdout = next; else stderr = next;
    };
    child.stdout.on("data", capture("stdout")); child.stderr.on("data", capture("stderr"));
    const outcome = await new Promise(resolveOutcome => {
      let settled = false, deadlineTimer = null, terminalTimer = null;
      const finish = value => {
        if (settled) return; settled = true; clearTimeout(deadlineTimer); clearTimeout(terminalTimer); resolveOutcome(value);
      };
      stopChild = reason => {
        if (stopReason) return; stopReason = reason;
        terminalTimer = setTimeout(() => finish({ kind: "terminal-missed" }), 2_000);
        try { child.kill(); } catch {}
      };
      child.once("error", () => stopChild("process-error"));
      child.once("close", exitCode => finish({ kind: "close", exitCode }));
      deadlineTimer = setTimeout(() => stopChild("timeout"), this.timeoutMs);
    });
    if (outcome.kind === "terminal-missed") throw coded("native-terminal-exit-missed");
    if (stopReason === "process-error") throw coded("native-process-error");
    if (stopReason === "timeout") throw coded("native-operation-timeout");
    if (stopReason === "output-limited") throw coded("native-output-limited");
    if (outcome.exitCode !== 0) {
      let stderrText = "";
      try { stderrText = utf8.decode(stderr); } catch {}
      const code = stderrText.trim().split(/\r?\n/u)
        .find(line => /^[a-z0-9-]{1,100}$/u.test(line));
      const error = coded(/^[a-z0-9-]{1,100}$/u.test(code) ? code : "native-operation-failed");
      error.stderrBytes = stderr.length;
      error.stderrSha256 = createHash("sha256").update(stderr).digest("hex");
      throw error;
    }
    let result;
    try { result = JSON.parse(utf8.decode(stdout)); }
    catch { throw coded("native-result-invalid"); }
    if (!result || result.schemaVersion !== NATIVE_RESULT) throw coded("native-result-invalid");
    return Object.freeze(result);
  }

  protect(path, value) {
    return this.invoke("protect", { path: resolve(path), dataBase64: Buffer.from(value).toString("base64") });
  }
  async unprotect(path) {
    const result = await this.invoke("unprotect", { path: resolve(path) });
    return strictBase64(result.dataBase64);
  }
  inspectRoot(root) { return this.invoke("inspect-root", { root: resolve(root) }); }
  inspectGit(root, identity) {
    return this.invoke("inspect-git", { root: resolve(root), expectedVolumeId: identity?.volumeId,
      expectedFileId: identity?.fileId });
  }
  async shortPath(path) {
    const result = await this.invoke("short-path", { path: resolve(path) });
    if (typeof result.shortPath !== "string" || !isAbsolute(result.shortPath)) throw coded("native-result-invalid");
    return result.shortPath;
  }
  async inspectFile(root, relativePath, identity) {
    if (!identity || !/^[a-f0-9]{8}$/u.test(identity.volumeId ?? "")
        || !/^[a-f0-9]{16}$/u.test(identity.fileId ?? "")) throw coded("native-root-identity-invalid");
    const result = await this.invoke("inspect-file", { root: resolve(root), relativePath,
      expectedVolumeId: identity.volumeId, expectedFileId: identity.fileId });
    if (!/^[a-f0-9]{8}$/u.test(result.volumeId ?? "") || !/^[a-f0-9]{16}$/u.test(result.fileId ?? "")
        || !Number.isSafeInteger(result.bytes) || result.bytes < 0) throw coded("native-result-invalid");
    return Object.freeze({ finalPath: result.finalPath, volumeId: result.volumeId,
      fileId: result.fileId, bytes: result.bytes });
  }
  async holdGit(root, identity) {
    if (!identity || !/^[a-f0-9]{8}$/u.test(identity.volumeId ?? "")
        || !/^[a-f0-9]{16}$/u.test(identity.fileId ?? "")) throw coded("native-root-identity-invalid");
    const release = await this.verifyRelease();
    const args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", this.scriptPath, "-Action", "hold-git"];
    const child = spawn(this.powershellPath, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let childClosed = false; child.once("close", () => { childClosed = true; });
    const input = JSON.stringify({ root: resolve(root), expectedVolumeId: identity.volumeId,
      expectedFileId: identity.fileId });
    child.stdin.on("error", () => {}); child.stdin.write(`${input}\n`);
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), settled = false;
    const ready = await new Promise((done, fail) => {
      const timer = setTimeout(() => finish(fail, coded("native-hold-timeout")), this.timeoutMs);
      const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timer); callback(value); };
      child.once("error", () => finish(fail, coded("native-process-error")));
      child.once("close", () => finish(fail, coded("native-hold-closed")));
      child.stderr.on("data", chunk => { stderr = Buffer.concat([stderr, Buffer.from(chunk)]);
        if (stderr.length > LOCAL_CONTEXT_LIMITS.responseBytes) finish(fail, coded("native-output-limited")); });
      child.stdout.on("data", chunk => {
        stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
        if (stdout.length + stderr.length > LOCAL_CONTEXT_LIMITS.responseBytes) {
          finish(fail, coded("native-output-limited")); return;
        }
        const newline = stdout.indexOf(0x0a);
        if (newline < 0) return;
        let value;
        try { value = JSON.parse(utf8.decode(stdout.subarray(0, newline)).replace(/\r$/u, "")); }
        catch { finish(fail, coded("native-result-invalid")); return; }
        if (value?.schemaVersion !== NATIVE_RESULT || value.held !== true
            || typeof value.rootFinalPath !== "string" || typeof value.gitFinalPath !== "string") {
          finish(fail, coded("native-result-invalid")); return;
        }
        finish(done, value);
      });
    }).catch(async error => {
      if (!childClosed) {
        const closed = new Promise(done => child.once("close", done));
        try { child.kill(); } catch {}
        const terminated = await Promise.race([closed.then(() => true),
          new Promise(done => setTimeout(() => done(false), 2_000))]);
        if (!terminated) throw coded("native-hold-terminal-exit-missed");
      }
      throw error;
    });
    let released = false;
    return Object.freeze({ ...ready, processId: child.pid, executablePath: release.powershellPath,
      executableSha256: release.powershellSha256, release: async () => {
      if (released) return; released = true;
      child.stdin.end("release\n");
      await new Promise((done, fail) => {
        let finished = false, terminalTimer = null;
        const timer = setTimeout(() => {
          try { child.kill(); } catch {}
          terminalTimer = setTimeout(() => { if (!finished) { finished = true;
            fail(coded("native-hold-terminal-exit-missed")); } }, 2_000);
        }, 2_000);
        child.once("close", code => { if (finished) return; finished = true; clearTimeout(timer);
          clearTimeout(terminalTimer); if (code === 0) done(); else fail(coded("native-hold-release-failed")); });
      });
    } });
  }
  async safeRead(root, relativePath, identity, sourceIdentity = null) {
    if (!identity || !/^[a-f0-9]{8}$/u.test(identity.volumeId ?? "")
        || !/^[a-f0-9]{16}$/u.test(identity.fileId ?? "")) throw coded("native-root-identity-invalid");
    const source = sourceIdentity ?? await this.inspectFile(root, relativePath, identity);
    if (!/^[a-f0-9]{8}$/u.test(source.volumeId ?? "") || !/^[a-f0-9]{16}$/u.test(source.fileId ?? "")) {
      throw coded("native-source-identity-invalid");
    }
    const result = await this.invoke("safe-read", { root: resolve(root), relativePath,
      expectedVolumeId: identity.volumeId, expectedFileId: identity.fileId,
      expectedSourceVolumeId: source.volumeId, expectedSourceFileId: source.fileId });
    return strictBase64(result.dataBase64);
  }
}

export class OmenRootStore {
  constructor({ statePath, nativeBridge, userProfilePath, protectedSystemPaths = [] }) {
    if (!isAbsolute(statePath) || !isAbsolute(userProfilePath)) throw coded("omen-root-store-path-invalid");
    this.statePath = resolve(statePath); this.nativeBridge = nativeBridge;
    this.userProfilePath = resolve(userProfilePath);
    this.protectedSystemPaths = protectedSystemPaths.map(value => resolve(value));
  }

  async load() {
    let data;
    try { data = JSON.parse((await this.nativeBridge.unprotect(this.statePath)).toString("utf8")); }
    catch (error) {
      if (error?.code === "native-state-missing") return this.#empty();
      throw error;
    }
    if (!data || data.schemaVersion !== "runa-omen-root-store/v1" || !Array.isArray(data.roots)
        || data.roots.length > LOCAL_CONTEXT_LIMITS.roots) throw coded("omen-root-store-invalid");
    for (const item of data.roots) this.#validateRecord(item);
    return Object.freeze({ schemaVersion: data.schemaVersion,
      roots: Object.freeze(data.roots.map(item => Object.freeze({ ...item }))) });
  }

  async inspectSelectedRoot(selectedPath) {
    const exact = resolve(selectedPath);
    if (exact === parse(exact).root || exact.toLowerCase() === this.userProfilePath.toLowerCase()
        || this.protectedSystemPaths.some(path => this.#sameOrBeneath(path, exact))) {
      throw coded("omen-root-protected");
    }
    const inspected = await this.nativeBridge.inspectRoot(exact);
    const displayName = basename(inspected.finalPath).replace(/\s+/gu, " ").trim();
    if (!displayName || displayName.length > LOCAL_CONTEXT_LIMITS.displayNameCharacters) {
      throw coded("omen-root-label-invalid");
    }
    const retained = await this.load();
    for (const root of retained.roots) {
      if (this.#sameOrBeneath(root.path, inspected.finalPath) || this.#sameOrBeneath(inspected.finalPath, root.path)) {
        throw coded("omen-root-overlap");
      }
    }
    return Object.freeze({ candidateId: `candidate-${randomBytes(16).toString("hex")}`,
      rootId: `root-${localSha256(`${inspected.volumeId}\0${inspected.fileId}`).slice(0, 32)}`,
      displayName, path: inspected.finalPath, volumeId: inspected.volumeId, fileId: inspected.fileId,
      repositoryDetected: inspected.repositoryDetected === true,
      expiresAt: new Date(Date.now() + LOCAL_CONTEXT_LIMITS.candidateLifetimeMs).toISOString() });
  }

  async confirm(candidate, { now = new Date() } = {}) {
    if (!candidate || Date.parse(candidate.expiresAt) < now.getTime()) throw coded("omen-root-candidate-expired");
    const inspected = await this.nativeBridge.inspectRoot(candidate.path);
    if (inspected.volumeId !== candidate.volumeId || inspected.fileId !== candidate.fileId
        || inspected.finalPath.toLowerCase() !== candidate.path.toLowerCase()) throw coded("omen-root-candidate-changed");
    const retained = await this.load();
    if (retained.roots.length >= LOCAL_CONTEXT_LIMITS.roots) throw coded("local-root-limit");
    const record = { rootId: candidate.rootId, displayName: candidate.displayName, path: candidate.path,
      volumeId: candidate.volumeId, fileId: candidate.fileId,
      repositoryDetected: candidate.repositoryDetected === true, confirmedAt: now.toISOString() };
    this.#validateRecord(record);
    const next = { schemaVersion: "runa-omen-root-store/v1", roots: [...retained.roots, record] };
    await this.nativeBridge.protect(this.statePath, Buffer.from(JSON.stringify(next)));
    return Object.freeze({ rootId: record.rootId, displayName: record.displayName,
      repositoryDetected: record.repositoryDetected });
  }

  async remove(rootId) {
    const retained = await this.load();
    const next = retained.roots.filter(item => item.rootId !== rootId);
    if (next.length === retained.roots.length) return false;
    await this.nativeBridge.protect(this.statePath,
      Buffer.from(JSON.stringify({ schemaVersion: "runa-omen-root-store/v1", roots: next })));
    return true;
  }

  async readText(rootId, relativePath) {
    if (protectedPathReason(relativePath)) throw coded("protected-source-denied");
    const root = await this.currentRoot(rootId);
    const bytes = await this.nativeBridge.safeRead(root.path, relativePath, root);
    assertReadableSource(relativePath, bytes);
    const lines = bytes.toString("utf8").split(/\r?\n/u).slice(0, LOCAL_CONTEXT_LIMITS.returnedTextLines);
    let content = lines.join("\n");
    while (Buffer.byteLength(content) > LOCAL_CONTEXT_LIMITS.returnedTextBytes) content = content.slice(0, -1);
    return Object.freeze({ schemaVersion: "runa-omen-text-result/v1", rootId, relativePath,
      content, sourceBytes: bytes.length, returnedBytes: Buffer.byteLength(content),
      truncated: bytes.length > Buffer.byteLength(content), privateValuesIncluded: true });
  }

  async localRootForGit(rootId) {
    const root = await this.currentRoot(rootId, { repository: true });
    const git = await this.nativeBridge.inspectGit(root.path, root);
    const gitRelative = relative(root.path, git.gitFinalPath);
    if (git.replacementEntries !== 0 || gitRelative.toLowerCase() !== ".git" || isAbsolute(gitRelative)) {
      throw coded("omen-git-metadata-denied");
    }
    return Object.freeze({ ...root, gitFinalPath: git.gitFinalPath });
  }

  async currentRoot(rootId, { repository = false } = {}) {
    const retained = await this.load();
    const root = retained.roots.find(item => item.rootId === rootId);
    if (!root || repository && root.repositoryDetected !== true) {
      throw coded(repository ? "omen-git-root-not-found" : "omen-root-not-found");
    }
    const inspected = await this.nativeBridge.inspectRoot(root.path);
    if (inspected.volumeId !== root.volumeId || inspected.fileId !== root.fileId
        || inspected.finalPath.toLowerCase() !== root.path.toLowerCase()) throw coded("omen-root-identity-changed");
    if (repository && inspected.repositoryDetected !== true) throw coded("omen-git-root-not-found");
    return Object.freeze({ rootId: root.rootId, path: root.path, displayName: root.displayName,
      volumeId: root.volumeId, fileId: root.fileId, privateValuesIncluded: true });
  }

  #empty() { return Object.freeze({ schemaVersion: "runa-omen-root-store/v1", roots: Object.freeze([]) }); }
  #sameOrBeneath(parent, child) {
    const value = relative(resolve(parent), resolve(child));
    return value === "" || (!value.startsWith("..") && !isAbsolute(value));
  }
  #validateRecord(item) {
    if (!item || typeof item !== "object" || !/^root-[a-f0-9]{32}$/u.test(item.rootId)
        || typeof item.displayName !== "string" || item.displayName.length < 1
        || item.displayName.length > LOCAL_CONTEXT_LIMITS.displayNameCharacters || !isAbsolute(item.path)
        || !/^[a-f0-9]{8}$/u.test(item.volumeId) || !/^[a-f0-9]{16}$/u.test(item.fileId)
        || typeof item.repositoryDetected !== "boolean" || !Number.isFinite(Date.parse(item.confirmedAt))) {
      throw coded("omen-root-store-invalid");
    }
  }
}
