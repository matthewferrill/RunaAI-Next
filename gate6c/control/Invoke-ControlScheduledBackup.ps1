[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$ReleaseId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($ReleaseId -notmatch '^[A-Za-z0-9._-]{1,100}$') { throw 'candidate-release-id-invalid' }
$manifest = Get-Content -Raw -LiteralPath (Join-Path $Root 'config\release.json') | ConvertFrom-Json
if ($manifest.releaseId -ne $ReleaseId) { throw 'candidate-release-id-mismatch' }
$pgDump = Join-Path $Root 'tools\postgresql\pgsql\bin\pg_dump.exe'
if (-not (Test-Path -LiteralPath $pgDump)) { throw 'candidate-backup-tool-missing' }
$backupRoot = Join-Path $Root 'backups\scheduled'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$resolvedBackup = [IO.Path]::GetFullPath($backupRoot).TrimEnd('\') + '\'
if (-not $resolvedBackup.StartsWith('C:\AI\RunaAI-Next-Candidate\backups\', [StringComparison]::OrdinalIgnoreCase)) { throw 'candidate-backup-root-invalid' }
& icacls.exe $backupRoot '/inheritance:r' '/grant:r' 'SYSTEM:(OI)(CI)F' 'RUNA-CONTROL\Matthew:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'candidate-backup-acl-failed' }

$completed = @(Get-ChildItem -LiteralPath $backupRoot -Directory | Where-Object {
  Test-Path -LiteralPath (Join-Path $_.FullName 'BACKUP-MANIFEST.json')
})
if ($completed.Count -ge 30) { throw 'candidate-backup-retention-capacity-reached' }
$generation = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$generationRoot = Join-Path $backupRoot $generation
New-Item -ItemType Directory -Path $generationRoot | Out-Null
$resolvedGeneration = [IO.Path]::GetFullPath($generationRoot)
if (-not $resolvedGeneration.StartsWith($resolvedBackup, [StringComparison]::OrdinalIgnoreCase)) { throw 'candidate-backup-generation-invalid' }

function Hash-Bytes([byte[]]$Value) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($algorithm.ComputeHash($Value)) -replace '-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose() }
}
function Invoke-DumpBytes([string]$Database, [string]$Password) {
  if ($Database -notin @('runaai_next','keycloak_candidate','openfga_candidate')) { throw 'candidate-backup-database-invalid' }
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $pgDump
  $start.Arguments = "-h 127.0.0.1 -p 9765 -U postgres --format=custom --no-owner --no-privileges $Database"
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.EnvironmentVariables['PGPASSWORD'] = $Password
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $start
  if (-not $process.Start()) { throw 'candidate-backup-dump-start-failed' }
  $memory = New-Object IO.MemoryStream
  try {
    $process.StandardOutput.BaseStream.CopyTo($memory)
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'candidate-backup-dump-failed' }
    return $memory.ToArray()
  } finally { $memory.Dispose(); $process.Dispose() }
}

Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes("runa2-gate6c-scheduled-backup:$ReleaseId")
$scope = [Security.Cryptography.DataProtectionScope]::LocalMachine
$password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\postgres-admin')).Trim()
$results = New-Object Collections.Generic.List[object]
try {
  foreach ($database in @('runaai_next','keycloak_candidate','openfga_candidate')) {
    $dump = Invoke-DumpBytes $database $password
    $protected = [Security.Cryptography.ProtectedData]::Protect($dump, $entropy, $scope)
    $path = Join-Path $generationRoot "$database.dump.dpapi"
    [IO.File]::WriteAllBytes($path, $protected)
    $roundTrip = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $entropy, $scope)
    if ((Hash-Bytes $roundTrip) -ne (Hash-Bytes $dump)) { throw 'candidate-backup-encryption-roundtrip-failed' }
    $results.Add([ordered]@{ database=$database; archiveBytes=$dump.Length;
      archiveDigest=(Hash-Bytes $dump); encryptedBytes=$protected.Length;
      encryptedDigest=(Hash-Bytes $protected); encrypted=$true })
    [Array]::Clear($dump, 0, $dump.Length)
    [Array]::Clear($roundTrip, 0, $roundTrip.Length)
  }
} finally { $password = $null }

$result = [ordered]@{ schemaVersion='runa2-gate6c-scheduled-backup/v1'; releaseId=$ReleaseId;
  releaseCommit=$manifest.commit; artifactDigest=$manifest.artifactDigest; generation=$generation;
  encryption='DPAPI LocalMachine'; databases=$results; plaintextBackupCount=0;
  privateValuesIncluded=$false }
$manifestPath = Join-Path $generationRoot 'BACKUP-MANIFEST.json'
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8
[ordered]@{ schemaVersion=$result.schemaVersion; passed=$true; generation=$generation;
  encryptedBackupCount=$results.Count; plaintextBackupCount=0;
  manifestDigest=(Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant();
  privateValuesIncluded=$false } | ConvertTo-Json -Compress
