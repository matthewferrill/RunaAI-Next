import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PATCHED_SHA256, VULNERABLE_SHA256, patchDiagnosticSource,
  patchMxcSdkDiagnostic } from "./patch-mxc-sdk-diagnostic.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const installed = path.join(repositoryRoot, "node_modules", "@microsoft", "mxc-sdk", "dist", "diagnostic.js");
const reverse = Object.freeze([
  ["import { execFileSync } from 'child_process';", "import { execSync } from 'child_process';"],
  ["const output = execFileSync('C:\\\\Windows\\\\System32\\\\whoami.exe', ['/user', '/fo', 'csv', '/nh'], {",
    "const output = execSync('whoami /user /fo csv /nh', {"],
  ["            windowsHide: true,\n            stdio: ['ignore', 'pipe', 'pipe'],\n        }).trim();",
    "            windowsHide: true,\n        }).trim();"],
  ["let pipeName = null;\nfunction diagnosticPipeName() {\n    if (pipeName === null) {\n        pipeName = getDiagnosticPipeName();\n    }\n    return pipeName;\n}", "const PIPE_NAME = getDiagnosticPipeName();"],
  ["const socket = net.createConnection(diagnosticPipeName());", "const socket = net.createConnection(PIPE_NAME);"],
]);

async function vulnerableBytes() {
  const installedBytes = await readFile(installed);
  if (digest(installedBytes) === VULNERABLE_SHA256) return installedBytes;
  assert.equal(digest(installedBytes), PATCHED_SHA256);
  let source = installedBytes.toString("utf8");
  for (const [patched, vulnerable] of reverse) {
    assert.equal(source.split(patched).length - 1, 1);
    source = source.replace(patched, vulnerable);
  }
  const value = Buffer.from(source, "utf8");
  assert.equal(digest(value), VULNERABLE_SHA256);
  return value;
}

async function fixture({ version = "0.8.0", bytes } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "mxc-diagnostic-patch-"));
  const packageRoot = path.join(root, "node_modules", "@microsoft", "mxc-sdk");
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: "@microsoft/mxc-sdk", version }));
  await writeFile(path.join(packageRoot, "dist", "diagnostic.js"), bytes ?? await vulnerableBytes());
  return { root, packageRoot, target: path.join(packageRoot, "dist", "diagnostic.js"),
    close: () => rm(root, { recursive: true, force: true }) };
}

test("exact vulnerable dependency patches once and the exact patched state is a verified no-op", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(patchDiagnosticSource(await readFile(f.target)).length > 0, true);
    const first = await patchMxcSdkDiagnostic({ repositoryRoot: f.root });
    assert.equal(first.changed, true); assert.equal(digest(await readFile(f.target)), PATCHED_SHA256);
    const second = await patchMxcSdkDiagnostic({ repositoryRoot: f.root });
    assert.equal(second.changed, false); assert.equal(second.diagnosticSha256, PATCHED_SHA256);
  } finally { await f.close(); }
});

test("unknown bytes, wrong version, reparse dependency root and hard-linked target fail closed", async () => {
  const unknown = await fixture({ bytes: Buffer.from("partial-or-unknown") });
  try { await assert.rejects(patchMxcSdkDiagnostic({ repositoryRoot: unknown.root }), /source-unknown/u); }
  finally { await unknown.close(); }
  const version = await fixture({ version: "0.8.1" });
  try { await assert.rejects(patchMxcSdkDiagnostic({ repositoryRoot: version.root }), /package-version/u); }
  finally { await version.close(); }
  const hardlink = await fixture();
  try { await link(hardlink.target, path.join(hardlink.packageRoot, "dist", "second-link.js"));
    await assert.rejects(patchMxcSdkDiagnostic({ repositoryRoot: hardlink.root }), /file-boundary/u); }
  finally { await hardlink.close(); }
  const reparseRoot = await mkdtemp(path.join(tmpdir(), "mxc-diagnostic-reparse-"));
  const outside = await fixture();
  try { await symlink(path.join(outside.root, "node_modules"), path.join(reparseRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(patchMxcSdkDiagnostic({ repositoryRoot: reparseRoot }), /directory-boundary/u); }
  finally { await rm(reparseRoot, { recursive: true, force: true }); await outside.close(); }
});

test("disabled diagnostics import the patched SDK without a parent stderr write", () => {
  const env = { ComSpec: "C:\\Windows\\System32\\cmd.exe", OS: "Windows_NT", PATHEXT: ".COM;.EXE;.BAT;.CMD",
    PROCESSOR_ARCHITECTURE: "AMD64", SystemDrive: "C:", SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows",
    TEMP: tmpdir(), TMP: tmpdir() };
  const result = spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "-e",
    "await import('@microsoft/mxc-sdk')"], { cwd: repositoryRoot, env, encoding: "utf8", windowsHide: true, timeout: 10_000 });
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
});
