[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Rehearse','Reconcile','RecoverAndReconcile')][string]$Mode,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedRootDaclSha256,
  [Parameter(Mandatory)][string]$ExpectedScriptSha256,
  [Parameter(Mandatory)][string]$ExpectedSourceSha256,
  [Parameter(Mandatory)][string]$ExpectedTestSha256,
  [Parameter(Mandatory)][string]$ExpectedPriorReleaseId,
  [Parameter(Mandatory)][string]$ExpectedPriorCommit,
  [string]$ExpectedCurrentNonDaclSha256 = 'not-required',
  [string]$ExpectedTargetNonDaclSha256 = 'not-required',
  [int]$ExpectedTargetControlFlags = -1,
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [switch]$Worker,
  [string]$ResultPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$systemDriveRoot = 'C:\'
$scriptPath = [IO.Path]::GetFullPath($MyInvocation.MyCommand.Path)

if ($ExpectedCommit -notmatch '^[a-f0-9]{40}$' -or
    $ExpectedPriorCommit -notmatch '^[a-f0-9]{40}$' -or
    $ExpectedPriorReleaseId -notmatch '^[A-Za-z0-9._-]{1,100}$') {
  throw 'target-only-host-repair-pin-invalid'
}
foreach ($value in @($ExpectedRootDaclSha256, $ExpectedScriptSha256,
    $ExpectedSourceSha256, $ExpectedTestSha256)) {
  if ($value -notmatch '^[a-f0-9]{64}$') { throw 'target-only-host-repair-pin-invalid' }
}
if ($Mode -eq 'RecoverAndReconcile' -and (
    $ExpectedCurrentNonDaclSha256 -notmatch '^[a-f0-9]{64}$' -or
    $ExpectedTargetNonDaclSha256 -notmatch '^[a-f0-9]{64}$' -or
    $ExpectedTargetControlFlags -lt 0 -or $ExpectedTargetControlFlags -gt [UInt16]::MaxValue)) {
  throw 'target-only-host-repair-pin-invalid'
}
$taskPath = '\RunaAI-Next\'
$taskName = "Gate7E-TargetOnly-$Mode-$($ExpectedCommit.Substring(0,7))"
$stage = Join-Path $Root "staging\gate7e-target-only-host-repair-$($ExpectedCommit.Substring(0,7))"
$expectedScriptPath = Join-Path $stage 'Invoke-ControlTargetOnlyHostRepair.ps1'
$sourcePath = Join-Path $stage 'TargetOnlyAcl.cs'
$testPath = Join-Path $stage 'Test-TargetOnlyAcl.ps1'

function Hash([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'target-only-staged-file-missing' }
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Safe-Code([System.Management.Automation.ErrorRecord]$Record) {
  $text = $Record.Exception.ToString()
  foreach ($code in @(
    'target-dacl-hash-mismatch', 'target-sid-conflict', 'target-sid-duplicate',
    'target-dacl-tuple-postcondition-failed', 'target-ownership-postcondition-failed',
    'target-dacl-control-postcondition-failed', 'target-only-dacl-write-failed',
    'target-recovery-starting-state-mismatch', 'target-recovery-metadata-postcondition-failed',
    'target-control-restore-starting-state-mismatch', 'target-control-restore-postcondition-failed',
    'automatic-control-rollback-verification-failed',
    'target-only-control-mutation-and-rollback-failed',
    'automatic-rollback-verification-failed', 'target-only-mutation-and-rollback-failed',
    'snapshot-restore-postcondition-failed', 'snapshot-restore-metadata-drift',
    'target-only-rehearsal-invalid', 'target-only-critical-path-drift',
    'target-only-root-starting-state-invalid', 'target-only-root-final-state-invalid'
  )) {
    if ($text.Contains($code)) { return $code }
  }
  'target-only-host-repair-failed'
}

function Write-ExclusiveJson([string]$Path, [object]$Value) {
  $json = $Value | ConvertTo-Json -Compress -Depth 5
  $encoding = New-Object Text.UTF8Encoding($false)
  $stream = New-Object IO.FileStream($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write,
    [IO.FileShare]::None)
  try {
    $bytes = $encoding.GetBytes($json + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
  } finally {
    $stream.Dispose()
  }
}

function Load-Operator {
  if (-not ('RunaAI.Next.Gate7E.TargetOnlyAcl' -as [type])) { Add-Type -Path $sourcePath }
}

function Inspect-Root {
  Load-Operator
  [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($systemDriveRoot)
}

function Critical-Paths {
  @(
    'C:\AI',
    'C:\AI\RunaAI-Next-Candidate',
    'C:\AI\RunaAI-Next-Candidate\config',
    'C:\AI\RunaAI-Next-Candidate\control',
    'C:\AI\RunaAI-Next-Candidate\releases',
    'C:\AI\RunaAI-Next-Candidate\secrets',
    'C:\Program Files',
    'C:\ProgramData',
    'C:\Users',
    'C:\Windows'
  )
}

function Critical-Hashes {
  $values = [ordered]@{}
  foreach ($path in Critical-Paths) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
      throw 'target-only-critical-path-missing'
    }
    $values[$path] = [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($path)
  }
  $values
}

if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate' -or
    $scriptPath -ne $expectedScriptPath) {
  throw 'target-only-host-repair-pin-invalid'
}
if ((Hash $scriptPath) -ne $ExpectedScriptSha256 -or
    (Hash $sourcePath) -ne $ExpectedSourceSha256 -or
    (Hash $testPath) -ne $ExpectedTestSha256) {
  throw 'target-only-host-repair-hash-mismatch'
}

if ($Worker) {
  $record = $null
  $snapshot = $null
  $snapshotNonDacl = $null
  $snapshotControlFlags = $null
  $mutationApplied = $false
  $rollbackRestored = $false
  try {
    if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
        [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'NT AUTHORITY\SYSTEM' -or
        -not $ResultPath -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ResultPath)) -ne $stage) {
      throw 'target-only-worker-context-invalid'
    }
    if (Test-Path -LiteralPath $ResultPath) { throw 'target-only-result-path-exists' }

    if ($Mode -eq 'Rehearse') {
      $testOutput = & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
        -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $testPath `
        -RequirePrivilegedControlTests 2>&1
      $testExit = $LASTEXITCODE
      $testText = (@($testOutput | ForEach-Object { [string]$_ }) -join "`n").Trim()
      if ($testExit -ne 0) { throw 'target-only-rehearsal-invalid' }
      $testResult = $testText | ConvertFrom-Json
      if ($testResult.passed -ne $true -or $testResult.descendantDaclStable -ne $true -or
          $testResult.exactRestore -ne $true -or $testResult.conflictRejected -ne $true -or
          $testResult.duplicateRejected -ne $true -or
          $testResult.protectedDaclPreserved -ne $true -or
          $testResult.metadataRecoveryPassed -ne $true -or
          $testResult.privilegedControlTestsRun -ne $true -or
          $testResult.privateValuesIncluded -ne $false) {
        throw 'target-only-rehearsal-invalid'
      }
      $record = [ordered]@{
        schemaVersion = 'runa2-gate7e-target-only-control-rehearsal/v1'
        passed = $true
        systemContext = $true
        applyAndRestorePassed = $true
        descendantDaclStable = $true
        conflictRejected = $true
        duplicateRejected = $true
        protectedDaclPreserved = $true
        metadataRecoveryPassed = $true
        productionChanged = $false
        privateValuesIncluded = $false
      }
    } else {
      Load-Operator
      $before = Inspect-Root
      if ($before.DaclSha256 -ne $ExpectedRootDaclSha256 -or
          $before.AllApplicationPackagesExactCount -ne 1 -or
          $before.AllRestrictedApplicationPackagesExactCount -ne 0 -or
          $before.AllApplicationPackagesConflictCount -ne 0 -or
          $before.AllRestrictedApplicationPackagesConflictCount -ne 0) {
        throw 'target-only-root-starting-state-invalid'
      }
      if ($Mode -eq 'RecoverAndReconcile' -and
          $before.NonDaclSha256 -ne $ExpectedCurrentNonDaclSha256) {
        throw 'target-recovery-starting-state-mismatch'
      }
      $snapshot = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($systemDriveRoot)
      $snapshotNonDacl = $before.NonDaclSha256
      $snapshotControlFlags = $before.ControlFlagsValue
      $criticalBefore = Critical-Hashes
      if ($Mode -eq 'RecoverAndReconcile') {
        $mutation = [RunaAI.Next.Gate7E.TargetOnlyAcl]::RecoverAndEnsureHostPreparation(
          $systemDriveRoot,
          $ExpectedRootDaclSha256,
          $ExpectedCurrentNonDaclSha256,
          $ExpectedTargetControlFlags,
          $ExpectedTargetNonDaclSha256
        )
      } else {
        $mutation = [RunaAI.Next.Gate7E.TargetOnlyAcl]::EnsureHostPreparation(
          $systemDriveRoot,
          $ExpectedRootDaclSha256
        )
      }
      $mutationApplied = $mutation.Changed
      $after = Inspect-Root
      if ($after.AllApplicationPackagesExactCount -ne 1 -or
          $after.AllRestrictedApplicationPackagesExactCount -ne 1 -or
          $after.AllApplicationPackagesConflictCount -ne 0 -or
          $after.AllRestrictedApplicationPackagesConflictCount -ne 0 -or
          $after.OwnershipSha256 -ne $before.OwnershipSha256 -or
          $after.DaclProtected -ne $before.DaclProtected -or
          $after.DaclDefaulted -ne $before.DaclDefaulted) {
        if ($Mode -ne 'RecoverAndReconcile') { throw 'target-only-root-final-state-invalid' }
      }
      if ($Mode -eq 'RecoverAndReconcile' -and (
          $after.NonDaclSha256 -ne $ExpectedTargetNonDaclSha256 -or
          $after.ControlFlagsValue -ne $ExpectedTargetControlFlags -or
          $after.OwnershipSha256 -ne $before.OwnershipSha256)) {
        throw 'target-recovery-metadata-postcondition-failed'
      }
      $criticalAfter = Critical-Hashes
      foreach ($path in Critical-Paths) {
        if ($criticalBefore[$path] -ne $criticalAfter[$path]) {
          throw 'target-only-critical-path-drift'
        }
      }
      $record = [ordered]@{
        schemaVersion = 'runa2-gate7e-target-only-control-reconciliation/v1'
        passed = $true
        systemContext = $true
        rootChanged = $mutation.Changed
        addedTupleCount = $mutation.AddedCount
        firstTupleCount = $after.AllApplicationPackagesExactCount
        secondTupleCount = $after.AllRestrictedApplicationPackagesExactCount
        descendantSampleCount = $criticalAfter.Count
        descendantDaclStable = $true
        rollbackRequired = $false
        metadataRecovered = $Mode -eq 'RecoverAndReconcile'
        productionApplicationChanged = $false
        privateValuesIncluded = $false
      }
    }
  } catch {
    $failureCode = Safe-Code $_
    if ($Mode -ne 'Rehearse' -and $snapshot) {
      try {
        Load-Operator
        $current = Inspect-Root
        if ($Mode -eq 'RecoverAndReconcile' -and (
            $current.DaclSha256 -ne $ExpectedRootDaclSha256 -or
            $current.NonDaclSha256 -ne $snapshotNonDacl)) {
          [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDaclAndControlFlags(
            $systemDriveRoot,
            $current.DaclSha256,
            $current.NonDaclSha256,
            $snapshot,
            $snapshotControlFlags,
            $snapshotNonDacl
          ) | Out-Null
        } elseif ($current.DaclSha256 -ne $ExpectedRootDaclSha256) {
          [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDacl(
            $systemDriveRoot,
            $current.DaclSha256,
            $snapshot
          ) | Out-Null
        }
        $restored = Inspect-Root
        $rollbackRestored = $restored.DaclSha256 -eq $ExpectedRootDaclSha256 -and
          $restored.AllApplicationPackagesExactCount -eq 1 -and
          $restored.AllRestrictedApplicationPackagesExactCount -eq 0 -and
          ($Mode -ne 'RecoverAndReconcile' -or $restored.NonDaclSha256 -eq $snapshotNonDacl)
      } catch {
        $failureCode = 'target-only-reconciliation-and-rollback-failed'
      }
    }
    $record = [ordered]@{
      schemaVersion = 'runa2-gate7e-target-only-control-error/v1'
      passed = $false
      errorCode = $failureCode
      rollbackRestored = $rollbackRestored
      productionApplicationChanged = $false
      privateValuesIncluded = $false
    }
  }
  Write-ExclusiveJson $ResultPath $record
  if ($record.passed -ne $true) { exit 1 }
  exit 0
}

if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'target-only-main-context-invalid'
}
if (Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw 'target-only-task-already-exists'
}
$runtime = Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$readiness = Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
if ($runtime.running.releaseId -ne $ExpectedPriorReleaseId -or
    $runtime.running.commit -ne $ExpectedPriorCommit -or
    $readiness.authority -ne 'active' -or $readiness.protectedDataImported -ne $true -or
    $readiness.productionTrafficChanged -ne $true) {
  throw 'target-only-active-release-drift'
}
$rootState = Inspect-Root
if ($rootState.DaclSha256 -ne $ExpectedRootDaclSha256 -or
    $rootState.AllApplicationPackagesExactCount -ne 1 -or
    $rootState.AllRestrictedApplicationPackagesExactCount -ne 0 -or
    $rootState.AllApplicationPackagesConflictCount -ne 0 -or
    $rootState.AllRestrictedApplicationPackagesConflictCount -ne 0) {
  throw 'target-only-root-starting-state-invalid'
}
if ($Mode -eq 'RecoverAndReconcile' -and
    $rootState.NonDaclSha256 -ne $ExpectedCurrentNonDaclSha256) {
  throw 'target-recovery-starting-state-mismatch'
}

$ResultPath = Join-Path $stage ("result-$($Mode.ToLowerInvariant()).json")
if (Test-Path -LiteralPath $ResultPath) { throw 'target-only-result-path-exists' }
$powerShell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = @(
  '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', ('"' + $scriptPath + '"'),
  '-Mode', $Mode,
  '-ExpectedCommit', $ExpectedCommit,
  '-ExpectedRootDaclSha256', $ExpectedRootDaclSha256,
  '-ExpectedScriptSha256', $ExpectedScriptSha256,
  '-ExpectedSourceSha256', $ExpectedSourceSha256,
  '-ExpectedTestSha256', $ExpectedTestSha256,
  '-ExpectedPriorReleaseId', $ExpectedPriorReleaseId,
  '-ExpectedPriorCommit', $ExpectedPriorCommit,
  '-ExpectedCurrentNonDaclSha256', $ExpectedCurrentNonDaclSha256,
  '-ExpectedTargetNonDaclSha256', $ExpectedTargetNonDaclSha256,
  '-ExpectedTargetControlFlags', $ExpectedTargetControlFlags,
  '-Root', ('"' + $Root + '"'),
  '-Worker',
  '-ResultPath', ('"' + $ResultPath + '"')
) -join ' '
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Action $action `
  -Principal $principal -Settings $settings | Out-Null
$timedOut = $false
$taskInfo = $null
try {
  $startedAt = [DateTime]::UtcNow
  Start-ScheduledTask -TaskPath $taskPath -TaskName $taskName
  $deadline = $startedAt.AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 250
    $task = Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName
    $taskInfo = Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $taskName
    $completed = $taskInfo.LastRunTime.ToUniversalTime() -ge $startedAt.AddSeconds(-1) -and
      $task.State -ne 'Running'
  } until ($completed -or [DateTime]::UtcNow -ge $deadline)
  if (-not $completed) {
    $timedOut = $true
    Stop-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue
  }
} finally {
  Unregister-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Confirm:$false `
    -ErrorAction SilentlyContinue
}

if ($timedOut -or -not (Test-Path -LiteralPath $ResultPath -PathType Leaf)) {
  throw 'target-only-task-result-unavailable'
}
try {
  $result = Get-Content -Raw -LiteralPath $ResultPath | ConvertFrom-Json
} finally {
  Remove-Item -LiteralPath $ResultPath -Force -ErrorAction SilentlyContinue
}
$afterRuntime = Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
if ($afterRuntime.running.releaseId -ne $ExpectedPriorReleaseId -or
    $afterRuntime.running.commit -ne $ExpectedPriorCommit) {
  throw 'target-only-active-release-changed'
}
if ($result.passed -ne $true -or $result.privateValuesIncluded -ne $false) {
  $safeCode = if ([string]$result.errorCode -match '^[a-z0-9-]{1,100}$') {
    [string]$result.errorCode
  } else {
    'target-only-host-repair-failed'
  }
  throw "target-only-host-repair-failed:$safeCode"
}
if ($taskInfo.LastTaskResult -ne 0) {
  throw 'target-only-task-failed'
}
$result | Add-Member -NotePropertyName taskRetained -NotePropertyValue (
  $null -ne (Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue)
)
$result | Add-Member -NotePropertyName activeReleaseUnchanged -NotePropertyValue $true
$result | ConvertTo-Json -Compress -Depth 5
