import { execFileSync, spawn } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const fold = value => process.platform === "win32" ? value.toLowerCase() : value;

export function trackedTestInventory(root = process.cwd()) {
  const workingRoot = realpathSync(path.resolve(root));
  const gitRoot = realpathSync(execFileSync("git", ["-c", `safe.directory=${path.resolve(root).replaceAll("\\", "/")}`,
    "rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", windowsHide: true }).trim());
  if (fold(workingRoot) !== fold(gitRoot)) throw new Error("tracked-test-root-invalid");
  const bytes = execFileSync("git", ["-c", `safe.directory=${gitRoot.replaceAll("\\", "/")}`,
    "ls-files", "--stage", "-z", "--", "*.test.mjs"], { cwd: gitRoot, encoding: "buffer", windowsHide: true });
  const records = bytes.toString("utf8").split("\0").filter(Boolean).map(record => {
    const tab = record.indexOf("\t");
    if (tab < 1) throw new Error("tracked-test-inventory-invalid");
    const header = record.slice(0, tab).split(" "), file = record.slice(tab + 1);
    if (header.length !== 3 || header[0] !== "100644" || !/^[a-f0-9]{40,64}$/u.test(header[1]) || header[2] !== "0") {
      throw new Error("tracked-test-index-mode-invalid");
    }
    if (!file || file.includes("\\") || path.isAbsolute(file) || file.split("/").some(part => !part || part === "..")) {
      throw new Error("tracked-test-path-invalid");
    }
    return { file, indexMode: header[0] };
  });
  if (!records.length) throw new Error("tracked-test-inventory-invalid");
  const lexical = new Set(), canonical = new Set();
  for (const record of records) {
    const lexicalKey = fold(record.file);
    if (lexical.has(lexicalKey)) throw new Error("tracked-test-duplicate-invalid");
    lexical.add(lexicalKey);
    const candidate = path.join(gitRoot, ...record.file.split("/")), info = lstatSync(candidate);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("tracked-test-file-invalid");
    const actual = realpathSync(candidate), relative = path.relative(gitRoot, actual);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("tracked-test-containment-invalid");
    }
    const canonicalKey = fold(actual);
    if (canonical.has(canonicalKey)) throw new Error("tracked-test-duplicate-invalid");
    canonical.add(canonicalKey);
  }
  return Object.freeze(records.map(record => record.file));
}

export function applyTestChildOutcome({ code, signal }, processObject = process) {
  if (signal) processObject.kill(processObject.pid, signal);
  else processObject.exitCode = Number.isInteger(code) ? code : 1;
}

export async function runTrackedTests(files, { spawnChild = spawn, processObject = process, root = process.cwd() } = {}) {
  const child = spawnChild(process.execPath, ["--test", "--test-concurrency=4", ...files], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  const outcome = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  applyTestChildOutcome(outcome, processObject);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const files = trackedTestInventory();
  if (process.argv.slice(2).includes("--list")) {
    process.stdout.write(JSON.stringify({ schemaVersion: "runaai-tracked-test-inventory/v1", count: files.length, files }) + "\n");
  } else {
    await runTrackedTests(files);
  }
}
