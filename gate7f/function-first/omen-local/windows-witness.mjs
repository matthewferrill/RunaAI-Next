import { spawn } from "node:child_process";
import { TextDecoder } from "node:util";
import { canonicalJson } from "../local-context-contract.mjs";

const OUTPUT_LIMIT = 65_536;
const LINE_LIMIT = 4_096;
const COUNT_LIMIT = 1_000_000;
const UI_COUNT_LIMIT = 10_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const REPOSITORY_ABORT_CODES = new Set(["repository-name-event", "repository-content-event",
  "repository-metadata-event", "watcher-error", "watcher-count-overflow", "witness-drain-timeout",
  "security-snapshot-failed", "security-baseline-changed", "witness-protocol-invalid"]);
const UI_ABORT_CODES = new Set(["interactive-window-observed", "ui-owner-unresolved",
  "ui-wrapper-identity-mismatch", "ui-hook-error", "ui-event-overflow", "ui-protocol-invalid"]);
const coded = code => Object.assign(new Error(code), { code });
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const boundedCount = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const encodeFrame = value => Buffer.from(canonicalJson(value), "utf8").toString("base64url");

function repositoryResult(value, operationId) {
  const keys = ["name", "content", "metadata", "security", "errors"];
  if (!exactKeys(value, ["schemaVersion", "operationId", "counts", "securityEntries", "securityEqual",
    "privateValuesIncluded"]) || value.schemaVersion !== "runa-omen-repository-witness-result/v1"
      || value.operationId !== operationId || value.privateValuesIncluded !== false
      || !exactKeys(value.counts, keys) || !keys.every(key => boundedCount(value.counts[key], COUNT_LIMIT))
      || !Number.isSafeInteger(value.securityEntries) || value.securityEntries < 1
      || value.securityEntries > 100_000 || typeof value.securityEqual !== "boolean") {
    throw coded("omen-git-witness-result-invalid");
  }
  return Object.freeze({ ...value, counts: Object.freeze({ ...value.counts }) });
}

function uiResult(value, operationId) {
  if (!exactKeys(value, ["schemaVersion", "operationId", "inputDesktopEvents", "attributableWindowEvents",
    "errors", "overflow", "survivorObserved", "privateValuesIncluded"])
      || value.schemaVersion !== "runa-omen-ui-witness-result/v1" || value.operationId !== operationId
      || value.privateValuesIncluded !== false
      || ![value.inputDesktopEvents, value.attributableWindowEvents, value.errors]
        .every(item => boundedCount(item, UI_COUNT_LIMIT))
      || typeof value.overflow !== "boolean" || typeof value.survivorObserved !== "boolean") {
    throw coded("omen-git-ui-witness-result-invalid");
  }
  return Object.freeze({ ...value });
}

function startProtocol({ powershellPath, scriptPath, operationId, kind, start, spawnProcess = spawn }) {
  if (!UUID.test(operationId)) throw coded("omen-git-witness-operation-invalid");
  const child = spawnProcess(powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
    "Bypass", "-File", scriptPath], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let bytes = 0, pending = Buffer.alloc(0), sequence = 0, faulted = false;
  let bound = false, cancellationRequested = false;
  let readyDone = false, resultDone = false, abortDone = false;
  let resolveReady, rejectReady, resolveResult, rejectResult, resolveAbort;
  const ready = new Promise((done, fail) => { resolveReady = done; rejectReady = fail; });
  const result = new Promise((done, fail) => { resolveResult = done; rejectResult = fail; });
  const abort = new Promise(done => { resolveAbort = done; });
  ready.catch(() => {}); result.catch(() => {});
  const exit = new Promise(done => child.once("close", code => done(code)));
  const fail = code => {
    if (faulted) return;
    faulted = true;
    const error = coded(code);
    if (!readyDone) { readyDone = true; rejectReady(error); }
    if (!resultDone) { resultDone = true; rejectResult(error); }
    if (!abortDone) { abortDone = true; resolveAbort(error); }
    try { child.kill(); } catch {}
  };
  child.once("error", () => fail("omen-git-witness-process-error"));
  child.stderr.on("data", chunk => {
    bytes += Buffer.byteLength(chunk);
    fail(bytes > OUTPUT_LIMIT ? "omen-git-witness-output-limited" : "omen-git-witness-stderr");
  });
  child.stdout.on("data", chunk => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > OUTPUT_LIMIT) { fail("omen-git-witness-output-limited"); return; }
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    if (pending.length > LINE_LIMIT && pending.indexOf(0x0a) < 0) { fail("omen-git-witness-output-limited"); return; }
    for (;;) {
      const newline = pending.indexOf(0x0a);
      if (newline < 0) break;
      const raw = pending.subarray(0, newline);
      pending = pending.subarray(newline + 1);
      if (raw.length < 2 || raw.length > LINE_LIMIT) { fail("omen-git-witness-output-invalid"); return; }
      let line, value;
      try { line = new TextDecoder("utf-8", { fatal: true }).decode(raw).replace(/\r$/u, "");
        value = JSON.parse(line); }
      catch { fail("omen-git-witness-output-invalid"); return; }
      const readySchema = kind === "repository" ? "runa-omen-repository-witness-ready/v1"
        : "runa-omen-ui-witness-ready/v1";
      const abortSchema = kind === "repository" ? "runa-omen-repository-witness-abort/v1"
        : "runa-omen-ui-witness-abort/v1";
      if (value?.schemaVersion === readySchema) {
        if (sequence !== 0 || !exactKeys(value, ["schemaVersion", "operationId"])
            || value.operationId !== operationId) { fail("omen-git-witness-output-invalid"); return; }
        sequence = 1; readyDone = true; resolveReady();
      } else if (value?.schemaVersion === abortSchema) {
        const allowed = kind === "repository" ? REPOSITORY_ABORT_CODES : UI_ABORT_CODES;
        if (sequence > 1 || !exactKeys(value, ["schemaVersion", "operationId", "errorCode"])
            || value.operationId !== operationId || !allowed.has(value.errorCode)) {
          fail("omen-git-witness-output-invalid"); return;
        }
        sequence = 2;
        const error = coded(kind === "repository" ? "omen-git-source-changed" : "omen-git-ui-exposure");
        error.witnessCode = value.errorCode;
        if (!readyDone) { readyDone = true; rejectReady(error); }
        if (!abortDone) { abortDone = true; resolveAbort(error); }
      } else {
        const resultSchema = kind === "repository" ? "runa-omen-repository-witness-result/v1"
          : "runa-omen-ui-witness-result/v1";
        if (value?.schemaVersion !== resultSchema || sequence < 1 || sequence > 2 || resultDone) {
          fail("omen-git-witness-output-invalid"); return;
        }
        try { value = kind === "repository" ? repositoryResult(value, operationId) : uiResult(value, operationId); }
        catch (error) { fail(error.code); return; }
        sequence = 3; resultDone = true; resolveResult(value);
      }
    }
  });
  child.once("close", () => {
    if (pending.length !== 0) fail("omen-git-witness-output-invalid");
    if (!resultDone && cancellationRequested && kind === "ui" && sequence === 1) {
      resultDone = true; resolveResult(null);
    } else if (!resultDone) fail("omen-git-witness-closed");
  });
  const frame = encodeFrame(start);
  if (Buffer.byteLength(frame) > 8_192) fail("omen-git-witness-input-invalid");
  else child.stdin.write(`${frame}\n`);
  child.stdin.on("error", () => fail("omen-git-witness-input-error"));
  return Object.freeze({ child, ready, abort, result, exit,
    bind(value) { if (kind !== "ui" || bound || cancellationRequested || child.stdin.destroyed) {
        throw coded("omen-git-witness-state-invalid");
      }
      const encoded = encodeFrame(value); if (Buffer.byteLength(encoded) > 8_192) throw coded("omen-git-witness-input-invalid");
      bound = true; child.stdin.write(`${encoded}\n`); },
    cancelBeforeBind() {
      if (kind !== "ui" || bound || cancellationRequested || child.stdin.destroyed) {
        throw coded("omen-git-witness-state-invalid");
      }
      cancellationRequested = true; child.stdin.end("cancel\n");
    },
    complete() { if (!child.stdin.destroyed) child.stdin.end("complete\n"); },
    terminate() { try { child.kill(); } catch {} },
  });
}

export function startRepositoryWitness({ powershellPath, scriptPath, operationId, root }) {
  return startProtocol({ powershellPath, scriptPath, operationId, kind: "repository",
    start: { schemaVersion: "runa-omen-repository-witness-start/v1", operationId,
      root: { rootFinalPath: root.path, gitFinalPath: root.gitFinalPath,
        volumeId: root.volumeId, fileId: root.fileId } } });
}

export function startUiWitness({ powershellPath, scriptPath, operationId, mxcImage, gitImage }) {
  const protocol = startProtocol({ powershellPath, scriptPath, operationId, kind: "ui",
    start: { schemaVersion: "runa-omen-ui-witness-start/v1", operationId, mxcImage, gitImage } });
  return Object.freeze({ ...protocol, bindWrapper(wrapperPid) {
    protocol.bind({ schemaVersion: "runa-omen-ui-witness-bind/v1", operationId, wrapperPid });
  } });
}

export { encodeFrame, repositoryResult, startProtocol, uiResult };
