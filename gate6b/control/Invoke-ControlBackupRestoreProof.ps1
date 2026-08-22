[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$ReleaseId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($ReleaseId -notmatch '^[A-Za-z0-9._-]{1,100}$') { throw 'candidate-release-id-invalid' }

$taskPath = '\RunaAI-Next\'
$pgBin = Join-Path $Root 'tools\postgresql\pgsql\bin'
$releaseManifest = Get-Content -Raw -LiteralPath (Join-Path $Root 'config\release.json') | ConvertFrom-Json
if ($releaseManifest.releaseId -ne $ReleaseId) { throw 'candidate-release-id-mismatch' }
$runtime = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 15
$readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 15
if ($runtime.running.releaseId -ne $ReleaseId -or $runtime.cutover.phase -ne 'planned' -or $runtime.cutover.revision -ne 0 -or $runtime.authorityGeneration -ne 'legacy-runaai:control-production') { throw 'candidate-backup-authority-mismatch' }
if ($readiness.authority -ne 'shadow' -or $readiness.protectedDataImported -ne $false -or $readiness.ownerCredentialEnrolled -ne $false -or $readiness.productionTrafficChanged -ne $false) {
  throw 'candidate-backup-boundary-mismatch'
}

$backupRoot = Join-Path $Root "backups\$ReleaseId"
$workRoot = Join-Path $backupRoot 'disposable-work'
if (Test-Path -LiteralPath $backupRoot) { throw 'candidate-backup-proof-already-exists' }
New-Item -ItemType Directory -Path $workRoot | Out-Null
$aclIdentity = "$env:COMPUTERNAME\$env:USERNAME"
& icacls.exe $backupRoot '/inheritance:r' '/grant:r' 'SYSTEM:(OI)(CI)F' "$aclIdentity`:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'candidate-backup-acl-failed' }

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$Code) {
  $priorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $Executable @Arguments *> $null
  $nativeExit = $LASTEXITCODE
  $ErrorActionPreference = $priorPreference
  if ($nativeExit -ne 0) { throw $Code }
}
function Hash-Bytes([byte[]]$Value) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { $hash = $algorithm.ComputeHash($Value) } finally { $algorithm.Dispose() }
  return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}
function Canonical-DumpHash([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  $text = [regex]::Replace($text, '(?m)^\\(?:un)?restrict[^\r\n]*\r?\n', '')
  $text = $text.Replace("`r`n", "`n")
  return Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($text))
}
function Invoke-PsqlLines([string]$Database, [string]$Query) {
  $priorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $lines = @(& (Join-Path $pgBin 'psql.exe') -X -h 127.0.0.1 -p 9765 -U postgres -d $Database -A -t -v ON_ERROR_STOP=1 -c $Query)
  $nativeExit = $LASTEXITCODE
  $ErrorActionPreference = $priorPreference
  if ($nativeExit -ne 0) { throw 'candidate-backup-data-digest-failed' }
  return $lines
}
function Quote-Identifier([string]$Value) { return '"' + $Value.Replace('"','""') + '"' }
function Database-DataSummary([string]$Database) {
  $tableRecords = @(Invoke-PsqlLines $Database "SELECT json_build_array(schemaname,tablename)::text FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename")
  $tables = New-Object Collections.Generic.List[object]
  $totalRows = 0
  foreach ($record in $tableRecords) {
    if (-not $record) { continue }
    $identity = $record | ConvertFrom-Json
    $schema = [string]$identity[0]
    $table = [string]$identity[1]
    $qualified = "$(Quote-Identifier $schema).$(Quote-Identifier $table)"
    $rows = @(Invoke-PsqlLines $Database "SELECT to_jsonb(row_value)::text FROM $qualified AS row_value ORDER BY to_jsonb(row_value)::text")
    $rowText = $rows -join "`n"
    $tables.Add([ordered]@{ schema=$schema; table=$table; rows=$rows.Count;
      digest=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($rowText))) })
    $totalRows += $rows.Count
  }
  $canonical = ConvertTo-Json -InputObject ($tables.ToArray()) -Depth 5 -Compress
  return [pscustomobject]@{ tableCount=$tables.Count; rowCount=$totalRows;
    digest=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($canonical))) }
}
function Wait-PortAbsent([int[]]$Ports, [int]$Seconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    Start-Sleep -Seconds 1
    $present = @($Ports | Where-Object { Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue })
  } until ($present.Count -eq 0 -or [DateTime]::UtcNow -gt $deadline)
  if ($present.Count -ne 0) { throw 'candidate-backup-service-stop-failed' }
}
function Wait-Url([string]$Uri, [int]$Seconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    Start-Sleep -Seconds 1
    try { $ready = (Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 3).StatusCode -eq 200 }
    catch { $ready = $false }
  } until ($ready -or [DateTime]::UtcNow -gt $deadline)
  if (-not $ready) { throw 'candidate-backup-service-recovery-failed' }
}

Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes("runa2-gate6b-backup:$ReleaseId")
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
$env:PGPASSWORD = [IO.File]::ReadAllText((Join-Path $Root 'secrets\postgres-admin')).Trim()
$databaseSpecs = @(
  [pscustomobject]@{ Source = 'runaai_next'; Restore = 'restoreproof_runa'; Owner = 'runa_candidate' },
  [pscustomobject]@{ Source = 'keycloak_candidate'; Restore = 'restoreproof_keycloak'; Owner = 'keycloak_candidate' },
  [pscustomobject]@{ Source = 'openfga_candidate'; Restore = 'restoreproof_openfga'; Owner = 'openfga_candidate' }
)
$createdRestores = New-Object Collections.Generic.List[string]
$stoppedTasks = New-Object Collections.Generic.List[string]
$results = New-Object Collections.Generic.List[object]
$proofFailure = $null

try {
  foreach ($name in @('Application','Keycloak','OpenFga')) {
    if ((Get-ScheduledTask -TaskPath $taskPath -TaskName $name).State -eq 'Running') {
      Stop-ScheduledTask -TaskPath $taskPath -TaskName $name
      $stoppedTasks.Add($name)
    }
  }
  Wait-PortAbsent @(9760,9762,9763,9764,9766) 90

  foreach ($spec in $databaseSpecs) {
    $present = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 9765 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($spec.Restore)'"
    if (($present -join '').Trim()) { throw 'candidate-restore-target-already-exists' }
    $sourceDump = Join-Path $workRoot "$($spec.Source).dump"
    $sourceSchema = Join-Path $workRoot "$($spec.Source).schema.sql"
    $restoredSchema = Join-Path $workRoot "$($spec.Source).restored.schema.sql"
    Invoke-Checked (Join-Path $pgBin 'pg_dump.exe') @('-h','127.0.0.1','-p','9765','-U','postgres',
      '--format=custom','--no-owner','--no-privileges','--file', $sourceDump, $spec.Source) 'candidate-backup-dump-failed'
    $sourceBytes = [IO.File]::ReadAllBytes($sourceDump)
    $protected = [Security.Cryptography.ProtectedData]::Protect($sourceBytes, $entropy, $scope)
    $protectedPath = Join-Path $backupRoot "$($spec.Source).dump.dpapi"
    [IO.File]::WriteAllBytes($protectedPath, $protected)
    $roundTrip = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedPath), $entropy, $scope)
    if ((Hash-Bytes $roundTrip) -ne (Hash-Bytes $sourceBytes)) { throw 'candidate-backup-encryption-roundtrip-failed' }

    Invoke-Checked (Join-Path $pgBin 'createdb.exe') @('-h','127.0.0.1','-p','9765','-U','postgres',
      '-O', $spec.Owner, $spec.Restore) 'candidate-restore-target-create-failed'
    $createdRestores.Add($spec.Restore)
    Invoke-Checked (Join-Path $pgBin 'pg_restore.exe') @('-h','127.0.0.1','-p','9765','-U','postgres',
      '--exit-on-error','--no-owner','--no-privileges','-d', $spec.Restore, $sourceDump) 'candidate-backup-restore-failed'
    Invoke-Checked (Join-Path $pgBin 'pg_dump.exe') @('-h','127.0.0.1','-p','9765','-U','postgres',
      '--schema-only','--no-owner','--no-privileges','--no-comments','--file', $sourceSchema, $spec.Source) 'candidate-source-schema-dump-failed'
    Invoke-Checked (Join-Path $pgBin 'pg_dump.exe') @('-h','127.0.0.1','-p','9765','-U','postgres',
      '--schema-only','--no-owner','--no-privileges','--no-comments','--file', $restoredSchema, $spec.Restore) 'candidate-restored-schema-dump-failed'
    $sourceSchemaDigest = Canonical-DumpHash $sourceSchema
    $restoredSchemaDigest = Canonical-DumpHash $restoredSchema
    $sourceData = Database-DataSummary $spec.Source
    $restoredData = Database-DataSummary $spec.Restore
    $sourceLogicalDigest = Hash-Bytes ([Text.Encoding]::UTF8.GetBytes("$sourceSchemaDigest`n$($sourceData.digest)"))
    $restoredLogicalDigest = Hash-Bytes ([Text.Encoding]::UTF8.GetBytes("$restoredSchemaDigest`n$($restoredData.digest)"))
    if ($sourceLogicalDigest -ne $restoredLogicalDigest) { throw 'candidate-backup-logical-restore-mismatch' }
    $results.Add([ordered]@{
      database = $spec.Source
      restoreTarget = $spec.Restore
      sourceArchiveBytes = $sourceBytes.Length
      sourceArchiveDigest = Hash-Bytes $sourceBytes
      encryptedBackupBytes = $protected.Length
      encryptedBackupDigest = Hash-Bytes $protected
      dpapiCurrentUserRoundTrip = $true
      schemaDigest = $sourceSchemaDigest
      tableCount = $sourceData.tableCount
      rowCount = $sourceData.rowCount
      sourceLogicalDigest = $sourceLogicalDigest
      restoredLogicalDigest = $restoredLogicalDigest
      exact = $true
    })
  }
} catch { $proofFailure = $_ }
finally {
  foreach ($database in $createdRestores) {
    Invoke-Checked (Join-Path $pgBin 'dropdb.exe') @('-h','127.0.0.1','-p','9765','-U','postgres','--force',$database) 'candidate-restore-target-cleanup-failed'
  }
  if (Test-Path -LiteralPath $workRoot) {
    $resolvedBackup = [IO.Path]::GetFullPath($backupRoot).TrimEnd('\') + '\'
    $resolvedWork = [IO.Path]::GetFullPath($workRoot)
    if (-not $resolvedWork.StartsWith($resolvedBackup, [StringComparison]::OrdinalIgnoreCase)) { throw 'candidate-backup-cleanup-path-invalid' }
    Remove-Item -LiteralPath $workRoot -Recurse -Force
  }
  $env:PGPASSWORD = $null
  foreach ($name in @('OpenFga','Keycloak')) {
    if ($stoppedTasks.Contains($name)) { Start-ScheduledTask -TaskPath $taskPath -TaskName $name }
  }
  if ($stoppedTasks.Contains('OpenFga')) { Wait-Url 'http://127.0.0.1:9763/healthz' 90 }
  if ($stoppedTasks.Contains('Keycloak')) { Wait-Url 'http://127.0.0.1:9762/realms/runaai-next/.well-known/openid-configuration' 180 }
  if ($stoppedTasks.Contains('Application')) {
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
    Wait-Url 'http://127.0.0.1:9760/health/live' 600
  }
}
if ($proofFailure) { throw $proofFailure }

$manifest = [ordered]@{
  schemaVersion = 'runa2-gate6b-backup-restore-proof/v1'
  releaseId = $ReleaseId
  commit = $releaseManifest.commit
  artifactDigest = $releaseManifest.artifactDigest
  authorityGeneration = 'legacy-runaai:control-production'
  cutoverPhase = 'planned'
  cutoverRevision = 0
  encryption = 'DPAPI CurrentUser'
  databases = $results
  distinctTargetsDestroyed = $createdRestores.Count -eq $databaseSpecs.Count
  plaintextWorkRemoved = -not (Test-Path -LiteralPath $workRoot)
  servicesRecovered = (Invoke-RestMethod -Uri 'http://127.0.0.1:9760/health/ready' -TimeoutSec 15).ready
  protectedDataImported = $false
  ownerCredentialEnrolled = $false
  productionTrafficChanged = $false
  privateValuesIncluded = $false
}
$manifestPath = Join-Path $backupRoot 'BACKUP-RESTORE-PROOF.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8
[ordered]@{
  schemaVersion = $manifest.schemaVersion
  releaseId = $ReleaseId
  databaseCount = $results.Count
  allExact = @($results | Where-Object { -not $_.exact }).Count -eq 0
  encryptedBackupCount = @(Get-ChildItem -LiteralPath $backupRoot -Filter '*.dpapi' -File).Count
  distinctTargetsDestroyed = $manifest.distinctTargetsDestroyed
  plaintextWorkRemoved = $manifest.plaintextWorkRemoved
  servicesRecovered = $manifest.servicesRecovered
  manifestDigest = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
  protectedDataImported = $false
  privateValuesIncluded = $false
} | ConvertTo-Json -Compress
