import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertCanonicalGitArchive, extractVerifiedArchiveBytes, readGitArchiveCommit } from "./source-archive.mjs";

const commit = "8cf2d3d92ed091ccc8e8a4ac7ac508d174e7cdd4";

test("accepts Windows EOF after Git returns the embedded commit successfully", () => {
  const spawn = () => ({
    status: 0,
    signal: null,
    stdout: `${commit}\n`,
    stderr: "",
    error: Object.assign(new Error("spawnSync git EOF"), { code: "EOF" }),
  });
  assert.equal(readGitArchiveCommit({ archiveBytes: Buffer.from("tar"), cwd: ".", spawn }), commit);
});

test("rejects a non-EOF process error", () => {
  const error = Object.assign(new Error("access denied"), { code: "EACCES" });
  const spawn = () => ({ status: 0, signal: null, stdout: `${commit}\n`, stderr: "", error });
  assert.throws(() => readGitArchiveCommit({ archiveBytes: Buffer.from("tar"), cwd: ".", spawn }), error);
});

test("rejects an unsuccessful or unidentifiable archive", () => {
  const failed = () => ({ status: 128, signal: null, stdout: "", stderr: "not a git archive" });
  assert.throws(() => readGitArchiveCommit({ archiveBytes: Buffer.from("tar"), cwd: ".", spawn: failed }),
    /not a git archive/u);
  const malformed = () => ({ status: 0, signal: null, stdout: "not-a-commit\n", stderr: "" });
  assert.throws(() => readGitArchiveCommit({ archiveBytes: Buffer.from("tar"), cwd: ".", spawn: malformed }),
    /did not contain one Git commit ID/u);
});

test("rejects altered tar entries even when the embedded Git commit ID is retained", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "runa-source-archive-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: directory });
  await writeFile(path.join(directory, "source.txt"), "alpha\n");
  execFileSync("git", ["add", "source.txt"], { cwd: directory });
  execFileSync("git", ["-c", "user.name=Runa Test", "-c", "user.email=runa@example.invalid",
    "commit", "-q", "-m", "fixture"], { cwd: directory });
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  const archive = execFileSync("git", ["archive", "--format=tar", sourceCommit], {
    cwd: directory, encoding: "buffer",
  });
  const changed = Buffer.from(archive), offset = changed.indexOf(Buffer.from("alpha"));
  assert.notEqual(offset, -1); Buffer.from("omega").copy(changed, offset);
  assert.equal(readGitArchiveCommit({ archiveBytes: changed, cwd: directory }), sourceCommit);
  assert.throws(() => assertCanonicalGitArchive({ archiveBytes: changed, commit: sourceCommit, cwd: directory }),
    /did not match canonical Git archive/u);
  assert.equal(assertCanonicalGitArchive({ archiveBytes: archive, commit: sourceCommit, cwd: directory }), archive);
});

test("extracts the already-verified buffer even when the supplied archive path is replaced", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "runa-source-swap-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: directory });
  const sourcePath = path.join(directory, "source.txt"), archivePath = path.join(directory, "source.tar");
  await writeFile(sourcePath, "alpha\n"); execFileSync("git", ["add", "source.txt"], { cwd: directory });
  execFileSync("git", ["-c", "user.name=Runa Test", "-c", "user.email=runa@example.invalid",
    "commit", "-q", "-m", "first"], { cwd: directory });
  const firstCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  execFileSync("git", ["archive", "--format=tar", "-o", archivePath, firstCommit], { cwd: directory });
  const verifiedBytes = await readFile(archivePath);
  await writeFile(sourcePath, "bravo\n"); execFileSync("git", ["add", "source.txt"], { cwd: directory });
  execFileSync("git", ["-c", "user.name=Runa Test", "-c", "user.email=runa@example.invalid",
    "commit", "-q", "-m", "second"], { cwd: directory });
  execFileSync("git", ["archive", "--format=tar", "-o", archivePath, "HEAD"], { cwd: directory });
  const extraction = path.join(directory, "extracted"); await mkdir(extraction);
  extractVerifiedArchiveBytes({ archiveBytes: verifiedBytes, target: extraction });
  assert.equal((await readFile(path.join(extraction, "source.txt"), "utf8")).trim(), "alpha");
});
