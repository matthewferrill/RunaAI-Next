[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][int]$ExpectedArtifactFileCount,
  [Parameter(Mandatory)][string]$PriorReleaseId,
  [Parameter(Mandatory)][string]$PriorCommit,
  [Parameter(Mandatory)][string]$PriorArtifactDigest,
  [Parameter(Mandatory)][string]$ArchiveSha256,
  [Parameter(Mandatory)][string]$ConfigSha256,
  [Parameter(Mandatory)][string]$ManifestSha256,
  [Parameter(Mandatory)][string]$LauncherSha256,
  [Parameter(Mandatory)][string]$ManifestName
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate';$legacy='C:\AI\Projects\RunaAI'
$legacyCommit='b4db04090d8f0df87234fab573b396e7824c5354';$taskPath='\RunaAI-Next\'
if($env:COMPUTERNAME-ne 'RUNA-CONTROL'-or [Security.Principal.WindowsIdentity]::GetCurrent().Name-ne 'RUNA-CONTROL\Matthew'){throw 'candidate-promotion-context-invalid'}
foreach($value in @($ExpectedCommit,$PriorCommit)){if($value-notmatch '^[a-f0-9]{40}$'){throw 'candidate-promotion-commit-pin-invalid'}}
foreach($value in @($ExpectedArtifactDigest,$PriorArtifactDigest,$ArchiveSha256,$ConfigSha256,$ManifestSha256,$LauncherSha256)){if($value-notmatch '^[a-f0-9]{64}$'){throw 'candidate-promotion-digest-pin-invalid'}}
foreach($value in @($ReleaseId,$PriorReleaseId)){if($value-notmatch '^[A-Za-z0-9._-]{1,100}$'){throw 'candidate-promotion-release-id-invalid'}}
if($ManifestName-notmatch '^release-gate6d-[A-Za-z0-9._-]{1,90}\.json$'){throw 'candidate-promotion-manifest-name-invalid'}
$staging=Join-Path $root "staging\$ReleaseId";$release=Join-Path $root "releases\$ReleaseId"
$archive=Join-Path $staging 'release.tar.gz';$stagedConfig=Join-Path $staging 'candidate.json'
$stagedManifest=Join-Path $staging $ManifestName;$stagedLauncher=Join-Path $staging 'Run-Application.ps1'
$config=Join-Path $root 'config\candidate.json';$manifest=Join-Path $root "config\$ManifestName"
$launcher=Join-Path $root 'control\Run-Application.ps1';$backupScript=Join-Path $root 'control\Invoke-ControlScheduledBackup.ps1'
$stamp=$ExpectedCommit.Substring(0,12);$configBackup=Join-Path $root "config\candidate.pre-gate6d-$stamp.json"
$launcherBackup=Join-Path $root "control\Run-Application.pre-gate6d-$stamp.ps1"
function Hash([string]$Path){if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'candidate-promotion-staged-file-missing'};(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Wait-PortClosed([int]$Port){$deadline=[DateTime]::UtcNow.AddSeconds(90);do{if(-not(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 500}until([DateTime]::UtcNow-gt $deadline);throw 'candidate-promotion-app-stop-timeout'}
function Wait-Release([string]$Id){$deadline=[DateTime]::UtcNow.AddMinutes(12);do{Start-Sleep -Seconds 2;try{$value=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 3;if($value.running.releaseId-eq $Id){return $value}}catch{}}until([DateTime]::UtcNow-gt $deadline);throw 'candidate-promotion-app-start-timeout'}
function Expand-Response([object]$Response){foreach($item in @($Response)){if($item-is [Array]){foreach($nested in $item){$nested}}else{$item}}}
$pins=@{$archive=$ArchiveSha256;$stagedConfig=$ConfigSha256;$stagedManifest=$ManifestSha256;$stagedLauncher=$LauncherSha256}
foreach($entry in $pins.GetEnumerator()){if((Hash $entry.Key)-ne $entry.Value){throw 'candidate-promotion-staged-hash-mismatch'}}
foreach($path in @($release,$manifest,$configBackup,$launcherBackup)){if(Test-Path -LiteralPath $path){throw 'candidate-promotion-new-path-exists'}}
if((& git.exe -C $legacy rev-parse HEAD).Trim()-ne $legacyCommit-or(& git.exe -C $legacy branch --show-current).Trim()-ne 'main'-or((& git.exe -C $legacy status --porcelain --untracked-files=no)-join '')-ne ''){throw 'candidate-promotion-legacy-drift'}
$beforeRuntime=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$beforeReadiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
$beforeCeremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
$currentCandidate=Get-Content -Raw -LiteralPath $config|ConvertFrom-Json
$priorCutoverSafe=($beforeRuntime.cutover.phase-eq 'planned'-and$beforeRuntime.cutover.revision-eq 0)-or
  ($beforeRuntime.cutover.phase-eq 'rolled-back'-and$beforeRuntime.authorityGeneration-eq$currentCandidate.sourceGeneration)
if($beforeRuntime.running.releaseId-ne $PriorReleaseId-or$beforeRuntime.running.commit-ne $PriorCommit-or
  $beforeRuntime.running.artifactDigest-ne $PriorArtifactDigest-or-not$priorCutoverSafe-or$beforeReadiness.authority-ne 'shadow'-or
  $beforeReadiness.protectedDataImported-ne $false-or$beforeReadiness.productionTrafficChanged-ne $false-or
  $beforeCeremony.complete-ne $true-or$beforeCeremony.revision-ne 7){throw 'candidate-promotion-current-state-drift'}
if($beforeRuntime.cutover.phase-eq 'rolled-back'){
  $marker=Get-Content -Raw -LiteralPath (Join-Path $root 'gate6c\freeze-lease.json')|ConvertFrom-Json
  $stateAcl=Get-Acl -LiteralPath (Join-Path $legacy '.runaai-local\state')
  if($marker.status-ne 'released'-or$marker.selectedWritesFrozen-ne $false-or
    @($stateAcl.Access|Where-Object{$_.AccessControlType-eq 'Deny'}).Count-ne 0){throw 'candidate-promotion-rollback-not-clean'}
}
$password=$null;$token=$null;$subject=$null
try{$password=[IO.File]::ReadAllText((Join-Path $root 'secrets\keycloak-bootstrap')).Trim();$base='http://localhost:9762'
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{grant_type='password';client_id='admin-cli';username='candidate-bootstrap';password=$password}).access_token
  $headers=@{Authorization="Bearer $token"};$users=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users?username=matthew-owner&exact=true" -Headers $headers))
  if($users.Count-ne 1){throw 'candidate-promotion-owner-user-mismatch'};$subject=[string]$users[0].id
  $credentials=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users/$subject/credentials" -Headers $headers))
  if(@($credentials|Where-Object{$_.type-eq 'webauthn-passwordless'}).Count-ne 2){throw 'candidate-promotion-passkey-count-mismatch'}
}finally{Remove-Variable password,token -ErrorAction SilentlyContinue}
$candidate=Get-Content -Raw -LiteralPath $stagedConfig|ConvertFrom-Json;$releaseFacts=Get-Content -Raw -LiteralPath $stagedManifest|ConvertFrom-Json
if($candidate.mode-ne 'active'-or$candidate.gate6c.enabled-ne $true-or$candidate.gate6c.legacyCommit-ne $legacyCommit-or
  $candidate.releaseManifestPath-ne $ManifestName-or$releaseFacts.releaseId-ne $ReleaseId-or
  $releaseFacts.commit-ne $ExpectedCommit-or$releaseFacts.artifactDigest-ne $ExpectedArtifactDigest){throw 'candidate-promotion-staged-release-invalid'}
New-Item -ItemType Directory -Path $release|Out-Null;& tar.exe -xzf $archive -C $release;if($LASTEXITCODE-ne 0){throw 'candidate-promotion-extract-failed'}
$artifact=Get-Content -Raw -LiteralPath (Join-Path $release 'artifact-files.json')|ConvertFrom-Json
if($artifact.artifactDigest-ne $ExpectedArtifactDigest-or@($artifact.entries).Count-ne $ExpectedArtifactFileCount){throw 'candidate-promotion-artifact-invalid'}
Copy-Item -LiteralPath $config -Destination $configBackup;Copy-Item -LiteralPath $launcher -Destination $launcherBackup
Copy-Item -LiteralPath $stagedManifest -Destination $manifest;Copy-Item -LiteralPath $stagedConfig -Destination "$config.new";Copy-Item -LiteralPath $stagedLauncher -Destination "$launcher.new"
$backupTask=Get-ScheduledTask -TaskPath $taskPath -TaskName 'ProtectedBackup';$priorBackupAction=$backupTask.Actions[0]
$newBackupAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -ReleaseId `"$ReleaseId`""
$changed=$false
try{Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application';Wait-PortClosed 9760
  Move-Item -LiteralPath "$config.new" -Destination $config -Force;Move-Item -LiteralPath "$launcher.new" -Destination $launcher -Force;$changed=$true
  Set-ScheduledTask -TaskPath $taskPath -TaskName 'ProtectedBackup' -Action $newBackupAction|Out-Null
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$runtime=Wait-Release $ReleaseId
  $initial=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 20
  if($initial.revision-ne 0-or$initial.complete-ne $false){throw 'candidate-promotion-new-ceremony-not-pristine'}
  $env:RUNA_GATE6C_OWNER_SUBJECT=$subject
  $operator=Join-Path $release 'gate6c\control\Rebind-ControlCompletedOwnerCeremony.mjs'
  $output=& (Join-Path $release 'runtime\node.exe') $operator --release-root $release --config $config --expected-release-id $ReleaseId --expected-commit $ExpectedCommit --expected-artifact-digest $ExpectedArtifactDigest --prior-release-id $PriorReleaseId --prior-commit $PriorCommit --prior-artifact-digest $PriorArtifactDigest --reason 'completed-owner-promotion-candidate' --legacy-repo $legacy --legacy-commit $legacyCommit 2>&1
  $exit=$LASTEXITCODE;Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  if($exit-ne 0){throw 'candidate-promotion-owner-rebind-failed'}
  $readiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20;$ceremony=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 20
  if($readiness.authority-ne 'shadow'-or$readiness.ownerCredentialEnrolled-ne $true-or$readiness.protectedDataImported-ne $false-or$readiness.productionTrafficChanged-ne $false-or$ceremony.complete-ne $true-or$ceremony.revision-ne 7-or$runtime.cutover.phase-ne 'planned'){throw 'candidate-promotion-post-deploy-state-invalid'}
  [ordered]@{schemaVersion='runa2-gate6d-promotion-candidate-deploy/v1';deployed=$true;releaseId=$ReleaseId;commit=$ExpectedCommit;artifactDigest=$ExpectedArtifactDigest;mode='active';authority='shadow';cutoverPhase='planned';ownerComplete=$true;backupScheduleAdvanced=$true;legacyModified=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{$failure=$_.Exception.Message;Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  if($changed){Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application' -ErrorAction SilentlyContinue;Wait-PortClosed 9760;Copy-Item -LiteralPath $configBackup -Destination $config -Force;Copy-Item -LiteralPath $launcherBackup -Destination $launcher -Force;Set-ScheduledTask -TaskPath $taskPath -TaskName 'ProtectedBackup' -Action $priorBackupAction|Out-Null;Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$restored=Wait-Release $PriorReleaseId
    [ordered]@{schemaVersion='runa2-gate6d-promotion-candidate-deploy/v1';deployed=$false;rolledBack=$true;restoredReleaseId=$restored.running.releaseId;errorCode=$failure;privateValuesIncluded=$false}|ConvertTo-Json -Compress}
  throw
}finally{Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue}
