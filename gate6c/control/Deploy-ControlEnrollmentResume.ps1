[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate'
$staging=Join-Path $root 'staging\gate6c-resume-ad4e686'
$releaseId='runaai-next-gate6c-resume-2026-08-22-ad4e686'
$priorReleaseId='runaai-next-gate6c-localhost-2026-08-22-ff15c61'
$release=Join-Path $root "releases\$releaseId"
$config=Join-Path $root 'config\candidate.json'
$manifest=Join-Path $root 'config\release-gate6c-resume-ad4e686.json'
$launcher=Join-Path $root 'control\Run-Application.ps1'
$configBackup=Join-Path $root 'config\candidate.pre-gate6c-resume-ad4e686.json'
$launcherBackup=Join-Path $root 'control\Run-Application.pre-gate6c-resume-ad4e686.ps1'
$archive=Join-Path $staging 'runaai-next-gate6c-resume-ad4e686.tar.gz'
$stagedConfig=Join-Path $staging 'candidate-resume-ad4e686.json'
$stagedManifest=Join-Path $staging 'release-gate6c-resume-ad4e686.json'
$stagedLauncher=Join-Path $staging 'Run-Application.resume-ad4e686.ps1'
$taskPath='\RunaAI-Next\'

function Hash([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "candidate-required-file-missing:$Path" }
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Wait-PortClosed([int]$Port,[int]$Seconds=60) {
  $deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
  do { if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { return }; Start-Sleep -Milliseconds 500 } until ([DateTime]::UtcNow -gt $deadline)
  throw "candidate-port-stop-timeout:$Port"
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
  $archive='23d50c3af8e1b3d8abb90858647b8ffd5d33eba053780740ac3806fa0789436e'
  $stagedConfig='c3cf48e1bc31f099079c1e451577c86dcbed622cf48685ea952141309ba054d8'
  $stagedManifest='12543f46243cc1199c44f60bf4ddae7fbc8c96ddd79dc3cd3a0d802e748638d5'
  $stagedLauncher='079926d5797d7bceb5856abbf3cc238c690c37662913efbbe4d2c99a7fe8fe7d'
}
foreach($entry in $pins.GetEnumerator()){if((Hash $entry.Key)-ne $entry.Value){throw "candidate-staged-hash-mismatch:$($entry.Key)"}}
if((Hash $config)-ne '7b7696dd6c846b04cdd4fa2139b3c505eaed3a4500058f5bf2f4779d4172ca69'){throw 'candidate-current-config-drift'}
if((Hash $launcher)-ne 'bc4e4d69a7a7b8341175f5e8b7de008755d8a213b8e12e0cf132b25f5f4a9a72'){throw 'candidate-current-app-launcher-drift'}
foreach($path in @($release,$manifest,$configBackup,$launcherBackup)){if(Test-Path -LiteralPath $path){throw "candidate-new-path-already-exists:$path"}}

$beforeRuntime=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$beforeReadiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
$beforeCeremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
if($beforeRuntime.running.releaseId-ne $priorReleaseId -or $beforeCeremony.revision-ne 1 -or
   $beforeCeremony.nextStep-ne 'enroll-primary-credential' -or $beforeReadiness.authority-ne 'shadow' -or
   $beforeReadiness.protectedDataImported-ne $false -or $beforeReadiness.productionTrafficChanged-ne $false){throw 'candidate-current-safety-state-drift'}

New-Item -ItemType Directory -Path $release | Out-Null
& tar.exe -xzf $archive -C $release
if($LASTEXITCODE-ne 0){throw 'candidate-release-extract-failed'}
$artifact=Get-Content -LiteralPath (Join-Path $release 'artifact-files.json') -Raw | ConvertFrom-Json
if($artifact.artifactDigest-ne '688f102b7d5e9014d73f41ee381ed7fe00d7d40d9f28fc1ae938ca70cd9cabf6' -or @($artifact.entries).Count-ne 29414){throw 'candidate-extracted-artifact-invalid'}
$candidate=Get-Content -LiteralPath $stagedConfig -Raw | ConvertFrom-Json
$releaseFacts=Get-Content -LiteralPath $stagedManifest -Raw | ConvertFrom-Json
if($candidate.mode-ne 'shadow' -or $candidate.keycloak.issuer-ne 'http://localhost:9762/realms/runaai-next' -or
   $candidate.gate6c.legacyCommit-ne 'b4db04090d8f0df87234fab573b396e7824c5354' -or
   $releaseFacts.releaseId-ne $releaseId -or $releaseFacts.commit-ne 'ad4e686243726dea188b50751176a00e2338fd9e' -or
   $releaseFacts.artifactDigest-ne '688f102b7d5e9014d73f41ee381ed7fe00d7d40d9f28fc1ae938ca70cd9cabf6' -or
   $releaseFacts.configurationDigest-ne '710ddb97e2bb11bc02b84d02bd304a5e987580d7b89918d77176506b685357d8'){throw 'candidate-resume-release-invalid'}

Copy-Item -LiteralPath $config -Destination $configBackup
Copy-Item -LiteralPath $launcher -Destination $launcherBackup
Copy-Item -LiteralPath $stagedManifest -Destination $manifest
Copy-Item -LiteralPath $stagedConfig -Destination "$config.resume-new"
Copy-Item -LiteralPath $stagedLauncher -Destination "$launcher.resume-new"
$changed=$false
try {
  Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application';Wait-PortClosed 9760
  Move-Item -LiteralPath "$config.resume-new" -Destination $config -Force
  Move-Item -LiteralPath "$launcher.resume-new" -Destination $launcher -Force
  $changed=$true
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
  $runtime=Wait-Release $releaseId
  $readiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20
  $ceremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 20
  if($ceremony.revision-ne 0 -or $ceremony.nextStep-ne 'verify-recovery-authority' -or
     $readiness.authority-ne 'shadow' -or $readiness.protectedDataImported-ne $false -or
     $readiness.productionTrafficChanged-ne $false){throw 'candidate-resume-post-deploy-state-invalid'}
  [ordered]@{schemaVersion='runa2-gate6c-enrollment-resume-deploy/v1';deployed=$true;
    releaseId=$runtime.running.releaseId;commit=$runtime.running.commit;artifactDigest=$runtime.running.artifactDigest;
    configurationDigest=$readiness.configuration.configurationDigest;ceremonyRevision=$ceremony.revision;
    ceremonyNextStep=$ceremony.nextStep;priorCeremonyRetained=$true;legacyModified=$false;
    protectedDataImported=$false;productionTrafficChanged=$false;rollbackFilesRetained=$true;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
} catch {
  $failure=$_.Exception.Message
  if($changed){
    Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application' -ErrorAction SilentlyContinue;Wait-PortClosed 9760
    Copy-Item -LiteralPath $configBackup -Destination $config -Force
    Copy-Item -LiteralPath $launcherBackup -Destination $launcher -Force
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
    $restored=Wait-Release $priorReleaseId
    [ordered]@{schemaVersion='runa2-gate6c-enrollment-resume-deploy/v1';deployed=$false;rolledBack=$true;
      restoredReleaseId=$restored.running.releaseId;errorCode=$failure;privateValuesIncluded=$false}|ConvertTo-Json -Compress
  }
  throw
}
