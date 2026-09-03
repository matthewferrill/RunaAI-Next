$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'RunaContainedProcess.cs'
Add-Type -Path $source

$normal = [RunaContainedProcess]::Run(
    'C:\Windows\System32\hostname.exe',
    [string[]]@(),
    5000,
    8192)

$timeout = [RunaContainedProcess]::Run(
    'C:\Windows\System32\ping.exe',
    [string[]]@('127.0.0.1', '-n', '6'),
    100,
    8192)

$overflow = [RunaContainedProcess]::Run(
    'C:\Windows\System32\findstr.exe',
    [string[]]@('.', 'C:\Windows\System32\drivers\etc\services'),
    5000,
    64)

$startFailure = $false
try { [RunaContainedProcess]::Run('C:\Windows\System32\runa-file-does-not-exist.exe', [string[]]@(), 500, 64) | Out-Null }
catch { $startFailure = $true }

$passed = $normal.Started -and $normal.Terminal -and $normal.NoSurvivors -and $normal.ExitCode -eq 0 -and
    $normal.OutputBytes -gt 0 -and $normal.OutputBytes -le 8192 -and
    $timeout.Started -and $timeout.TimedOut -and $timeout.Terminal -and $timeout.NoSurvivors -and
    $overflow.Started -and $overflow.OutputOverflow -and $overflow.Terminal -and $overflow.NoSurvivors -and
    $startFailure

$record = [pscustomobject][ordered]@{
    schemaVersion = 'runa-contained-process-smoke/v1'
    passed = [bool]$passed
    normalPassed = [bool]($normal.Terminal -and $normal.NoSurvivors -and $normal.ExitCode -eq 0)
    timeoutPassed = [bool]($timeout.TimedOut -and $timeout.Terminal -and $timeout.NoSurvivors)
    overflowPassed = [bool]($overflow.OutputOverflow -and $overflow.Terminal -and $overflow.NoSurvivors)
    startFailurePassed = [bool]$startFailure
    privateValuesIncluded = $false
}
$record | ConvertTo-Json -Compress
if (-not $record.passed) { throw 'contained-process-smoke-failed' }
