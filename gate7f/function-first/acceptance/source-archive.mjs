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

export function assertCanonicalGitArchive({ archiveBytes, commit, cwd, spawn = spawnSync }) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  const result = spawn("git", ["archive", "--format=tar", commit], {
    cwd, encoding: null, maxBuffer: 536_870_912,
  });
  assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message || "git archive failed");
  assert.equal(result.signal, null, "git archive was interrupted");
  if (result.error) throw result.error;
  assert(Buffer.isBuffer(result.stdout) && archiveBytes.equals(result.stdout),
    "source archive bytes did not match canonical Git archive");
  return archiveBytes;
}

export function extractVerifiedArchiveBytes({ archiveBytes, target, spawn = spawnSync }) {
  const result = spawn("tar", ["-xf", "-", "-C", target], {
    input: archiveBytes, encoding: null, maxBuffer: 8_388_608,
  });
  assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message || "tar extraction failed");
  assert.equal(result.signal, null, "tar extraction was interrupted");
  if (result.error && result.error.code !== "EOF") throw result.error;
  return target;
}
