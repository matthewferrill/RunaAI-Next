[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function ConvertFrom-SingleJsonLine {
  param([Parameter(Mandatory)][string]$Text, [Parameter(Mandatory)][string]$ErrorCode)
  $candidateLines = @($Text -split "`r?`n" | Where-Object { $_.TrimStart().StartsWith('{') })
  if ($candidateLines.Count -ne 1) { throw $ErrorCode }
  try { $candidateLines[0] | ConvertFrom-Json } catch { throw $ErrorCode }
}

function Invoke-BoundedSshJson {
  param([Parameter(Mandatory)][string[]]$Arguments, [Parameter(Mandatory)][string]$ErrorCode)
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = (Get-Command ssh.exe -CommandType Application -ErrorAction Stop).Source
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $sshProcess = [Diagnostics.Process]::new()
  $sshProcess.StartInfo = $startInfo
  try {
    if (-not $sshProcess.Start()) { throw $ErrorCode }
    $stdoutTask = $sshProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $sshProcess.StandardError.ReadToEndAsync()
    if (-not $sshProcess.WaitForExit(30000)) {
      & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $sshProcess.Id /T /F | Out-Null
      if (-not $sshProcess.WaitForExit(10000)) { throw ($ErrorCode + '-cleanup-unconfirmed') }
      throw ($ErrorCode + '-timeout')
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($sshProcess.ExitCode -ne 0 -or $stdout.Length -gt 1048576) {
      throw ($ErrorCode + ': ' + $stderr.Trim())
    }
    ConvertFrom-SingleJsonLine -Text $stdout -ErrorCode $ErrorCode
  } finally {
    $sshProcess.Dispose()
  }
}

$omenReceipt = [ordered]@{
  host = [Environment]::MachineName
  identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  os = [Environment]::OSVersion.VersionString
  ps = $PSVersionTable.PSVersion.ToString()
  node = (& node.exe --version)
}

$controlProbeSource = @'
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$computer=Get-CimInstance Win32_ComputerSystem
$processor=Get-CimInstance Win32_Processor|Select-Object -First 1
[ordered]@{
  host=$env:COMPUTERNAME
  identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  os=[Environment]::OSVersion.VersionString
  ps=$PSVersionTable.PSVersion.ToString()
  node=(& node.exe --version)
  cpu=$processor.Name
  logical=$processor.NumberOfLogicalProcessors
  memory=[long]$computer.TotalPhysicalMemory
  stagingRootPresent=(Test-Path -LiteralPath 'C:\AI\RunaAI-Next-Candidate\staging' -PathType Container)
}|ConvertTo-Json -Compress
'@
$controlEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($controlProbeSource))
$controlReceipt = Invoke-BoundedSshJson -Arguments @(
  '-F', 'C:\Users\matth\.ssh\config', '-o', 'ClearAllForwardings=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=8', 'runa-control-codex', 'powershell.exe', '-NoProfile', '-NonInteractive',
  '-EncodedCommand', $controlEncoded
) -ErrorCode 'focused-review-control-transport'

$homeProbeSource = @'
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$computer=Get-CimInstance Win32_ComputerSystem
$processor=Get-CimInstance Win32_Processor|Select-Object -First 1
$registry=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 10
$loadedInstances=@($registry.models|ForEach-Object{@($_.loaded_instances)}|Where-Object{$null-ne$_})
$gpuRows=@(& nvidia-smi.exe --query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit --format=csv,noheader,nounits)
[ordered]@{
  host=$env:COMPUTERNAME
  identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  os=[Environment]::OSVersion.VersionString
  ps=$PSVersionTable.PSVersion.ToString()
  node=(& node.exe --version)
  cpu=$processor.Name
  logical=$processor.NumberOfLogicalProcessors
  memory=[long]$computer.TotalPhysicalMemory
  registryAvailable=$true
  loadedModelInstances=$loadedInstances.Count
  gpus=$gpuRows
  modelPresent=(Test-Path -LiteralPath 'C:\lm-studio-models\google\gemma-4-26B-A4B-it-qat-q4_0-gguf\gemma-4-26B_q4_0-it.gguf' -PathType Leaf)
}|ConvertTo-Json -Compress
'@
$homeEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($homeProbeSource))
$nestedHomeCommand = 'ssh -o ClearAllForwardings=yes -o BatchMode=yes -o ConnectTimeout=8 runa-home-codex powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + $homeEncoded
$homeReceipt = Invoke-BoundedSshJson -Arguments @(
  '-F', 'C:\Users\matth\.ssh\config', '-o', 'ClearAllForwardings=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=8', 'runa-control-wsl-codex', $nestedHomeCommand
) -ErrorCode 'focused-review-home-transport'

if ($omenReceipt.host -cne 'DESKTOP-OMEN' -or
    $controlReceipt.host -cne 'RUNA-CONTROL' -or
    $homeReceipt.host -cne 'RUNA-HOME' -or
    $homeReceipt.registryAvailable -cne $true -or
    $homeReceipt.loadedModelInstances -ne 0 -or
    $homeReceipt.modelPresent -cne $true) {
  throw 'focused-review-readiness-boundary'
}

$receipt = [ordered]@{
  schemaVersion = 'runaai-focused-review-readiness/v1'
  collectedAt = [DateTimeOffset]::UtcNow.ToString('O')
  passed = $true
  systems = [ordered]@{ omen = $omenReceipt; control = $controlReceipt; home = $homeReceipt }
  transport = [ordered]@{ omenToControlWindows = 'live'; omenToControlWslToHome = 'live' }
  modelsInvoked = $false
  productionChanged = $false
  privateValuesIncluded = $false
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$parentDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $parentDirectory -PathType Container)) {
  [void](New-Item -ItemType Directory -Path $parentDirectory)
}
$bytes = [Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 8) + "`n")
$stream = [IO.File]::Open($resolvedOutput, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
$receipt | ConvertTo-Json -Depth 8
