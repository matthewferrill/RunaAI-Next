import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import predecessor from "../gate7a/fixtures/control-predecessor.json" with { type: "json" };
import { caddyfile, createCustomerJourneyReleaseConfig,
  customerJourneyProjectionStatus } from "../gate7a/lan-release.mjs";
import { loadReleaseConfig } from "../gate6b/release-config.mjs";

test("Gate 7B changes only the application deadline and Caddy configuration identity", async () => {
  const current = structuredClone(predecessor.config);
  current.mode = "active";
  current.limits.totalDeadlineMs = 30_000;
  const successor = createCustomerJourneyReleaseConfig(current);
  const normalized = structuredClone(successor);
  normalized.limits.totalDeadlineMs = current.limits.totalDeadlineMs;
  normalized.services.caddy.configurationDigest = current.services.caddy.configurationDigest;
  assert.deepEqual(normalized, current);
  assert.equal(successor.limits.totalDeadlineMs, 60_000);
  assert.notEqual(successor.services.caddy.configurationDigest, current.services.caddy.configurationDigest);
  const status = customerJourneyProjectionStatus(current, successor);
  assert.equal(status.priorConfigurationPreserved, true);
  assert.equal(status.authorityChanged, false);
  assert.equal(status.identityChanged, false);
  assert.equal(status.protectedProductDataChanged, false);
});

test("the projected successor remains a valid exact release configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runa-gate7b-deployment-"));
  try {
    const current = structuredClone(predecessor.config);
    current.mode = "active";
    const successor = createCustomerJourneyReleaseConfig(current);
    const path = join(directory, "candidate.json");
    await writeFile(path, JSON.stringify(successor));
    const loaded = await loadReleaseConfig(path);
    assert.equal(loaded.value.mode, "active");
    assert.equal(loaded.value.limits.totalDeadlineMs, 60_000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Caddy gives the application and provider more time than their inner deadlines", () => {
  assert.equal((caddyfile.match(/response_header_timeout 70s/g) ?? []).length, 2);
  assert.equal((caddyfile.match(/response_header_timeout 65s/g) ?? []).length, 1);
  assert.equal((caddyfile.match(/response_header_timeout 30s/g) ?? []).length, 1);
  assert.match(caddyfile, /reverse_proxy http:\/\/192\.168\.50\.165:1234/);
});

test("the Control deployer validates, changes, and restores Caddy inside the application rollback", async () => {
  const deploy = await readFile(new URL("../gate7a/control/Deploy-ControlOrdinaryAccessSuccessor.ps1", import.meta.url), "utf8");
  assert.match(deploy, /CaddyfileSha256/);
  assert.match(deploy, /caddy-binary-drift/);
  assert.match(deploy, /RedirectStandardError=\$true/);
  assert.doesNotMatch(deploy, /& \$caddyExe (?:validate|reload)/);
  assert.match(deploy, /JsonFacts \$currentConfig/);
  assert.doesNotMatch(deploy, /preservedCandidate\|ConvertTo-Json[^\n]+-ne/);
  assert.match(deploy, /caddy-reload-failed/);
  assert.match(deploy, /caddy-rollback-failed/);
  assert.match(deploy, /applicationAndCaddyChangedTogether=\$true/);
  assert.doesNotMatch(deploy, /Stop-ScheduledTask[^\n]+(?:Postgresql|OpenFga|Keycloak|Caddy|ProtectedBackup)/);
});
