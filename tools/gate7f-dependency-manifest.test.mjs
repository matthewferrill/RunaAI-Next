import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEPENDENCY_ROOTS,
  EXPECTED_DEPENDENCY_SHA256,
  dependencyManifestSha256,
} from "../gate7f/function-first/native-gate3-control-node-bootstrap.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const generator = path.join(import.meta.dirname, "print-gate7f-dependency-manifest.mjs");

test("published dependency pin is produced by the runtime verifier from any working directory", async () => {
  assert.deepEqual(DEPENDENCY_ROOTS, ["@microsoft/mxc-sdk", "node-pty", "semver", "zod"]);
  assert.equal(await dependencyManifestSha256(), EXPECTED_DEPENDENCY_SHA256);
  const result = spawnSync(process.execPath, [generator], {
    cwd: tmpdir(), encoding: "utf8", windowsHide: true, timeout: 10_000,
  });
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  const published = JSON.parse(result.stdout);
  assert.deepEqual(published.roots, DEPENDENCY_ROOTS);
  assert.equal(published.actualSha256, EXPECTED_DEPENDENCY_SHA256);
  assert.equal(published.expectedSha256, EXPECTED_DEPENDENCY_SHA256);
  assert.equal(published.matchesPinned, true);
  for (const key of ["modelInvoked", "eligibilityInvoked", "browserInvoked", "databaseAttempted",
    "networkAttempted", "privateValuesIncluded"]) assert.equal(published[key], false);
});

test("the shared manifest changes when a fixed dependency tree changes", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "gate7f-dependency-manifest-"));
  try {
    const dependencyRoot = path.join(fixture, "node_modules");
    for (const root of DEPENDENCY_ROOTS) {
      const directory = path.join(dependencyRoot, ...root.split("/"));
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "fixture.txt"), `${root}\n`, "utf8");
    }
    const before = await dependencyManifestSha256({ dependencyRoot });
    await writeFile(path.join(dependencyRoot, "zod", "fixture.txt"), "changed\n", "utf8");
    const after = await dependencyManifestSha256({ dependencyRoot });
    assert.match(before, /^[a-f0-9]{64}$/u); assert.match(after, /^[a-f0-9]{64}$/u);
    assert.notEqual(after, before);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
