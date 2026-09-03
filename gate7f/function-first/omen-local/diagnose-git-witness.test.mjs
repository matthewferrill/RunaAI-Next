import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadOmenReleasePins } from "./release-pins.mjs";

const runnerPath = resolve(import.meta.dirname, "diagnose-git-witness.mjs");
const classifierPath = resolve(import.meta.dirname, "Classify-RunaRepositoryEvents.ps1");

test("Git witness diagnostic is aggregate-only and limited to one status operation", async () => {
  const [runner, classifier] = await Promise.all([
    readFile(runnerPath, "utf8"), readFile(classifierPath, "utf8"),
  ]);
  assert.match(runner, /observer\.observe\(candidate\.rootId, "status"\)/u);
  assert.equal((runner.match(/observer\.observe\(/gu) ?? []).length, 1);
  assert.match(runner, /privateValuesIncluded: false, productionChanged: false, modelCalled: false/u);
  assert.match(runner, /treeBefore === treeAfter/u);
  assert.match(runner, /processAudit\.rootPid === childRecords\[0\]\.processId/u);
  assert.match(runner, /descendants\.length >= 1/u);
  assert.match(runner, /survivors\.length === 0/u);
  assert.match(runner, /aggregate\.watcherErrors !== 0/u);
  assert.match(runner, /diagnostic-watcher-terminal-missed/u);
  assert.match(runner, /diagnostic-process-audit-terminal-missed/u);
  assert.match(runner, /pins\.processMonitorSha256/u);
  assert.ok(runner.indexOf("policyTemplateDigest(templateConfig)") < runner.indexOf("await mkdtemp("));
  assert.match(classifier, /NotifyFilters\]::FileName/u);
  assert.match(classifier, /NotifyFilters\]::LastWrite/u);
  assert.match(classifier, /NotifyFilters\]::Attributes/u);
  assert.match(classifier, /NotifyFilters\]::Security/u);
  assert.match(classifier, /GetSecurityDescriptorSddlForm/u);
  assert.match(classifier, /Wait-R15WatcherQuiescence/u);
  assert.match(classifier, /schemaVersion='runa-omen-repository-event-witness-result\/v1';counts=\$counts;/u);
  assert.doesNotMatch(classifier, /WriteLine\([^\r\n]*\$event/u);
});

test("category witness parses in the pinned Windows PowerShell", { skip: process.platform !== "win32" }, async () => {
  const pins = await loadOmenReleasePins();
  const escaped = classifierPath.replaceAll("'", "''");
  const source = `$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$null,[ref]$errors);if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}`;
  const result = spawnSync(pins.powershellPath,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", source],
    { windowsHide: true, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
