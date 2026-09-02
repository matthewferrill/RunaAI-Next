import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { closePinned, createContainedNewDirectory, openContainedPinned, writeContainedNew } from "./r15-owned-pinned-files.mjs";
import { sha256 } from "./runner-contract.mjs";

test("retained pinned handle detects byte drift and rejects escape paths", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "r15-pinned-"));
  const file = path.join(root, "value.json"), initial = Buffer.from("{\"value\":1}\n");
  await writeFile(file, initial); const pinned = await openContainedPinned(root, "value.json", { expectedSha256: sha256(initial) });
  t.after(() => closePinned([pinned]));
  assert.deepEqual(pinned.json(), { value: 1 });
  await writeFile(file, "{\"value\":2}\n");
  await assert.rejects(pinned.verifyUnchanged(), /r15-owned-pinned-file-changed/u);
  await assert.rejects(openContainedPinned(root, "../outside.json"), /r15-owned-pinned-file-path/u);
});

test("a linked parent is rejected before opening evidence", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "r15-pinned-root-"));
  const outside = await mkdtemp(path.join(tmpdir(), "r15-pinned-outside-"));
  await writeFile(path.join(outside, "value.json"), "{}\n");
  try { await symlink(outside, path.join(root, "linked"), "junction"); }
  catch (error) { if (["EPERM", "ENOTSUP"].includes(error?.code)) return t.skip("junction creation unavailable"); throw error; }
  await assert.rejects(openContainedPinned(root, "linked/value.json"), /r15-owned-pinned-file-reparse/u);
});

test("a linked stage root is rejected before opening evidence", async t => {
  const parent = await mkdtemp(path.join(tmpdir(), "r15-pinned-parent-"));
  const outside = await mkdtemp(path.join(tmpdir(), "r15-pinned-root-target-"));
  await writeFile(path.join(outside, "value.json"), "{}\n");
  const linkedRoot = path.join(parent, "stage");
  try { await symlink(outside, linkedRoot, "junction"); }
  catch (error) { if (["EPERM", "ENOTSUP"].includes(error?.code)) return t.skip("junction creation unavailable"); throw error; }
  await assert.rejects(openContainedPinned(linkedRoot, "value.json"), /r15-owned-pinned-file-reparse/u);
});

test("a retained handle repeatedly rejects replacement of its bound pathname", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "r15-pinned-replacement-"));
  for (let index = 0; index < 20; index += 1) {
    const name = `value-${index}.json`, original = path.join(root, name), moved = path.join(root, `moved-${index}.json`);
    await writeFile(original, '{"value":1}\n');
    const pinned = await openContainedPinned(root, name);
    try {
      await rename(original, moved);
      await writeFile(original, '{"value":2}\n');
      await assert.rejects(pinned.verifyUnchanged(), /r15-owned-pinned-file-changed/u);
    } finally { await pinned.close(); }
  }
});

test("create-only review outputs reject a junctioned evidence ancestor", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "r15-pinned-output-root-"));
  const outside = await mkdtemp(path.join(tmpdir(), "r15-pinned-output-target-"));
  try { await symlink(outside, path.join(root, "acceptance-evidence"), "junction"); }
  catch (error) { if (["EPERM", "ENOTSUP"].includes(error?.code)) return t.skip("junction creation unavailable"); throw error; }
  await assert.rejects(createContainedNewDirectory(root, "acceptance-evidence/operator-review-binding"), /reparse/u);
  await assert.rejects(writeContainedNew(root, "acceptance-evidence/review.json", { passed: true }), /reparse/u);
});

test("create-only publication rejects a same-inode same-size durable overwrite", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "r15-pinned-output-bytes-"));
  const intended = Buffer.from("intended-bytes\n"), replacement = Buffer.from("replaced-bytes\n");
  assert.equal(intended.length, replacement.length);
  await assert.rejects(writeContainedNew(root, "review.json", intended, "r15-publication", {
    afterSync: async ({ absolute }) => writeFile(absolute, replacement)
  }), /r15-publication-changed/u);
});
