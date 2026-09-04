# Native PostgreSQL Gate 2 Candidate failure RCA — 2026-09-04

## Disposition

- Classification: actual PostgreSQL product SQL defect in candidate initialization; not a model failure and not three independent failures.
- Gate result: **STOPPED**. All three Candidate tests reached the disposable PostgreSQL service, then stopped at the same initialization statement before their scenario bodies could proceed.
- Error: PostgreSQL SQLSTATE `0A000`, `FOR UPDATE cannot be applied to the nullable side of an outer join`.
- Resume point: all three exact Candidate tests, once, after this source correction is committed, independently reviewed, and the exact wrapper pins are refreshed.
- Compatibility remains forbidden until the resumed Candidate stage and every cleanup witness are green.

## Evidence and blast radius

The three top-level Candidate tests each failed from `PostgresServerWorkspaceStore.initialize()` at the same statement in
`server-workspace/postgres.mjs`. Their durations and stacks show one shared setup defect rather than three feature
failures. The Node runner returned `1`, and the wrapper stopped without starting Compatibility.

The disposable PostgreSQL helper emitted one valid terminal receipt for PID `31576`: controlled stop requested, exit
code `0`, terminal exit confirmed, owned synthetic data removed, and `productionChanged=false`. The wrapper's final
witness found no Runa-owned PostgreSQL process and removed its temporary `node_modules` junction. Failure transcripts
were retained under the bounded Candidate artifact root for this RCA.

No model, browser, Control host, production service, customer data, or network model endpoint was exercised.

## Root cause

The migration query identifies nonterminal workspace rows that lack a matching operation-authority row by using a
`LEFT JOIN`. Its unqualified trailing `FOR UPDATE` asked PostgreSQL to lock every relation in the query, including the
nullable authority side of the outer join. PostgreSQL correctly rejects that lock shape because a missing authority row
does not exist to lock.

The migration only needs to lock the selected workspace rows before changing them. The query already names those rows as
`workspace_row`, but the lock clause did not restrict its target.

## Correction design

Change only the lock clause from unqualified `FOR UPDATE` to `FOR UPDATE OF workspace_row`. This preserves the required
transactional lock on every workspace row that may be migrated to `unknown`, while avoiding an impossible lock on the
nullable authority side. The join predicate, lifecycle filter, fail-closed migration, payload rewrite, revision change,
and outbox evidence remain unchanged.

No fixture expectation or test selection is relaxed. Because all three Candidate scenarios stopped in their shared
initialization path and none passed, the affected-stage resume must run the same exact three tests once. A failure stops
again for RCA; a green result permits a separate Compatibility review and authorization.

## Prevention

- Outer-join locking queries must name only the concrete relation whose rows are mutated.
- A deterministic source invariant inventories every `LEFT`, `RIGHT`, or `FULL JOIN` query that also uses a row lock,
  requires an explicit `OF` target, pins the two present queries to their concrete workspace aliases, and rejects each
  nullable-side alias.
- The corrected exact source must be parsed and independently reviewed before execution.
- Actual PostgreSQL remains the authority for SQL-dialect behavior; mock or parser-only evidence cannot grant this gate.

## Bounded failure-evidence preservation before resume

The frozen wrapper requires the live Candidate artifact root to be absent before a run. Preserve, rather than delete or
overwrite, the failed-attempt transcripts at this exact archival path:

```text
D:\Projects\Runalab\runaai-next-native-control-host\artifacts\runs\m1-s2b1-postgres-lifecycle-failure-20260904-sqlstate-0a000
```

The move is authorized only when all of these checks pass in one PowerShell identity:

1. Resolve the worktree and `artifacts\runs` parent, then prove the literal source and proposed destination are descendants
   of that parent.
2. Require the source to be an ordinary, non-reparse directory and the destination to be absent.
3. Require the source to contain exactly the two ordinary, non-reparse files `candidate.stdout.txt` and
   `candidate.stderr.txt`, with no descendants or other entries.
4. Require SHA-256 `093D7D5083C9F0E4FF7F4EE7B1D764250313D5A992DA63EA2BB16E0440818D79` for stdout and
   `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` for stderr.
5. Move only the literal source directory to the literal destination with `Move-Item -LiteralPath`.
6. Prove the source absent; reauthenticate the destination as an ordinary directory containing exactly the same two
   ordinary files with the same hashes.
7. Prove the worktree HEAD and status are unchanged, `node_modules` remains absent, and no Runa-owned PostgreSQL process
   exists. Any failed check stops without starting Node or PostgreSQL.

The archive remains failure evidence and is not reused as input to the resumed test.

### Literal preservation boundary — frozen, unexecuted

The exact block below performs the preservation move. A fresh post-commit reviewer must replace the single
`ARCHIVE_GO_40_HEX_COMMIT` value in memory, parse the exact substituted block without invoking it, and authorize that
exact text. Any failure preserves the evidence wherever it then exists, performs no reverse move, deletion, or overwrite,
and denies Candidate pending review.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedHead = 'ARCHIVE_GO_40_HEX_COMMIT'
$worktree = 'D:\Projects\Runalab\runaai-next-native-control-host'
$runsParent = Join-Path $worktree 'artifacts\runs'
$source = Join-Path $runsParent 'm1-s2b1-postgres-lifecycle'
$destination = Join-Path $runsParent 'm1-s2b1-postgres-lifecycle-failure-20260904-sqlstate-0a000'
$localModules = Join-Path $worktree 'node_modules'
$postgresBin = 'D:\Projects\Runalab\artifacts\tools\postgresql\bin\pgsql\bin'
$fsutil = 'C:\Windows\System32\fsutil.exe'
$expectedFiles = [ordered]@{
  'candidate.stdout.txt' = '093D7D5083C9F0E4FF7F4EE7B1D764250313D5A992DA63EA2BB16E0440818D79'
  'candidate.stderr.txt' = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
}

function Canonical-Path([string]$literalPath) {
  return [IO.Path]::GetFullPath($literalPath).TrimEnd('\')
}
function Same-Path([string]$left, [string]$right) {
  return (Canonical-Path $left).Equals((Canonical-Path $right), [StringComparison]::OrdinalIgnoreCase)
}
function Assert-Descendant([string]$parent, [string]$child) {
  $prefix = (Canonical-Path $parent) + '\'
  if (-not (Canonical-Path $child).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "path-outside-parent:$child"
  }
}
function Get-LiteralItemOrNull([string]$literalPath) {
  try { return Get-Item -Force -LiteralPath $literalPath -ErrorAction Stop }
  catch [System.Management.Automation.ItemNotFoundException] { return $null }
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
function Assert-OrdinaryFile([string]$literalPath, [string]$expectedHash) {
  $item = Get-LiteralItemOrNull $literalPath
  if ($null -eq $item -or $item.PSIsContainer -or
      (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
      -not (Same-Path $item.FullName $literalPath)) {
    throw "ordinary-file-required:$literalPath"
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $literalPath -ErrorAction Stop).Hash
  if ($actual -cne $expectedHash) { throw "file-hash-mismatch:${literalPath}:$actual" }
  return $item
}
function Get-FileId([string]$literalPath) {
  $output = @(& $fsutil file queryFileID $literalPath 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "file-id-query-failed:$literalPath" }
  $matches = [regex]::Matches(($output -join "`n"), '(?i)\b0x[0-9a-f]{16,32}\b')
  if ($matches.Count -ne 1) { throw "file-id-shape-invalid:$literalPath" }
  return $matches[0].Value.ToLowerInvariant()
}
function Assert-EvidenceShape([string]$root) {
  $rootItem = Assert-OrdinaryDirectory $root
  $entries = @(Get-ChildItem -Force -LiteralPath $root -ErrorAction Stop)
  if ($entries.Count -ne $expectedFiles.Count) { throw "evidence-entry-count:$($entries.Count)" }
  $fileIds = [ordered]@{}
  foreach ($entry in $entries) {
    if (-not $expectedFiles.Contains($entry.Name)) { throw "unexpected-evidence-entry:$($entry.Name)" }
    [void](Assert-OrdinaryFile $entry.FullName $expectedFiles[$entry.Name])
    $fileIds[$entry.Name] = Get-FileId $entry.FullName
  }
  foreach ($name in $expectedFiles.Keys) {
    if (-not $fileIds.Contains($name)) { throw "missing-evidence-file:$name" }
  }
  return [ordered]@{ directoryId = Get-FileId $rootItem.FullName; fileIds = $fileIds }
}
function Assert-CleanHead {
  $head = (& git -c "safe.directory=$worktree" -C $worktree rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -cne $expectedHead) { throw "reviewed-head-mismatch:$head" }
  $status = @(& git -c "safe.directory=$worktree" -C $worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) { throw 'worktree-not-clean' }
  return $head
}
function Assert-NoOwnedPostgres {
  $ownedPrefix = (Canonical-Path $postgresBin) + '\'
  foreach ($process in @(Get-Process -Name postgres -ErrorAction SilentlyContinue)) {
    try { $image = $process.Path } catch { throw "postgres-image-path-unavailable:$($process.Id)" }
    if ([string]::IsNullOrWhiteSpace($image)) { throw "postgres-image-path-unavailable:$($process.Id)" }
    if ((Canonical-Path $image).StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "runa-postgres-process-present:$($process.Id)"
    }
  }
}
function Assert-DestinationAbsent {
  if ($null -ne (Get-LiteralItemOrNull $destination)) { throw 'archive-destination-occupied' }
  $leaf = [IO.Path]::GetFileName($destination)
  $collisions = @(Get-ChildItem -Force -LiteralPath $runsParent -ErrorAction Stop |
    Where-Object { $_.Name.Equals($leaf, [StringComparison]::OrdinalIgnoreCase) })
  if ($collisions.Count -ne 0) { throw 'archive-destination-collision' }
}

try {
  if (-not (Test-Path -LiteralPath $fsutil -PathType Leaf)) { throw 'fsutil-unavailable' }
  [void](Assert-OrdinaryDirectory $worktree)
  [void](Assert-OrdinaryDirectory $runsParent)
  Assert-Descendant $runsParent $source
  Assert-Descendant $runsParent $destination
  if ($null -ne (Get-LiteralItemOrNull $localModules)) { throw 'node-modules-entry-present' }
  Assert-NoOwnedPostgres
  $reviewedHead = Assert-CleanHead
  Assert-DestinationAbsent
  $before = Assert-EvidenceShape $source

  Move-Item -LiteralPath $source -Destination $destination -ErrorAction Stop

  if ($null -ne (Get-LiteralItemOrNull $source)) { throw 'live-candidate-root-still-present' }
  $after = Assert-EvidenceShape $destination
  if ($after.directoryId -cne $before.directoryId) { throw 'archive-directory-identity-changed' }
  foreach ($name in $expectedFiles.Keys) {
    if ($after.fileIds[$name] -cne $before.fileIds[$name]) { throw "archive-file-identity-changed:$name" }
  }
  [void](Assert-OrdinaryDirectory $worktree)
  [void](Assert-OrdinaryDirectory $runsParent)
  Assert-Descendant $runsParent $destination
  if ($null -ne (Get-LiteralItemOrNull $localModules)) { throw 'post-move-node-modules-entry-present' }
  Assert-NoOwnedPostgres
  [void](Assert-CleanHead)
  [ordered]@{
    schemaVersion = 'runaai-native-postgres-failure-archive/v1'
    reviewedHead = $reviewedHead
    sourceAbsent = $true
    archivePath = $destination
    directoryId = $after.directoryId
    fileIds = $after.fileIds
    hashes = $expectedFiles
    passed = $true
  } | ConvertTo-Json -Depth 5 -Compress
} catch {
  throw ('failure-evidence-preservation-stopped|' + $_.Exception.Message)
}
```
