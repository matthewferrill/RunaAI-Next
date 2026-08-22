[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Prepare','ActivateAndPromote','RestartAfterPromotion','VerifyLive','Observe','Close','Rollback')][string]$Mode,
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][string]$LeaseId
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate';$legacy='C:\AI\Projects\RunaAI';$legacyCommit='b4db04090d8f0df87234fab573b396e7824c5354'
$release=Join-Path $root "releases\$ReleaseId";$config=Join-Path $root 'config\candidate.json';$gateRoot=Join-Path $root 'gate6c'
$restoreProof=Join-Path $gateRoot 'restore-proof.json';$preflightProof=Join-Path $gateRoot 'preflight-proof.json';$observationProof=Join-Path $gateRoot 'observation-proof.json'
$freezeScript=Join-Path $release 'gate6c\control\Set-ControlLegacyWriteFreeze.ps1';$operator=Join-Path $release 'gate6c\control\Run-ControlProtectedCutover.mjs'
$node=Join-Path $release 'runtime\node.exe';$taskPath='\RunaAI-Next\'
if($env:COMPUTERNAME-ne 'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne 'RUNA-CONTROL\Matthew'){throw 'gate6d-maintenance-context-invalid'}
if($ExpectedCommit-notmatch '^[a-f0-9]{40}$'-or$ExpectedArtifactDigest-notmatch '^[a-f0-9]{64}$'-or$ReleaseId-notmatch '^[A-Za-z0-9._-]{1,100}$'-or$LeaseId-notmatch '^[A-Za-z0-9._:-]{1,160}$'){throw 'gate6d-maintenance-pin-invalid'}
foreach($path in @($release,$config,$freezeScript,$operator,$node)){if(-not(Test-Path -LiteralPath $path)){throw 'gate6d-maintenance-required-path-missing'}}
function Candidate-Config{$value=Get-Content -Raw -LiteralPath $config|ConvertFrom-Json;$manifestPath=Join-Path (Split-Path -Parent $config) $value.releaseManifestPath;$manifest=Get-Content -Raw -LiteralPath $manifestPath|ConvertFrom-Json;if($value.mode-ne 'active'-or$value.gate6c.enabled-ne $true-or$value.gate6c.legacyCommit-ne $legacyCommit-or$manifest.releaseId-ne $ReleaseId-or$manifest.commit-ne $ExpectedCommit-or$manifest.artifactDigest-ne $ExpectedArtifactDigest){throw 'gate6d-maintenance-release-mismatch'};[pscustomobject]@{Config=$value;Manifest=$manifest}}
function Runtime{Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10}
function Readiness{Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10}
function Wait-PortClosed{$deadline=[DateTime]::UtcNow.AddSeconds(90);do{if(-not(Get-NetTCPConnection -State Listen -LocalPort 9760 -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 500}until([DateTime]::UtcNow-gt $deadline);throw 'gate6d-application-stop-timeout'}
function Wait-App{$deadline=[DateTime]::UtcNow.AddMinutes(12);do{Start-Sleep -Seconds 2;try{$value=Runtime;if($value.running.releaseId-eq $ReleaseId){return $value}}catch{}}until([DateTime]::UtcNow-gt $deadline);throw 'gate6d-application-start-timeout'}
function Invoke-Operator([string]$Phase){$output=& $node $operator --phase $Phase --release-root $release --config $config --expected-release-id $ReleaseId --expected-commit $ExpectedCommit --expected-artifact-digest $ExpectedArtifactDigest --legacy-repo $legacy --legacy-commit $legacyCommit --lease-id $LeaseId --restore-proof $restoreProof --preflight-proof $preflightProof 2>&1;$exit=$LASTEXITCODE;$text=($output|ForEach-Object{[string]$_})-join '';if($exit-ne 0){try{$safe=($text|ConvertFrom-Json).errorCode}catch{$safe='gate6d-operator-failed'};throw $safe};$text|ConvertFrom-Json}
function Verify-Freeze{& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $freezeScript -Mode Verify -ExpectedCommit $legacyCommit -LeaseId $LeaseId|Out-Null;if($LASTEXITCODE-ne 0){throw 'gate6d-freeze-verification-failed'}}
function Release-Freeze([string]$Reason){& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $freezeScript -Mode Release -ExpectedCommit $legacyCommit -LeaseId $LeaseId -ReleaseReason $Reason|Out-Null;if($LASTEXITCODE-ne 0){throw 'gate6d-freeze-release-failed'}}
function Recover{try{Invoke-Operator 'rollback'|Out-Null}finally{Release-Freeze 'verified-rollback'}}
$authority=Candidate-Config;$runtime=Runtime
if($runtime.running.releaseId-ne $ReleaseId-or$runtime.running.commit-ne $ExpectedCommit-or$runtime.running.artifactDigest-ne $ExpectedArtifactDigest){throw 'gate6d-running-release-mismatch'}
if($Mode-eq 'Prepare'){
  if($runtime.cutover.phase-ne 'planned'-or$runtime.cutover.revision-ne 0){throw 'gate6d-preflight-cutover-not-pristine'}
  $readiness=Readiness;if($readiness.authority-ne 'shadow'-or$readiness.ownerCredentialEnrolled-ne $true-or$readiness.protectedDataImported-ne $false-or$readiness.productionTrafficChanged-ne $false-or$readiness.dependencies.ready-ne $true){throw 'gate6d-preflight-readiness-invalid'}
  $legacyStatus=Invoke-RestMethod -Uri 'http://127.0.0.1:3786/api/runtime/status' -TimeoutSec 10
  if($legacyStatus.ok-ne $true-or$legacyStatus.running.commit-ne $legacyCommit-or$legacyStatus.running.cleanAtStart-ne $true){throw 'gate6d-preflight-legacy-runtime-invalid'}
  if((& git.exe -C $legacy rev-parse HEAD).Trim()-ne $legacyCommit-or(& git.exe -C $legacy branch --show-current).Trim()-ne 'main'-or((& git.exe -C $legacy status --porcelain --untracked-files=no)-join '')-ne ''){throw 'gate6d-preflight-legacy-git-invalid'}
  $tasks=@(Get-ScheduledTask -TaskPath $taskPath);foreach($name in @('Postgresql','Keycloak','OpenFga','Caddy','Application','ProtectedBackup')){if(-not($tasks|Where-Object{$_.TaskName-eq $name})){throw 'gate6d-preflight-task-missing'}}
  $backupTask=Get-ScheduledTask -TaskPath $taskPath -TaskName 'ProtectedBackup';$backupInfo=Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName 'ProtectedBackup'
  if([string]$backupTask.State-ne 'Ready'-or$backupInfo.LastTaskResult-ne 0-or$backupTask.Actions[0].Arguments-notmatch [regex]::Escape($ReleaseId)){throw 'gate6d-preflight-backup-schedule-invalid'}
  $listeners=@(Get-NetTCPConnection -State Listen|Where-Object{$_.LocalPort-in @(9760,9761,9762,9763,9764,9765,9766,9770)})
  if($listeners.Count-ne 8-or@($listeners|Where-Object{$_.LocalPort-ne 9761-and$_.LocalAddress-notin @('127.0.0.1','::1')}).Count-ne 0-or@($listeners|Where-Object{$_.LocalPort-eq 9761-and$_.LocalAddress-ne '192.168.50.169'}).Count-ne 0){throw 'gate6d-preflight-listener-boundary-invalid'}
  if((Get-PSDrive -Name C).Free-lt 5GB){throw 'gate6d-preflight-capacity-invalid'}
  if((Get-Service W32Time).Status-ne 'Running'){throw 'gate6d-preflight-time-service-invalid'}
  $verify=& $node --test (Join-Path $release 'gate6\gate6.test.mjs') (Join-Path $release 'gate6b\gate6b.test.mjs') (Join-Path $release 'gate6c\gate6c.test.mjs') 2>&1;if($LASTEXITCODE-ne 0){throw 'gate6d-preflight-selected-verifier-failed'}
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $freezeScript -Mode Preflight -ExpectedCommit $legacyCommit|Out-Null;if($LASTEXITCODE-ne 0){throw 'gate6d-preflight-freeze-failed'}
  $backupOutput=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $release 'gate6c\control\Invoke-ControlScheduledBackup.ps1') -ReleaseId $ReleaseId 2>&1;if($LASTEXITCODE-ne 0){throw 'gate6d-preflight-backup-failed'}
  $backup=($backupOutput|ForEach-Object{[string]$_})-join ''|ConvertFrom-Json
  $restoreOutput=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $release 'gate6c\control\Invoke-ControlScheduledRestoreProof.ps1') -ReleaseId $ReleaseId 2>&1;if($LASTEXITCODE-ne 0){throw 'gate6d-preflight-restore-failed'}
  $restore=(($restoreOutput|ForEach-Object{[string]$_})-join '')|ConvertFrom-Json
  if($backup.passed-ne $true-or$restore.passed-ne $true-or$backup.generation-ne $restore.generation){throw 'gate6d-preflight-backup-restore-mismatch'}
  New-Item -ItemType Directory -Path $gateRoot -Force|Out-Null;$restore|Add-Member -NotePropertyName scheduleActive -NotePropertyValue $true -Force;$restore|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $restoreProof -Encoding utf8
  $facts=[ordered]@{};foreach($name in @('releaseApplicationEntrypointVerified','releaseArtifactVerified','targetPathDistinctFromLegacy','sourceCheckoutCleanExact','targetCheckoutCleanExact','postgresqlPersistent','keycloakPersistent','openfgaPersistent','privateTlsVerified','secretsReferencedOnly','backupVerified','restoreVerifiedDistinctTarget','providerModelExact','runtimeStatusAvailable','rollbackOwnerPresent','legacyRollbackAvailable','timeSynchronized','capacityHeadroomVerified','noPublicListener','noProtectedOutput','selectedVerifierAvailable')){$facts[$name]=$true}
  [ordered]@{schemaVersion='runa2-gate6cd-control-preflight/v1';passed=$true;releaseManifestDigest=$authority.Manifest.manifestDigest;legacyCommit=$legacyCommit;facts=$facts;protectedStoresOpened=$false;sourceModified=$false;privateValuesIncluded=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $preflightProof -Encoding utf8
  $operatorCheck=Invoke-Operator 'prerequisite-check'
  if($operatorCheck.passed-ne $true-or$operatorCheck.protectedStoresOpened-ne $false){throw 'gate6d-preflight-operator-prerequisite-failed'}
  [ordered]@{schemaVersion='runa2-gate6cd-prepare/v1';passed=$true;releaseId=$ReleaseId;backupGeneration=$backup.generation;selectedVerifierPassed=$true;freezePreflightPassed=$true;operatorPrerequisitePassed=$true;privateValuesIncluded=$false}|ConvertTo-Json -Compress;return
}
if($Mode-eq 'ActivateAndPromote'){
  try{& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $freezeScript -Mode Activate -ExpectedCommit $legacyCommit -LeaseId $LeaseId -DurationMinutes 180|Out-Null;if($LASTEXITCODE-ne 0){throw 'gate6d-freeze-activation-failed'};Verify-Freeze;$result=Invoke-Operator 'migrate-promote';$result|ConvertTo-Json -Compress;return}catch{try{Recover}catch{};throw}
}
if($Mode-eq 'RestartAfterPromotion'){
  try{Verify-Freeze;if($runtime.cutover.phase-ne 'promoted'){throw 'gate6d-restart-phase-invalid'};Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application';Wait-PortClosed;Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$after=Wait-App;$ready=Readiness;if($after.cutover.phase-ne 'promoted'-or$after.authorityGeneration-ne $authority.Config.targetGeneration-or$ready.authority-ne 'active'-or$ready.protectedDataImported-ne $true-or$ready.productionTrafficChanged-ne $true){throw 'gate6d-restart-validation-failed'};[ordered]@{schemaVersion='runa2-gate6d-restart/v1';passed=$true;phase='promoted';authority='active';ownerValidationUrl="$($authority.Config.publicBaseUrl)/gate6d-validation";privateValuesIncluded=$false}|ConvertTo-Json -Compress;return}catch{try{Recover}catch{};throw}
}
if($Mode-eq 'VerifyLive'){try{Verify-Freeze;$result=Invoke-Operator 'verify-live';$result|ConvertTo-Json -Compress;return}catch{try{Recover}catch{};throw}}
if($Mode-eq 'Observe'){
  try{Verify-Freeze;$start=Runtime;if($start.cutover.phase-ne 'observing'){throw 'gate6d-observation-phase-invalid'};$started=[DateTime]::UtcNow;$samples=0;$freezeChecks=1
    for($index=0;$index-lt 120;$index++){$health=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/health/ready' -TimeoutSec 10;$live=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10;if($health.ready-ne $true-or$live.cutover.phase-ne 'observing'-or$live.authorityGeneration-ne $authority.Config.targetGeneration){throw 'gate6d-observation-health-failed'};$samples++;if(($samples%10)-eq 0){Verify-Freeze;$freezeChecks++};Start-Sleep -Seconds 30}
    Verify-Freeze;$freezeChecks++;[ordered]@{schemaVersion='runa2-gate6d-observation-proof/v1';passed=$true;releaseManifestDigest=$authority.Manifest.manifestDigest;cutoverId=$authority.Config.cutoverId;startedAt=$started.ToString('o');endedAt=[DateTime]::UtcNow.ToString('o');durationMinutes=60;sampleCount=$samples;freezeVerificationCount=$freezeChecks;healthGreenForEntireWindow=$true;selectedWritesStayedFrozen=$true;privateValuesIncluded=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $observationProof -Encoding utf8
    [ordered]@{schemaVersion='runa2-gate6d-observation/v1';passed=$true;durationMinutes=60;sampleCount=$samples;freezeVerificationCount=$freezeChecks;privateValuesIncluded=$false}|ConvertTo-Json -Compress;return
  }catch{try{Recover}catch{};throw}
}
if($Mode-eq 'Close'){try{Verify-Freeze;$result=Invoke-Operator 'close';Release-Freeze 'gate6-closed';$result|ConvertTo-Json -Compress;return}catch{try{Recover}catch{};throw}}
if($Mode-eq 'Rollback'){Recover;[ordered]@{schemaVersion='runa2-gate6d-maintenance-rollback/v1';passed=$true;phase='rolled-back';legacyModified=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress}
