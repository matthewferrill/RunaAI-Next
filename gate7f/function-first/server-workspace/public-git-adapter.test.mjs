import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "node:fs";
import * as git from "isomorphic-git";
import { createGitBrokerHttp } from "./git-broker-transport.mjs";
import { materializeGitCommit } from "./public-git-adapter.mjs";

test("materializes an actual Git commit into a separate bounded file root", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runa-m1-git-core-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, "objects"), staging = path.join(root, "staging");
  await git.init({ fs, dir: repository, defaultBranch: "main" });
  await writeFile(path.join(repository, "README.md"), "# Candidate\n", { flag: "wx" });
  await writeFile(path.join(repository, ".env"), "MUST_NOT_PUBLISH=1\n", { flag: "wx" });
  await git.add({ fs, dir: repository, filepath: "README.md" });
  await git.add({ fs, dir: repository, filepath: ".env" });
  const oid = await git.commit({ fs, dir: repository, message: "sealed fixture",
    author: { name: "Runa test", email: "runa@example.invalid" } });
  const result = await materializeGitCommit({ objectDirectory: repository, commitOid: oid,
    expectedCommitOid: oid, stagingDirectory: staging });
  assert.equal(result.nativeVersion, oid);
  assert.deepEqual(result.entries.map(value => value.path), ["README.md"]);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.complete, true);
  assert.equal(await readFile(path.join(staging, "README.md"), "utf8"), "# Candidate\n");
  await assert.rejects(readFile(path.join(staging, ".env")), /ENOENT/u);
});

test("rejects nested roots before reading or publishing", async () => {
  const parent = path.resolve(os.tmpdir(), "runa-m1-root-boundary");
  await assert.rejects(materializeGitCommit({ objectDirectory: parent, commitOid: "a".repeat(40),
    expectedCommitOid: "a".repeat(40), stagingDirectory: path.join(parent, "staging") }),
  error => error.code === "workspace-root-invalid");
  await assert.rejects(materializeGitCommit({ objectDirectory: path.join(parent, "objects"),
    commitOid: "a".repeat(40), expectedCommitOid: "a".repeat(40), stagingDirectory: parent }),
  error => error.code === "workspace-root-invalid");
});

test("rejects authority commit mismatch without creating staging", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runa-m1-git-mismatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, "objects"), staging = path.join(root, "staging");
  await git.init({ fs, dir: repository, defaultBranch: "main" });
  await writeFile(path.join(repository, "README.md"), "sealed\n", { flag: "wx" });
  await git.add({ fs, dir: repository, filepath: "README.md" });
  const oid = await git.commit({ fs, dir: repository, message: "sealed fixture",
    author: { name: "Runa test", email: "runa@example.invalid" } });
  await assert.rejects(materializeGitCommit({ objectDirectory: repository, commitOid: oid,
    expectedCommitOid: "f".repeat(40), stagingDirectory: staging }),
  error => error.code === "workspace-commit-mismatch");
  await assert.rejects(stat(staging), /ENOENT/u);
});

test("custom transport rejects a request before the broker when shape or options widen", async () => {
  let calls = 0;
  const makeHttp = requestId => createGitBrokerHttp({
    repositoryHttpsUrl: "https://github.com/example/sealed.git",
    sourceId: "source_0001", requestId, deadlineAt: Date.now() + 120_000,
    broker: { async request() { calls += 1; } }
  });
  await assert.rejects(makeHttp("request_0001").request({
    url: "https://github.com/example/sealed.git/info/refs?service=git-upload-pack",
    method: "GET", headers: { accept: "application/x-git-upload-pack-advertisement" },
    fetchOptions: { redirect: "follow" } }), error => error.code === "git-broker-option-denied");
  await assert.rejects(makeHttp("request_0002").request({
    url: "https://github.com/example/other.git/info/refs?service=git-upload-pack",
    method: "GET", headers: { accept: "application/x-git-upload-pack-advertisement" } }),
  error => error.code === "git-broker-request-shape-denied");
  assert.equal(calls, 0);
});
