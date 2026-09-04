# M1-S2B1 Native PostgreSQL gate-2 preflight — 2026-09-04

## Status and boundary

This is a method freeze, not execution evidence. The read-only audit at clean branch
`codex/m1-native-control-host` commit `36030b41f54e5c10e4bc0b4febe6c1236008c959` returned **STOP**:
the existing four-test PostgreSQL lifecycle file and one-test compatibility file contain no actual-PostgreSQL
coverage of the Native candidate authority methods or tables. No syntax command, import, test, PostgreSQL process,
service, browser, network, model, release, production or customer action ran while preparing this record.

Gate 2 remains stopped until lane A supplies the bounded product correction and candidate tests described below,
lane B's helper and this method record are reviewed together with those exact bytes, all changes are source-committed,
and a different reviewer returns GO with P0=0/P1=0. The eventual authorization must freeze the literal resulting
40-character commit ID; this pre-commit record cannot truthfully supply it.

## Audit STOP and ownership

The existing `postgres-lifecycle.integration.test.mjs` was introduced at `b3409d6` and previously passed 4/4 after
the retained `NOT VALID` fault-injection correction. The separately gated `postgres.integration.test.mjs` then
passed 1/1. Those results prove the accepted legacy lifecycle/compatibility boundary only. Neither file currently
mentions `admitMaterializationRequest`, `lookupMaterializationByOperation`, `claimEffect`,
`operation_authorities`, `workspace_effect_claims`, or `workspace_publication_authorities`. Replaying the four
unchanged legacy lifecycle tests would not satisfy Native gate 2.

Lane A owns both of these blockers:

1. `#durablePublicationFromRows` validates the encrypted/decrypted manifest digest plus authority/request/binding
   digests, but does not defensively cross-check duplicated durable row identities—workspace/operation/revision;
   parent/ingress/staging resource IDs; parent/staging/final name-volume-file identities; publication claim ID and
   revision; and observed-final identity/digest/state coherence—against the workspace, authority, decrypted manifest
   and supplied claim on restart lookup. Immutability triggers do not replace read-time coherence validation. Lane A
   owns the bounded source fix and corrupted-row actual-PostgreSQL negatives; no new interface is prescribed here.
2. Candidate tests in the existing lifecycle file must cover the complete correction-design gate-2 contract: fresh
   and migrated schemas; begin/authority/outbox atomicity; in-transaction signature, key-version and watchdog-identity
   verification; ordinary-scope absent/create convergence; locked reconciliation-locator scope enforcement;
   cross-project/source denial; committed-response-loss lookup; restart-ledger cross-check; effect/publication CAS
   concurrency; tamper rollback; ready receipt/outbox atomicity; every restart branch; and a fully recomputed but
   unsigned adversary that leaves authority/workspace/outbox counts and content digests unchanged. Every new test
   selected for the candidate-only run must begin with the exact name prefix `candidate PostgreSQL`.

The root `package.json` has no Native PostgreSQL, lifecycle or compatibility script. Broad `npm test` is outside this
gate. The literal bounded wrapper below is the only proposed entry point for either separately authorized command.

## Lane-B helper hardening — unexecuted

The first independent lane-B review returned **STOP P0=0/P1=5**. It found that the helper authenticated the resolved
cleanup target rather than the literal child, forgot a rejected stop operation, represented child termination through
conflicting flags, left loopback-port acquisition outside the guarded startup boundary, and described rather than
implemented the operator witness. The corrected bytes remain unexecuted and require fresh independent review.

A later bounded review retained the stop because the helper did not reauthenticate the owned literal child directly
before its one `pg_ctl stop`, while the wrapper mixed a stale compatibility hash with final-review sentinels, accepted
indented or directive-bearing TAP results, shared one artifact root across both modes, and rejected the individual
untracked failure artifacts it was required to preserve. This correction remains source-only and unexecuted.

`synthetic-postgres.mjs` now remains backward-compatible for existing callers while closing those findings:

- the legacy `stop()` result remains exactly `{ stopped: true, ownedSyntheticDataRemoved: true,
  productionChanged: false }` unless a caller explicitly requests process evidence;
- optional `statementTimeoutMs`, `lockTimeoutMs` and `idleInTransactionSessionTimeoutMs` values add server-enforced
  query/lock/idle-transaction bounds without changing legacy defaults;
- loopback-port acquisition has its own five-second bound and is inside the post-child-directory guarded startup
  lifecycle;
- one lifecycle record owns the child, PID, port, terminal observation, spawn error and phase. A signal and an exit
  code use the same terminal path during readiness, startup recovery and shutdown, and a terminal state is never
  overwritten by `ready`;
- `processExitTimeoutMs` defaults to 30 seconds. The exact spawned `postgres.exe` PID is returned, and cleanup cannot
  begin until that exact child has produced the expected controlled-stop terminal state;
- concurrent or repeated `stop()` calls retain one sticky Promise whether it fulfills or rejects. `pg_ctl stop` is
  issued at most once, and a child already terminal before that request or terminating nonzero/by signal cannot
  produce a green receipt;
- the original literal generated child is reauthenticated immediately before that single `pg_ctl stop` request and
  reauthenticated again immediately before deletion after its controlled terminal state is confirmed;
- `includeProcessEvidence: true` returns the versioned frozen receipt with exact PID,
  `controlledStopRequested: true`, `terminalExitConfirmed: true`, exit code `0`, signal `null`, and owned-child removal;
- both the artifact root and the original literal generated child must be ordinary non-reparse directories. The
  child's literal identity must equal its canonical identity, retain its creation device/inode/birth-time identity,
  and be an immediate `m1-synthetic-pg-*` child of the canonical root; deletion targets the authenticated literal
  path, never a resolved substitute; and
- a proven no-child startup failure may remove that authenticated child. An abnormal/unknown child, failed stop,
  missing PID, terminal-observation timeout or unverified cleanup target is preserved. The originating error retains
  bounded inline startup/cleanup evidence; an independent diagnostic-write failure is attached without replacing it.

Lane A must configure the shared candidate lifecycle fixture with these exact bounds:
`statementTimeoutMs: 30000`, `lockTimeoutMs: 5000`, `idleInTransactionSessionTimeoutMs: 30000`,
`processExitTimeoutMs: 30000`, and `includeProcessEvidence: true`. The Node test runner supplies the separate
per-test 180-second lifecycle bound. Its single `test.after` must assert the receipt and emit exactly one TAP comment
whose content is `RUNAAI_SYNTHETIC_POSTGRES_STOP_RECEIPT ` followed by the compact receipt JSON; this is the bounded
operator-publication channel used below. The wrapper accepts only unindented successful top-level selected-test TAP
results, rejects directives including `SKIP` and `TODO`, and requires every reviewed selected name exactly once.

## Exact reviewed identities at this preflight

- `C:\Program Files\nodejs\node.exe`: Node `22.22.0`, SHA-256
  `BAE898ADD4643FCF890A83AD8AE56E20DCE7E781CAB161A53991CEBA70C99FFB`.
- PostgreSQL tool root: `D:\Projects\Runalab\artifacts\tools\postgresql`; archive
  `postgresql-18.6-1-windows-x64-binaries.zip`, SHA-256
  `FBE23DA234EE31547BF8A36D29DFD81E82B849DF2D2B78D2EECB43D360252F8C`.
- PostgreSQL `18.6` executable SHA-256 values:
  - `postgres.exe`: `AF5B897CB69C9CE692A4A15ECD022B540DB85DB1ADD0F66D2B9F0697BE2451A0`
  - `initdb.exe`: `68195F0C6F22694660BA86D914AE8C74BCD38E71EB342F98E065B1962311142E`
  - `pg_ctl.exe`: `552049183DF455921657C8E498E9745E8508BF77D2C2E5CB9C21B2CBDC798822`
  - `pg_isready.exe`: `2EB622A9F68F239FF9555C4C47291527A6C01C1D22BF912FB0A3228879E2814E`
- Native and reviewed dependency-source `package-lock.json`: SHA-256
  `CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`.
- Reviewed dependency source:
  `D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules`, an ordinary directory at audit time;
  `pg@8.23.0` package manifest SHA-256
  `E42DD36CBA6E9DD8DBB6F773A2F7BE8A8C3C273E18B155E42E75961A4CB8BC28`; `zod@4.4.3` package manifest SHA-256
  `C630BD10B52DCF71C112A2BF78DBF2734B9DB58D62DE663B8D86C2EC2C8CDA2E`.
- Preflight source hashes before lane-A changes:
  - corrected `synthetic-postgres.mjs`: `591471218FFBD66BB5C9516054DF28801C5E76E351E8B63DDF33B559BCB2A996`
  - `server-workspace/postgres.mjs`: `73E1445492DF58FA17AA799AB2FA6B3C3C463AE5823D1032C655AF50E8A6B21C`
  - existing lifecycle test: `5ACBB144953C9D4BCCC1D84D5E6F8C9782009C5CCA64E7F47BFE2D3986A492DC`
  - compatibility test: `0D1BC4B299138C2A9EE728F1B1E2B2A7236DD3791F369C9BDE9DFEBE6B94A662`

These identities must be recomputed and frozen after lane A and lane B are committed. Package or tool drift stops;
version strings alone are insufficient.

## Process-witness limitation

Under the audit identity, `Get-CimInstance Win32_Process` failed with access denied and is not an admissible witness.
`Get-Process -Name postgres` with `Id,Path` succeeded and found seven pre-existing Reallusion PostgreSQL processes,
all rooted at `C:\Program Files\Common Files\Reallusion\PostgreSQL\bin\postgres.exe` and none under the Runa tool
root. Before execution, the exact `Get-Process` query must be re-proved under the same unrestricted Windows identity
that will run the test. It must reject any pre-existing `postgres.exe` whose resolved path is under the exact Runa
tool root. Unrelated processes outside that root are counted but neither stopped nor attributed to this gate.

The helper's returned PID and versioned stop receipt are the primary owned-process evidence. The external
executable-root census is only the independent pre/post leak check; it cannot replace terminal confirmation for the
exact spawned child.

## Literal one-attempt wrapper — frozen, unexecuted

The wrapper below is the whole operator boundary; the prose above is not a substitute. It is pasted into the approved
unrestricted PowerShell identity and is not saved as another repository script. Before authorization, a fresh reviewer
must supply the final 40-hex committed HEAD, final lane-A source/test hashes, and the exact three candidate test names
in the marked values of that transient invocation. If the fenced block is mechanically extracted, each of the seven
exact sentinel values must occur once before replacement and zero times after replacement. A broad substring scan for
the sentinel prefix is forbidden because the wrapper intentionally retains a generic fail-closed wildcard guard that
contains that prefix. The untouched value sentinels deliberately fail closed. The fixed helper, lock, package, Node and
PostgreSQL pins are literal. Before execution authorization, the exact substituted in-memory text must be parsed without
invocation by `System.Management.Automation.Language.Parser.ParseInput`; any parser error stops the stage. The transient
host must set strict mode and terminating errors before compiling the reviewed text so compilation failure cannot fall
through to invocation. Changing any command, pin, test name or bound requires review.

Set `$mode = 'Candidate'` for the first authorized attempt. A later `$mode = 'Compatibility'` invocation is a separate
attempt and authorization; it is forbidden unless Candidate and all cleanup checks are green. Compatibility is also
stopped until its existing one-test fixture is changed, source-committed and independently reviewed to request process
evidence, assert the same receipt, and emit the same single receipt comment. It must then supply its new exact hash in
the marked pin; legacy 1/1 evidence is not a substitute.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Values beginning FINAL_GO are mandatory exact values from the fresh post-commit review.
$mode = 'Candidate' # the only alternatives are Candidate and separately authorized Compatibility
$expectedHead = 'FINAL_GO_40_HEX_COMMIT'
$compatibilityTestSha256 = 'FINAL_GO_64_HEX_COMPATIBILITY_TEST_WITH_PROCESS_RECEIPT'
$expectedHashes = [ordered]@{
  'gate7f\function-first\synthetic-postgres.mjs' = 'E289CE4DD04F840EACBE468F1516DAB01EA74568B115D6C4565BD683B893D145'
  'gate7f\function-first\server-workspace\postgres.mjs' = 'FINAL_GO_64_HEX_POSTGRES_SOURCE'
  'gate7f\function-first\server-workspace\postgres-lifecycle.integration.test.mjs' = 'FINAL_GO_64_HEX_LIFECYCLE_TEST'
  'gate7f\function-first\server-workspace\postgres.integration.test.mjs' = $compatibilityTestSha256
}
[string[]]$expectedCandidateNames = @(
  'FINAL_GO_EXACT_CANDIDATE_TEST_NAME_1',
  'FINAL_GO_EXACT_CANDIDATE_TEST_NAME_2',
  'FINAL_GO_EXACT_CANDIDATE_TEST_NAME_3'
)
[string[]]$expectedCompatibilityNames = @(
  'real PostgreSQL retains encrypted scoped source authority and idempotent intent'
)

$worktree = 'D:\Projects\Runalab\runaai-next-native-control-host'
$dependencySource = 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules'
$localModules = Join-Path $worktree 'node_modules'
$artifactLeaf = if ($mode -ceq 'Candidate') { 'm1-s2b1-postgres-lifecycle' } else { 'm1-s2b1-postgres' }
$artifactRoot = Join-Path $worktree "artifacts\runs\$artifactLeaf"
$artifactStatusPrefix = "?? artifacts/runs/$artifactLeaf/"
$toolRoot = 'D:\Projects\Runalab\artifacts\tools'
$postgresBin = Join-Path $toolRoot 'postgresql\bin\pgsql\bin'
$node = 'C:\Program Files\nodejs\node.exe'
$lockSha256 = 'CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308'
$packagePins = [ordered]@{
  'pg\package.json' = 'E42DD36CBA6E9DD8DBB6F773A2F7BE8A8C3C273E18B155E42E75961A4CB8BC28'
  'zod\package.json' = 'C630BD10B52DCF71C112A2BF78DBF2734B9DB58D62DE663B8D86C2EC2C8CDA2E'
}
$toolPins = @(
  [ordered]@{ path = $node; sha256 = 'BAE898ADD4643FCF890A83AD8AE56E20DCE7E781CAB161A53991CEBA70C99FFB' },
  [ordered]@{ path = (Join-Path $postgresBin 'postgres.exe'); sha256 = 'AF5B897CB69C9CE692A4A15ECD022B540DB85DB1ADD0F66D2B9F0697BE2451A0' },
  [ordered]@{ path = (Join-Path $postgresBin 'initdb.exe'); sha256 = '68195F0C6F22694660BA86D914AE8C74BCD38E71EB342F98E065B1962311142E' },
  [ordered]@{ path = (Join-Path $postgresBin 'pg_ctl.exe'); sha256 = '552049183DF455921657C8E498E9745E8508BF77D2C2E5CB9C21B2CBDC798822' },
  [ordered]@{ path = (Join-Path $postgresBin 'pg_isready.exe'); sha256 = '2EB622A9F68F239FF9555C4C47291527A6C01C1D22BF912FB0A3228879E2814E' }
)

$failures = [System.Collections.Generic.List[string]]::new()
$linkCreated = $false
$artifactCreated = $false
$testGreen = $false
$runner = $null
$stdoutPath = $null
$stderrPath = $null
$greenResult = $null
$hadNodePath = Test-Path Env:NODE_PATH
$priorNodePath = $env:NODE_PATH
$hadToolRoot = Test-Path Env:RUNALAB_TOOL_ROOT
$priorToolRoot = $env:RUNALAB_TOOL_ROOT

function Add-Failure([string]$message) {
  if (-not [string]::IsNullOrWhiteSpace($message)) { $failures.Add($message) }
}
function Same-Path([string]$left, [string]$right) {
  return [StringComparer]::OrdinalIgnoreCase.Equals(
    [IO.Path]::GetFullPath($left).TrimEnd('\'),
    [IO.Path]::GetFullPath($right).TrimEnd('\'))
}
function Get-LiteralItemOrNull([string]$literalPath) {
  try { return Get-Item -Force -LiteralPath $literalPath -ErrorAction Stop }
  catch {
    if ($_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::ObjectNotFound) { return $null }
    throw
  }
}
function Assert-OrdinaryDirectory([string]$literalPath) {
  $item = Get-LiteralItemOrNull $literalPath
  if ($null -eq $item -or -not $item.PSIsContainer -or
      (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
      -not (Same-Path $item.FullName $literalPath)) {
    throw "ordinary-directory-required:$literalPath"
  }
  return $item
}
function Assert-Hash([string]$literalPath, [string]$expected) {
  if ($expected -notmatch '^[A-Fa-f0-9]{64}$') { throw "unresolved-hash-pin:$literalPath" }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $literalPath -ErrorAction Stop).Hash
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals($actual, $expected)) {
    throw "hash-mismatch:${literalPath}:$actual"
  }
}
function Get-TextSha256([string]$value) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($value)
    return ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '')
  } finally { $algorithm.Dispose() }
}
function Assert-ReviewedHeadAndHashes {
  if ($expectedHead -notmatch '^[a-f0-9]{40}$') { throw 'unresolved-reviewed-head' }
  $head = (& git -c "safe.directory=$worktree" -C $worktree rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -cne $expectedHead) { throw "reviewed-head-mismatch:$head" }
  foreach ($entry in $expectedHashes.GetEnumerator()) {
    Assert-Hash (Join-Path $worktree $entry.Key) $entry.Value
  }
  return $head
}
function Assert-CleanReviewedHead {
  $head = Assert-ReviewedHeadAndHashes
  $status = @(& git -c "safe.directory=$worktree" -C $worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) { throw 'reviewed-worktree-not-clean' }
  return $head
}
function Assert-PostRunStatus([bool]$allowPreservedArtifact) {
  [void](Assert-ReviewedHeadAndHashes)
  $status = @(& git -c "safe.directory=$worktree" -C $worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { throw 'post-run-status-unavailable' }
  if (-not $allowPreservedArtifact -and $status.Count -ne 0) { throw 'post-run-worktree-not-clean' }
  if ($allowPreservedArtifact) {
    $unexpected = @($status | Where-Object {
      -not $_.StartsWith($artifactStatusPrefix, [StringComparison]::Ordinal)
    })
    if ($unexpected.Count -ne 0) { throw ('unexpected-post-run-status:' + ($unexpected -join ',')) }
  }
}
function Assert-Junction {
  $item = Get-LiteralItemOrNull $localModules
  if ($null -eq $item -or -not $item.PSIsContainer -or
      (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) -or
      $item.LinkType -cne 'Junction') { throw 'worktree-node-modules-not-exact-junction' }
  $targets = @($item.Target)
  if ($targets.Count -ne 1) { throw 'worktree-node-modules-target-count-invalid' }
  $targetPath = if ([IO.Path]::IsPathRooted($targets[0])) { $targets[0] } else {
    Join-Path $item.Parent.FullName $targets[0]
  }
  $resolvedTarget = (Resolve-Path -LiteralPath $targetPath -ErrorAction Stop).ProviderPath
  $resolvedSource = (Resolve-Path -LiteralPath $dependencySource -ErrorAction Stop).ProviderPath
  if (-not (Same-Path $resolvedTarget $resolvedSource)) { throw 'worktree-node-modules-target-mismatch' }
  return $item
}
function Get-PostgresWitness {
  $owned = [System.Collections.Generic.List[object]]::new()
  $all = @(Get-Process -Name postgres -ErrorAction SilentlyContinue)
  $ownedPrefix = [IO.Path]::GetFullPath($postgresBin).TrimEnd('\') + '\'
  foreach ($process in $all) {
    try { $image = $process.Path } catch { throw "postgres-image-path-unavailable:$($process.Id)" }
    if ([string]::IsNullOrWhiteSpace($image)) { throw "postgres-image-path-unavailable:$($process.Id)" }
    $fullImage = [IO.Path]::GetFullPath($image)
    if ($fullImage.StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      $owned.Add([ordered]@{ id = [int]$process.Id; path = $fullImage })
    }
  }
  return [ordered]@{ totalPostgresCount = $all.Count; owned = @($owned) }
}
function Assert-ExactOutputFile([string]$literalPath) {
  $item = Get-LiteralItemOrNull $literalPath
  if ($null -eq $item -or $item.PSIsContainer -or
      (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
      -not (Same-Path $item.FullName $literalPath)) { throw "output-file-identity-invalid:$literalPath" }
  return $item
}

try {
  if (@('Candidate', 'Compatibility') -cnotcontains $mode) { throw 'run-mode-invalid' }
  [string[]]$expectedNames = if ($mode -ceq 'Candidate') {
    $expectedCandidateNames
  } else { $expectedCompatibilityNames }
  if ($expectedNames -isnot [System.Array]) { throw 'selected-test-names-not-array' }
  if ($expectedNames.Count -ne $(if ($mode -ceq 'Candidate') { 3 } else { 1 }) -or
      @($expectedNames | Where-Object { $_ -like 'FINAL_GO_*' }).Count -ne 0) {
    throw 'unresolved-selected-test-name-pins'
  }
  $reviewedHead = Assert-CleanReviewedHead
  if ($env:RUNALAB_TOOL_ROOT -and -not (Same-Path $env:RUNALAB_TOOL_ROOT $toolRoot)) {
    throw 'unexpected-existing-runalab-tool-root'
  }
  Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
  $env:RUNALAB_TOOL_ROOT = $toolRoot

  $operatorIdentitySha256 = Get-TextSha256 ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
  foreach ($entry in $toolPins) { Assert-Hash $entry.path $entry.sha256 }
  $nodeVersion = (& $node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -cne 'v22.22.0') { throw "node-version-mismatch:$nodeVersion" }
  $postgresVersion = (& (Join-Path $postgresBin 'postgres.exe') --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $postgresVersion -cne 'postgres (PostgreSQL) 18.6') {
    throw "postgres-version-mismatch:$postgresVersion"
  }
  Assert-Hash (Join-Path $worktree 'package-lock.json') $lockSha256
  Assert-Hash 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json' $lockSha256
  [void](Assert-OrdinaryDirectory $dependencySource)
  foreach ($entry in $packagePins.GetEnumerator()) {
    Assert-Hash (Join-Path $dependencySource $entry.Key) $entry.Value
  }
  if ($null -ne (Get-LiteralItemOrNull $localModules)) { throw 'worktree-node-modules-must-be-absent' }
  if ($null -ne (Get-LiteralItemOrNull $artifactRoot)) { throw 'artifact-root-must-be-absent' }
  $beforeProcesses = Get-PostgresWitness
  if ($beforeProcesses.owned.Count -ne 0) { throw 'preexisting-runa-postgres-process' }

  [void](New-Item -ItemType Junction -Path $localModules -Target $dependencySource -ErrorAction Stop)
  $linkCreated = $true
  [void](Assert-Junction)
  foreach ($entry in $packagePins.GetEnumerator()) {
    Assert-Hash (Join-Path $localModules $entry.Key) $entry.Value
  }

  [void](New-Item -ItemType Directory -Path $artifactRoot -ErrorAction Stop)
  $artifactCreated = $true
  [void](Assert-OrdinaryDirectory $artifactRoot)
  $stem = if ($mode -ceq 'Candidate') { 'candidate' } else { 'compatibility' }
  $stdoutPath = Join-Path $artifactRoot "$stem.stdout.txt"
  $stderrPath = Join-Path $artifactRoot "$stem.stderr.txt"
  $testPath = if ($mode -ceq 'Candidate') {
    'gate7f/function-first/server-workspace/postgres-lifecycle.integration.test.mjs'
  } else { 'gate7f/function-first/server-workspace/postgres.integration.test.mjs' }
  $argumentLine = if ($mode -ceq 'Candidate') {
    "--test --test-reporter=tap --test-concurrency=1 --test-timeout=180000 --test-name-pattern `"^candidate PostgreSQL`" $testPath"
  } else { "--test --test-reporter=tap --test-concurrency=1 --test-timeout=180000 $testPath" }
  $outerDeadlineMs = if ($mode -ceq 'Candidate') { 600000 } else { 240000 }

  $runner = Start-Process -FilePath $node -ArgumentList $argumentLine -WorkingDirectory $worktree `
    -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
  if (-not $runner.WaitForExit($outerDeadlineMs)) {
    & taskkill.exe /PID $runner.Id /T /F | Out-Null
    [void]$runner.WaitForExit(30000)
    throw "node-test-outer-timeout:${mode}:$outerDeadlineMs"
  }
  $runner.WaitForExit()
  $exitCode = $runner.ExitCode
  $stdoutText = Get-Content -Raw -LiteralPath $stdoutPath -ErrorAction Stop
  $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction Stop
  Write-Output $stdoutText
  if (-not [string]::IsNullOrWhiteSpace($stderrText)) { Write-Output $stderrText }
  if ($exitCode -ne 0) { throw "node-test-failed:${mode}:$exitCode" }

  $topLevelResults = @([regex]::Matches($stdoutText,
    '(?m)^(?<status>ok|not ok) (?<ordinal>[1-9][0-9]*) - (?<name>[^#\r\n]*?)(?<directive>[ \t]+#[^\r\n]*)?\r?$'))
  $selectedResults = @($topLevelResults | Where-Object {
    $name = $_.Groups['name'].Value.TrimEnd()
    if ($mode -ceq 'Candidate') { $name.StartsWith('candidate PostgreSQL',
      [StringComparison]::Ordinal) } else { $name -ceq $expectedCompatibilityNames[0] }
  })
  if ($selectedResults.Count -ne $expectedNames.Count) {
    throw "selected-test-count-mismatch:$($selectedResults.Count)"
  }
  $observedNames = [System.Collections.Generic.List[string]]::new()
  $seenNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  for ($index = 0; $index -lt $expectedNames.Count; $index++) {
    $selected = $selectedResults[$index]
    $name = $selected.Groups['name'].Value.TrimEnd()
    if ($selected.Groups['status'].Value -cne 'ok') { throw "selected-test-unsuccessful:$name" }
    if ($selected.Groups['directive'].Success) { throw "selected-test-directive-forbidden:$name" }
    if (-not $seenNames.Add($name)) { throw "selected-test-duplicate:$name" }
    if ($name -cne $expectedNames[$index]) {
      throw "selected-test-name-mismatch:${index}:$name"
    }
    $observedNames.Add($name)
  }

  $receiptMatches = [regex]::Matches($stdoutText,
    '(?m)^\s*#\s+RUNAAI_SYNTHETIC_POSTGRES_STOP_RECEIPT\s+(?<json>\{[^\r\n]+\})\s*$')
  if ($receiptMatches.Count -ne 1) { throw "process-receipt-count-mismatch:$($receiptMatches.Count)" }
  $receipt = $receiptMatches[0].Groups['json'].Value | ConvertFrom-Json -ErrorAction Stop
  $expectedReceiptFields = @('controlledStopRequested', 'exitCode', 'ownedSyntheticDataRemoved',
    'postgresProcessId', 'productionChanged', 'schemaVersion', 'signal', 'stopped', 'terminalExitConfirmed')
  $actualReceiptFields = @($receipt.PSObject.Properties.Name | Sort-Object)
  if (($actualReceiptFields -join '|') -cne (($expectedReceiptFields | Sort-Object) -join '|')) {
    throw 'process-receipt-shape-invalid'
  }
  if ($receipt.schemaVersion -cne 'runaai-synthetic-postgres-stop-receipt/v1' -or
      $receipt.stopped -cne $true -or $receipt.ownedSyntheticDataRemoved -cne $true -or
      $receipt.productionChanged -cne $false -or $receipt.controlledStopRequested -cne $true -or
      $receipt.terminalExitConfirmed -cne $true -or [long]$receipt.exitCode -ne 0 -or
      $null -ne $receipt.signal -or [long]$receipt.postgresProcessId -lt 1) {
    throw 'process-receipt-value-invalid'
  }
  if ($null -ne (Get-Process -Id ([int]$receipt.postgresProcessId) -ErrorAction SilentlyContinue)) {
    throw "owned-postgres-pid-still-present:$($receipt.postgresProcessId)"
  }
  $afterProcesses = Get-PostgresWitness
  if ($afterProcesses.owned.Count -ne 0) { throw 'post-run-runa-postgres-process' }

  # Recheck immutable inputs before removing the bounded transcript evidence.
  foreach ($entry in $toolPins) { Assert-Hash $entry.path $entry.sha256 }
  Assert-Hash (Join-Path $worktree 'package-lock.json') $lockSha256
  Assert-Hash 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json' $lockSha256
  foreach ($entry in $packagePins.GetEnumerator()) {
    Assert-Hash (Join-Path $dependencySource $entry.Key) $entry.Value
  }
  [void](Assert-ReviewedHeadAndHashes)

  $stdoutItem = Assert-ExactOutputFile $stdoutPath
  $stderrItem = Assert-ExactOutputFile $stderrPath
  $stdoutItem.Delete()
  $stderrItem.Delete()
  $rootItem = Assert-OrdinaryDirectory $artifactRoot
  if (@(Get-ChildItem -Force -LiteralPath $artifactRoot -ErrorAction Stop).Count -ne 0) {
    throw 'artifact-root-not-empty-after-green-run'
  }
  $rootItem.Delete()
  $artifactCreated = $false
  if ($null -ne (Get-LiteralItemOrNull $artifactRoot)) { throw 'artifact-root-removal-not-proved' }
  $testGreen = $true
  $greenResult = [ordered]@{
    schemaVersion = 'runaai-native-postgres-gate2-wrapper-result/v1'
    mode = $mode
    reviewedHead = $reviewedHead
    operatorIdentitySha256 = $operatorIdentitySha256
    selectedTestCount = $observedNames.Count
    selectedTestNames = $observedNames
    processReceipt = $receipt
    preexistingPostgresCount = $beforeProcesses.totalPostgresCount
    postRunPostgresCount = $afterProcesses.totalPostgresCount
    passed = $true
  }
} catch {
  Add-Failure $_.Exception.Message
} finally {
  try {
    $postProcesses = Get-PostgresWitness
    if ($postProcesses.owned.Count -ne 0) { Add-Failure 'final-runa-postgres-process' }
    if ($null -ne $runner -and
        $null -ne (Get-Process -Id $runner.Id -ErrorAction SilentlyContinue)) {
      Add-Failure "final-node-runner-process:$($runner.Id)"
    }
  } catch { Add-Failure "process-witness-cleanup:$($_.Exception.Message)" }

  if ($linkCreated) {
    try {
      $linkItem = Assert-Junction
      $linkItem.Delete() # DirectoryInfo junction object only; never recursive and never the target.
      if ($null -ne (Get-LiteralItemOrNull $localModules)) { throw 'junction-removal-not-proved' }
      [void](Assert-OrdinaryDirectory $dependencySource)
      foreach ($entry in $packagePins.GetEnumerator()) {
        Assert-Hash (Join-Path $dependencySource $entry.Key) $entry.Value
      }
    } catch { Add-Failure "junction-cleanup:$($_.Exception.Message)" }
  } elseif ($null -ne (Get-LiteralItemOrNull $localModules)) {
    Add-Failure 'unowned-worktree-node-modules-appeared'
  }

  if ($artifactCreated -and $testGreen) {
    Add-Failure 'green-artifact-root-was-not-removed'
  }
  # A non-green/unknown artifact root and every diagnostic beneath it are deliberately preserved.
  try {
    foreach ($entry in $toolPins) { Assert-Hash $entry.path $entry.sha256 }
    Assert-Hash (Join-Path $worktree 'package-lock.json') $lockSha256
    Assert-Hash 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json' $lockSha256
    Assert-PostRunStatus (-not $testGreen)
  } catch { Add-Failure "post-run-identity:$($_.Exception.Message)" }

  if ($hadNodePath) { $env:NODE_PATH = $priorNodePath } else { Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue }
  if ($hadToolRoot) { $env:RUNALAB_TOOL_ROOT = $priorToolRoot }
  else { Remove-Item Env:RUNALAB_TOOL_ROOT -ErrorAction SilentlyContinue }
}

if ($failures.Count -ne 0) {
  throw ('native-postgres-gate2-stopped|' + ($failures -join '|'))
}
if (-not $testGreen -or $null -eq $greenResult) {
  throw 'native-postgres-gate2-green-result-unavailable'
}
Write-Output ($greenResult | ConvertTo-Json -Depth 5 -Compress)
```

The wrapper supplies a 600-second Candidate process bound and a 240-second Compatibility bound around the per-test
180-second bound. On timeout it terminates only the exact owned Node process tree, then still performs the exact-path
process/junction/hash witnesses. Any failure stops that mode and prevents its successor; unchanged bytes are not
retried. The prospective green result remains only in memory until the complete `finally` boundary has performed its
process, runner, junction, dependency/hash and post-run-status checks; `passed:true` is emitted only after the
aggregated failure list is empty. Failure artifacts remain for RCA. Neither mode receives Native-process, Control,
browser, network, model, release, production or customer-acceptance credit.
