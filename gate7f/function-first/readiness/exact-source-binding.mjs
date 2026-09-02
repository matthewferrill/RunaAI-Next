import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export function assertGitPathsMatchCommit({ root, sourceCommit, relativePaths }) {
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("v2-campaign-source-commit");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (head !== sourceCommit) throw new Error("v2-campaign-source-commit");
  for (const relativePath of relativePaths) {
    const gitPath = relativePath.replaceAll(path.sep, "/");
    const committed = execFileSync("git", ["show", `${sourceCommit}:${gitPath}`], {
      cwd: root, encoding: "buffer", maxBuffer: 8_000_000,
    });
    const indexed = execFileSync("git", ["show", `:${gitPath}`], {
      cwd: root, encoding: "buffer", maxBuffer: 8_000_000,
    });
    if (!committed.equals(indexed) || !readFileSync(path.join(root, relativePath)).equals(committed)) {
      throw new Error(`v2-campaign-source-drift:${gitPath}`);
    }
  }
  return sourceCommit;
}
