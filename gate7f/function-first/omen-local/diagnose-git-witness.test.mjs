import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { evaluateLifecycle, publicLifecycleAggregate, publicLifecycleFailures }
  from "./diagnose-git-witness.mjs";
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
  assert.match(runner, /aggregate\.containedChildren !== 1/u);
  assert.match(runner, /aggregate\.containedExitCode !== 0/u);
  assert.match(runner, /aggregate\.nativeGuardSurvived !== false/u);
  assert.match(runner, /!aggregate\.treeEqual/u);
  assert.match(runner, /!aggregate\.securityEqual/u);
  assert.match(runner, /aggregate\.watcherErrors !== 0/u);
  assert.match(runner, /record\.child\.kill\(\)/u);
  assert.match(runner, /await bounded\(record\.terminal, 5_000, "diagnostic-contained-child-terminal-missed"\)/u);
  assert.match(runner, /if \(cleanupFailure\) throw cleanupFailure;/u);
  assert.match(runner, /if \(!aggregate\.ownedFixtureRemoved\) throw coded\("diagnostic-owned-fixture-removal-unverified"\)/u);
  assert.match(runner, /publicLifecycleFailures\(error\.lifecycleFailures\)/u);
  assert.match(runner, /publicLifecycleAggregate\(error\.lifecycleAggregate\)/u);
  assert.match(runner, /diagnostic-watcher-terminal-missed/u);
  assert.doesNotMatch(runner, /processMonitor|process-audit|Observe-RunaProcessTree/u);
  assert.ok(runner.indexOf("policyTemplateDigest(templateConfig, templateRoot, pins.gitInstallRoot)")
    < runner.indexOf("await mkdtemp("));
  assert.match(classifier, /NotifyFilters\]::FileName/u);
  assert.match(classifier, /NotifyFilters\]::LastWrite/u);
  assert.match(classifier, /NotifyFilters\]::Attributes/u);
  assert.match(classifier, /NotifyFilters\]::Security/u);
  assert.match(classifier, /GetSecurityDescriptorSddlForm/u);
  assert.match(classifier, /Wait-R15WatcherQuiescence/u);
  assert.match(classifier, /schemaVersion='runa-omen-repository-event-witness-result\/v1';counts=\$counts;/u);
  assert.doesNotMatch(classifier, /WriteLine\([^\r\n]*\$event/u);
});

test("lifecycle evidence identifies exact failed gates without private values", () => {
  const aggregate = { observerCode: "omen-git-source-changed", containedExitCode: 0,
    containedChildren: 1, nameEvents: 0, contentEvents: 0, metadataEvents: 0, securityEvents: 2,
    watcherErrors: 0, treeEqual: true, securityEqual: false, securityEntries: 27,
    nativeGuardReleased: true, nativeGuardSurvived: false, watcherExitCode: 0,
    ownedFixtureRemoved: true, privatePath: "must-not-cross" };
  assert.deepEqual(evaluateLifecycle(aggregate), ["repository-security-changed"]);
  const published = publicLifecycleAggregate(aggregate);
  assert.equal(published.observerCode, "omen-git-source-changed");
  assert.equal(published.securityEvents, 2);
  assert.equal(published.securityEqual, false);
  assert.equal(published.ownedFixtureRemoved, true);
  assert.equal("privatePath" in published, false);
  assert.equal(publicLifecycleAggregate({ ...aggregate, observerCode: "private-value" }).observerCode,
    "unknown");
  assert.deepEqual(publicLifecycleFailures(["repository-security-changed"]),
    ["repository-security-changed"]);
  assert.equal(publicLifecycleFailures(["private-value"]), null);
  assert.equal(publicLifecycleFailures(["repository-security-changed", "repository-security-changed"]),
    null);
});

test("lifecycle evidence reports each narrowed failure independently", () => {
  const aggregate = { containedExitCode: null, containedChildren: 0, watcherErrors: 1,
    treeEqual: false, securityEqual: false, nativeGuardReleased: false,
    nativeGuardSurvived: null, watcherExitCode: null };
  assert.deepEqual(evaluateLifecycle(aggregate), ["contained-child-count-invalid",
    "contained-child-exit-invalid", "category-watcher-exit-invalid", "native-guard-release-missing",
    "native-guard-survivor-or-unknown", "repository-tree-changed", "repository-security-changed",
    "category-watcher-error"]);
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
