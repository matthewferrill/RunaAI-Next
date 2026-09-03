param(
  [Parameter(Mandatory = $true)][string]$ReadyPath,
  [Parameter(Mandatory = $true)][string]$RootPidPath,
  [Parameter(Mandatory = $true)][string]$StopPath,
  [Parameter(Mandatory = $true)][string]$ResultPath,
  [ValidateRange(1000,30000)][int]$MaximumMs = 20000
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$events = [Collections.Generic.List[object]]::new()
$watcher = [Management.ManagementEventWatcher]::new('SELECT * FROM Win32_ProcessStartTrace')
$watcher.Options.Timeout = [TimeSpan]::FromMilliseconds(100)
$deadline = [DateTime]::UtcNow.AddMilliseconds($MaximumMs)
$rootProcess = $null

try {
  $watcher.Start()
  [IO.File]::WriteAllText($ReadyPath, 'ready', [Text.Encoding]::ASCII)
  while (-not [IO.File]::Exists($StopPath) -and [DateTime]::UtcNow -lt $deadline) {
    if (-not $rootProcess -and [IO.File]::Exists($RootPidPath)) {
      $observedRootPid = [int]([IO.File]::ReadAllText($RootPidPath, [Text.Encoding]::ASCII))
      $rootDetails = Get-CimInstance Win32_Process -Filter "ProcessId=$observedRootPid" -ErrorAction SilentlyContinue
      if ($rootDetails -and $rootDetails.ExecutablePath -and [IO.File]::Exists([string]$rootDetails.ExecutablePath)) {
        $rootProcess = [pscustomobject]@{ processId=$observedRootPid; processName=[string]$rootDetails.Name;
          executablePath=[string]$rootDetails.ExecutablePath;
          executableSha256=(Get-FileHash -LiteralPath ([string]$rootDetails.ExecutablePath) -Algorithm SHA256).Hash.ToLowerInvariant() }
      }
    }
    try {
      $event = $watcher.WaitForNextEvent()
      $processId = [int]$event.ProcessID
      $details = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
      $executablePath = if ($details) { [string]$details.ExecutablePath } else { '' }
      $executableSha256 = if ($executablePath -and [IO.File]::Exists($executablePath)) {
        (Get-FileHash -LiteralPath $executablePath -Algorithm SHA256).Hash.ToLowerInvariant()
      } else { '' }
      $events.Add([pscustomobject]@{ processId=$processId;
        parentProcessId=[int]$event.ParentProcessID; processName=[string]$event.ProcessName;
        executablePath=$executablePath; executableSha256=$executableSha256 })
    } catch [Management.ManagementException] {
      if ($_.Exception.ErrorCode -ne [Management.ManagementStatus]::Timedout) { throw }
    }
  }
} finally {
  try { $watcher.Stop() } catch {}
  $watcher.Dispose()
}

if (-not [IO.File]::Exists($RootPidPath)) { throw 'process-audit-root-missing' }
$rootPid = [int]([IO.File]::ReadAllText($RootPidPath, [Text.Encoding]::ASCII))
$known = [Collections.Generic.HashSet[int]]::new()
[void]$known.Add($rootPid)
$descendants = [Collections.Generic.List[object]]::new()
foreach ($event in $events) {
  if ($known.Contains([int]$event.parentProcessId)) {
    [void]$known.Add([int]$event.processId)
    $descendants.Add($event)
  }
}
$survivors = @()
foreach ($processId in $known) {
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) { $survivors += $processId }
}
$result = @{ schemaVersion='runa-omen-process-tree-audit/v1'; rootPid=$rootPid; rootProcess=$rootProcess;
  descendants=@($descendants); survivorProcessIds=@($survivors); timedOut=([DateTime]::UtcNow -ge $deadline) }
[IO.File]::WriteAllText($ResultPath, ($result | ConvertTo-Json -Compress -Depth 6),
  [Text.UTF8Encoding]::new($false))
