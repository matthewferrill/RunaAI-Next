param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-ne'RUNA-HOME'){throw 'lease-supervisor-host'}
$root=$PSScriptRoot
$config=Get-Content -LiteralPath (Join-Path $root 'lease-config.json') -Raw|ConvertFrom-Json
if($root-ne$config.homeRoot-or$config.leaseId-notmatch'^20260828-smoke-(gemma|coder|qwen36)-r[1-9][0-9]*$'){throw 'lease-supervisor-root'}
$seal=Get-Content -LiteralPath (Join-Path $root 'seal.json') -Raw|ConvertFrom-Json
foreach($file in $seal.files.PSObject.Properties){if($file.Name-notmatch'^[a-zA-Z-]+\.(mjs|json|ps1)$'-or(Get-FileHash -LiteralPath (Join-Path $root $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()-ne$file.Value){throw 'lease-supervisor-source-drift'}}
function Evidence($name,$value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 20)+"`n");$s=[IO.File]::Open((Join-Path $root $name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$s.Write($bytes,0,$bytes.Length)}finally{$s.Dispose()}}
function Inventory{$v=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 10;@($v.models|ForEach-Object{$m=$_;foreach($i in $m.loaded_instances){@{key=$m.key;id=$i.id}}})}
$uuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
$worker=$null;$started=$null;$failure=$null;$code=$null;$recovered=$false;$powerAuthorized=$false
$watch=[IO.File]::Open((Join-Path $root 'supervisor.jsonl'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{
 if(@(Inventory).Count-ne0){throw 'lease-supervisor-unowned-baseline'}
 $baseline=@(& nvidia-smi.exe --query-gpu=uuid,power.limit --format=csv,noheader,nounits)
 if($LASTEXITCODE-ne0-or$baseline.Count-ne2){throw 'lease-supervisor-power-baseline'}
 for($i=0;$i-lt2;$i++){$v=$baseline[$i].Split(',')|ForEach-Object{$_.Trim()};if($v[0]-ne$uuids[$i]-or[double]$v[1]-ne260){throw 'lease-supervisor-power-baseline'}}
 $powerAuthorized=$true
 $out=Join-Path $root 'worker-stdout.txt';$err=Join-Path $root 'worker-stderr.txt'
 if((Test-Path -LiteralPath $out)-or(Test-Path -LiteralPath $err)){throw 'lease-supervisor-reuse'}
 $worker=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList ('"'+(Join-Path $root 'home-smoke-lease.mjs')+'"') -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
 # Keep the native handle while the process is live; otherwise PS5 can expose a null ExitCode after refresh.
 $null=$worker.Handle;$started=$worker.StartTime.ToUniversalTime()
 Evidence 'worker.json' @{pid=$worker.Id;startedAt=$started.ToString('o');sshIndependent=$true}
 $deadline=[DateTime]::UtcNow.AddMinutes(24)
 while(-not$worker.WaitForExit(5000)){
  $lines=@(& nvidia-smi.exe --query-gpu=index,uuid,temperature.gpu,memory.total,memory.used,power.limit --format=csv,noheader,nounits)
  if($LASTEXITCODE-ne0-or$lines.Count-ne2){throw 'lease-supervisor-telemetry'}
  $hw=@();for($i=0;$i-lt2;$i++){$v=$lines[$i].Split(',')|ForEach-Object{$_.Trim()};if([int]$v[0]-ne$i-or$v[1]-ne$uuids[$i]){throw 'lease-supervisor-gpu-identity'};$hw+=@{index=$i;uuid=$v[1];temperatureC=[double]$v[2];totalMiB=[double]$v[3];usedMiB=[double]$v[4];watts=[double]$v[5]}}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes((@{time=[DateTime]::UtcNow.ToString('o');pid=$worker.Id;gpus=$hw}|ConvertTo-Json -Depth 8 -Compress)+"`n");$watch.Write($bytes,0,$bytes.Length);$watch.Flush()
  if(@($hw|Where-Object{$_.temperatureC-ge85-or($_.totalMiB-$_.usedMiB)-lt1024}).Count-gt0){throw 'lease-supervisor-hardware'}
  if([DateTime]::UtcNow-gt$deadline){throw 'lease-supervisor-deadline'}
  if((Get-Item -LiteralPath $out).Length-gt2097152-or(Get-Item -LiteralPath $err).Length-gt2097152){throw 'lease-supervisor-output-cap'}
 }
 $worker.WaitForExit();$code=$worker.ExitCode;if($null-eq$code){throw 'lease-supervisor-exit-code-missing'}
}catch{$failure=if($_.Exception.Message-match'^lease-[a-z0-9-]+$'){$_.Exception.Message}else{'lease-supervisor-failed'}}
finally{
 try{
  if(-not$powerAuthorized){throw 'lease-supervisor-power-not-owned'}
  if($null-ne$worker-and-not$worker.HasExited){$live=Get-Process -Id $worker.Id;if($live.StartTime.ToUniversalTime()-ne$started){throw 'lease-supervisor-pid-drift'};Stop-Process -Id $worker.Id;if(-not$worker.WaitForExit(5000)){throw 'lease-supervisor-stop-unverified'}}
  $remaining=@(Inventory)
  # Recovery only uses retained successful load responses. It never infers ownership from names alone.
  if($remaining.Count-gt0){
   $events=@(Get-Content -LiteralPath (Join-Path $root 'events.jsonl')|ForEach-Object{$_|ConvertFrom-Json})
   $loads=@($events|Where-Object{$_.type-eq'load-response'-and$_.value.status-eq'loaded'})
   foreach($item in $remaining){$match=@($loads|Where-Object{$_.key-eq$item.key-and$_.value.instance_id-eq$item.id});if($match.Count-ne1){throw 'lease-supervisor-recovery-ambiguous'}}
   foreach($item in $remaining){$null=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models/unload' -Method Post -ContentType 'application/json' -Body (@{instance_id=$item.id}|ConvertTo-Json -Compress) -TimeoutSec 120}
  }
  if(@(Inventory).Count-ne0){throw 'lease-supervisor-residency-unverified'}
  foreach($uuid in $uuids){& nvidia-smi.exe -i $uuid -pl 260|Out-Null;if($LASTEXITCODE-ne0){throw 'lease-supervisor-power-restore'}}
  $powers=@(& nvidia-smi.exe --query-gpu=uuid,power.limit --format=csv,noheader,nounits)
  for($i=0;$i-lt2;$i++){$v=$powers[$i].Split(',')|ForEach-Object{$_.Trim()};if($v[0]-ne$uuids[$i]-or[double]$v[1]-ne260){throw 'lease-supervisor-power-unverified'}}
  $recovered=$true
 }catch{if(-not$failure){$failure='lease-supervisor-cleanup-unverified'}}
 Evidence 'supervisor-result.json' @{time=[DateTime]::UtcNow.ToString('o');exitCode=$code;failure=$failure;zeroResidencyAndPowerRestored=$recovered;productionRoutingChanged=$false}
 $watch.Dispose()
}
if($failure-or$code-ne0-or-not$recovered){exit 1}
