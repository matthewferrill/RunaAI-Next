import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const configure = await read("./control/Configure-ControlOrdinaryAccess.ps1");
const invitation = await read("./control/Send-ControlOrdinaryInvitation.ps1");
const enrollSmtp = await read("./control/Set-ControlKeycloakSmtpCredential.ps1");
const applySmtp = await read("./control/Apply-ControlKeycloakSmtp.ps1");
const remove = await read("./control/Remove-ControlOrdinaryAccess.ps1");
const deploy = await read("./control/Deploy-ControlOrdinaryAccessSuccessor.ps1");
const activate = await read("./control/Invoke-ControlOrdinaryAccessActivation.ps1");
const ownerRebind = await read("./control/Rebind-ControlOrdinaryOwnerSession.mjs");
const ordinary = await read("./ordinary-session.mjs");
const postgres = await read("./postgres-ordinary-session.mjs");
const release = await read("../gate6b/release-config.mjs");

test("ordinary authentication uses a separate exact password-only Keycloak client", () => {
  assert.match(configure, /\$clientId='runaai-next-user'/);
  assert.match(configure, /\$flowAlias='runaai-next-ordinary-password'/);
  assert.match(configure, /auth-username-password-form/);
  assert.match(configure, /directAccessGrantsEnabled=\$false/);
  assert.match(configure, /implicitFlowEnabled=\$false/);
  assert.match(configure, /serviceAccountsEnabled=\$false/);
  assert.match(configure, /'claim\.value'='\["pwd"\]'/);
  assert.match(configure, /\/session\/user\/callback/);
  assert.match(configure, /publicSelfRegistration=\$false/);
  assert.match(configure, /ownerClientChanged=\$false/);
  assert.match(configure, /\$clients=@\(Get-Clients \$headers\);\$flows=@\(Get-Flows \$headers\)/);
  assert.match(configure, /\$verifiedClients=@\(Get-Clients \$headers\)/);
});

test("ordinary-client activation is exact-release pinned, secret-safe, and automatically reversible", () => {
  assert.match(configure, /ExpectedReleaseId/);
  assert.match(configure, /ExpectedCommit/);
  assert.match(configure, /ExpectedArtifactDigest/);
  assert.match(configure, /Set-Acl/);
  assert.match(configure, /Remove-Item -LiteralPath \$secretPath/);
  assert.match(configure, /authentication\/flows\/\$createdFlowId/);
  assert.doesNotMatch(configure, /Write-Output.*clientSecret|Set-Clipboard/i);
  assert.match(remove, /runaai-next-user/);
  assert.match(remove, /runaai-next-ordinary-password/);
  assert.match(remove, /remove-target-invalid/);
  assert.match(remove, /ownerClientChanged=\$false/);
  assert.match(activate, /configuredByAttempt/);
  assert.match(activate, /Remove-ControlOrdinaryAccess\.ps1/);
  assert.match(activate, /identityRolledBack/);
});

test("ordinary successor changes only the application release and restores the exact predecessor on failure", () => {
  for (const pin of ["ExpectedCommit", "ExpectedArtifactDigest", "ExpectedArtifactFileCount",
    "PriorReleaseId", "PriorCommit", "PriorArtifactDigest", "ArchiveSha256", "ConfigSha256",
    "ManifestSha256", "LauncherSha256"]) assert.match(deploy, new RegExp(pin));
  assert.match(deploy, /gate7a-ordinary-rollback-\$ReleaseId/);
  assert.match(deploy, /Copy-Item -LiteralPath \(Join-Path \$rollback 'candidate\.json'\) -Destination \$config -Force/);
  assert.match(deploy, /Copy-Item -LiteralPath \(Join-Path \$rollback \$manifestName\) -Destination \$manifest -Force/);
  assert.match(deploy, /Wait-Release \$PriorReleaseId/);
  assert.match(deploy, /selectedCoreAuthorityUnchanged=\$true/);
  assert.match(deploy, /ownerRouteUnchanged=\$true/);
  assert.match(deploy, /Rebind-ControlOrdinaryOwnerSession\.mjs/);
  assert.match(deploy, /RUNA_GATE7A_OWNER_SUBJECT/);
  assert.match(deploy, /ownerProofRebound=\$true/);
  assert.match(deploy, /InnerException/);
  assert.match(deploy, /StatusCode-ne303/);
  assert.doesNotMatch(deploy, /StatusCode-ne302/);
  assert.doesNotMatch(deploy, /Stop-ScheduledTask[^\n]+(?:Postgresql|OpenFga|Keycloak|Caddy|ProtectedBackup)/);
  assert.doesNotMatch(deploy, /C:\\AI\\Projects\\RunaAI(?:['"\\])/);
});

test("ordinary successor rebinds only the completed owner proof to exact canonical release pins", () => {
  assert.match(ownerRebind, /completed-owner-ordinary-access-release/);
  assert.match(ownerRebind, /runaai-next-user/);
  assert.match(ownerRebind, /https:\/\/runa\.bridgebuildersai\.com/);
  assert.match(ownerRebind, /config\.gate7a\.predecessorManifestDigest !== priorConfig\.gate7a\.predecessorManifestDigest/);
  assert.doesNotMatch(ownerRebind, /predecessorManifestDigest !== priorManifest\.manifestDigest/);
  assert.match(ownerRebind, /priorImported\("gate6b\/release-config\.mjs"\)/);
  assert.match(ownerRebind, /loadPriorReleaseConfig\(priorConfigPath\)/);
  assert.match(deploy, /\$ErrorActionPreference='Continue'/);
  assert.match(ownerRebind, /priorCeremonyRetained/);
  assert.match(ownerRebind, /authorityChanged: false/);
  assert.match(ownerRebind, /protectedProductDataChanged: false/);
  assert.doesNotMatch(ownerRebind, /RUNA_GATE7A_OWNER_SUBJECT.*process\.stdout/);
});

test("SMTP enrollment is owner-bound DPAPI CurrentUser and network-inert", () => {
  assert.match(enrollSmtp, /RUNA-CONTROL\\Matthew/);
  assert.match(enrollSmtp, /Read-Host 'SMTP username'/);
  assert.match(enrollSmtp, /Read-Host 'SMTP password or application password' -AsSecureString/);
  assert.match(enrollSmtp, /DataProtectionScope\]::CurrentUser/);
  assert.match(enrollSmtp, /Get-AccessRuleSignature/);
  assert.match(enrollSmtp, /Compare-Object -ReferenceObject \$expectedAcl -DifferenceObject \$actualAcl/);
  assert.match(enrollSmtp, /gate7a-smtp-enrollment-acl-invalid/);
  assert.doesNotMatch(enrollSmtp, /Set-Acl/);
  assert.match(enrollSmtp, /networkCalled=\$false/);
  assert.doesNotMatch(enrollSmtp, /Invoke-RestMethod|Invoke-WebRequest|Set-Clipboard/);
  assert.doesNotMatch(enrollSmtp, /\[string\]\$Username/);
});

test("SMTP apply keeps the DPAPI source, verifies exact realm state, and rolls back on failure", () => {
  assert.match(applySmtp, /keycloak-smtp\.dpapi/);
  assert.match(applySmtp, /ProtectedData\]::Unprotect/);
  assert.match(applySmtp, /invitationDeliveryRequiredForAcceptance=\$true/);
  assert.match(applySmtp, /gate7a-smtp-rollback-failed/);
  assert.doesNotMatch(applySmtp, /Write-Output.*password|Set-Clipboard/i);
});

test("a single-use invitation creates an isolated ordinary principal and no owner authority", () => {
  for (const action of ["VERIFY_EMAIL", "UPDATE_PROFILE", "UPDATE_PASSWORD"]) assert.match(invitation, new RegExp(action));
  assert.match(invitation, /lifespan=600/);
  assert.match(invitation, /'adult-member','adult','active'/);
  assert.match(invitation, /relation='chat_ephemeral'/);
  assert.match(invitation, /ownerIdentityChanged=\$false/);
  assert.match(invitation, /passwordSetByInvitee=\$true/);
  assert.match(invitation, /usernameSetByInvitee=\$true/);
  assert.match(invitation, /Invitation email:/);
  assert.doesNotMatch(invitation, /\[string\]\$Email/);
  assert.match(invitation, /DELETE FROM gate5\.principals/);
  assert.match(invitation, /Method Delete.*users\/\$createdUserId/);
  assert.doesNotMatch(invitation, /ConvertTo-Json[^\n]*\$Email|Set-Clipboard/i);
});

test("ordinary sessions have separate encrypted storage and owner roles cannot use passwords", () => {
  assert.match(postgres, /CREATE SCHEMA IF NOT EXISTS gate7a/);
  assert.match(postgres, /private_envelope jsonb NOT NULL/);
  assert.match(postgres, /cipher\.encrypt/);
  assert.match(ordinary, /passwordRoles = new Set\(\["adult-member", "minor-member", "guest"\]\)/);
  assert.match(ordinary, /gate7a-ordinary-role-denied/);
  assert.match(release, /ordinaryKeycloakClient/);
  assert.match(release, /runaai-next-user/);
});
