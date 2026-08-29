param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'lease-v2-supervisor-host'}
$root=$PSScriptRoot
$config=Get-Content -LiteralPath (Join-Path $root 'lease-config.json') -Raw|ConvertFrom-Json
if($root-cne$config.homeRoot-or$config.leaseId-notmatch'^20260829-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$'-or$config.schemaVersion-cne'runa-m1-campaign-lease/v2'-or$config.profile-cne'campaign-v2'){throw 'lease-v2-supervisor-root'}
$p=$config.policy
if($p.readyLeaseMs-ne4200000-or$p.preparationMs-ne600000-or$p.maximumBatchMs-ne3600000-or$p.minimumLaunchRemainingMs-ne3780000-or$p.dispatchStopMarginMs-ne240000-or$p.publicationMarginMs-ne180000-or$p.runnerFinalizationMs-ne60000-or$p.completionPublicationMs-ne120000-or$p.ownedCleanupMs-ne120000-or$p.workerDeadlineMs-ne4920000-or$p.independentRecoveryMs-ne240000-or$p.supervisorDeadlineMs-ne5160000-or$p.taskDeadlineMs-ne5160000-or$p.preparationMs+$p.readyLeaseMs+$p.ownedCleanupMs-ne$p.workerDeadlineMs-or$p.runnerFinalizationMs+$p.completionPublicationMs-ne$p.publicationMarginMs-or$p.workerDeadlineMs+$p.independentRecoveryMs-ne$p.supervisorDeadlineMs-or$p.supervisorDeadlineMs-ne$p.taskDeadlineMs){throw 'lease-v2-supervisor-policy'}
$seal=Get-Content -LiteralPath (Join-Path $root 'seal.json') -Raw|ConvertFrom-Json
if($seal.schemaVersion-cne'runa-m1-campaign-lease-seal/v2'){throw 'lease-v2-supervisor-seal'}
foreach($file in $seal.files.PSObject.Properties){
 if($file.Name-notmatch'^[a-zA-Z0-9-]+\.(mjs|json|ps1)$'-or(Get-FileHash -LiteralPath (Join-Path $root $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$file.Value){throw 'lease-v2-supervisor-source-drift'}
}
function Evidence($name,$value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 20)+"`n")
 $stream=[IO.File]::Open((Join-Path $root $name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
function Inventory{$value=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 10
 @($value.models|ForEach-Object{$model=$_;foreach($instance in $model.loaded_instances){@{key=$model.key;id=$instance.id}}})}
$uuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
$worker=$null;$started=$null;$failure=$null;$code=$null;$recovered=$false;$powerAuthorized=$false
$watch=[IO.File]::Open((Join-Path $root 'supervisor.jsonl'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{
 if(@(Inventory).Count-ne0){throw 'lease-v2-supervisor-unowned-baseline'}
 $baseline=@(& nvidia-smi.exe --query-gpu=uuid,power.limit --format=csv,noheader,nounits)
 if($LASTEXITCODE-ne0-or$baseline.Count-ne2){throw 'lease-v2-supervisor-power-baseline'}
 for($i=0;$i-lt2;$i++){$value=$baseline[$i].Split(',')|ForEach-Object{$_.Trim()}
  if($value[0]-cne$uuids[$i]-or[double]$value[1]-ne260){throw 'lease-v2-supervisor-power-baseline'}}
 $powerAuthorized=$true;$out=Join-Path $root 'worker-stdout.txt';$err=Join-Path $root 'worker-stderr.txt'
 if((Test-Path -LiteralPath $out)-or(Test-Path -LiteralPath $err)){throw 'lease-v2-supervisor-reuse'}
 $worker=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList ('"'+(Join-Path $root 'home-campaign-lease-v2.mjs')+'"') -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
 $null=$worker.Handle;$started=$worker.StartTime.ToUniversalTime()
 Evidence 'worker.json' @{pid=$worker.Id;startedAt=$started.ToString('o');sshIndependent=$true}
 $deadline=[DateTime]::UtcNow.AddMilliseconds([double]$p.workerDeadlineMs)
 $preparationUntil=[DateTime]::UtcNow.AddMilliseconds([double]$p.preparationMs)
 while(-not$worker.WaitForExit(5000)){
  $lines=@(& nvidia-smi.exe --query-gpu=index,uuid,temperature.gpu,memory.total,memory.used,power.limit --format=csv,noheader,nounits)
  if($LASTEXITCODE-ne0-or$lines.Count-ne2){throw 'lease-v2-supervisor-telemetry'}
  $hardware=@();for($i=0;$i-lt2;$i++){$value=$lines[$i].Split(',')|ForEach-Object{$_.Trim()}
   if([int]$value[0]-ne$i-or$value[1]-cne$uuids[$i]){throw 'lease-v2-supervisor-gpu-identity'}
   $hardware+=@{index=$i;uuid=$value[1];temperatureC=[double]$value[2];totalMiB=[double]$value[3];usedMiB=[double]$value[4];watts=[double]$value[5]}}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes((@{time=[DateTime]::UtcNow.ToString('o');pid=$worker.Id;gpus=$hardware}|ConvertTo-Json -Depth 8 -Compress)+"`n")
  $watch.Write($bytes,0,$bytes.Length);$watch.Flush()
  if(@($hardware|Where-Object{$_.temperatureC-ge85-or($_.totalMiB-$_.usedMiB)-lt1024}).Count-gt0){throw 'lease-v2-supervisor-hardware'}
  if([DateTime]::UtcNow-gt$deadline){throw 'lease-v2-supervisor-deadline'}
  if(-not(Test-Path -LiteralPath (Join-Path $root 'ready.json'))-and[DateTime]::UtcNow-gt$preparationUntil){throw 'lease-v2-supervisor-preparation-deadline'}
  if((Get-Item -LiteralPath $out).Length-gt2097152-or(Get-Item -LiteralPath $err).Length-gt2097152){throw 'lease-v2-supervisor-output-cap'}
 }
 $worker.WaitForExit();$code=$worker.ExitCode;if($null-eq$code){throw 'lease-v2-supervisor-exit-code-missing'}
}catch{$failure=if($_.Exception.Message-match'^lease-[a-z0-9-]+$'){$_.Exception.Message}else{'lease-v2-supervisor-failed'}}
finally{
 try{
  if(-not$powerAuthorized){throw 'lease-v2-supervisor-power-not-owned'}
  if($null-ne$worker-and-not$worker.HasExited){$live=Get-Process -Id $worker.Id
   if($live.StartTime.ToUniversalTime()-ne$started){throw 'lease-v2-supervisor-pid-drift'}
   Stop-Process -Id $worker.Id;if(-not$worker.WaitForExit(5000)){throw 'lease-v2-supervisor-stop-unverified'}}
  $remaining=@(Inventory)
  if($remaining.Count-gt0){
   $events=@(Get-Content -LiteralPath (Join-Path $root 'events.jsonl')|ForEach-Object{$_|ConvertFrom-Json})
   $loads=@($events|Where-Object{$_.type-eq'load-response'-and$_.value.status-eq'loaded'})
   foreach($item in $remaining){$match=@($loads|Where-Object{$_.key-eq$item.key-and$_.value.instance_id-eq$item.id})
    if($match.Count-ne1){throw 'lease-v2-supervisor-recovery-ambiguous'}}
   foreach($item in $remaining){$null=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models/unload' -Method Post -ContentType 'application/json' -Body (@{instance_id=$item.id}|ConvertTo-Json -Compress) -TimeoutSec 120}
  }
  if(@(Inventory).Count-ne0){throw 'lease-v2-supervisor-residency-unverified'}
  foreach($uuid in $uuids){& nvidia-smi.exe -i $uuid -pl 260|Out-Null;if($LASTEXITCODE-ne0){throw 'lease-v2-supervisor-power-restore'}}
  $powers=@(& nvidia-smi.exe --query-gpu=uuid,power.limit --format=csv,noheader,nounits)
  for($i=0;$i-lt2;$i++){$value=$powers[$i].Split(',')|ForEach-Object{$_.Trim()}
   if($value[0]-cne$uuids[$i]-or[double]$value[1]-ne260){throw 'lease-v2-supervisor-power-unverified'}}
  $recovered=$true
 }catch{if(-not$failure){$failure='lease-v2-supervisor-cleanup-unverified'}}
 Evidence 'supervisor-result.json' @{schemaVersion='runa-m1-campaign-supervisor-result/v2';time=[DateTime]::UtcNow.ToString('o');exitCode=$code
  failure=$failure;zeroResidencyAndPowerRestored=$recovered;productionRoutingChanged=$false}
 $watch.Dispose()
}
if($failure-or$code-ne0-or-not$recovered){exit 1}
