import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const VULNERABLE_SHA256 = "4ba317942b40061a3d068f5f02be2727ba7674da5efb845d8147ab104ca47c4a";
export const PATCHED_SHA256 = "396f6dde90c416ce40af34a0bdf99c61eec6c005222dd27644e48cb8b0181f51";
const coded = code => Object.assign(new Error(code), { code });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const samePath = (left, right) => process.platform === "win32"
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);

const replacements = Object.freeze([
  ["import { execSync } from 'child_process';", "import { execFileSync } from 'child_process';"],
  ["const output = execSync('whoami /user /fo csv /nh', {",
    "const output = execFileSync('C:\\\\Windows\\\\System32\\\\whoami.exe', ['/user', '/fo', 'csv', '/nh'], {"],
  ["            windowsHide: true,\n        }).trim();",
    "            windowsHide: true,\n            stdio: ['ignore', 'pipe', 'pipe'],\n        }).trim();"],
  ["const PIPE_NAME = getDiagnosticPipeName();",
    "let pipeName = null;\nfunction diagnosticPipeName() {\n    if (pipeName === null) {\n        pipeName = getDiagnosticPipeName();\n    }\n    return pipeName;\n}"],
  ["const socket = net.createConnection(PIPE_NAME);", "const socket = net.createConnection(diagnosticPipeName());"],
]);

function occurrences(value, marker) { return value.split(marker).length - 1; }

export function patchDiagnosticSource(bytes) {
  if (digest(bytes) === PATCHED_SHA256) return Buffer.from(bytes);
  if (digest(bytes) !== VULNERABLE_SHA256) throw coded("mxc-diagnostic-patch-source-unknown");
  let source;
  try { source = new TextDecoder("utf8", { fatal: true }).decode(bytes); }
  catch { throw coded("mxc-diagnostic-patch-source-encoding"); }
  for (const [before, after] of replacements) {
    if (occurrences(source, before) !== 1) throw coded("mxc-diagnostic-patch-marker");
    source = source.replace(before, after);
  }
  const patched = Buffer.from(source, "utf8");
  if (digest(patched) !== PATCHED_SHA256) throw coded("mxc-diagnostic-patch-result-drift");
  return patched;
}

async function plainDirectory(directory) {
  const item = await lstat(directory);
  if (!item.isDirectory() || item.isSymbolicLink() || !samePath(await realpath(directory), directory)) {
    throw coded("mxc-diagnostic-patch-directory-boundary");
  }
}

async function stablePlainFileIdentity(filename, maximumBytes) {
  const item = await lstat(filename);
  if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1 || item.size < 1 || item.size > maximumBytes
      || !samePath(await realpath(filename), filename)) throw coded("mxc-diagnostic-patch-file-boundary");
  const handle = await open(filename, "r");
  try {
    const before = await handle.stat();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || bytes.length !== before.size || before.dev !== after.dev
        || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw coded("mxc-diagnostic-patch-file-drift");
    }
    return Object.freeze({ bytes, dev: before.dev, ino: before.ino });
  } finally { await handle.close(); }
}

async function stablePlainFile(filename, maximumBytes) {
  return (await stablePlainFileIdentity(filename, maximumBytes)).bytes;
}

async function boundPathIdentity(filename, expected) {
  const item = await lstat(filename);
  if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1 || item.dev !== expected.dev
      || item.ino !== expected.ino || !samePath(await realpath(filename), filename)) {
    throw coded("mxc-diagnostic-patch-target-identity");
  }
}

export async function patchMxcSdkDiagnostic({ repositoryRoot = path.resolve(import.meta.dirname, "..") } = {}) {
  const root = path.resolve(repositoryRoot);
  await plainDirectory(root);
  const dependencyRoot = path.join(root, "node_modules");
  const scopeRoot = path.join(dependencyRoot, "@microsoft");
  const packageRoot = path.join(scopeRoot, "mxc-sdk");
  const distributionRoot = path.join(packageRoot, "dist");
  for (const directory of [dependencyRoot, scopeRoot, packageRoot, distributionRoot]) await plainDirectory(directory);
  if (!samePath(path.dirname(dependencyRoot), root)) throw coded("mxc-diagnostic-patch-repository-boundary");

  const packageFile = path.join(packageRoot, "package.json");
  let manifest;
  try { manifest = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(await stablePlainFile(packageFile, 65_536))); }
  catch (error) { if (error?.code) throw error; throw coded("mxc-diagnostic-patch-package-json"); }
  if (manifest?.name !== "@microsoft/mxc-sdk" || manifest?.version !== "0.8.0") {
    throw coded("mxc-diagnostic-patch-package-version");
  }

  const target = path.join(distributionRoot, "diagnostic.js");
  const approved = await stablePlainFileIdentity(target, 65_536);
  const current = approved.bytes;
  const currentSha256 = digest(current);
  if (![VULNERABLE_SHA256, PATCHED_SHA256].includes(currentSha256)) {
    throw coded("mxc-diagnostic-patch-source-unknown");
  }
  if (currentSha256 === VULNERABLE_SHA256) {
    const patched = patchDiagnosticSource(current);
    const handle = await open(target, "r+");
    try {
      const before = await handle.stat();
      const locked = await handle.readFile();
      if (!before.isFile() || before.nlink !== 1 || before.dev !== approved.dev || before.ino !== approved.ino
          || digest(locked) !== VULNERABLE_SHA256) {
        throw coded("mxc-diagnostic-patch-use-time-drift");
      }
      await boundPathIdentity(target, before);
      let offset = 0;
      while (offset < patched.length) {
        const written = await handle.write(patched, offset, patched.length - offset, offset);
        if (written.bytesWritten < 1) throw coded("mxc-diagnostic-patch-short-write");
        offset += written.bytesWritten;
      }
      await handle.truncate(patched.length);
      await handle.sync();
      const after = await handle.stat();
      if (before.dev !== after.dev || before.ino !== after.ino || after.nlink !== 1 || after.size !== patched.length) {
        throw coded("mxc-diagnostic-patch-target-drift");
      }
      await boundPathIdentity(target, after);
    } finally { await handle.close(); }
  }
  const verified = await stablePlainFile(target, 65_536);
  if (digest(verified) !== PATCHED_SHA256) throw coded("mxc-diagnostic-patch-verification-failed");
  return Object.freeze({ schemaVersion: "runaai-mxc-diagnostic-patch/v1", packageVersion: manifest.version,
    diagnosticSha256: PATCHED_SHA256, changed: currentSha256 === VULNERABLE_SHA256,
    privateValuesIncluded: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  patchMxcSdkDiagnostic().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(`${/^[a-z0-9-]+$/u.test(error?.code ?? "") ? error.code : "mxc-diagnostic-patch-failed"}\n`);
    process.exitCode = 1;
  });
}
