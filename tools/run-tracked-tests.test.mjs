import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyTestChildOutcome, runTrackedTests, trackedTestInventory } from "./run-tracked-tests.mjs";

const git = (root, ...args) => execFileSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], {
  cwd: root, encoding: "utf8", windowsHide: true,
}).trim();
async function repository(t) {
  const root = await mkdtemp(path.join(tmpdir(), "runa-tracked-tests-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  return root;
}
async function blob(root, content = "test('fixture',()=>{});\n") {
  const file = path.join(root, "blob.txt"); await writeFile(file, content);
  return git(root, "hash-object", "-w", "blob.txt");
}

test("inventory includes tracked tests and excludes untracked retained artifacts", async t => {
  const root = await repository(t);
  await writeFile(path.join(root, "current.test.mjs"), "test('current',()=>{});\n");
  await mkdir(path.join(root, "retained"));
  await writeFile(path.join(root, "retained", "old.test.mjs"), "throw new Error('old');\n");
  git(root, "add", "current.test.mjs");
  assert.deepEqual(trackedTestInventory(root), ["current.test.mjs"]);
});

test("inventory rejects a Git symlink mode even when the worktree path is an ordinary file", async t => {
  const root = await repository(t), hash = await blob(root);
  await writeFile(path.join(root, "link.test.mjs"), "target.test.mjs\n");
  git(root, "update-index", "--add", "--cacheinfo", `120000,${hash},link.test.mjs`);
  assert.throws(() => trackedTestInventory(root), /tracked-test-index-mode-invalid/u);
});

test("inventory rejects a regular indexed path whose parent junction escapes the repository", { skip: process.platform !== "win32" }, async t => {
  const root = await repository(t), outside = await mkdtemp(path.join(tmpdir(), "runa-tracked-outside-"));
  t.after(async () => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "escaped.test.mjs"), "test('escaped',()=>{});\n");
  await symlink(outside, path.join(root, "junction"), "junction");
  const hash = await blob(root);
  git(root, "update-index", "--add", "--cacheinfo", `100644,${hash},junction/escaped.test.mjs`);
  assert.throws(() => trackedTestInventory(root), /tracked-test-containment-invalid/u);
});

test("inventory rejects Windows-equivalent case-folded duplicate index paths", { skip: process.platform !== "win32" }, async t => {
  const root = await repository(t), hash = await blob(root);
  await writeFile(path.join(root, "case.test.mjs"), "test('case',()=>{});\n");
  git(root, "update-index", "--add", "--cacheinfo", `100644,${hash},case.test.mjs`);
  git(root, "update-index", "--add", "--cacheinfo", `100644,${hash},CASE.test.mjs`);
  assert.throws(() => trackedTestInventory(root), /tracked-test-duplicate-invalid/u);
});

test("child nonzero, null outcome, signal and spawn error propagate fail closed", async () => {
  const processObject = { pid: 42, exitCode: 0, signals: [], kill(pid, signal) { this.signals.push([pid, signal]); } };
  applyTestChildOutcome({ code: 7, signal: null }, processObject); assert.equal(processObject.exitCode, 7);
  applyTestChildOutcome({ code: null, signal: null }, processObject); assert.equal(processObject.exitCode, 1);
  applyTestChildOutcome({ code: null, signal: "SIGTERM" }, processObject); assert.deepEqual(processObject.signals, [[42, "SIGTERM"]]);
  const spawnError = Object.assign(new Error("spawn failed"), { code: "ENOENT" });
  await assert.rejects(runTrackedTests([], { processObject, spawnChild() {
    const child = new EventEmitter(); queueMicrotask(() => child.emit("error", spawnError)); return child;
  } }), error => error === spawnError);
});
