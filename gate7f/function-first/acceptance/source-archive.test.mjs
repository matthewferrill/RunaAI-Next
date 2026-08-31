import assert from "node:assert/strict";
import test from "node:test";
import { readGitArchiveCommit } from "./source-archive.mjs";

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
