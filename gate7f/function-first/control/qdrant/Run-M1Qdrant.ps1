[CmdletBinding()]
param([Parameter(Mandatory)][string]$ExpectedPackageSha256)
. (Join-Path $PSScriptRoot 'Common-M1Qdrant.ps1')
Assert-M1QdrantHost
Assert-M1Qdrant ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value-eq'S-1-5-19') 'runtime-principal'
$root=$script:M1QdrantRoot;$state=Join-Path $root 'state';$code=Join-Path $root 'code'
Assert-M1Qdrant ($PSScriptRoot-ceq$code) 'runtime-root'
$null=Get-M1QdrantInstallation $ExpectedPackageSha256
Assert-M1QdrantTree $state
Assert-M1QdrantPortsFree
$lockPath=Join-Path $state 'runtime.lock';Assert-M1QdrantPath $lockPath
if(Test-Path -LiteralPath $lockPath){Assert-M1QdrantPath $lockPath -File}
$lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$child=$null;$ownedStart=$null;$proof=$null;$failure=$null;$exitCode=0;$outRing=$null;$errRing=$null
$runId=[Guid]::NewGuid().ToString('N');$stopPath=Join-Path $state 'stop-request.json'
try{
  if(Test-Path -LiteralPath $stopPath){throw 'm1-qdrant-stop-present'}
  $exe=Join-Path $code 'qdrant.exe';$config=Join-Path $code 'qdrant.yaml'
  $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$exe;$info.Arguments='--config-path "'+$config+'"'
  $info.WorkingDirectory=$code;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.RedirectStandardInput=$true
  # Environment overrides cannot expand config, telemetry, networking, storage or proxy settings.
  $info.EnvironmentVariables.Clear()
  $info.EnvironmentVariables['SystemRoot']='C:\Windows';$info.EnvironmentVariables['SystemDrive']='C:'
  $info.EnvironmentVariables['PATH']=$code+';C:\Windows\System32'
  $info.EnvironmentVariables['TEMP']=Join-Path $state 'tmp';$info.EnvironmentVariables['TMP']=Join-Path $state 'tmp'
  $info.EnvironmentVariables['RUN_MODE']='production'
  $child=[Diagnostics.Process]::Start($info);$null=$child.Handle;$ownedStart=$child.StartTime.ToUniversalTime();$child.StandardInput.Close()
  $outRing=[RunaM1Qdrant.Ring]::new($child.StandardOutput);$errRing=[RunaM1Qdrant.Ring]::new($child.StandardError)
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+$child.Id)
  $runner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)
  $proof=[ordered]@{schemaVersion='runaai-m1-qdrant-process/v1';packageSha256=$ExpectedPackageSha256;runId=$runId;
    pid=$child.Id;startedAt=$live.CreationDate.ToUniversalTime().ToString('o');executable=$exe;
    runnerPid=$PID;runnerStartedAt=$runner.CreationDate.ToUniversalTime().ToString('o')}
  Assert-M1QdrantChild $proof $live
  Write-M1QdrantJson (Join-Path $state 'process.json') $proof
  $deadline=[DateTime]::UtcNow.AddSeconds(45);$ready=$false;$ticks=0
  while(-not$child.WaitForExit(1000)){
    if(Test-Path -LiteralPath $stopPath){
      Assert-M1QdrantPath $stopPath -File;$stop=Get-Content -LiteralPath $stopPath -Raw|ConvertFrom-Json
      Assert-M1Qdrant ($stop.schemaVersion-eq'runaai-m1-qdrant-stop/v1'-and$stop.packageSha256-eq$ExpectedPackageSha256) 'stop-binding'
      break
    }
    if(-not$ready){
      try{Assert-M1QdrantListeners $child.Id;$response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9774/readyz' -TimeoutSec 2 -MaximumRedirection 0;$ready=$response.StatusCode-eq200}catch{$ready=$false}
      if($ready){Write-M1QdrantJson (Join-Path $state 'ready.json') (@{schemaVersion='runaai-m1-qdrant-ready/v1';packageSha256=$ExpectedPackageSha256;runId=$runId;pid=$child.Id;readyAt=[DateTime]::UtcNow.ToString('o')})}
      elseif([DateTime]::UtcNow-gt$deadline){throw 'm1-qdrant-readiness-timeout'}
    }else{Assert-M1QdrantListeners $child.Id}
    $ticks++
    if($ticks%5-eq0){Write-M1QdrantJson (Join-Path $state ('logs\'+$runId+'.json')) (@{time=[DateTime]::UtcNow.ToString('o');stdout=$outRing.Snapshot();stderr=$errRing.Snapshot()})}
  }
  if($child.HasExited){$child.WaitForExit();$exitCode=$child.ExitCode;if($exitCode-ne0){throw 'm1-qdrant-child-exit'}}
}catch{$failure=if($_.Exception.Message-match'^m1-qdrant-[a-z0-9-]+$'){$_.Exception.Message}else{'m1-qdrant-run-failed'};$exitCode=1}
finally{
  try{
    if($null-ne$child-and-not$child.HasExited){
      # The retained live Process handle also covers failure before the CIM receipt is available.
      Assert-M1Qdrant ($null-ne$ownedStart-and$child.StartTime.ToUniversalTime()-eq$ownedStart-and$child.StartInfo.FileName-ceq(Join-Path $code 'qdrant.exe')) 'owned-handle'
      if($null-ne$proof){Assert-M1QdrantChild $proof (Get-CimInstance Win32_Process -Filter ('ProcessId='+$child.Id))}
      $child.Kill();Assert-M1Qdrant ($child.WaitForExit(10000)) 'stop-timeout'
    }
    if($outRing){Write-M1QdrantJson (Join-Path $state ('logs\'+$runId+'.json')) (@{time=[DateTime]::UtcNow.ToString('o');stdout=$outRing.Snapshot();stderr=$errRing.Snapshot()})}
    Write-M1QdrantJson (Join-Path $state ('run-'+$runId+'.json')) (@{schemaVersion='runaai-m1-qdrant-run-result/v1';runId=$runId;packageSha256=$ExpectedPackageSha256;exitCode=$exitCode;failure=$failure;endedAt=[DateTime]::UtcNow.ToString('o');dataRetained=$true}) -New
  }catch{$exitCode=1}
  $lock.Dispose()
}
exit $exitCode
