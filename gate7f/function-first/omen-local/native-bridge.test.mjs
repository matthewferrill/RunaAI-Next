import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OmenRootStore } from "./native-bridge.mjs";

test("pinned Windows PowerShell helper uses the native atomic state-publish primitive", async () => {
  const source = await readFile(new URL("./Invoke-RunaOmenNative.ps1", import.meta.url), "utf8");
  assert.match(source, /MoveFileExW/u);
  assert.match(source, /MOVEFILE_REPLACE_EXISTING \| MOVEFILE_WRITE_THROUGH/u);
  assert.match(source, /native-state-commit-failed/u);
  assert.doesNotMatch(source, /\[IO\.File\]::Move\([^\r\n]+,\s*\$true\)/u);
});

class FakeNative {
  constructor() { this.state = null; this.roots = new Map(); this.files = new Map(); }
  async unprotect() {
    if (!this.state) throw Object.assign(new Error("missing"), { code: "native-state-missing" });
    return Buffer.from(this.state);
  }
  async protect(_path, value) { this.state = Buffer.from(value); return { protected: true }; }
  async inspectRoot(root) {
    const value = this.roots.get(root.toLowerCase());
    if (!value) throw Object.assign(new Error("missing"), { code: "native-open-denied" });
    return value;
  }
  async inspectGit(root, identity) {
    const inspected = await this.inspectRoot(root);
    if (inspected.volumeId !== identity.volumeId || inspected.fileId !== identity.fileId) {
      throw Object.assign(new Error("changed"), { code: "native-root-identity-changed" });
    }
    return { gitFinalPath: `${root}\\.git`, replacementEntries: 0 };
  }
  async safeRead(root, relativePath, identity) {
    const inspected = await this.inspectRoot(root);
    if (inspected.volumeId !== identity.volumeId || inspected.fileId !== identity.fileId) {
      throw Object.assign(new Error("changed"), { code: "native-root-identity-changed" });
    }
    const value = this.files.get(`${root.toLowerCase()}|${relativePath.toLowerCase()}`);
    if (!value) throw Object.assign(new Error("missing"), { code: "native-open-denied" });
    return Buffer.from(value);
  }
}

function fixture() {
  const native = new FakeNative();
  native.roots.set("d:\\work", { finalPath: "D:\\work", volumeId: "00000001",
    fileId: "0000000000000001", repositoryDetected: true });
  native.roots.set("d:\\work\\child", { finalPath: "D:\\work\\child", volumeId: "00000001",
    fileId: "0000000000000002", repositoryDetected: false });
  native.files.set("d:\\work|notes.txt", "ordinary notes\nsecond line");
  native.files.set("d:\\work|secret.txt", `password=${"x".repeat(12)}`);
  return { native, store: new OmenRootStore({ statePath: "D:\\state\\roots.dpapi", nativeBridge: native,
    userProfilePath: "C:\\Users\\person", protectedSystemPaths: ["C:\\Windows", "C:\\Program Files"] }) };
}

test("native-selected root confirmation persists only opaque public result", async () => {
  const { store } = fixture();
  const candidate = await store.inspectSelectedRoot("D:\\work");
  assert.equal(candidate.displayName, "work");
  assert.equal(candidate.repositoryDetected, true);
  const confirmed = await store.confirm(candidate);
  assert.deepEqual(confirmed, { rootId: candidate.rootId, displayName: "work", repositoryDetected: true });
  const loaded = await store.load();
  assert.equal(loaded.roots[0].path, "D:\\work");
  assert.equal(await store.remove(candidate.rootId), true);
  assert.equal((await store.load()).roots.length, 0);
});

test("whole drives, user home, system locations and overlapping roots are denied", async () => {
  const { store } = fixture();
  await assert.rejects(store.inspectSelectedRoot("D:\\"), { code: "omen-root-protected" });
  await assert.rejects(store.inspectSelectedRoot("C:\\Users\\person"), { code: "omen-root-protected" });
  await assert.rejects(store.inspectSelectedRoot("C:\\Windows\\System32"), { code: "omen-root-protected" });
  const candidate = await store.inspectSelectedRoot("D:\\work");
  await store.confirm(candidate);
  await assert.rejects(store.inspectSelectedRoot("D:\\work\\child"), { code: "omen-root-overlap" });
});

test("bounded text reads apply native containment then protected-source policy", async () => {
  const { store } = fixture();
  const candidate = await store.inspectSelectedRoot("D:\\work");
  await store.confirm(candidate);
  const result = await store.readText(candidate.rootId, "notes.txt");
  assert.equal(result.content, "ordinary notes\nsecond line");
  await assert.rejects(store.readText(candidate.rootId, ".env"), { code: "protected-source-denied" });
  await assert.rejects(store.readText(candidate.rootId, "secret.txt"), { code: "protected-source-denied" });
});

test("candidate identity change and DPAPI corruption fail closed", async () => {
  const { native, store } = fixture();
  const candidate = await store.inspectSelectedRoot("D:\\work");
  native.roots.set("d:\\work", { ...native.roots.get("d:\\work"), fileId: "0000000000000009" });
  await assert.rejects(store.confirm(candidate), { code: "omen-root-candidate-changed" });
  native.state = Buffer.from("not-json");
  await assert.rejects(store.load(), SyntaxError);
});

test("a retained root identity change is denied before file or Git access", async () => {
  const { native, store } = fixture();
  const candidate = await store.inspectSelectedRoot("D:\\work");
  await store.confirm(candidate);
  native.roots.set("d:\\work", { ...native.roots.get("d:\\work"), fileId: "0000000000000009" });
  await assert.rejects(store.readText(candidate.rootId, "notes.txt"), { code: "omen-root-identity-changed" });
  await assert.rejects(store.localRootForGit(candidate.rootId), { code: "omen-root-identity-changed" });
});
