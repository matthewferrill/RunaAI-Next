import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContainedOutputDirectory, parseContinuationHistoryArguments, regularBoundRootFile } from "./prepare-campaign-continuation-history.mjs";

test("history preparation arguments are complete, unique, and hash-bound", () => {
  const h = "a".repeat(64), argv = ["--owned-root", "x", "--candidate-id", "qwen36-27b-mtp",
    "--full-plan", "acceptance-evidence/base.json", "--full-plan-sha256", h,
    "--history-manifest", "acceptance-evidence/history.json", "--history-manifest-sha256", h,
    "--current-runtime-seal", "runtimeSeal.json", "--current-runtime-seal-sha256", h,
    "--output-directory", "acceptance-evidence/prepared"];
  assert.equal(parseContinuationHistoryArguments(argv)["candidate-id"], "qwen36-27b-mtp");
  assert.throws(() => parseContinuationHistoryArguments([...argv, "--candidate-id", "x"]), /argument-invalid/u);
  const invalid = [...argv]; invalid[invalid.indexOf("--full-plan-sha256") + 1] = "bad";
  assert.throws(() => parseContinuationHistoryArguments(invalid), /argument-invalid/u);
});

test("history preparation creates a new contained evidence directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-history-output-"));
  await mkdir(path.join(root, "acceptance-evidence"));
  const output = await createContainedOutputDirectory(root, path.join("acceptance-evidence", "prepared"));
  assert.equal(output, await realpath(path.join(root, "acceptance-evidence", "prepared")));
  await assert.rejects(createContainedOutputDirectory(root, path.join("acceptance-evidence", "prepared")));
  await assert.rejects(createContainedOutputDirectory(root, "outside"), /output-invalid/u);
});

test("history preparation rejects a junctioned parent that escapes evidence", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-history-junction-"));
  const evidence = path.join(root, "acceptance-evidence"), outside = path.join(root, "outside");
  await Promise.all([mkdir(evidence), mkdir(outside)]);
  try { await symlink(outside, path.join(evidence, "escape"), "junction"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return t.skip(`junction unavailable: ${error.code}`);
    throw error;
  }
  await assert.rejects(createContainedOutputDirectory(root, path.join("acceptance-evidence", "escape", "prepared")),
    /output-invalid/u);
});

test("history preparation rejects an in-root current-seal symlink before reading its target", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-history-seal-link-")), target = path.join(root, "seal-target.json");
  const bytes = Buffer.from("{}\n"); await writeFile(target, bytes);
  try { await symlink(target, path.join(root, "runtimeSeal.json"), "file"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
      assert.ok(true, `operating system rejected creation of the requested file symlink: ${error.code}`); return;
    }
    throw error;
  }
  await assert.rejects(regularBoundRootFile(root, "runtimeSeal.json",
    createHash("sha256").update(bytes).digest("hex")), /file-invalid/u);
});
