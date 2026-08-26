[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SourceRoot,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedDaclSha256,
  [Parameter(Mandatory)][string]$ExpectedCurrentNonDaclSha256,
  [Parameter(Mandatory)][string]$ExpectedTargetNonDaclSha256,
  [Parameter(Mandatory)][int]$ExpectedTargetControlFlags,
  [Parameter(Mandatory)][string]$ExpectedPriorReleaseId,
  [Parameter(Mandatory)][string]$ExpectedPriorCommit,
  [string]$Root='C:\AI\RunaAI-Next-Candidate',
  [string]$TaskName='Gate7E-SandboxAncestorRepair',
  [switch]$Worker,
  [string]$ResultPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$target='C:\AI'
$rootPath=[IO.Path]::GetFullPath($Root)
$sourcePath=[IO.Path]::GetFullPath($SourceRoot)
$operatorSource=Join-Path $sourcePath 'gate7e\control\TargetOnlyAcl.cs'
$taskPath='\RunaAI-Next\'

function Valid-Hash([string]$Value){$Value-match'^[a-f0-9]{64}$'}
function Write-ExclusiveJson([string]$Path,[object]$Value){
  $json=$Value|ConvertTo-Json -Compress -Depth 8
  $stream=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($json+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Load-Operator{if(-not('RunaAI.Next.Gate7E.TargetOnlyAcl'-as[type])){Add-Type -Path $operatorSource}}
function Inspect-Target{Load-Operator;[RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($target)}
function Critical-Paths{@(
  'C:\AI\RunaAI-Next-Candidate','C:\AI\RunaAI-Next-Candidate\config',
  'C:\AI\RunaAI-Next-Candidate\control','C:\AI\RunaAI-Next-Candidate\releases',
  'C:\AI\RunaAI-Next-Candidate\secrets','C:\AI\RunaAI-Next-Candidate\staging'
)}
function Critical-Hashes{
  $values=[ordered]@{}
  foreach($path in Critical-Paths){
    if(-not(Test-Path -LiteralPath $path -PathType Container)){throw 'ancestor-critical-path-missing'}
    $values[$path]=[RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($path)
  }
  $values
}

if($rootPath-ne'C:\AI\RunaAI-Next-Candidate'-or
  -not$sourcePath.StartsWith("$rootPath\staging\gate7e-source-",[StringComparison]::OrdinalIgnoreCase)-or
  $ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or$ExpectedPriorCommit-notmatch'^[a-f0-9]{40}$'-or
  $ExpectedPriorReleaseId-notmatch'^[A-Za-z0-9._-]{1,100}$'-or
  -not(Valid-Hash $ExpectedDaclSha256)-or-not(Valid-Hash $ExpectedCurrentNonDaclSha256)-or
  -not(Valid-Hash $ExpectedTargetNonDaclSha256)-or$ExpectedTargetControlFlags-lt0-or
  $ExpectedTargetControlFlags-gt[UInt16]::MaxValue-or$TaskName-notmatch'^[A-Za-z0-9._-]{1,100}$'){
  throw 'ancestor-repair-pin-invalid'
}

if($Worker){
  $record=$null;$snapshot=$null;$before=$null;$rollbackRestored=$false
  try{
    if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or
      [Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'NT AUTHORITY\SYSTEM'-or
      -not$ResultPath-or[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ResultPath))-ne(Join-Path $rootPath 'staging')){
      throw 'ancestor-worker-context-invalid'
    }
    Load-Operator
    $before=Inspect-Target
    if($before.DaclSha256-ne$ExpectedDaclSha256-or
      $before.NonDaclSha256-ne$ExpectedCurrentNonDaclSha256-or
      $before.AllApplicationPackagesExactCount-ne0-or
      $before.AllRestrictedApplicationPackagesExactCount-ne0-or
      $before.AllApplicationPackagesConflictCount-ne0-or
      $before.AllRestrictedApplicationPackagesConflictCount-ne0){throw 'ancestor-starting-state-invalid'}
    $snapshot=[RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($target)
    $criticalBefore=Critical-Hashes
    $mutation=[RunaAI.Next.Gate7E.TargetOnlyAcl]::RecoverAndEnsureHostPreparation(
      $target,$ExpectedDaclSha256,$ExpectedCurrentNonDaclSha256,
      $ExpectedTargetControlFlags,$ExpectedTargetNonDaclSha256)
    $after=Inspect-Target
    if($after.AllApplicationPackagesExactCount-ne1-or
      $after.AllRestrictedApplicationPackagesExactCount-ne1-or
      $after.AllApplicationPackagesConflictCount-ne0-or
      $after.AllRestrictedApplicationPackagesConflictCount-ne0-or
      $after.NonDaclSha256-ne$ExpectedTargetNonDaclSha256-or
      $after.ControlFlagsValue-ne$ExpectedTargetControlFlags-or
      $after.OwnershipSha256-ne$before.OwnershipSha256-or
      $after.DaclProtected-ne$before.DaclProtected-or$after.DaclDefaulted-ne$before.DaclDefaulted){
      throw 'ancestor-final-state-invalid'
    }
    $criticalAfter=Critical-Hashes
    foreach($path in Critical-Paths){if($criticalBefore[$path]-ne$criticalAfter[$path]){throw 'ancestor-critical-path-drift'}}
    $record=[ordered]@{schemaVersion='runa2-gate7e-sandbox-ancestor-repair/v1';passed=$true;
      systemContext=$true;targetChanged=$mutation.Changed;addedTupleCount=$mutation.AddedCount;
      firstTupleCount=$after.AllApplicationPackagesExactCount;
      secondTupleCount=$after.AllRestrictedApplicationPackagesExactCount;
      targetControlFlags=$after.ControlFlagsValue;descendantSampleCount=$criticalAfter.Count;
      descendantDaclStable=$true;productionApplicationChanged=$false;privateValuesIncluded=$false}
  }catch{
    $safeCode=if([string]$_.Exception.Message-match'^[a-z0-9-]{1,100}$'){[string]$_.Exception.Message}else{'ancestor-repair-failed'}
    if($snapshot-and$before){
      try{
        $current=Inspect-Target
        [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDaclAndControlFlags($target,
          $current.DaclSha256,$current.NonDaclSha256,$snapshot,$before.ControlFlagsValue,
          $before.NonDaclSha256)|Out-Null
        $restored=Inspect-Target
        $rollbackRestored=$restored.DaclSha256-eq$before.DaclSha256-and
          $restored.NonDaclSha256-eq$before.NonDaclSha256
      }catch{$safeCode='ancestor-repair-and-rollback-failed'}
    }
    $record=[ordered]@{schemaVersion='runa2-gate7e-sandbox-ancestor-repair-error/v1';
      passed=$false;errorCode=$safeCode;rollbackRestored=$rollbackRestored;
      productionApplicationChanged=$false;privateValuesIncluded=$false}
  }
  Write-ExclusiveJson $ResultPath $record
  exit $(if($record.passed){0}else{1})
}

if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or
  [Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'ancestor-main-context-invalid'
}
foreach($path in @($sourcePath,$operatorSource,$PSCommandPath)){if(-not(Test-Path -LiteralPath $path)){throw 'ancestor-input-missing'}}
$head=(& git -C $sourcePath rev-parse HEAD 2>$null).Trim();$headExit=$LASTEXITCODE
$tracked=(& git -C $sourcePath status --porcelain --untracked-files=no 2>$null)-join'';$statusExit=$LASTEXITCODE
if($headExit-ne0-or$statusExit-ne0-or$head-ne$ExpectedCommit-or$tracked){throw 'ancestor-source-authority-mismatch'}
$runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
if($runtime.running.releaseId-ne$ExpectedPriorReleaseId-or$runtime.running.commit-ne$ExpectedPriorCommit){throw 'ancestor-active-release-drift'}
if(Get-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction SilentlyContinue){throw 'ancestor-task-exists'}
$ResultPath=Join-Path $rootPath 'staging\gate7e-sandbox-ancestor-result.json'
Remove-Item -LiteralPath $ResultPath -Force -ErrorAction SilentlyContinue
$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"'-f$PSCommandPath),
  '-SourceRoot',('"{0}"'-f$sourcePath),'-ExpectedCommit',$ExpectedCommit,
  '-ExpectedDaclSha256',$ExpectedDaclSha256,'-ExpectedCurrentNonDaclSha256',$ExpectedCurrentNonDaclSha256,
  '-ExpectedTargetNonDaclSha256',$ExpectedTargetNonDaclSha256,'-ExpectedTargetControlFlags',$ExpectedTargetControlFlags,
  '-ExpectedPriorReleaseId',$ExpectedPriorReleaseId,'-ExpectedPriorCommit',$ExpectedPriorCommit,
  '-Root',('"{0}"'-f$rootPath),'-TaskName',$TaskName,'-Worker','-ResultPath',('"{0}"'-f$ResultPath))-join' '
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
try{
  Register-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -Action $action -Principal $principal -Settings $settings|Out-Null
  Start-ScheduledTask -TaskPath $taskPath -TaskName $TaskName
  $deadline=[DateTime]::UtcNow.AddMinutes(2)
  do{Start-Sleep -Milliseconds 500;$exists=Test-Path -LiteralPath $ResultPath;$state=(Get-ScheduledTask -TaskPath $taskPath -TaskName $TaskName).State}until($exists-or($state-ne'Running'-and$state-ne'Queued')-or[DateTime]::UtcNow-gt$deadline)
  $info=Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $TaskName
  if(-not(Test-Path -LiteralPath $ResultPath -PathType Leaf)){throw "ancestor-result-missing:$($info.LastTaskResult)"}
  $receipt=Get-Content -Raw -LiteralPath $ResultPath|ConvertFrom-Json
  if($receipt.passed-ne$true-or$receipt.privateValuesIncluded-ne$false){throw "ancestor-repair-failed:$($receipt.errorCode)"}
  $afterRuntime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  if($afterRuntime.running.releaseId-ne$ExpectedPriorReleaseId-or$afterRuntime.running.commit-ne$ExpectedPriorCommit){throw 'ancestor-active-release-changed'}
  $receipt|Add-Member -NotePropertyName taskLastResult -NotePropertyValue ([int64]$info.LastTaskResult)
  $receipt|Add-Member -NotePropertyName taskRetained -NotePropertyValue $false
  $receipt|Add-Member -NotePropertyName activeReleaseUnchanged -NotePropertyValue $true
  $receipt|ConvertTo-Json -Compress -Depth 8
}finally{
  Stop-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ResultPath -Force -ErrorAction SilentlyContinue
}
