[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$worktree = 'D:\Projects\Runalab\runaai-next-native-control-host'
$parentRelative = 'gate7f/function-first/Invoke-NativeGate3ResourceOwnershipProofBounded.ps1'
$inner = [IO.Path]::Combine($worktree, 'gate7f', 'function-first', 'Invoke-NativeGate3ResourceOwnershipProof.ps1')
$innerSha256 = 'CD3E4209345AC09E5E11D8DFE8F7F6CC6778A85C33A54AA8AEFA117458F368C2'
$evidenceRoot = [IO.Path]::Combine($worktree, 'artifacts', 'runs', 'native-gate3-production-resource-ownership-parent-03')
$stdoutPath = [IO.Path]::Combine($evidenceRoot, 'stdout.log')
$stderrPath = [IO.Path]::Combine($evidenceRoot, 'stderr.log')
$resultPath = [IO.Path]::Combine($evidenceRoot, 'result.json')
$expectedPowerShellCoreHome = 'C:\Users\matth\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell'
$expectedCurrentPowerShell = [IO.Path]::Combine($expectedPowerShellCoreHome, 'pwsh.exe')
$outerDeadlineMs = 600000
$failures = [System.Collections.Generic.List[string]]::new()
$runner = $null
$runnerStartUtcTicks = $null
$runnerExecutable = $null
$stdoutTask = $null
$stderrTask = $null
$childOutputCaptured = $false
$greenResult = $null
$head = $null

function Add-Failure([string]$Message) {
  if (-not [string]::IsNullOrWhiteSpace($Message)) { $script:failures.Add($Message) }
}

function Same-Path([string]$Left, [string]$Right) {
  return [string]::Equals([IO.Path]::GetFullPath($Left).TrimEnd('\'),
    [IO.Path]::GetFullPath($Right).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

function Get-DotNetSha256([string]$Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  if (-not [IO.File]::Exists($fullPath)) { throw "hash-target-not-file:$Path" }
  $attributes = [IO.File]::GetAttributes($fullPath)
  if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) { throw "hash-target-not-file:$Path" }
  if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "hash-target-is-reparse-point:$Path" }
  $stream = [IO.File]::Open($fullPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return ([Convert]::ToHexString($hasher.ComputeHash($stream)))
  } finally {
    $hasher.Dispose()
    $stream.Dispose()
  }
}

function Test-ExactRunnerAlive {
  if ($null -eq $runner -or $null -eq $runnerStartUtcTicks -or $null -eq $runnerExecutable) { return $false }
  try {
    $candidate = [Diagnostics.Process]::GetProcessById($runner.Id)
  } catch [ArgumentException] {
    return $false
  }
  try {
    return $candidate.StartTime.ToUniversalTime().Ticks -eq $runnerStartUtcTicks -and
      (Same-Path $candidate.MainModule.FileName $runnerExecutable)
  } finally {
    $candidate.Dispose()
  }
}

function Complete-OwnedProcessOutput {
  if ($childOutputCaptured -or $null -eq $stdoutTask -or $null -eq $stderrTask) { return }
  $outputTasks = [Threading.Tasks.Task[]]@($stdoutTask, $stderrTask)
  if (-not [Threading.Tasks.Task]::WaitAll($outputTasks, 10000)) {
    throw 'bounded-parent-child-output-terminal-timeout'
  }
  [IO.File]::WriteAllText($stdoutPath, $stdoutTask.Result, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($stderrPath, $stderrTask.Result, [Text.UTF8Encoding]::new($false))
  $script:childOutputCaptured = $true
}

function Stop-OwnedProcessTree {
  if ($null -eq $runner) { return }
  $runner.Refresh()
  if (-not $runner.HasExited) {
    try { $runner.Kill($true) } catch [InvalidOperationException] {
      if (Test-ExactRunnerAlive) { throw }
    }
    if (-not $runner.WaitForExit(30000)) { throw "bounded-parent-child-exit-timeout:$($runner.Id)" }
    $runner.Refresh()
  }
  if (-not $runner.HasExited -or (Test-ExactRunnerAlive)) {
    throw "bounded-parent-child-did-not-exit:$($runner.Id)"
  }
}

try {
  $currentProcess = [Diagnostics.Process]::GetCurrentProcess()
  try { $currentPowerShell = $currentProcess.MainModule.FileName } finally { $currentProcess.Dispose() }
  if ($PSVersionTable.PSEdition -cne 'Core' -or $PSVersionTable.PSVersion.ToString() -cne '7.6.5' -or
      -not (Same-Path $PSHOME $expectedPowerShellCoreHome) -or
      -not (Same-Path $currentPowerShell $expectedCurrentPowerShell) -or
      (Get-DotNetSha256 $currentPowerShell) -cne '362A356CE7F0940EC74F73A8FC2C990A2CC24A38A11C90BBD8ECA947110AD139') {
    throw 'bounded-parent-powershell-core-identity-invalid'
  }
  $env:PSModulePath = [IO.Path]::Combine($expectedPowerShellCoreHome, 'Modules')
  if (-not (Same-Path (Get-Location).Path $worktree)) { throw 'bounded-parent-working-directory-mismatch' }
  if (Test-Path -LiteralPath $evidenceRoot) { throw 'bounded-parent-evidence-root-already-exists' }
  $status = @(& git -c core.excludesFile= -c safe.directory=$worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) { throw 'bounded-parent-worktree-must-be-clean' }
  $head = (& git -c core.excludesFile= -c safe.directory=$worktree rev-parse HEAD).Trim()
  $parentCommit = (& git -c core.excludesFile= -c safe.directory=$worktree log -1 --format=%H -- $parentRelative).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[a-f0-9]{40}$' -or $parentCommit -cne $head) {
    throw 'bounded-parent-reviewed-head-invalid'
  }
  $actualInnerSha256 = Get-DotNetSha256 $inner
  if ($actualInnerSha256 -cne $innerSha256) { throw "bounded-parent-inner-hash-mismatch:$actualInnerSha256" }
  $powershell = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
  $windowsPowerShellHome = Split-Path -Parent $powershell
  $windowsPowerShellModuleRoot = Join-Path $windowsPowerShellHome 'Modules'
  $utilityModuleManifest = Join-Path $windowsPowerShellModuleRoot 'Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
  $utilityModuleImplementation = Join-Path $windowsPowerShellModuleRoot 'Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psm1'
  $powershellIdentityInvalid = [Diagnostics.FileVersionInfo]::GetVersionInfo($powershell).FileVersion -cne '10.0.26100.8972 (WinBuild.160101.0800)'
  $powershellIdentityInvalid = $powershellIdentityInvalid -or (Get-DotNetSha256 $powershell) -cne '7600FFE12DA441FE89D035B13801E8E91D064BC544A27B19A5CF49F6AB8B18F5'
  if ($powershellIdentityInvalid) {
    throw 'bounded-parent-windows-powershell-identity-invalid'
  }
  foreach ($modulePin in ([ordered]@{
      $utilityModuleManifest = 'C09DF190ADDC67F7C6C38E7EA1DCA719FD87807107F688C3F60ED8816E1C48A6'
      $utilityModuleImplementation = 'F9232F3DE3C94DD03CAF40F54B22876C9D810C657C41E54AB2D10469B45F26B5'
    }).GetEnumerator()) {
    if ((Get-DotNetSha256 $modulePin.Key) -cne $modulePin.Value) {
      throw "bounded-parent-windows-powershell-module-identity-invalid:$($modulePin.Key)"
    }
  }
  New-Item -ItemType Directory -Path $evidenceRoot -ErrorAction Stop | Out-Null
  [IO.File]::WriteAllBytes($stdoutPath, [byte[]]@())
  [IO.File]::WriteAllBytes($stderrPath, [byte[]]@())
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $powershell
  $startInfo.WorkingDirectory = $worktree
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $inner)) {
    [void]$startInfo.ArgumentList.Add($argument)
  }
  $startInfo.Environment['PSModulePath'] = $windowsPowerShellModuleRoot
  $startInfo.Environment['RUNAAI_GATE3_RESOURCE_PROOF_PARENT'] = 'runaai-native-gate3-resource-ownership-parent/v1'
  $startInfo.Environment['RUNAAI_WINDOWS_POWERSHELL_MODULE_PATH'] = $windowsPowerShellModuleRoot
  $runner = [Diagnostics.Process]::new()
  $runner.StartInfo = $startInfo
  if (-not $runner.Start()) { throw 'bounded-parent-child-start-failed' }
  $runnerStartUtcTicks = $runner.StartTime.ToUniversalTime().Ticks
  $runnerExecutable = $powershell
  $stdoutTask = $runner.StandardOutput.ReadToEndAsync()
  $stderrTask = $runner.StandardError.ReadToEndAsync()
  if (-not $runner.WaitForExit($outerDeadlineMs)) {
    Stop-OwnedProcessTree
    throw "bounded-parent-outer-timeout:$outerDeadlineMs"
  }
  $runner.WaitForExit()
  Complete-OwnedProcessOutput
  if ($runner.ExitCode -ne 0) { throw "bounded-parent-child-failed:$($runner.ExitCode)" }
  $stderr = $stderrTask.Result
  if (-not [string]::IsNullOrWhiteSpace($stderr)) { throw 'bounded-parent-child-stderr-not-empty' }
  $stdout = $stdoutTask.Result
  $parsed = $stdout | ConvertFrom-Json
  $expectedChildProperties = @('candidateSessionsAfterEarlyFailure', 'candidateSessionsAfterM1Failure',
    'dependencyManifestSha256', 'fail', 'fixtureRootCleaned', 'head', 'modelInvoked', 'nodeVersion', 'pass', 'passed',
    'postgresProcessId', 'postgresVersion', 'powershellEdition', 'powershellHome', 'privateValuesIncluded',
    'productionChanged', 'schemaVersion', 'syntheticClusterStopped', 'tests', 'utilityModule') | Sort-Object
  $actualChildProperties = @($parsed.PSObject.Properties.Name | Sort-Object)
  if (@(Compare-Object -ReferenceObject $expectedChildProperties -DifferenceObject $actualChildProperties).Count -ne 0) {
    throw 'bounded-parent-child-result-shape-invalid'
  }
  $childResultInvalid = $parsed.schemaVersion -cne 'runaai-native-gate3-resource-ownership-proof/v1'
  $childResultInvalid = $childResultInvalid -or $parsed.passed -ne $true -or $parsed.head -cne $head
  $childResultInvalid = $childResultInvalid -or $parsed.tests -ne 1 -or $parsed.pass -ne 1 -or $parsed.fail -ne 0
  $childResultInvalid = $childResultInvalid -or $parsed.nodeVersion -cne 'v22.22.0'
  $childResultInvalid = $childResultInvalid -or $parsed.postgresVersion -cne 'postgres (PostgreSQL) 18.6'
  $childResultInvalid = $childResultInvalid -or $parsed.powershellEdition -cne 'Desktop'
  $childResultInvalid = $childResultInvalid -or -not (Same-Path $parsed.powershellHome $windowsPowerShellHome)
  $expectedUtilityProperties = @('commandSource', 'commandType', 'implementationPath', 'implementationSha256',
    'manifestPath', 'manifestSha256', 'moduleGuid', 'moduleVersion') | Sort-Object
  $actualUtilityProperties = @($parsed.utilityModule.PSObject.Properties.Name | Sort-Object)
  $childResultInvalid = $childResultInvalid -or
    @(Compare-Object -ReferenceObject $expectedUtilityProperties -DifferenceObject $actualUtilityProperties).Count -ne 0
  $childResultInvalid = $childResultInvalid -or $parsed.utilityModule.commandType -cne 'Function'
  $childResultInvalid = $childResultInvalid -or $parsed.utilityModule.commandSource -cne 'Microsoft.PowerShell.Utility'
  $childResultInvalid = $childResultInvalid -or $parsed.utilityModule.moduleGuid -cne '1da87e53-152b-403e-98dc-74d7b4d63d59'
  $childResultInvalid = $childResultInvalid -or $parsed.utilityModule.moduleVersion -cne '3.1.0.0'
  $childResultInvalid = $childResultInvalid -or -not (Same-Path $parsed.utilityModule.manifestPath $utilityModuleManifest)
  $childResultInvalid = $childResultInvalid -or -not (Same-Path $parsed.utilityModule.implementationPath $utilityModuleImplementation)
  $childResultInvalid = $childResultInvalid -or $parsed.utilityModule.manifestSha256 -cne 'C09DF190ADDC67F7C6C38E7EA1DCA719FD87807107F688C3F60ED8816E1C48A6'
  $childResultInvalid = $childResultInvalid -or $parsed.utilityModule.implementationSha256 -cne 'F9232F3DE3C94DD03CAF40F54B22876C9D810C657C41E54AB2D10469B45F26B5'
  $childResultInvalid = $childResultInvalid -or $parsed.dependencyManifestSha256 -cne 'b49d965cc9f73536b5dfd19b1aa341f0308bcbf90b174e5654789c77b5ede151'
  $childResultInvalid = $childResultInvalid -or $parsed.postgresProcessId -lt 1
  $childResultInvalid = $childResultInvalid -or $parsed.candidateSessionsAfterEarlyFailure -ne 0
  $childResultInvalid = $childResultInvalid -or $parsed.candidateSessionsAfterM1Failure -ne 0
  $childResultInvalid = $childResultInvalid -or $parsed.syntheticClusterStopped -ne $true
  $childResultInvalid = $childResultInvalid -or $parsed.fixtureRootCleaned -ne $true
  $childResultInvalid = $childResultInvalid -or $parsed.modelInvoked -ne $false
  $childResultInvalid = $childResultInvalid -or $parsed.productionChanged -ne $false
  $childResultInvalid = $childResultInvalid -or $parsed.privateValuesIncluded -ne $false
  if ($childResultInvalid) {
    throw 'bounded-parent-child-result-invalid'
  }
  $greenResult = [ordered]@{ schemaVersion = 'runaai-native-gate3-resource-ownership-parent-result/v1'
    passed = $true; head = $head; innerSha256 = $actualInnerSha256; innerProcessId = $runner.Id
    wholeOperatorDeadlineMs = $outerDeadlineMs; child = $parsed; privateValuesIncluded = $false }
} catch {
  Add-Failure $_.Exception.Message
} finally {
  try { Stop-OwnedProcessTree } catch { Add-Failure "bounded-parent-cleanup:$($_.Exception.Message)" }
  try { Complete-OwnedProcessOutput } catch { Add-Failure "bounded-parent-output:$($_.Exception.Message)" }
  try {
    if (Test-ExactRunnerAlive) {
      Add-Failure "bounded-parent-child-remains:$($runner.Id)"
    }
    $finalHead = (& git -c core.excludesFile= -c safe.directory=$worktree rev-parse HEAD).Trim()
    $finalStatus = @(& git -c core.excludesFile= -c safe.directory=$worktree status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $finalHead -cne $head -or $finalStatus.Count -ne 0) {
      Add-Failure 'bounded-parent-final-worktree-identity-invalid'
    }
    if ((Get-DotNetSha256 $inner) -cne $innerSha256) {
      Add-Failure 'bounded-parent-final-inner-hash-mismatch'
    }
  } catch { Add-Failure "bounded-parent-final-witness:$($_.Exception.Message)" }
  if ($null -ne $runner -and -not (Test-ExactRunnerAlive)) { $runner.Dispose() }
}

if ($failures.Count -gt 0) {
  throw "native-gate3-resource-ownership-bounded-parent-failed: $($failures -join ' | ')"
}

$greenResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Get-Content -LiteralPath $resultPath -Raw
