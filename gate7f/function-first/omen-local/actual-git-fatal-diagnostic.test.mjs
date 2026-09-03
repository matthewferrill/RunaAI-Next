import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("fatal diagnostic shares pre-status fixture and branches before every successor", async () => {
  const proof = await readFile(resolve(import.meta.dirname, "actual-git-proof.mjs"), "utf8");
  const entry = await readFile(resolve(import.meta.dirname, "actual-git-fatal-diagnostic.mjs"), "utf8");
  assert.ok(proof.indexOf("await loadOmenReleasePins()") < proof.indexOf("await mkdtemp("));
  assert.ok(proof.indexOf("policyTemplateDigest(policyProbe, policyProbeRoot, pins.gitInstallRoot)")
    < proof.indexOf("await mkdtemp("));
  const start = proof.indexOf("if (fatalDiagnostic) {");
  const stop = proof.indexOf("} else if (permissionBoundaryDiagnostic) {", start);
  assert.ok(start > 0 && stop > start);
  const branch = proof.slice(start, stop);
  assert.equal((branch.match(/observer\.observe\(/gu) ?? []).length, 1);
  assert.match(branch, /observer\.observe\(candidate\.rootId, "status"\)/u);
  assert.doesNotMatch(branch, /unchanged\("(?:log|diffstat|branches|remotes|show)"|runNetworkChild|networkUrls/u);
  assert.ok(proof.indexOf("probes.push(await startProbe", start) > stop);
  assert.match(proof, /wrapperCount: childAudits\.length/u);
  assert.match(proof, /witnessCount: witnessAudits\.length/u);
  assert.match(proof, /guardCount: guardAudits\.length/u);
  assert.match(proof, /fixtureRemoved: checks\.ownedFixtureRemoved === true/u);
  assert.ok(proof.indexOf("await requireTerminal(audit.terminalPromise") < proof.indexOf("await rm(root"));
  assert.ok(proof.indexOf("await requireTerminal(audit.release()") < proof.indexOf("await rm(root"));
  assert.match(entry, /runActualOmenGitFatalDiagnostic\(\)/u);
  assert.doesNotMatch(entry, /runActualOmenGitProof|observe\(|runNetworkChild/u);
});
