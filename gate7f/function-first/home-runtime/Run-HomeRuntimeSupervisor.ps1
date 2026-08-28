param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal)
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value-cne'S-1-5-18'){throw 'runtime-supervisor-principal'}
[void](Assert-RuntimeInstallation $ExpectedSeal)
$workerTask='RunaAI-Next-HomeRuntime-Worker';$node='C:\Program Files\nodejs\node.exe'
$entry=$script:RuntimeRoot+'\code\home-runtime\runtime-main.mjs'
$lock=$null;$child=$null;$childIdentity=$null;$workerIdentity=$null;$paths=$null;$failure=$null;$recovered=$false;$sessionId=$null
function Random-RuntimeHex {
  $bytes=New-Object byte[] 32;$random=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$random.GetBytes($bytes);([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()}finally{$random.Dispose()}
}
function Wait-RuntimeFile([string]$File,[int]$Seconds=30){
  $until=[DateTime]::UtcNow.AddSeconds($Seconds)
  while(-not(Test-Path -LiteralPath $File)){if([DateTime]::UtcNow-gt$until){throw 'runtime-file-timeout'};Start-Sleep -Milliseconds 100}
  return Read-RuntimeJson $File
}
function Assert-OwnedWorker($Identity,[string]$Session){
  if($Identity.executable-cne$node-or(Test-RuntimeStopped $Identity)){throw 'runtime-worker-identity'}
  $native=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$Identity.pid) -OperationTimeoutSec 5
  if($null-eq$native-or(Invoke-CimMethod -InputObject $native -MethodName GetOwnerSid -OperationTimeoutSec 5).Sid-cne'S-1-5-19'){throw 'runtime-worker-owner'}
  $actual=@([RunaRuntimeProbe]::Arguments($native.CommandLine));$expected=@($node,$entry,'worker',$ExpectedSeal,$Session)
  if($actual.Count-ne$expected.Count){throw 'runtime-worker-commandline'}
  for($index=0;$index-lt$expected.Count;$index++){if($actual[$index]-cne$expected[$index]){throw 'runtime-worker-commandline'}}
}
function Invoke-OwnedRecovery([string]$Session,$OldPaths){
  $processes=Read-RuntimeJson ($OldPaths.state+'\processes.json')
  if($processes.sessionId-cne$Session-or$processes.installationSha256-cne$ExpectedSeal){throw 'runtime-recovery-binding'}
  foreach($item in @($processes.worker,$processes.supervisor)){if(-not(Test-RuntimeStopped $item)){Stop-RuntimeProcess $item}}
  $arguments='"'+$entry+'" recover '+$ExpectedSeal+' '+$Session
  # An already-retained successful result is not blindly trusted over current native state: the
  # pure recovery path rechecks the complete journal, engine, settings and current zero residency.
  $attempt=[Guid]::NewGuid().ToString('N');$attemptTime=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $recovery=Start-Process -FilePath $node -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput ($OldPaths.state+'\recovery-'+$attempt+'-stdout.txt') -RedirectStandardError ($OldPaths.state+'\recovery-'+$attempt+'-stderr.txt')
  $record=Get-RuntimeIdentity $recovery.Id;[void]$recovery.Handle
  try{
    if(-not$recovery.WaitForExit(600000)){Stop-RuntimeProcess $record;throw 'runtime-recovery-timeout'}
    if($recovery.ExitCode-ne0){throw 'runtime-recovery-failed'}
    $result=Read-RuntimeJson ($OldPaths.state+'\recovery-result.json')
    if($result.clean-ne$true-or$result.closed-ne$true-or[long]$result.time-lt$attemptTime){throw 'runtime-recovery-unconfirmed'}
  }finally{$recovery.Dispose()}
}
try{
  $lock=[IO.File]::Open(($script:RuntimeRoot+'\state\owner.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  if(Test-Path -LiteralPath ($script:RuntimeRoot+'\state\disabled.json')){throw 'runtime-disabled'}
  $task=Get-ScheduledTask -TaskPath '\' -TaskName $workerTask
  Assert-RuntimeTask $task 'Worker' $ExpectedSeal
  # First reconcile an interrupted prior generation while this native process holds the owner lock.
  $activePath=$script:RuntimeRoot+'\active-session.json'
  if(Test-Path -LiteralPath $activePath){
    $old=Read-RuntimeJson $activePath;if($old.installationSha256-cne$ExpectedSeal){throw 'runtime-old-installation'}
    $oldPaths=Runtime-SessionPaths $old.sessionId
    if(-not(Test-Path -LiteralPath ($oldPaths.state+'\native-result.json'))){Invoke-OwnedRecovery $old.sessionId $oldPaths}
    else{$previous=Read-RuntimeJson ($oldPaths.state+'\native-result.json');if($previous.recovered-ne$true){throw 'runtime-old-cleanup-unconfirmed'}}
  }
  if((Get-ScheduledTask -TaskPath '\' -TaskName $workerTask).State-eq'Running'){throw 'runtime-worker-task-already-running'}
  # Reuse the installed desktop runtime. This waits closed, not an unattended LM Studio boot claim.
  $until=[DateTime]::UtcNow.AddMinutes(10)
  while(@(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 1234 -ErrorAction SilentlyContinue).Count-ne1){
    if([DateTime]::UtcNow-gt$until-or(Test-Path -LiteralPath ($script:RuntimeRoot+'\state\disabled.json'))){throw 'runtime-engine-unavailable'}
    Start-Sleep -Seconds 2
  }
  if(Get-NetTCPConnection -State Listen -LocalPort 9776 -ErrorAction SilentlyContinue){throw 'runtime-proxy-port-in-use'}
  $sessionId=Random-RuntimeHex;$paths=Runtime-SessionPaths $sessionId
  foreach($directory in @($paths.state,$paths.ipc,($paths.ipc+'\requests'),($paths.ipc+'\replies'),$paths.worker)){
    Assert-RuntimePath $directory;if(Test-Path -LiteralPath $directory){throw 'runtime-existing-session'};[void][IO.Directory]::CreateDirectory($directory)
  }
  Set-RuntimeDirectoryAcl $paths.state
  Set-RuntimeDirectoryAcl $paths.ipc 'ReadAndExecute'
  Set-RuntimeDirectoryAcl ($paths.ipc+'\requests') 'Modify'
  Set-RuntimeDirectoryAcl ($paths.ipc+'\replies') 'ReadAndExecute'
  Set-RuntimeDirectoryAcl $paths.worker 'Modify'
  $key=New-Object byte[] 32;$random=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$random.GetBytes($key)}finally{$random.Dispose()}
  $keyFile=[IO.File]::Open(($paths.ipc+'\session-key.bin'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{$keyFile.Write($key,0,$key.Length);$keyFile.Flush($true)}finally{$keyFile.Dispose();[Array]::Clear($key,0,$key.Length)}
  $binding=@{sessionId=$sessionId;installationSha256=$ExpectedSeal}
  Write-RuntimeJson ($paths.ipc+'\binding.json') $binding
  Write-RuntimeJson $activePath $binding $true
  Start-ScheduledTask -TaskPath '\' -TaskName $workerTask
  $workerIdentity=Wait-RuntimeFile ($paths.worker+'\process.json');Assert-OwnedWorker $workerIdentity $sessionId
  Write-RuntimeJson ($paths.ipc+'\approved-worker.json') $workerIdentity
  $arguments='"'+$entry+'" supervisor '+$ExpectedSeal+' '+$sessionId
  $child=Start-Process -FilePath $node -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput ($paths.state+'\controller-stdout.txt') -RedirectStandardError ($paths.state+'\controller-stderr.txt')
  [void]$child.Handle;$childIdentity=Get-RuntimeIdentity $child.Id
  Write-RuntimeJson ($paths.state+'\processes.json') @{sessionId=$sessionId;installationSha256=$ExpectedSeal;supervisor=$childIdentity;worker=$workerIdentity}
  Write-RuntimeJson ($paths.state+'\native-heartbeat.json') @{sessionId=$sessionId;time=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
  Write-RuntimeJson ($paths.state+'\approved-supervisor.json') $childIdentity
  $preparation=[DateTime]::UtcNow.AddMinutes(10);$lastHardware=[DateTime]::UtcNow;$stopDeadline=$null
  $samples=0;$peak=0.0;$minimumGpu=23040.0;$minimumHost=[long]::MaxValue;$maximumGap=0.0
  while(-not$child.WaitForExit(1000)){
    Write-RuntimeJson ($paths.state+'\native-heartbeat.json') @{sessionId=$sessionId;time=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()} $true
    if(Test-RuntimeStopped $workerIdentity){throw 'runtime-worker-stopped'}
    $heartbeatPath=$paths.state+'\controller-heartbeat.json'
    if(Test-Path -LiteralPath $heartbeatPath){$pulse=Read-RuntimeJson $heartbeatPath
      if(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[long]$pulse.time)-gt15000){throw 'runtime-controller-heartbeat-lost'}}
    if(-not(Test-Path -LiteralPath ($paths.worker+'\listener-ready.json'))-and[DateTime]::UtcNow-gt$preparation){throw 'runtime-startup-deadline'}
    foreach($file in @(($paths.worker+'\stdout.txt'),($paths.worker+'\stderr.txt'),($paths.state+'\controller-stdout.txt'),($paths.state+'\controller-stderr.txt'))){
      if((Get-Item -LiteralPath $file).Length-gt2097152){throw 'runtime-output-cap'}
    }
    if(([DateTime]::UtcNow-$lastHardware).TotalSeconds-ge5){
      $rawTelemetry=[RunaRuntimeProbe]::RunBounded('C:\Windows\System32\nvidia-smi.exe','--query-gpu=index,uuid,temperature.gpu,memory.total,memory.used --format=csv,noheader,nounits',5000,8192)
      $lines=@($rawTelemetry.Trim()-split'\r?\n')
      if($lines.Count-ne2){throw 'runtime-native-telemetry'}
      $uuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
      $gpus=@()
      for($index=0;$index-lt2;$index++){$parts=$lines[$index].Split(',')|ForEach-Object{$_.Trim()}
        if([int]$parts[0]-ne$index-or$parts[1]-cne$uuids[$index]-or[double]$parts[2]-ge85-or([double]$parts[3]-[double]$parts[4])-lt1024){throw 'runtime-native-hardware'}
        $gpus+=@{index=$index;uuid=$parts[1];temperatureC=[double]$parts[2];totalMiB=[double]$parts[3];usedMiB=[double]$parts[4]}
        $peak=[Math]::Max($peak,[double]$parts[2]);$minimumGpu=[Math]::Min($minimumGpu,([double]$parts[3]-[double]$parts[4]))
      }
      $freeHost=[long][RunaRuntimeProbe]::FreeMemory()
      if($freeHost-lt8589934592){throw 'runtime-native-host-memory'}
      $samples++;$minimumHost=[Math]::Min($minimumHost,$freeHost);$maximumGap=[Math]::Max($maximumGap,([DateTime]::UtcNow-$lastHardware).TotalMilliseconds)
      Write-RuntimeJson ($paths.state+'\native-telemetry.json') @{schemaVersion='runaai-runtime-native-telemetry/v1';time=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();gpus=$gpus;freeHostBytes=$freeHost;
        samples=$samples;peakTemperatureC=$peak;minimumFreeGpuMiB=$minimumGpu;minimumFreeHostBytes=$minimumHost;maximumGapMs=$maximumGap} $true
      $lastHardware=[DateTime]::UtcNow
    }
    if((Test-Path -LiteralPath ($script:RuntimeRoot+'\state\disabled.json'))-and$null-eq$stopDeadline){
      Write-RuntimeJson ($paths.state+'\stop.json') @{sessionId=$sessionId;mode='drain'};$stopDeadline=[DateTime]::UtcNow.AddSeconds(75)
    }
    if($null-ne$stopDeadline-and[DateTime]::UtcNow-gt$stopDeadline){throw 'runtime-native-drain-timeout'}
  }
  if($child.ExitCode-ne0){throw 'runtime-controller-exited'}
}catch{$failure=if($_.Exception.Message-match'^runtime-[a-z0-9-]+$'){$_.Exception.Message}else{'runtime-native-supervisor-failed'}}
finally{
  try{
    if($null-ne$workerIdentity-and-not(Test-RuntimeStopped $workerIdentity)){Stop-RuntimeProcess $workerIdentity}
    if($null-ne$childIdentity-and-not(Test-RuntimeStopped $childIdentity)){Stop-RuntimeProcess $childIdentity}
    if($null-ne$paths-and(Test-Path -LiteralPath ($paths.state+'\processes.json'))){Invoke-OwnedRecovery $sessionId $paths;$recovered=$true}
    if($null-ne$paths){Write-RuntimeJson ($paths.state+'\native-result.json') @{schemaVersion='runaai-native-runtime-result/v1';sessionId=$sessionId;installationSha256=$ExpectedSeal;
      time=[DateTime]::UtcNow.ToString('o');failure=$failure;recovered=$recovered;privateValuesIncluded=$false}}
  }catch{if(-not$failure){$failure='runtime-native-recovery-unconfirmed'}}
  if($null-ne$child){$child.Dispose()};if($null-ne$lock){$lock.Dispose()}
}
if($failure-or-not$recovered){exit 1}
