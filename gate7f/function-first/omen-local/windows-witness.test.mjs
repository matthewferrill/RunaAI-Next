import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { encodeFrame, repositoryResult, startProtocol, uiResult } from "./windows-witness.mjs";

const operationId = "12345678-1234-4123-8123-123456789abc";

test("repository witness result is exact, bounded and permits restored security-only events", () => {
  const value = { schemaVersion: "runa-omen-repository-witness-result/v1", operationId,
    counts: { name: 0, content: 0, metadata: 0, security: 84, errors: 0 },
    securityEntries: 43, securityEqual: true, privateValuesIncluded: false };
  assert.equal(repositoryResult(value, operationId).counts.security, 84);
  for (const invalid of [
    { ...value, privatePath: "must-not-cross" },
    { ...value, operationId: "12345678-1234-4123-8123-123456789abd" },
    { ...value, counts: { ...value.counts, name: 1_000_001 } },
    { ...value, counts: { ...value.counts, privateName: 1 } },
    { ...value, securityEntries: 0 },
  ]) assert.throws(() => repositoryResult(invalid, operationId));
});

test("UI witness result rejects exposure, private fields and invalid bounded types at the parser boundary", () => {
  const value = { schemaVersion: "runa-omen-ui-witness-result/v1", operationId,
    inputDesktopEvents: 2, attributableWindowEvents: 0, errors: 0,
    overflow: false, survivorObserved: false, privateValuesIncluded: false };
  assert.equal(uiResult(value, operationId).inputDesktopEvents, 2);
  for (const invalid of [
    { ...value, pid: 42 }, { ...value, inputDesktopEvents: 10_001 },
    { ...value, overflow: 0 }, { ...value, survivorObserved: null },
  ]) assert.throws(() => uiResult(invalid, operationId));
});

test("start frames use unpadded base64url and retain exact string identities", () => {
  const value = { schemaVersion: "runa-omen-repository-witness-start/v1", operationId,
    root: { rootFinalPath: "C:\\owned", gitFinalPath: "C:\\owned\\.git",
      volumeId: "00000001", fileId: "0000000000000001" } };
  const frame = encodeFrame(value);
  assert.match(frame, /^[A-Za-z0-9_-]+$/u);
  assert.doesNotMatch(frame, /=/u);
  assert.deepEqual(JSON.parse(Buffer.from(frame, "base64url").toString("utf8")), value);
});

test("UI pre-bind cancellation is a clean terminal lifecycle rather than a protocol abort", async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
  child.stderr = new PassThrough(); child.kill = () => child.emit("close", 1);
  let lines = "", started = false;
  child.stdin.on("data", chunk => {
    lines += chunk.toString("utf8");
    for (;;) {
      const newline = lines.indexOf("\n"); if (newline < 0) break;
      const line = lines.slice(0, newline); lines = lines.slice(newline + 1);
      if (!started) { started = true; child.stdout.write(`${JSON.stringify({
        schemaVersion: "runa-omen-ui-witness-ready/v1", operationId })}\n`); }
      else if (line === "cancel") queueMicrotask(() => child.emit("close", 0));
    }
  });
  const protocol = startProtocol({ powershellPath: "C:\\Windows\\powershell.exe",
    scriptPath: "C:\\witness.ps1", operationId, kind: "ui",
    start: { schemaVersion: "runa-omen-ui-witness-start/v1", operationId,
      mxcImage: "C:\\mxc.exe", gitImage: "C:\\git.exe" }, spawnProcess: () => child });
  await protocol.ready; protocol.cancelBeforeBind();
  assert.equal(await protocol.exit, 0); assert.equal(await protocol.result, null);
  let abortSettled = false; protocol.abort.then(() => { abortSettled = true; });
  await Promise.resolve(); assert.equal(abortSettled, false);
});

test("pinned PowerShell sidecars contain the frozen event-driven and fail-closed primitives", async () => {
  const root = import.meta.dirname;
  const [repository, ui, observer, attributes] = await Promise.all([
    readFile(resolve(root, "Watch-RunaRepository.ps1"), "utf8"),
    readFile(resolve(root, "Watch-RunaInteractiveDesktop.ps1"), "utf8"),
    readFile(resolve(root, "git-observer.mjs"), "utf8"),
    readFile(resolve(root, "../../../.gitattributes"), "utf8"),
  ]);
  const literal = token => new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u");
  for (const token of ["NotifyFilters.FileName", "NotifyFilters.LastWrite", "NotifyFilters.Attributes",
    "NotifyFilters.Security", "GetSecurityInfo", "FILE_FLAG_OPEN_REPARSE_POINT", "GetFinalPathNameByHandle",
    "StringComparer.Ordinal", "SHA256.Create", "MaximumEntries=100000", "watcher-count-overflow",
    "security-snapshot-failed", "StopWatching", "$afterA", "$afterB", "$afterC"])
    assert.match(repository, literal(token));
  for (const token of ["OpenInputDesktop", "SetThreadDesktop", "SetWinEventHook", "EVENT_OBJECT_CREATE",
    "EVENT_OBJECT_SHOW", "GetMessage", "EnumDesktopWindows", "QueryFullProcessImageName",
    "MaximumEvents=10000", "ui-owner-unresolved", "DESKTOP_READOBJECTS|DESKTOP_HOOKCONTROL|DESKTOP_ENUMERATE",
    "!UnhookWinEvent", "!PostThreadMessage", "!CloseDesktop", "$bindLine-ceq'cancel'"])
    assert.match(ui, literal(token));
  assert.doesNotMatch(ui, /DESKTOP_CREATEWINDOW|DESKTOP_WRITEOBJECTS|DESKTOP_SWITCHDESKTOP/u);
  assert.match(attributes, /^gate7f\/function-first\/omen-local\/Watch-RunaRepository\.ps1 text eol=lf$/mu);
  assert.match(attributes, /^gate7f\/function-first\/omen-local\/Watch-RunaInteractiveDesktop\.ps1 text eol=lf$/mu);
  assert.doesNotMatch(observer, /from "node:fs"/u);
  assert.ok(observer.indexOf("await guard.release()") < observer.indexOf("await finishWitnesses()"));
  assert.ok(observer.indexOf("await finishWitnesses()") < observer.indexOf("structuredResult(operation, stdout)"));
});
