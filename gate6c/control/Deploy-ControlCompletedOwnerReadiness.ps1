[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate'
$staging=Join-Path $root 'staging\gate6c-readiness-669139e'
$releaseId='runaai-next-gate6c-readiness-2026-08-22-669139e'
$priorReleaseId='runaai-next-gate6c-resume-2026-08-22-ad4e686'
$release=Join-Path $root "releases\$releaseId"
$config=Join-Path $root 'config\candidate.json'
$manifest=Join-Path $root 'config\release-gate6c-readiness-669139e.json'
$launcher=Join-Path $root 'control\Run-Application.ps1'
$configBackup=Join-Path $root 'config\candidate.pre-gate6c-readiness-669139e.json'
$launcherBackup=Join-Path $root 'control\Run-Application.pre-gate6c-readiness-669139e.ps1'
$archive=Join-Path $staging 'runaai-next-gate6c-readiness-669139e.tar.gz'
$stagedConfig=Join-Path $staging 'candidate.json'
$stagedManifest=Join-Path $staging 'release-gate6c-readiness-669139e.json'
$stagedLauncher=Join-Path $staging 'Run-Application.ps1'
$legacyRepo='C:\AI\Projects\RunaAI'
$legacyCommit='b4db04090d8f0df87234fab573b396e7824c5354'
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

if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'candidate-readiness-context-invalid' }
$pins=[ordered]@{
  $archive='1acf0f45215b600f8fe0ac24a54a56b3b80a71a9e4dbbf1cb165c998d4ab5050'
  $stagedConfig='94019034a7529428095da86542666331fdba236bf2dd836b9c04d73cc361db7a'
  $stagedManifest='bf34c41d31d425dfdc3996b804dcf4ad643cb06cb846e63eeef2b4620b891914'
  $stagedLauncher='b84a716eca9d1bff8d257b3c12672bbc4b3282c13a0db7f90702b71aeee8cd95'
}
foreach($entry in $pins.GetEnumerator()){if((Hash $entry.Key)-ne $entry.Value){throw "candidate-staged-hash-mismatch:$($entry.Key)"}}
if((Hash $config)-ne 'c3cf48e1bc31f099079c1e451577c86dcbed622cf48685ea952141309ba054d8'){throw 'candidate-current-config-drift'}
if((Hash $launcher)-ne '079926d5797d7bceb5856abbf3cc238c690c37662913efbbe4d2c99a7fe8fe7d'){throw 'candidate-current-app-launcher-drift'}
foreach($path in @($release,$manifest,$configBackup,$launcherBackup)){if(Test-Path -LiteralPath $path){throw "candidate-new-path-already-exists:$path"}}
if((& git.exe -C $legacyRepo rev-parse HEAD).Trim()-ne $legacyCommit -or
   (& git.exe -C $legacyRepo branch --show-current).Trim()-ne 'main' -or
   ((& git.exe -C $legacyRepo status --porcelain --untracked-files=no) -join '')-ne ''){throw 'candidate-legacy-authority-drift'}
$backupTask=Get-ScheduledTask -TaskPath $taskPath -TaskName 'ProtectedBackup'
$backupInfo=Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName 'ProtectedBackup'
if([string]$backupTask.State-ne 'Ready' -or $backupInfo.LastTaskResult-ne 0){throw 'candidate-backup-prerequisite-invalid'}

$beforeRuntime=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$beforeReadiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
$beforeCeremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
if($beforeRuntime.running.releaseId-ne $priorReleaseId -or $beforeCeremony.revision-ne 7 -or
   $beforeCeremony.complete-ne $true -or $beforeReadiness.authority-ne 'shadow' -or
   $beforeReadiness.protectedDataImported-ne $false -or $beforeReadiness.productionTrafficChanged-ne $false){throw 'candidate-current-safety-state-drift'}

$base='http://localhost:9762';$password=$null;$token=$null;$ownerSubject=$null
try {
  $password=[IO.File]::ReadAllText((Join-Path $root 'secrets\keycloak-bootstrap')).Trim()
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{grant_type='password';client_id='admin-cli';username='candidate-bootstrap';password=$password}).access_token
  $headers=@{Authorization="Bearer $token"}
  $users=@(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users?username=matthew-owner&exact=true" -Headers $headers)
  if($users.Count-ne 1){throw 'candidate-owner-user-mismatch'}
  $ownerSubject=[string]$users[0].id
  $credentials=@(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users/$ownerSubject/credentials" -Headers $headers)
  if(@($credentials|Where-Object{$_.type-eq 'webauthn-passwordless'}).Count-ne 2){throw 'candidate-owner-passkey-count-mismatch'}
} finally { Remove-Variable password,token -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Path $release | Out-Null
& tar.exe -xzf $archive -C $release
if($LASTEXITCODE-ne 0){throw 'candidate-release-extract-failed'}
$artifact=Get-Content -LiteralPath (Join-Path $release 'artifact-files.json') -Raw | ConvertFrom-Json
if($artifact.artifactDigest-ne 'd8a39de16b79c78de0e8d6211f9af2b2e007e1139836596b5cc8a9f0e58b7b77' -or @($artifact.entries).Count-ne 29423){throw 'candidate-extracted-artifact-invalid'}
$candidate=Get-Content -LiteralPath $stagedConfig -Raw | ConvertFrom-Json
$releaseFacts=Get-Content -LiteralPath $stagedManifest -Raw | ConvertFrom-Json
if($candidate.mode-ne 'shadow' -or $candidate.gate6c.enabled-ne $true -or
   $candidate.gate6c.legacyCommit-ne $legacyCommit -or $releaseFacts.releaseId-ne $releaseId -or
   $releaseFacts.commit-ne '669139ec7e0c1a043f2854b92e2db964137537ee' -or
   $releaseFacts.artifactDigest-ne 'd8a39de16b79c78de0e8d6211f9af2b2e007e1139836596b5cc8a9f0e58b7b77' -or
   $releaseFacts.configurationDigest-ne 'c0980e45c2443601038da2c76c1deb6fc9de6ca32eadae1a769719f3594d1424'){throw 'candidate-readiness-release-invalid'}

Copy-Item -LiteralPath $config -Destination $configBackup
Copy-Item -LiteralPath $launcher -Destination $launcherBackup
Copy-Item -LiteralPath $stagedManifest -Destination $manifest
Copy-Item -LiteralPath $stagedConfig -Destination "$config.readiness-new"
Copy-Item -LiteralPath $stagedLauncher -Destination "$launcher.readiness-new"
$changed=$false
try {
  Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application';Wait-PortClosed 9760
  Move-Item -LiteralPath "$config.readiness-new" -Destination $config -Force
  Move-Item -LiteralPath "$launcher.readiness-new" -Destination $launcher -Force
  $changed=$true
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
  $runtime=Wait-Release $releaseId
  $initialCeremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 20
  if($initialCeremony.revision-ne 0 -or $initialCeremony.complete-ne $false){throw 'candidate-new-ceremony-not-pristine'}
  $env:RUNA_GATE6C_OWNER_SUBJECT=$ownerSubject
  $operator=Join-Path $release 'gate6c\control\Rebind-ControlCompletedOwnerCeremony.mjs'
  $output=& (Join-Path $release 'runtime\node.exe') $operator --release-root $release --config $config `
    --expected-release-id $releaseId --expected-commit '669139ec7e0c1a043f2854b92e2db964137537ee' `
    --expected-artifact-digest 'd8a39de16b79c78de0e8d6211f9af2b2e007e1139836596b5cc8a9f0e58b7b77' `
    --prior-release-id $priorReleaseId --prior-commit 'ad4e686243726dea188b50751176a00e2338fd9e' `
    --prior-artifact-digest '688f102b7d5e9014d73f41ee381ed7fe00d7d40d9f28fc1ae938ca70cd9cabf6' `
    --reason 'completed-owner-readiness-release' --legacy-repo $legacyRepo --legacy-commit $legacyCommit 2>&1
  $exit=$LASTEXITCODE;Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  $text=($output|ForEach-Object{[string]$_})-join ''
  if($exit-ne 0){throw "candidate-completed-owner-rebind-failed:$text"}
  $rebind=$text|ConvertFrom-Json
  $readiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20
  $ceremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 20
  if($rebind.ceremonyComplete-ne $true -or $rebind.candidatePromoted-ne $false -or
     $ceremony.revision-ne 7 -or $ceremony.complete-ne $true -or $readiness.authority-ne 'shadow' -or
     $readiness.ownerCredentialEnrolled-ne $true -or $readiness.protectedDataImported-ne $false -or
     $readiness.productionTrafficChanged-ne $false){throw 'candidate-readiness-post-deploy-state-invalid'}
  [ordered]@{schemaVersion='runa2-gate6c-completed-owner-readiness-deploy/v1';deployed=$true;
    releaseId=$runtime.running.releaseId;commit=$runtime.running.commit;artifactDigest=$runtime.running.artifactDigest;
    configurationDigest=$readiness.configuration.configurationDigest;ownerComplete=$true;authority='shadow';
    candidatePromoted=$false;protectedDataImported=$false;productionTrafficChanged=$false;
    priorCeremonyRetained=$true;legacyModified=$false;rollbackFilesRetained=$true;privateValuesIncluded=$false}|ConvertTo-Json -Compress
} catch {
  $failure=$_.Exception.Message;Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  if($changed){
    Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application' -ErrorAction SilentlyContinue;Wait-PortClosed 9760
    Copy-Item -LiteralPath $configBackup -Destination $config -Force
    Copy-Item -LiteralPath $launcherBackup -Destination $launcher -Force
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
    $restored=Wait-Release $priorReleaseId
    [ordered]@{schemaVersion='runa2-gate6c-completed-owner-readiness-deploy/v1';deployed=$false;rolledBack=$true;
      restoredReleaseId=$restored.running.releaseId;errorCode=$failure;privateValuesIncluded=$false}|ConvertTo-Json -Compress
  }
  throw
} finally { Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue }
