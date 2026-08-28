[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$LeaseId,
  [Parameter(Mandatory)][string]$ExpectedSeal,
  [Parameter(Mandatory)][string]$ControlOwnedRoot,
  [Parameter(Mandatory)][string]$ExpectedControlSourceCommit,
  [ValidateRange(5,3900)][int]$MaximumSeconds=3900
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($LeaseId-notmatch'^20260828-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$'-or
  $ExpectedSeal-notmatch'^[a-f0-9]{64}$'-or$ExpectedControlSourceCommit-notmatch'^[a-f0-9]{40}$'){
  throw 'm1-mirror-pin-invalid'
}
$target=[IO.Path]::GetFullPath($ControlOwnedRoot)
if([IO.Path]::GetDirectoryName($target)-ne'C:\AI\RunaAI-Next-Candidate\staging'-or
  [IO.Path]::GetFileName($target)-notmatch'^m1-task-native-[a-f0-9]{32}$'){throw 'm1-mirror-target-invalid'}
$sshConfig='C:\Users\matth\.ssh\config'
# This script observes an existing owned lease. It cannot load/unload a model,
# change power, create a Home service, complete a lease or touch production data.
function Invoke-BoundedSsh([string]$Arguments,[string]$InputText=''){
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName='ssh.exe';$start.Arguments=$Arguments
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.RedirectStandardInput=$true
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    if(-not$process.Start()){throw 'm1-mirror-ssh-start-failed'}
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    if($InputText){$process.StandardInput.Write($InputText)};$process.StandardInput.Close()
    if(-not$process.WaitForExit(20000)){$process.Kill();$process.WaitForExit();throw 'm1-mirror-ssh-timeout'}
    $output=$stdout.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
    if($process.ExitCode-ne0-or$output.Length-gt1048576){throw 'm1-mirror-observation-failed'}
    return $output
  }finally{$process.Dispose()}
}
$homeProbe=@'
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$root='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\__LEASE__'
if($env:COMPUTERNAME-ne'RUNA-HOME'){throw 'mirror-host-invalid'}
if((Get-FileHash -LiteralPath (Join-Path $root 'seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()-ne'__SEAL__'){throw 'mirror-seal-invalid'}
$ready=Get-Content -LiteralPath (Join-Path $root 'ready.json') -Raw|ConvertFrom-Json
$worker=Get-Content -LiteralPath (Join-Path $root 'worker.json') -Raw|ConvertFrom-Json
$process=Get-Process -Id $worker.pid -ErrorAction SilentlyContinue
$alive=$null-ne$process-and$process.StartTime.ToUniversalTime().ToString('o')-eq([DateTime]$worker.startedAt).ToUniversalTime().ToString('o')
$task=Get-ScheduledTask -TaskName 'Runa-M1-__LEASE__'
$events=@(Get-Content -LiteralPath (Join-Path $root 'events.jsonl') -Tail 40|ForEach-Object{try{$_|ConvertFrom-Json}catch{}})
$telemetry=@($events|Where-Object{$_.type-eq'telemetry'})|Select-Object -Last 1
if($null-eq$telemetry){throw 'mirror-no-telemetry'}
$registry=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 8
$models=@($registry.models|ForEach-Object{[ordered]@{key=$_.key;loaded_instances=@($_.loaded_instances)}})
$value=[ordered]@{schemaVersion='runaai-m1-campaign-live/v1';observedAt=[DateTime]::UtcNow.ToString('o');leaseId='__LEASE__';sealSha256='__SEAL__';ready=$ready;taskRunning=([string]$task.State-eq'Running');workerAlive=[bool]$alive;completionPresent=(Test-Path -LiteralPath (Join-Path $root 'complete.json'));lastTelemetry=$telemetry;models=$models}
[Console]::Out.Write(($value|ConvertTo-Json -Depth 35 -Compress))
'@
$homeProbe=$homeProbe.Replace('__LEASE__',$LeaseId).Replace('__SEAL__',$ExpectedSeal)
$homeEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($homeProbe))
$homeArguments='-F "'+$sshConfig+'" -o ClearAllForwardings=yes -o BatchMode=yes -o ConnectTimeout=8 runa-control-wsl-codex "ssh -o ClearAllForwardings=yes -o BatchMode=yes -o ConnectTimeout=8 runa-home-codex powershell.exe -NoProfile -NonInteractive -EncodedCommand '+$homeEncoded+'"'
$writeMirror=@'
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$root='__ROOT__'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){throw 'mirror-owner-invalid'}
if([IO.Path]::GetDirectoryName($root)-ne'C:\AI\RunaAI-Next-Candidate\staging'-or((Get-Item -LiteralPath $root).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'mirror-target-invalid'}
$identity=Get-Content -LiteralPath (Join-Path $root 'SOURCE-IDENTITY.json') -Raw|ConvertFrom-Json
if($identity.sourceCommit-ne'__COMMIT__'){throw 'mirror-source-drift'}
$directory=Join-Path $root 'acceptance-evidence'
if(-not(Test-Path -LiteralPath $directory -PathType Container)-or((Get-Item -LiteralPath $directory).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'mirror-evidence-invalid'}
$raw=[Console]::In.ReadToEnd();if($raw.Length-gt1048576){throw 'mirror-size-invalid'}
$value=$raw|ConvertFrom-Json
if($value.schemaVersion-ne'runaai-m1-campaign-live/v1'-or$value.leaseId-ne'__LEASE__'-or$value.sealSha256-ne'__SEAL__'){throw 'mirror-record-invalid'}
$file=Join-Path $directory 'home-live.json';$temporary=Join-Path $directory 'home-live.json.new'
foreach($path in @($file,$temporary)){if((Test-Path -LiteralPath $path)-and((Get-Item -LiteralPath $path).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'mirror-file-reparse'}}
if(Test-Path -LiteralPath $temporary){throw 'mirror-staged-write-exists'}
if(Test-Path -LiteralPath $file){$previous=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json;if($previous.leaseId-ne'__LEASE__'-or$previous.sealSha256-ne'__SEAL__'){throw 'mirror-existing-binding-mismatch'}}
[IO.File]::WriteAllText($temporary,$raw,[Text.UTF8Encoding]::new($false))
# Windows PowerShell5 needs an explicit null string, not $null coerced to an empty backup path.
if(Test-Path -LiteralPath $file){[IO.File]::Replace($temporary,$file,[System.Management.Automation.Language.NullString]::Value)}else{[IO.File]::Move($temporary,$file)}
[Console]::Out.Write('{"mirrored":true}')
'@
$writeMirror=$writeMirror.Replace('__ROOT__',$target).Replace('__COMMIT__',$ExpectedControlSourceCommit).Replace('__LEASE__',$LeaseId).Replace('__SEAL__',$ExpectedSeal)
$controlEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($writeMirror))
$controlArguments='-F "'+$sshConfig+'" -o ClearAllForwardings=yes -o BatchMode=yes -o ConnectTimeout=8 runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand '+$controlEncoded
$deadline=[DateTime]::UtcNow.AddSeconds($MaximumSeconds);$samples=0
do{
  $raw=Invoke-BoundedSsh $homeArguments
  $value=$raw|ConvertFrom-Json
  if($value.schemaVersion-ne'runaai-m1-campaign-live/v1'-or$value.leaseId-ne$LeaseId-or$value.sealSha256-ne$ExpectedSeal){throw 'm1-mirror-response-invalid'}
  $ack=(Invoke-BoundedSsh $controlArguments $raw)|ConvertFrom-Json
  if($ack.mirrored-ne$true){throw 'm1-mirror-write-unconfirmed'}
  $samples++
  if($samples-eq1){[ordered]@{schemaVersion='runaai-m1-campaign-mirror-start/v1';leaseId=$LeaseId;mirrorPath=(Join-Path $target 'acceptance-evidence\home-live.json');readOnlyOnHome=$true}|ConvertTo-Json -Compress}
  if($value.completionPresent-or-not$value.workerAlive-or-not$value.taskRunning){break}
  Start-Sleep -Seconds 5
}while([DateTime]::UtcNow-lt$deadline)
[ordered]@{schemaVersion='runaai-m1-campaign-mirror-end/v1';leaseId=$LeaseId;samples=$samples;readOnlyOnHome=$true;productionChanged=$false}|ConvertTo-Json -Compress
