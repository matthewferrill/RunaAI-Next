[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$ReleaseId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($ReleaseId -notmatch '^[A-Za-z0-9._-]{1,100}$') { throw 'candidate-release-id-invalid' }
$configRoot = [IO.Path]::GetFullPath((Join-Path $Root 'config'))
$candidate = Get-Content -Raw -LiteralPath (Join-Path $configRoot 'candidate.json') | ConvertFrom-Json
$manifestRef = [string]$candidate.releaseManifestPath
if ($manifestRef -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$') { throw 'candidate-release-manifest-ref-invalid' }
$manifestPath = [IO.Path]::GetFullPath((Join-Path $configRoot $manifestRef))
if (-not [StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $manifestPath), $configRoot)) {
  throw 'candidate-release-manifest-path-invalid'
}
$release = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($release.releaseId -ne $ReleaseId -or $release.commit -notmatch '^[a-f0-9]{40}$' -or
    $release.artifactDigest -notmatch '^[a-f0-9]{64}$') { throw 'candidate-release-id-mismatch' }
$runtime = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
if ($runtime.running.releaseId -ne $release.releaseId -or $runtime.running.commit -ne $release.commit -or
    $runtime.running.artifactDigest -ne $release.artifactDigest) { throw 'candidate-running-release-mismatch' }
$pgBin = Join-Path $Root 'tools\postgresql\pgsql\bin'
$backupRoot = Join-Path $Root 'backups\scheduled'
$generation = Get-ChildItem -LiteralPath $backupRoot -Directory | Where-Object {
  Test-Path -LiteralPath (Join-Path $_.FullName 'BACKUP-MANIFEST.json')
} | Sort-Object Name -Descending | Select-Object -First 1
if (-not $generation) { throw 'candidate-scheduled-backup-missing' }
$backup = Get-Content -Raw -LiteralPath (Join-Path $generation.FullName 'BACKUP-MANIFEST.json') | ConvertFrom-Json
if ($backup.releaseId -ne $ReleaseId -or $backup.releaseCommit -ne $release.commit -or $backup.artifactDigest -ne $release.artifactDigest) { throw 'candidate-scheduled-backup-authority-mismatch' }

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$Code) {
  & $Executable @Arguments *> $null
  if ($LASTEXITCODE -ne 0) { throw $Code }
}
function Invoke-RestoreBytes([string]$Database, [byte[]]$Archive, [string]$Password) {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = (Join-Path $pgBin 'pg_restore.exe')
  $start.Arguments = "-h 127.0.0.1 -p 9765 -U postgres --exit-on-error --no-owner --no-privileges -d $Database"
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.EnvironmentVariables['PGPASSWORD'] = $Password
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $start
  if (-not $process.Start()) { throw 'candidate-scheduled-restore-start-failed' }
  try {
    $process.StandardInput.BaseStream.Write($Archive, 0, $Archive.Length)
    $process.StandardInput.BaseStream.Close()
    $null = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'candidate-scheduled-restore-failed' }
  } finally { $process.Dispose() }
}

Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes("runa2-gate6c-scheduled-backup:$ReleaseId")
$scope = [Security.Cryptography.DataProtectionScope]::LocalMachine
$password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\postgres-admin')).Trim()
$specs = @(
  [pscustomobject]@{ Source='runaai_next'; Restore='g6cproof_runa'; Owner='runa_candidate' },
  [pscustomobject]@{ Source='keycloak_candidate'; Restore='g6cproof_keycloak'; Owner='keycloak_candidate' },
  [pscustomobject]@{ Source='openfga_candidate'; Restore='g6cproof_openfga'; Owner='openfga_candidate' }
)
$created = New-Object Collections.Generic.List[string]
$results = New-Object Collections.Generic.List[object]
$failure = $null
try {
  foreach ($spec in $specs) {
    $present = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 9765 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($spec.Restore)'"
    if (($present -join '').Trim()) { throw 'candidate-restore-target-already-exists' }
    Invoke-Checked (Join-Path $pgBin 'createdb.exe') @('-h','127.0.0.1','-p','9765','-U','postgres','-O',$spec.Owner,$spec.Restore) 'candidate-restore-target-create-failed'
    $created.Add($spec.Restore)
    $protectedPath = Join-Path $generation.FullName "$($spec.Source).dump.dpapi"
    $archive = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedPath), $entropy, $scope)
    Invoke-RestoreBytes $spec.Restore $archive $password
    [Array]::Clear($archive, 0, $archive.Length)
    $tableCount = & (Join-Path $pgBin 'psql.exe') -X -h 127.0.0.1 -p 9765 -U postgres -d $spec.Restore -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')"
    if ($LASTEXITCODE -ne 0) { throw 'candidate-scheduled-restore-query-failed' }
    $results.Add([ordered]@{ database=$spec.Source; distinctTarget=$spec.Restore;
      restored=$true; tableCount=[int](($tableCount -join '').Trim()) })
  }
} catch { $failure = $_ }
finally {
  foreach ($database in $created) {
    Invoke-Checked (Join-Path $pgBin 'dropdb.exe') @('-h','127.0.0.1','-p','9765','-U','postgres','--force',$database) 'candidate-restore-target-cleanup-failed'
  }
  $password = $null
}
if ($failure) { throw $failure }
[ordered]@{ schemaVersion='runa2-gate6c-scheduled-restore-proof/v1'; passed=$true;
  releaseId=$ReleaseId; generation=$generation.Name; databaseCount=$results.Count;
  distinctRestoreVerified=$results.Count -eq $specs.Count; distinctTargetsDestroyed=$created.Count -eq $specs.Count;
  plaintextBackupCount=0; privateValuesIncluded=$false } | ConvertTo-Json -Compress
