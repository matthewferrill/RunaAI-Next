import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

export function readGitArchiveCommit({ archiveBytes, cwd, spawn = spawnSync }) {
  const result = spawn("git", ["get-tar-commit-id"], {
    cwd,
    input: archiveBytes,
    encoding: "utf8",
    maxBuffer: 1_048_576,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message || "git get-tar-commit-id failed");
  assert.equal(result.signal, null, "git get-tar-commit-id was interrupted");
  if (result.error && result.error.code !== "EOF") throw result.error;
  const commit = result.stdout.trim();
  assert.match(commit, /^[a-f0-9]{40}$/u, "source archive did not contain one Git commit ID");
  return commit;
}
