import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("permission-boundary mode is an ordered local-only fail-closed diagnostic", async () => {
  const proof = await readFile(resolve(import.meta.dirname, "actual-git-proof.mjs"), "utf8");
  const entry = await readFile(resolve(import.meta.dirname, "actual-git-permission-boundary-diagnostic.mjs"), "utf8");
  const start = proof.indexOf("} else if (permissionBoundaryDiagnostic) {");
  const stop = proof.indexOf("} else {\n    const status = await unchanged", start);
  assert.ok(start > 0 && stop > start);
  const branch = proof.slice(start, stop);
  assert.match(branch, /\[\["branches", \{\}\], \["show", \{ commit \}\], \["diffstat", \{\}\], \["status", \{\}\]\]/u);
  assert.equal((branch.match(/observer\.observe\(/gu) ?? []).length, 1);
  assert.match(branch, /createPermissionBoundaryCoordinator\(await treeDigest\(repository\)\)/u);
  assert.ok(branch.indexOf("permissionCoordinator.begin(operation, before)")
    < branch.indexOf("observer.observe(candidate.rootId, operation, input)"));
  assert.ok(branch.indexOf("permissionCoordinator.complete")
    < branch.indexOf("if (completed.outcome === \"git-fatal\") break"));
  assert.match(branch, /permissionCoordinator\.finish\(await treeDigest\(repository\)\)/u);
  assert.doesNotMatch(branch, /startProbe|runNetworkChild|processAudit|remotes|timeoutChild|createServer/u);
  assert.match(proof, /wrapperCount: childAudits\.length, witnessCount: witnessAudits\.length, guardCount: guardAudits\.length/u);
  assert.match(proof, /fixtureRemoved: checks\.ownedFixtureRemoved === true/u);
  assert.ok(proof.indexOf("await requireTerminal(audit.terminalPromise") < proof.indexOf("await rm(root"));
  assert.ok(proof.indexOf("await requireTerminal(audit.release()") < proof.indexOf("await rm(root"));
  assert.match(proof, /if \(!cleanupError\) \{/u);
  assert.match(entry, /runActualOmenGitPermissionBoundaryDiagnostic\(\)/u);
  assert.doesNotMatch(entry, /runActualOmenGitProof|observe\(|runNetworkChild/u);
});

test("permission diagnostic wrapper converts failures to the exact public contract", async () => {
  const proof = await readFile(resolve(import.meta.dirname, "actual-git-proof.mjs"), "utf8");
  const start = proof.indexOf("export async function runActualOmenGitPermissionBoundaryDiagnostic");
  assert.ok(start > 0);
  const branch = proof.slice(start, proof.indexOf("\nif (process.argv[1]", start));
  assert.match(branch, /failedPermissionBoundaryDiagnostic\(error, state\)/u);
  assert.match(branch, /error\?\.permissionDiagnosticState/u);
  assert.match(branch, /diagnostic-publication-refused/u);
  assert.doesNotMatch(branch, /stderr|diagnostic:|message|stack/u);
});
