[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = 'C:\AI\RunaAI-Next-Candidate'
$staging = Join-Path $root 'staging\gate6c-localhost-ff15c61'
$releaseId = 'runaai-next-gate6c-localhost-2026-08-22-ff15c61'
$release = Join-Path $root "releases\$releaseId"
$config = Join-Path $root 'config\candidate.json'
$manifest = Join-Path $root 'config\release-gate6c-localhost-ff15c61.json'
$appLauncher = Join-Path $root 'control\Run-Application.ps1'
$keycloakLauncher = Join-Path $root 'control\Run-Keycloak.ps1'
$configBackup = Join-Path $root 'config\candidate.pre-gate6c-localhost.json'
$appBackup = Join-Path $root 'control\Run-Application.pre-gate6c-localhost.ps1'
$keycloakBackup = Join-Path $root 'control\Run-Keycloak.pre-gate6c-localhost.ps1'
$archive = Join-Path $staging 'runaai-next-gate6c-shadow-ff15c61.tar.gz'
$stagedConfig = Join-Path $staging 'candidate-localhost.json'
$stagedManifest = Join-Path $staging 'release-gate6c-localhost-ff15c61.json'
$stagedApp = Join-Path $staging 'Run-Application.localhost.ps1'
$stagedKeycloak = Join-Path $staging 'Run-Keycloak.localhost.ps1'
$taskPath = '\RunaAI-Next\'

function Hash([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "candidate-required-file-missing:$Path" }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Wait-PortClosed([int]$Port,[int]$Seconds=60) {
  $deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
  do { if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { return }; Start-Sleep -Milliseconds 500 } until ([DateTime]::UtcNow -gt $deadline)
  throw "candidate-port-stop-timeout:$Port"
}
function Wait-Keycloak([string]$HostName,[int]$Minutes=3) {
  $deadline=[DateTime]::UtcNow.AddMinutes($Minutes)
  do { Start-Sleep -Seconds 1; try {
    $value=Invoke-RestMethod -Uri "http://$HostName`:9762/realms/runaai-next/.well-known/openid-configuration" -TimeoutSec 3
    if ($value.issuer -eq "http://$HostName`:9762/realms/runaai-next") { return $value }
  } catch {} } until ([DateTime]::UtcNow -gt $deadline)
  throw "candidate-keycloak-start-timeout:$HostName"
}
function Wait-Release([string]$ExpectedRelease,[int]$Minutes=12) {
  $deadline=[DateTime]::UtcNow.AddMinutes($Minutes)
  do { Start-Sleep -Seconds 2; try {
    $runtime=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 3
    if ($runtime.running.releaseId -eq $ExpectedRelease) { return $runtime }
  } catch {} } until ([DateTime]::UtcNow -gt $deadline)
  throw "candidate-release-start-timeout:$ExpectedRelease"
}
$pins=[ordered]@{
  $archive='e44b81d4d346b4b51b2cef9325b21680b7891fa639fb67f1e160c511919dfac1'
  $stagedConfig='7b7696dd6c846b04cdd4fa2139b3c505eaed3a4500058f5bf2f4779d4172ca69'
  $stagedManifest='cee0f49e62d506e0fdb34f7cd1040c5bc55cd5932a8f91d6bd5a7726cafd0b64'
  $stagedApp='bc4e4d69a7a7b8341175f5e8b7de008755d8a213b8e12e0cf132b25f5f4a9a72'
  $stagedKeycloak='b940321c6a472606db56101f3efd1383efe1f2337f5d225bbd67b94be4e6ddfb'
}
foreach ($entry in $pins.GetEnumerator()) { if ((Hash $entry.Key) -ne $entry.Value) { throw "candidate-staged-hash-mismatch:$($entry.Key)" } }
if ((Hash $config) -ne '387db20185eb4821b9a37b47e2c924f720f94aafc23c1ac197a03a33e99ff21a') { throw 'candidate-current-config-drift' }
if ((Hash $appLauncher) -ne '5a370a8c48e1eb5a6fb52ffca70d5f661eeec1e770efd267e0ba3bf2eaec8d8a') { throw 'candidate-current-app-launcher-drift' }
if ((Hash $keycloakLauncher) -ne '43eede915b10921d4f0443b1b1c04a097f2e8d79f810d0466e047e2e75080c4c') { throw 'candidate-current-keycloak-launcher-drift' }
foreach ($path in @($release,$manifest,$configBackup,$appBackup,$keycloakBackup)) { if (Test-Path -LiteralPath $path) { throw "candidate-new-path-already-exists:$path" } }

$beforeRuntime=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$beforeReadiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
$beforeCeremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
if ($beforeRuntime.running.releaseId -ne 'runaai-next-gate6c-shadow-2026-08-22-ff15c61' -or
    $beforeCeremony.revision -ne 1 -or $beforeCeremony.nextStep -ne 'enroll-primary-credential' -or
    $beforeReadiness.authority -ne 'shadow' -or $beforeReadiness.protectedDataImported -ne $false -or
    $beforeReadiness.productionTrafficChanged -ne $false) { throw 'candidate-current-safety-state-drift' }

New-Item -ItemType Directory -Path $release | Out-Null
& tar.exe -xzf $archive -C $release
if ($LASTEXITCODE -ne 0) { throw 'candidate-release-extract-failed' }
$artifact=Get-Content -LiteralPath (Join-Path $release 'artifact-files.json') -Raw | ConvertFrom-Json
if ($artifact.artifactDigest -ne 'fff3c379258efe4a2cabf2835c91897c4df528b4ab20b229e967d86a12354668' -or @($artifact.entries).Count -ne 29407) { throw 'candidate-extracted-artifact-invalid' }
$candidate=Get-Content -LiteralPath $stagedConfig -Raw | ConvertFrom-Json
$releaseFacts=Get-Content -LiteralPath $stagedManifest -Raw | ConvertFrom-Json
if ($candidate.mode -ne 'shadow' -or $candidate.keycloak.issuer -ne 'http://localhost:9762/realms/runaai-next' -or
    $candidate.gate6c.legacyCommit -ne 'b4db04090d8f0df87234fab573b396e7824c5354' -or
    $releaseFacts.releaseId -ne $releaseId -or $releaseFacts.commit -ne 'ff15c618ecbcb5095f362c6055f4a485af3148e7' -or
    $releaseFacts.artifactDigest -ne 'fff3c379258efe4a2cabf2835c91897c4df528b4ab20b229e967d86a12354668' -or
    $releaseFacts.configurationDigest -ne '363c3dd80eea2cdcc6252b413b9775cfae900b783e4d8ee44ac4bbadf153e80f') { throw 'candidate-localhost-release-invalid' }

Copy-Item -LiteralPath $config -Destination $configBackup
Copy-Item -LiteralPath $appLauncher -Destination $appBackup
Copy-Item -LiteralPath $keycloakLauncher -Destination $keycloakBackup
Copy-Item -LiteralPath $stagedManifest -Destination $manifest
Copy-Item -LiteralPath $stagedConfig -Destination "$config.localhost-new"
Copy-Item -LiteralPath $stagedApp -Destination "$appLauncher.localhost-new"
Copy-Item -LiteralPath $stagedKeycloak -Destination "$keycloakLauncher.localhost-new"
$changed=$false
try {
  Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application'; Wait-PortClosed 9760
  Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Keycloak'; Wait-PortClosed 9762
  Move-Item -LiteralPath "$config.localhost-new" -Destination $config -Force
  Move-Item -LiteralPath "$appLauncher.localhost-new" -Destination $appLauncher -Force
  Move-Item -LiteralPath "$keycloakLauncher.localhost-new" -Destination $keycloakLauncher -Force
  $changed=$true
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Keycloak'; Wait-Keycloak 'localhost' | Out-Null
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
  $runtime=Wait-Release $releaseId
  $readiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20
  $ceremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 20
  if ($ceremony.revision -ne 0 -or $ceremony.nextStep -ne 'verify-recovery-authority' -or
      $readiness.authority -ne 'shadow' -or $readiness.protectedDataImported -ne $false -or
      $readiness.productionTrafficChanged -ne $false) { throw 'candidate-localhost-post-deploy-state-invalid' }
  [ordered]@{ schemaVersion='runa2-gate6c-localhost-shadow-deploy/v1'; deployed=$true;
    releaseId=$runtime.running.releaseId; commit=$runtime.running.commit;
    artifactDigest=$runtime.running.artifactDigest; configurationDigest=$readiness.configuration.configurationDigest;
    keycloakIssuer='http://localhost:9762/realms/runaai-next'; authority=$readiness.authority;
    ceremonyRevision=$ceremony.revision; ceremonyNextStep=$ceremony.nextStep;
    priorCeremonyRetained=$true; legacyModified=$false; protectedDataImported=$false;
    productionTrafficChanged=$false; rollbackFilesRetained=$true; privateValuesIncluded=$false } | ConvertTo-Json -Compress
} catch {
  $failure=$_.Exception.Message
  if ($changed) {
    Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application' -ErrorAction SilentlyContinue; Wait-PortClosed 9760
    Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Keycloak' -ErrorAction SilentlyContinue; Wait-PortClosed 9762
    Copy-Item -LiteralPath $configBackup -Destination $config -Force
    Copy-Item -LiteralPath $appBackup -Destination $appLauncher -Force
    Copy-Item -LiteralPath $keycloakBackup -Destination $keycloakLauncher -Force
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Keycloak'; Wait-Keycloak '127.0.0.1' | Out-Null
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
    $restored=Wait-Release 'runaai-next-gate6c-shadow-2026-08-22-ff15c61'
    [ordered]@{ schemaVersion='runa2-gate6c-localhost-shadow-deploy/v1'; deployed=$false; rolledBack=$true;
      restoredReleaseId=$restored.running.releaseId; errorCode=$failure; privateValuesIncluded=$false } | ConvertTo-Json -Compress
  }
  throw
}
