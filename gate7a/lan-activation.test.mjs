import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./control/Invoke-ControlLanActivation.ps1", import.meta.url), "utf8");

test("live activation is exact-owner, exact-predecessor, and exact-successor pinned", () => {
  assert.match(script, /RUNA-CONTROL\\Matthew/);
  assert.match(script, /runaai-next-gate6d-promotion-2026-08-22-a886754/);
  assert.match(script, /93f2c9b3ddecec5f552308f973abd10005b9abd47e822baed7dc1427c8fc7b3b/);
  assert.doesNotMatch(script, /4167a8268295f8e973486e197845a2c1d3ac3efb0c5af632ae704d371f0f7343/);
  assert.match(script, /candidate\.gate7a\.predecessorManifestDigest -ne \$priorRuntimeManifestDigest/);
  assert.match(script, /ExpectedCommit/);
  assert.match(script, /ExpectedArtifactDigest/);
  assert.match(script, /ExpectedArtifactFileCount/);
  assert.match(script, /\[Parameter\(Mandatory\)\]\[string\]\$AttemptId/);
  assert.match(script, /\^gate7a-attempt-/);
  assert.match(script, /verifyReleaseArtifact/);
  assert.match(script, /--input-type=module -e `\r?\n/);
  assert.match(script, /gate7a-activation-predecessor-drift/);
  assert.match(script, /gate7a-activation-successor-invalid/);
});

test("Porkbun change is one dry-run-first exact private A record with ID-scoped rollback", () => {
  assert.match(script, /https:\/\/api\.porkbun\.com\/api\/json\/v3/);
  assert.match(script, /name=\$recordName; type='A'; content=\$privateAddress; ttl='600'/);
  assert.ok(script.indexOf("$dryRun = Invoke-RestMethod") < script.indexOf("$createdDns = Invoke-RestMethod"));
  assert.match(script, /\$dryRunBody\['dryRun'\] = \$true/);
  assert.match(script, /runaai-next-gate7a-dry-run-\$AttemptId/);
  assert.match(script, /runaai-next-gate7a-apply-\$AttemptId/);
  assert.doesNotMatch(script, /runaai-next-gate7a-create-\$ReleaseId/);
  assert.match(script, /\$dryRun = Invoke-RestMethod[^\r\n]*`\r?\n\s+-Headers \$dryRunHeaders/);
  assert.match(script, /\$createdDns = Invoke-RestMethod[^\r\n]*`\r?\n\s+-Headers \$createHeaders/);
  assert.match(script, /dns\/delete\/\$domain\/\$dnsRecordId/);
  assert.match(script, /runaai-next-gate7a-delete-\$AttemptId/);
  assert.match(script, /\$dnsCreated = \$true/);
  assert.match(script, /dns-created-record-not-uniquely-identifiable/);
  assert.match(script, /192\.168\.50\.169/);
});

test("only Caddy is LAN-facing and the firewall is Private LocalSubnet TCP 443", () => {
  assert.match(script, /New-NetFirewallRule -DisplayName \$firewallName -Direction Inbound -Action Allow -Protocol TCP/);
  assert.match(script, /-LocalPort 443 -Profile Private -RemoteAddress LocalSubnet/);
  assert.match(script, /publicAddresses\[0\] -ne \$privateAddress/);
  assert.match(script, /private-listener-boundary-invalid/);
  assert.doesNotMatch(script, /-Profile Any/);
  assert.doesNotMatch(script, /-RemoteAddress Any/);
});

test("Keycloak remains loopback and changes only exact canonical RP, origin, and callback", () => {
  assert.match(script, /http:\/\/127\.0\.0\.1:9762\/realms\/runaai-next/);
  assert.match(script, /webAuthnPolicyRpId = \$canonicalHost/);
  assert.match(script, /webAuthnPolicyPasswordlessRpId = \$canonicalHost/);
  assert.match(script, /webAuthnPolicyUserVerificationRequirement = 'required'/);
  assert.match(script, /webAuthnPolicyPasswordlessUserVerificationRequirement = 'required'/);
  assert.match(script, /redirectUris = @\("\$canonicalOrigin\/session\/callback"\)/);
  assert.match(script, /webOrigins = @\(\$canonicalOrigin\)/);
  assert.match(script, /browserIssuer/);
});

test("activation retains the commissioning route and restarts only browser front ends", () => {
  assert.match(script, /https:\/\/192\.168\.50\.169:9761\/health\/live/);
  assert.match(script, /@\('Application','Caddy','Keycloak'\)/);
  assert.doesNotMatch(script, /Stop-ScheduledTask[^\n]+(?:Postgresql|OpenFga|ProtectedBackup)/);
  assert.doesNotMatch(script, /Start-ScheduledTask[^\n]+(?:Postgresql|OpenFga|ProtectedBackup)/);
  assert.doesNotMatch(script, /C:\\AI\\Projects\\RunaAI(?:['"\\])/);
});

test("rollback is attempt-scoped, restores exact state, and removes only created ingress", () => {
  assert.match(script, /function Restore-Predecessor/);
  assert.match(script, /secrets\\gate7a-lan-rollback-\$AttemptId/);
  for (const file of ["candidate.json", "release-manifest.json", "Caddyfile",
    "Run-Application.ps1", "Run-Keycloak.ps1", "keycloak-realm.json", "keycloak-client.json"]) {
    assert.match(script, new RegExp(file.replaceAll(".", "\\.")));
  }
  assert.match(script, /if \(\$firewallCreated\)/);
  assert.match(script, /if \(\$dnsCreated\)/);
  assert.match(script, /Move-Item -LiteralPath \$nextManifestPath -Destination \$failedManifestPath/);
  assert.match(script, /failed-successor-manifest\.json/);
  assert.match(script, /identity-restore-reconciliation-failed/);
  assert.match(script, /\$liveChangeStarted/);
  assert.match(script, /rolledBack/);
  assert.match(script, /privateValuesIncluded = \$false/);
});

test("a verified immutable release can be reused by a fresh bounded attempt", () => {
  assert.match(script, /if \(-not \(Test-Path -LiteralPath \$releaseRoot -PathType Container\)\)/);
  assert.match(script, /foreach \(\$path in @\(\$nextManifestPath,\$rollbackRoot\)\)/);
  assert.match(script, /attemptId = \$AttemptId/);
  for (const stage of ["runtime-reconciliation", "identity-reconciliation", "dns-reconciliation",
    "dns-resolution", "browser-route", "listener-reconciliation", "firewall-reconciliation"]) {
    assert.match(script, new RegExp(`\\$failureStage = '${stage}'`));
  }
});

test("SameSite Lax is explicit without weakening the other cookie attributes", () => {
  assert.match(script, /gate6b\\http-server\.mjs/);
  assert.match(script, /Secure; HttpOnly; SameSite=Lax/);
  assert.match(script, /Secure; HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(script, /SkipCertificateCheck|ServerCertificateValidationCallback|TrustAll/);
});
