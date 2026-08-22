[CmdletBinding()]
param(
  [string]$Root='C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$PriorReleaseId,
  [Parameter(Mandatory)][string]$ReleaseId
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME-ne 'RUNA-CONTROL' -or [Security.Principal.WindowsIdentity]::GetCurrent().Name-ne 'RUNA-CONTROL\Matthew'){throw 'candidate-backup-update-context-invalid'}
if([IO.Path]::GetFullPath($Root)-ne 'C:\AI\RunaAI-Next-Candidate'){throw 'candidate-root-invalid'}
foreach($value in @($PriorReleaseId,$ReleaseId)){if($value-notmatch '^[A-Za-z0-9._-]{1,100}$'){throw 'candidate-release-id-invalid'}}
if($PriorReleaseId-eq $ReleaseId){throw 'candidate-backup-release-unchanged'}
$configRoot=Join-Path $Root 'config'
$candidate=Get-Content -Raw -LiteralPath (Join-Path $configRoot 'candidate.json')|ConvertFrom-Json
$manifestRef=[string]$candidate.releaseManifestPath
if($manifestRef-notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'){throw 'candidate-release-manifest-ref-invalid'}
$manifestPath=[IO.Path]::GetFullPath((Join-Path $configRoot $manifestRef))
if(-not [StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $manifestPath),[IO.Path]::GetFullPath($configRoot))){throw 'candidate-release-manifest-path-invalid'}
$manifest=Get-Content -Raw -LiteralPath $manifestPath|ConvertFrom-Json
$runtime=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$readiness=Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
if($manifest.releaseId-ne $ReleaseId -or $runtime.running.releaseId-ne $ReleaseId -or
   $runtime.running.commit-ne $manifest.commit -or $runtime.running.artifactDigest-ne $manifest.artifactDigest -or
   $readiness.authority-ne 'shadow' -or $readiness.ownerCredentialEnrolled-ne $true -or
   $readiness.protectedDataImported-ne $false -or $readiness.productionTrafficChanged-ne $false){throw 'candidate-backup-update-safety-state-invalid'}
$taskPath='\RunaAI-Next\';$taskName='ProtectedBackup';$script=Join-Path $Root 'control\Invoke-ControlScheduledBackup.ps1'
$task=Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName
$actions=@($task.Actions)
if([string]$task.State-ne 'Ready' -or $task.Principal.UserId-ne 'SYSTEM' -or $actions.Count-ne 1 -or
   $actions[0].Execute-ne 'powershell.exe' -or $actions[0].Arguments-notmatch [regex]::Escape("-ReleaseId `"$PriorReleaseId`"") -or
   $actions[0].Arguments-notmatch [regex]::Escape($script)){throw 'candidate-backup-update-task-drift'}
$priorAction=$actions[0]
$newAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Root `"$Root`" -ReleaseId `"$ReleaseId`""
$changed=$false
try{
  Set-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Action $newAction|Out-Null
  $changed=$true
  $updated=Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName
  $updatedActions=@($updated.Actions)
  if([string]$updated.State-ne 'Ready' -or $updated.Principal.UserId-ne 'SYSTEM' -or
     $updatedActions.Count-ne 1 -or $updatedActions[0].Arguments-notmatch [regex]::Escape("-ReleaseId `"$ReleaseId`"")){throw 'candidate-backup-update-postcheck-failed'}
  [ordered]@{schemaVersion='runa2-gate6c-backup-schedule-release-update/v1';updated=$true;
    priorReleaseId=$PriorReleaseId;releaseId=$ReleaseId;principal='SYSTEM';scheduleRetained=$true;
    protectedDataImported=$false;productionTrafficChanged=$false;candidatePromoted=$false;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  if($changed){Set-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Action $priorAction|Out-Null}
  throw
}
