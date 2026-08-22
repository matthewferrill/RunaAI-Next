[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$ReleaseId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($ReleaseId -notmatch '^[A-Za-z0-9._-]{1,100}$') { throw 'candidate-release-id-invalid' }
$script = Join-Path $Root 'control\Invoke-ControlScheduledBackup.ps1'
if (-not (Test-Path -LiteralPath $script)) { throw 'candidate-backup-script-missing' }
$configRoot = [IO.Path]::GetFullPath((Join-Path $Root 'config'))
$candidate = Get-Content -Raw -LiteralPath (Join-Path $configRoot 'candidate.json') | ConvertFrom-Json
$manifestRef = [string]$candidate.releaseManifestPath
if ($manifestRef -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$') { throw 'candidate-release-manifest-ref-invalid' }
$manifestPath = [IO.Path]::GetFullPath((Join-Path $configRoot $manifestRef))
if (-not [StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $manifestPath), $configRoot)) {
  throw 'candidate-release-manifest-path-invalid'
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.releaseId -ne $ReleaseId -or $manifest.commit -notmatch '^[a-f0-9]{40}$' -or
    $manifest.artifactDigest -notmatch '^[a-f0-9]{64}$') { throw 'candidate-release-id-mismatch' }
$runtime = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
if ($runtime.running.releaseId -ne $manifest.releaseId -or $runtime.running.commit -ne $manifest.commit -or
    $runtime.running.artifactDigest -ne $manifest.artifactDigest) { throw 'candidate-running-release-mismatch' }
$taskPath = '\RunaAI-Next\'
$taskName = 'ProtectedBackup'
if (Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'candidate-backup-task-already-exists' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Root `"$Root`" -ReleaseId `"$ReleaseId`""
$daily = New-ScheduledTaskTrigger -Daily -At '2:15 AM'
$startup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Action $action -Trigger @($daily,$startup) -Settings $settings -Principal $principal | Out-Null
[ordered]@{ schemaVersion='runa2-gate6c-backup-schedule-registration/v1'; registered=$true;
  taskPath=$taskPath; taskName=$taskName; principal='SYSTEM'; retentionMode='fail-closed-at-30-generations';
  protectedDataImported=$false; productionTrafficChanged=$false; privateValuesIncluded=$false } | ConvertTo-Json -Compress
