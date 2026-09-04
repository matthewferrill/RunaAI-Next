[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$worktree = 'D:\Projects\Runalab\runaai-next-native-control-host'
$parentRelative = 'gate7f/function-first/Invoke-NativeGate3ResourceOwnershipProofBounded.ps1'
$inner = Join-Path $worktree 'gate7f\function-first\Invoke-NativeGate3ResourceOwnershipProof.ps1'
$innerSha256 = '4F60820E62352088A4887ADC1E43DCEB6189BC919C205827CA191B05259447A7'
$evidenceRoot = Join-Path $worktree 'artifacts\runs\native-gate3-production-resource-ownership-parent-01'
$stdoutPath = Join-Path $evidenceRoot 'stdout.log'
$stderrPath = Join-Path $evidenceRoot 'stderr.log'
$resultPath = Join-Path $evidenceRoot 'result.json'
$outerDeadlineMs = 600000
$failures = [System.Collections.Generic.List[string]]::new()
$runner = $null
$greenResult = $null
$head = $null
$hadParentGate = Test-Path Env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT
$priorParentGate = if ($hadParentGate) { (Get-Item Env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT).Value } else { $null }

function Add-Failure([string]$Message) {
  if (-not [string]::IsNullOrWhiteSpace($Message)) { $script:failures.Add($Message) }
}

function Same-Path([string]$Left, [string]$Right) {
  return [string]::Equals([IO.Path]::GetFullPath($Left).TrimEnd('\'),
    [IO.Path]::GetFullPath($Right).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

function Stop-OwnedProcessTree {
  if ($null -eq $runner -or $runner.HasExited) { return }
  $taskkill = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'
  $kill = Start-Process -FilePath $taskkill -ArgumentList "/PID $($runner.Id) /T /F" -WindowStyle Hidden -PassThru
  if (-not $kill.WaitForExit(20000)) {
    $killPid = $kill.Id
    $kill.Kill()
    if (-not $kill.WaitForExit(5000)) { throw "bounded-parent-taskkill-terminal-unconfirmed:$killPid" }
    $kill.Refresh()
    if (-not $kill.HasExited -or $null -ne (Get-Process -Id $killPid -ErrorAction SilentlyContinue)) {
      throw "bounded-parent-taskkill-process-remains:$killPid"
    }
    throw "bounded-parent-taskkill-timeout:$($runner.Id)"
  }
  $kill.WaitForExit()
  $kill.Refresh()
  if (-not $kill.HasExited -or $null -ne (Get-Process -Id $kill.Id -ErrorAction SilentlyContinue)) {
    throw "bounded-parent-taskkill-process-remains:$($kill.Id)"
  }
  if ($kill.ExitCode -ne 0) { throw "bounded-parent-taskkill-failed:$($kill.ExitCode)" }
  if (-not $runner.WaitForExit(30000)) { throw "bounded-parent-child-exit-timeout:$($runner.Id)" }
  $runner.Refresh()
  if (-not $runner.HasExited) { throw "bounded-parent-child-did-not-exit:$($runner.Id)" }
}

try {
  if (-not (Same-Path (Get-Location).Path $worktree)) { throw 'bounded-parent-working-directory-mismatch' }
  if (Test-Path -LiteralPath $evidenceRoot) { throw 'bounded-parent-evidence-root-already-exists' }
  $status = @(& git -c core.excludesFile= -c safe.directory=$worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) { throw 'bounded-parent-worktree-must-be-clean' }
  $head = (& git -c core.excludesFile= -c safe.directory=$worktree rev-parse HEAD).Trim()
  $parentCommit = (& git -c core.excludesFile= -c safe.directory=$worktree log -1 --format=%H -- $parentRelative).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[a-f0-9]{40}$' -or $parentCommit -cne $head) {
    throw 'bounded-parent-reviewed-head-invalid'
  }
  $actualInnerSha256 = (Get-FileHash -LiteralPath $inner -Algorithm SHA256).Hash
  if ($actualInnerSha256 -cne $innerSha256) { throw "bounded-parent-inner-hash-mismatch:$actualInnerSha256" }
  New-Item -ItemType Directory -Path $evidenceRoot -ErrorAction Stop | Out-Null
  $env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT = 'runaai-native-gate3-resource-ownership-parent/v1'
  $powershell = Join-Path $PSHOME 'powershell.exe'
  $arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$inner`""
  $runner = Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $worktree `
    -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
  if (-not $runner.WaitForExit($outerDeadlineMs)) {
    Stop-OwnedProcessTree
    throw "bounded-parent-outer-timeout:$outerDeadlineMs"
  }
  $runner.WaitForExit()
  if ($runner.ExitCode -ne 0) { throw "bounded-parent-child-failed:$($runner.ExitCode)" }
  $stderr = Get-Content -LiteralPath $stderrPath -Raw
  if (-not [string]::IsNullOrWhiteSpace($stderr)) { throw 'bounded-parent-child-stderr-not-empty' }
  $stdout = Get-Content -LiteralPath $stdoutPath -Raw
  $parsed = $stdout | ConvertFrom-Json
  $expectedChildProperties = @('candidateSessionsAfterEarlyFailure', 'candidateSessionsAfterM1Failure',
    'dependencyManifestSha256', 'fail', 'fixtureRootCleaned', 'head', 'modelInvoked', 'nodeVersion', 'pass', 'passed',
    'postgresProcessId', 'postgresVersion', 'privateValuesIncluded', 'productionChanged', 'schemaVersion',
    'syntheticClusterStopped', 'tests') | Sort-Object
  $actualChildProperties = @($parsed.PSObject.Properties.Name | Sort-Object)
  if (@(Compare-Object -ReferenceObject $expectedChildProperties -DifferenceObject $actualChildProperties).Count -ne 0) {
    throw 'bounded-parent-child-result-shape-invalid'
  }
  $childResultInvalid = $parsed.schemaVersion -cne 'runaai-native-gate3-resource-ownership-proof/v1'
  $childResultInvalid = $childResultInvalid -or $parsed.passed -ne $true -or $parsed.head -cne $head
  $childResultInvalid = $childResultInvalid -or $parsed.tests -ne 1 -or $parsed.pass -ne 1 -or $parsed.fail -ne 0
  $childResultInvalid = $childResultInvalid -or $parsed.nodeVersion -cne 'v22.22.0'
  $childResultInvalid = $childResultInvalid -or $parsed.postgresVersion -cne 'postgres (PostgreSQL) 18.6'
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
  if ($hadParentGate) { $env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT = $priorParentGate }
  else { Remove-Item Env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT -ErrorAction SilentlyContinue }
  try {
    if ($null -ne $runner -and $null -ne (Get-Process -Id $runner.Id -ErrorAction SilentlyContinue)) {
      Add-Failure "bounded-parent-child-remains:$($runner.Id)"
    }
    $finalHead = (& git -c core.excludesFile= -c safe.directory=$worktree rev-parse HEAD).Trim()
    $finalStatus = @(& git -c core.excludesFile= -c safe.directory=$worktree status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $finalHead -cne $head -or $finalStatus.Count -ne 0) {
      Add-Failure 'bounded-parent-final-worktree-identity-invalid'
    }
    if ((Get-FileHash -LiteralPath $inner -Algorithm SHA256).Hash -cne $innerSha256) {
      Add-Failure 'bounded-parent-final-inner-hash-mismatch'
    }
  } catch { Add-Failure "bounded-parent-final-witness:$($_.Exception.Message)" }
}

if ($failures.Count -gt 0) {
  throw "native-gate3-resource-ownership-bounded-parent-failed: $($failures -join ' | ')"
}

$greenResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Get-Content -LiteralPath $resultPath -Raw
