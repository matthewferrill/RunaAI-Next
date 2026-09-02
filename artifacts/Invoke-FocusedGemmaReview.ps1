[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RunnerPath,
  [Parameter(Mandatory)][string]$ReadinessReceiptPath,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
  [ValidateSet('answerer','checker','rechecker')][string]$PhaseMode = 'answerer',
  [string]$InputRunId = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$resolvedRunner = [IO.Path]::GetFullPath($RunnerPath)
$resolvedReadiness = [IO.Path]::GetFullPath($ReadinessReceiptPath)
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$readiness = Get-Content -LiteralPath $resolvedReadiness -Raw | ConvertFrom-Json
if ($readiness.schemaVersion -cne 'runaai-focused-review-readiness/v1' -or
    $readiness.passed -cne $true -or $readiness.modelsInvoked -cne $false) {
  throw 'focused-review-readiness-invalid'
}
$readinessAge = [DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($readiness.collectedAt)
if ($readinessAge.TotalMinutes -gt 30) { throw 'focused-review-readiness-stale' }

& node.exe --check $resolvedRunner
if ($LASTEXITCODE -ne 0) { throw 'focused-review-runner-syntax' }
if (Select-String -LiteralPath $resolvedRunner -Pattern '\$(HOME|home|CODEX_HOME)\b' -CaseSensitive:$false) {
  throw 'focused-review-runner-reserved-variable'
}

$runnerBytes = [IO.File]::ReadAllBytes($resolvedRunner)
$runnerSha256 = (Get-FileHash -LiteralPath $resolvedRunner -Algorithm SHA256).Hash.ToLowerInvariant()
$runSuffix = -join ((1..12) | ForEach-Object { '{0:x}' -f (Get-Random -Minimum 0 -Maximum 16) })
$actualRunId = $(if ($PhaseMode -ceq 'checker') { 'focused-review-checker-20260902-' } elseif ($PhaseMode -ceq 'rechecker') { 'focused-review-rechecker-20260902-' } else { 'focused-review-20260902-' }) + $runSuffix
if (($PhaseMode -ceq 'checker' -and $InputRunId -cnotmatch '^focused-review-20260902-[a-f0-9]{12}$') -or
    ($PhaseMode -ceq 'rechecker' -and $InputRunId -cnotmatch '^focused-review-checker-20260902-[a-f0-9]{12}$')) {
  throw 'focused-review-input-run-id'
}
$nestedCommand = 'ssh -o ClearAllForwardings=yes -o BatchMode=yes -o ConnectTimeout=8 runa-home-codex node.exe - ' +
  $actualRunId + ' ' + $runnerSha256 + ' ' + $SourceCommit + ' ' + $PhaseMode + ' ' + $InputRunId

$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = (Get-Command ssh.exe -CommandType Application -ErrorAction Stop).Source
foreach ($argument in @(
  '-F', 'C:\Users\matth\.ssh\config', '-o', 'ClearAllForwardings=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=8', 'runa-control-wsl-codex', $nestedCommand
)) { [void]$startInfo.ArgumentList.Add($argument) }
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
$startInfo.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
$startInfo.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)

$sshProcess = [Diagnostics.Process]::new()
$sshProcess.StartInfo = $startInfo
try {
  if (-not $sshProcess.Start()) { throw 'focused-review-ssh-start' }
  $stdoutTask = $sshProcess.StandardOutput.ReadToEndAsync()
  $stderrTask = $sshProcess.StandardError.ReadToEndAsync()
  $sshProcess.StandardInput.BaseStream.Write($runnerBytes, 0, $runnerBytes.Length)
  $sshProcess.StandardInput.BaseStream.Flush()
  $sshProcess.StandardInput.Close()
  if (-not $sshProcess.WaitForExit(1200000)) {
    & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $sshProcess.Id /T /F | Out-Null
    if (-not $sshProcess.WaitForExit(10000)) { throw 'focused-review-ssh-timeout-cleanup-unconfirmed' }
    throw 'focused-review-ssh-timeout'
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($stdout.Length -gt 1048576 -or $stderr.Length -gt 1048576) { throw 'focused-review-output-cap' }
  $jsonLines = @($stdout -split "`r?`n" | Where-Object { $_.TrimStart().StartsWith('{') })
  if ($jsonLines.Count -ne 1) { throw ('focused-review-result-missing: ' + $stderr.Trim()) }
  $result = $jsonLines[0] | ConvertFrom-Json
  if ($result.runId -cne $actualRunId -or $result.runnerSha256 -cne $runnerSha256 -or
      $result.sourceCommit -cne $SourceCommit) { throw 'focused-review-result-binding' }
  if (-not (Test-Path -LiteralPath $resolvedOutput -PathType Container)) {
    [void](New-Item -ItemType Directory -Path $resolvedOutput)
  }
  $destination = Join-Path $resolvedOutput ($actualRunId + '.json')
  $receipt = [ordered]@{
    schemaVersion = 'runaai-focused-review-omen-publication/v1'
    publishedAt = [DateTimeOffset]::UtcNow.ToString('O')
    runId = $actualRunId
    sourceCommit = $SourceCommit
    runnerSha256 = $runnerSha256
    readinessReceiptSha256 = (Get-FileHash -LiteralPath $resolvedReadiness -Algorithm SHA256).Hash.ToLowerInvariant()
    transport = 'Omen -> Control WSL -> Home'
    remoteExitCode = $sshProcess.ExitCode
    result = $result
  }
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 20) + "`n")
  $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  $receipt | ConvertTo-Json -Depth 20
  if ($sshProcess.ExitCode -ne 0 -or $null -ne $result.failure) { exit 1 }
} finally {
  $sshProcess.Dispose()
}
