[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$worktree = 'D:\Projects\Runalab\runaai-next-native-control-host'
$dependencySource = 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules'
$localModules = Join-Path $worktree 'node_modules'
$toolRoot = 'D:\Projects\Runalab\artifacts\tools'
$postgresBin = Join-Path $toolRoot 'postgresql\bin\pgsql\bin'
$node = 'C:\Program Files\nodejs\node.exe'
$parentRelative = 'gate7f/function-first/Invoke-NativeGate3ResourceOwnershipProofBounded.ps1'
$directoryManifestPath = Join-Path $worktree 'gate7f\function-first\directory-manifest.mjs'
$testPath = Join-Path $worktree 'gate7f\function-first\production-resource-ownership.integration.test.mjs'
$artifactRoot = Join-Path $worktree 'artifacts\runs\native-gate3-production-resource-ownership'
$evidenceRoot = Join-Path $worktree 'artifacts\runs\native-gate3-production-resource-ownership-operator-01'
$stdoutPath = Join-Path $evidenceRoot 'stdout.log'
$stderrPath = Join-Path $evidenceRoot 'stderr.log'
$resultPath = Join-Path $evidenceRoot 'result.json'
$outerDeadlineMs = 240000

$sourcePins = [ordered]@{
  'gate6b\composition.mjs' = '5637790DA0C27341185A6458E5D59AE3EFD1C95F45012AD1E2AD9CC49E58B393'
  'gate6b\sandbox-runtime.mjs' = '9B479A0E247B814FF0821B6EC4453FE0D820EF40F0AF3E6E1E8BD2902FA03A7C'
  'gate6b\release-config.mjs' = '61099A22C4E00E60DB58FC06D87F13C9B6C56FCD79BDA01B92114EC393782A4B'
  'gate6b\artifact.mjs' = '6F9952DAEA66D7D92EF250D3701BD1A324B5D1F0901BD21DC1CE1A5E64590C78'
  'gate7f\function-first\synthetic-postgres.mjs' = 'E289CE4DD04F840EACBE468F1516DAB01EA74568B115D6C4565BD683B893D145'
  'gate7f\function-first\directory-manifest.mjs' = '8F194D3D773F0F0FF72A85852668C66577B7376837F153CAF08B957A60BE03A5'
  'gate7f\function-first\production-resource-ownership.integration.test.mjs' = '9AF2FDC4C096B36FBD0DC0CB7330AF7186E3C0F967C14822C5836BF4369C4978'
}
$toolPins = [ordered]@{
  $node = 'BAE898ADD4643FCF890A83AD8AE56E20DCE7E781CAB161A53991CEBA70C99FFB'
  (Join-Path $postgresBin 'postgres.exe') = 'AF5B897CB69C9CE692A4A15ECD022B540DB85DB1ADD0F66D2B9F0697BE2451A0'
  (Join-Path $postgresBin 'initdb.exe') = '68195F0C6F22694660BA86D914AE8C74BCD38E71EB342F98E065B1962311142E'
  (Join-Path $postgresBin 'pg_ctl.exe') = '552049183DF455921657C8E498E9745E8508BF77D2C2E5CB9C21B2CBDC798822'
  (Join-Path $postgresBin 'pg_isready.exe') = '2EB622A9F68F239FF9555C4C47291527A6C01C1D22BF912FB0A3228879E2814E'
}
$dependencyPins = [ordered]@{
  (Join-Path $worktree 'package-lock.json') = 'CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308'
  (Join-Path (Split-Path -Parent $dependencySource) 'package-lock.json') = 'CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308'
  (Join-Path $dependencySource 'pg\package.json') = 'E42DD36CBA6E9DD8DBB6F773A2F7BE8A8C3C273E18B155E42E75961A4CB8BC28'
  (Join-Path $dependencySource 'zod\package.json') = 'C630BD10B52DCF71C112A2BF78DBF2734B9DB58D62DE663B8D86C2EC2C8CDA2E'
}

$failures = [System.Collections.Generic.List[string]]::new()
$junctionCreated = $false
$runner = $null
$beforePostgres = @()
$sourceStatusBefore = $null
$head = $null
$greenResult = $null
$receiptPid = $null
$dependencyManifestBefore = $null
$hadMethodGate = Test-Path Env:RUNAAI_GATE3_RESOURCE_PROOF_METHOD
$priorMethodGate = if ($hadMethodGate) { (Get-Item Env:RUNAAI_GATE3_RESOURCE_PROOF_METHOD).Value } else { $null }
$forbiddenNodeEnvironment = @('NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'NODE_ICU_DATA',
  'NODE_V8_COVERAGE', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_PENDING_DEPRECATION', 'NODE_NO_WARNINGS',
  'NODE_REDIRECT_WARNINGS', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_COMPILE_CACHE',
  'NODE_DISABLE_COMPILE_CACHE', 'NODE_PRESERVE_SYMLINKS', 'NODE_CHANNEL_FD', 'NODE_DISABLE_COLORS',
  'NODE_SKIP_PLATFORM_CHECK', 'NODE_PENDING_PIPE_INSTANCES', 'NODE_REPL_HISTORY',
  'OPENSSL_CONF', 'SSL_CERT_FILE', 'SSL_CERT_DIR')

function Add-Failure([string]$Message) {
  if (-not [string]::IsNullOrWhiteSpace($Message)) { $script:failures.Add($Message) }
}

function Same-Path([string]$Left, [string]$Right) {
  return [string]::Equals([IO.Path]::GetFullPath($Left).TrimEnd('\'),
    [IO.Path]::GetFullPath($Right).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

function Assert-Hash([string]$Path, [string]$Expected) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($item.PSIsContainer) { throw "hash-target-not-file:$Path" }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "hash-target-is-reparse-point:$Path" }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actual -cne $Expected) { throw "hash-mismatch:${Path}:${actual}" }
}

function Get-PostgresPids {
  return @(Get-Process -Name 'postgres' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id } | Sort-Object -Unique)
}

function Get-LiteralItemOrNull([string]$Path) {
  $parent = Split-Path -Parent $Path
  $leaf = Split-Path -Leaf $Path
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { return $null }
  $matches = @(Get-ChildItem -LiteralPath $parent -Force -ErrorAction Stop | Where-Object { $_.Name -ceq $leaf })
  if ($matches.Count -gt 1) { throw "literal-path-ambiguous:$Path" }
  if ($matches.Count -eq 1) { return $matches[0] }
  return $null
}

function Assert-ExactJunction {
  $item = Get-Item -LiteralPath $localModules -Force -ErrorAction Stop
  $invalidJunction = -not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0
  $invalidJunction = $invalidJunction -or $item.LinkType -cne 'Junction'
  if ($invalidJunction) { throw 'worktree-node-modules-not-exact-junction' }
  $targets = @($item.Target)
  if ($targets.Count -ne 1) { throw 'worktree-node-modules-target-count-invalid' }
  $target = if ([IO.Path]::IsPathRooted($targets[0])) { $targets[0] } else { Join-Path $item.Parent.FullName $targets[0] }
  $resolvedTarget = (Resolve-Path -LiteralPath $target -ErrorAction Stop).ProviderPath
  $resolvedSource = (Resolve-Path -LiteralPath $dependencySource -ErrorAction Stop).ProviderPath
  if (-not (Same-Path $resolvedTarget $resolvedSource)) { throw 'worktree-node-modules-target-mismatch' }
}

function Stop-OwnedRunnerTree {
  if ($null -eq $runner -or $runner.HasExited) { return }
  $taskkill = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'
  $kill = Start-Process -FilePath $taskkill -ArgumentList "/PID $($runner.Id) /T /F" -WindowStyle Hidden -PassThru
  if (-not $kill.WaitForExit(20000)) {
    $killPid = $kill.Id
    $kill.Kill()
    if (-not $kill.WaitForExit(5000)) { throw "owned-taskkill-terminal-unconfirmed:$killPid" }
    $kill.Refresh()
    if (-not $kill.HasExited -or $null -ne (Get-Process -Id $killPid -ErrorAction SilentlyContinue)) {
      throw "owned-taskkill-process-remains:$killPid"
    }
    throw "owned-node-runner-taskkill-timeout:$($runner.Id)"
  }
  $kill.WaitForExit()
  $kill.Refresh()
  if (-not $kill.HasExited -or $null -ne (Get-Process -Id $kill.Id -ErrorAction SilentlyContinue)) {
    throw "owned-taskkill-process-remains:$($kill.Id)"
  }
  if ($kill.ExitCode -ne 0) { throw "owned-node-runner-taskkill-failed:$($kill.ExitCode)" }
  if (-not $runner.WaitForExit(30000)) { throw "owned-node-runner-exit-timeout:$($runner.Id)" }
  $runner.Refresh()
  if (-not $runner.HasExited) { throw "owned-node-runner-did-not-exit:$($runner.Id)" }
}

try {
  $parentGateInvalid = -not (Test-Path Env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT)
  if (-not $parentGateInvalid) {
    $parentGateInvalid = $env:RUNAAI_GATE3_RESOURCE_PROOF_PARENT -cne 'runaai-native-gate3-resource-ownership-parent/v1'
  }
  if ($parentGateInvalid) {
    throw 'bounded-parent-method-gate-required'
  }
  foreach ($name in $forbiddenNodeEnvironment) {
    if (Test-Path "Env:$name") { throw "node-startup-environment-must-be-absent:$name" }
  }
  if (-not (Same-Path (Get-Location).Path $worktree)) { throw 'operator-working-directory-mismatch' }
  if (Test-Path -LiteralPath $evidenceRoot) { throw 'operator-evidence-root-already-exists' }
  if (Test-Path -LiteralPath $artifactRoot) { throw 'fixture-artifact-root-already-exists' }
  if ($null -ne (Get-LiteralItemOrNull $localModules)) { throw 'worktree-node-modules-must-be-absent' }
  $dependencyItem = Get-Item -LiteralPath $dependencySource -Force -ErrorAction Stop
  if (-not $dependencyItem.PSIsContainer -or ($dependencyItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'dependency-source-must-be-ordinary-directory'
  }
  if (-not (Same-Path $dependencyItem.FullName $dependencySource)) { throw 'dependency-source-identity-mismatch' }

  $branch = (& git -c core.excludesFile= -c safe.directory=$worktree branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $branch -cne 'codex/m1-native-control-host') { throw "branch-mismatch:$branch" }
  $sourceStatusBefore = @(& git -c core.excludesFile= -c safe.directory=$worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $sourceStatusBefore.Count -ne 0) { throw 'worktree-must-be-clean' }
  $head = (& git -c core.excludesFile= -c safe.directory=$worktree rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[a-f0-9]{40}$') { throw 'head-identity-invalid' }
  $methodCommit = (& git -c core.excludesFile= -c safe.directory=$worktree log -1 --format=%H -- $parentRelative).Trim()
  if ($LASTEXITCODE -ne 0 -or $methodCommit -cne $head) { throw "reviewed-method-is-not-at-head:$methodCommit" }

  foreach ($entry in $sourcePins.GetEnumerator()) { Assert-Hash (Join-Path $worktree $entry.Key) $entry.Value }
  foreach ($entry in $toolPins.GetEnumerator()) { Assert-Hash $entry.Key $entry.Value }
  foreach ($entry in $dependencyPins.GetEnumerator()) { Assert-Hash $entry.Key $entry.Value }
  $nodeVersion = (& $node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -cne 'v22.22.0') { throw "node-version-mismatch:$nodeVersion" }
  $postgresVersion = (& (Join-Path $postgresBin 'postgres.exe') --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $postgresVersion -cne 'postgres (PostgreSQL) 18.6') {
    throw "postgres-version-mismatch:$postgresVersion"
  }
  $dependencyManifestJson = (& $node $directoryManifestPath $dependencySource)
  if ($LASTEXITCODE -ne 0) { throw "dependency-manifest-preflight-failed:$LASTEXITCODE" }
  $dependencyManifestBefore = $dependencyManifestJson | ConvertFrom-Json
  $dependencyManifestInvalid = $dependencyManifestBefore.schemaVersion -cne 'runaai-directory-manifest/v1'
  $dependencyManifestInvalid = $dependencyManifestInvalid -or $dependencyManifestBefore.sha256 -cne 'b49d965cc9f73536b5dfd19b1aa341f0308bcbf90b174e5654789c77b5ede151'
  $dependencyManifestInvalid = $dependencyManifestInvalid -or $dependencyManifestBefore.files -ne 29562
  $dependencyManifestInvalid = $dependencyManifestInvalid -or $dependencyManifestBefore.bytes -ne 377604996
  if ($dependencyManifestInvalid) {
    throw 'dependency-source-complete-manifest-mismatch'
  }

  $beforePostgres = @(Get-PostgresPids)
  New-Item -ItemType Directory -Path $evidenceRoot -ErrorAction Stop | Out-Null
  New-Item -ItemType Junction -Path $localModules -Target $dependencySource -ErrorAction Stop | Out-Null
  $junctionCreated = $true
  Assert-ExactJunction

  $env:RUNAAI_GATE3_RESOURCE_PROOF_METHOD = 'runaai-native-gate3-resource-ownership-operator/v1'
  $argumentLine = "--test `"$testPath`""
  $runner = Start-Process -FilePath $node -ArgumentList $argumentLine -WorkingDirectory $worktree `
    -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
  if (-not $runner.WaitForExit($outerDeadlineMs)) {
    Stop-OwnedRunnerTree
    throw "node-test-outer-timeout:$outerDeadlineMs"
  }
  $runner.WaitForExit()
  $exitCode = $runner.ExitCode
  $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
  if ($exitCode -ne 0) { throw "node-test-failed:$exitCode" }
  if (-not [string]::IsNullOrWhiteSpace($stderr)) { throw 'node-test-stderr-not-empty' }
  $summaryInvalid = @([regex]::Matches($stdout, '(?m)^# tests 1$')).Count -ne 1
  $summaryInvalid = $summaryInvalid -or @([regex]::Matches($stdout, '(?m)^# pass 1$')).Count -ne 1
  $summaryInvalid = $summaryInvalid -or @([regex]::Matches($stdout, '(?m)^# fail 0$')).Count -ne 1
  if ($summaryInvalid) { throw 'node-test-summary-invalid' }
  $expectedName = 'production composition releases its actual PostgreSQL pool after a pre-transfer M1 failure'
  if (@([regex]::Matches($stdout, "(?m)^ok 1 - $([regex]::Escape($expectedName))\r?$" )).Count -ne 1) {
    throw 'node-test-top-level-name-invalid'
  }
  if ([regex]::IsMatch($stdout, '(?mi)^(?:not ok|\s*(?:ok|not ok).*#\s*(?:skip|todo))')) {
    throw 'node-test-failure-or-directive-observed'
  }
  foreach ($zeroSummary in @('cancelled', 'skipped', 'todo')) {
    if (@([regex]::Matches($stdout, "(?m)^# $zeroSummary 0\r?$" )).Count -ne 1) {
      throw "node-test-$zeroSummary-summary-invalid"
    }
  }
  $receiptMatches = [regex]::Matches($stdout,
    '(?m)^# RUNAAI_SYNTHETIC_POSTGRES_STOP_RECEIPT (?<json>\{[^\r\n]+\})\r?$')
  if ($receiptMatches.Count -ne 1) { throw 'postgres-stop-receipt-count-invalid' }
  $receipt = $receiptMatches[0].Groups['json'].Value | ConvertFrom-Json
  $receiptPid = [int]$receipt.postgresProcessId
  $receiptInvalid = $receipt.schemaVersion -cne 'runaai-synthetic-postgres-stop-receipt/v1'
  $receiptInvalid = $receiptInvalid -or $receipt.stopped -ne $true -or $receipt.ownedSyntheticDataRemoved -ne $true
  $receiptInvalid = $receiptInvalid -or $receipt.productionChanged -ne $false -or $receipt.controlledStopRequested -ne $true
  $receiptInvalid = $receiptInvalid -or $receipt.terminalExitConfirmed -ne $true -or $receipt.exitCode -ne 0
  $receiptInvalid = $receiptInvalid -or $null -ne $receipt.signal -or $receiptPid -lt 1 -or $beforePostgres -contains $receiptPid
  if ($receiptInvalid) { throw 'postgres-stop-receipt-invalid' }
  if (Test-Path -LiteralPath $artifactRoot) {
    $remainingFixtureChildren = @(Get-ChildItem -LiteralPath $artifactRoot -Force -ErrorAction Stop)
    if ($remainingFixtureChildren.Count -ne 0) { throw 'fixture-owned-root-not-empty-after-green' }
  } else { throw 'fixture-artifact-root-not-observed' }

  $afterPostgres = @(Get-PostgresPids)
  $newPostgres = @($afterPostgres | Where-Object { $beforePostgres -notcontains $_ })
  if ($newPostgres.Count -ne 0) { throw "new-postgres-process-remains:$($newPostgres -join ',')" }
  if ($afterPostgres -contains $receiptPid) { throw "receipt-postgres-process-remains:$receiptPid" }
  $greenResult = [ordered]@{ schemaVersion = 'runaai-native-gate3-resource-ownership-proof/v1'; passed = $true
    head = $head; nodeVersion = $nodeVersion; postgresVersion = $postgresVersion; tests = 1; pass = 1; fail = 0
    dependencyManifestSha256 = $dependencyManifestBefore.sha256; postgresProcessId = $receiptPid
    candidateSessionsAfterEarlyFailure = 0; candidateSessionsAfterM1Failure = 0; syntheticClusterStopped = $true
    fixtureRootCleaned = $true; modelInvoked = $false; productionChanged = $false; privateValuesIncluded = $false }
} catch {
  Add-Failure $_.Exception.Message
} finally {
  try { Stop-OwnedRunnerTree } catch { Add-Failure "runner-cleanup:$($_.Exception.Message)" }
  if ($hadMethodGate) { $env:RUNAAI_GATE3_RESOURCE_PROOF_METHOD = $priorMethodGate }
  else { Remove-Item Env:RUNAAI_GATE3_RESOURCE_PROOF_METHOD -ErrorAction SilentlyContinue }
  if ($junctionCreated) {
    try {
      Assert-ExactJunction
      (Get-Item -LiteralPath $localModules -Force -ErrorAction Stop).Delete()
      if ($null -ne (Get-LiteralItemOrNull $localModules)) { throw 'junction-link-remains-after-delete' }
    } catch { Add-Failure "junction-cleanup:$($_.Exception.Message)" }
  } elseif ($null -ne (Get-LiteralItemOrNull $localModules)) {
    Add-Failure 'unowned-worktree-node-modules-appeared'
  }
  try {
    if ($null -ne $dependencyManifestBefore) {
      $dependencyManifestAfterJson = (& $node $directoryManifestPath $dependencySource)
      if ($LASTEXITCODE -ne 0) { throw "dependency-manifest-final-failed:$LASTEXITCODE" }
      $dependencyManifestAfter = $dependencyManifestAfterJson | ConvertFrom-Json
      $dependencyChanged = $dependencyManifestAfter.sha256 -cne $dependencyManifestBefore.sha256
      $dependencyChanged = $dependencyChanged -or $dependencyManifestAfter.files -ne $dependencyManifestBefore.files
      $dependencyChanged = $dependencyChanged -or $dependencyManifestAfter.bytes -ne $dependencyManifestBefore.bytes
      if ($dependencyChanged) {
        throw 'dependency-source-changed'
      }
    }
  } catch { Add-Failure "dependency-source-witness:$($_.Exception.Message)" }
  try {
    $finalPostgres = @(Get-PostgresPids)
    $unexpectedPostgres = @($finalPostgres | Where-Object { $beforePostgres -notcontains $_ })
    if ($unexpectedPostgres.Count -ne 0) { Add-Failure "final-postgres-process-remains:$($unexpectedPostgres -join ',')" }
  } catch { Add-Failure "postgres-process-witness:$($_.Exception.Message)" }
  try {
    $finalHead = (& git -c core.excludesFile= -c safe.directory=$worktree rev-parse HEAD).Trim()
    $sourceStatusAfter = @(& git -c core.excludesFile= -c safe.directory=$worktree status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $finalHead -cne $head -or $sourceStatusAfter.Count -ne 0) {
      Add-Failure 'final-worktree-identity-invalid'
    }
    foreach ($entry in $sourcePins.GetEnumerator()) { Assert-Hash (Join-Path $worktree $entry.Key) $entry.Value }
  } catch { Add-Failure "final-source-witness:$($_.Exception.Message)" }
}

if ($failures.Count -gt 0) {
  throw "native-gate3-resource-ownership-proof-failed: $($failures -join ' | ')"
}

$greenResult | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Get-Content -LiteralPath $resultPath -Raw
