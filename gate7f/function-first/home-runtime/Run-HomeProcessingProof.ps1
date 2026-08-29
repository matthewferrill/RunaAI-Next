param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'processing-proof-supervisor-host'}
$root=$PSScriptRoot;$config=Get-Content -LiteralPath ($root+'\config.json') -Raw|ConvertFrom-Json;$output=[string]$config.outputRoot;$base=[IO.Path]::GetDirectoryName($root)
if($root-cne$config.homeRoot-or$config.proofId-notmatch'^20260829-native-processing-nomic-r[1-9][0-9]*$'-or$base-cne('C:\ProgramData\RunaAI-Next-ProcessingProof-'+$config.proofId.Replace('-',''))-or$config.policy.proofDeadlineMs-ne900000){throw 'processing-proof-supervisor-config'}
$seal=Get-Content -LiteralPath ($root+'\seal.json') -Raw|ConvertFrom-Json;$sealHash=(Get-FileHash -LiteralPath ($root+'\seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()
foreach($file in $seal.files.PSObject.Properties){if($file.Name-notmatch'^[a-zA-Z0-9-]+\.(mjs|json|ps1)$'-or(Get-FileHash -LiteralPath ($root+'\'+$file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$file.Value){throw 'processing-proof-supervisor-source'}}
function Evidence([string]$name,$value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 20)+"`n");$stream=[IO.File]::Open(($output+'\'+$name),'CreateNew','Write','None');try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
function Inventory{$value=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 10;@($value.models|ForEach-Object{$model=$_;foreach($instance in $model.loaded_instances){@{key=$model.key;id=$instance.id}}})}
$uuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
$worker=$null;$started=$null;$failure=$null;$code=$null;$recovered=$false;$powerAuthorized=$false
$watch=[IO.File]::Open(($output+'\supervisor.jsonl'),'CreateNew','Write','Read')
try{
 if(@(Inventory).Count-ne0){throw 'processing-proof-supervisor-unowned-baseline'}
 $baseline=@(& nvidia-smi.exe --query-gpu=uuid,power.limit --format=csv,noheader,nounits)
 if($LASTEXITCODE-ne0-or$baseline.Count-ne2){throw 'processing-proof-supervisor-power-baseline'}
 for($index=0;$index-lt2;$index++){$value=$baseline[$index].Split(',')|ForEach-Object{$_.Trim()};if($value[0]-cne$uuids[$index]-or[double]$value[1]-ne260){throw 'processing-proof-supervisor-power-baseline'}}
 $powerAuthorized=$true;$stdout=$output+'\worker-stdout.txt';$stderr=$output+'\worker-stderr.txt'
 if((Test-Path -LiteralPath $stdout)-or(Test-Path -LiteralPath $stderr)){throw 'processing-proof-supervisor-reuse'}
 $worker=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList ('"'+($root+'\processing-proof-worker.mjs')+'"') -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
 $null=$worker.Handle;$started=$worker.StartTime.ToUniversalTime();Evidence 'worker.json' @{pid=$worker.Id;startedAt=$started.ToString('o');sshIndependent=$true}
 $deadline=[DateTime]::UtcNow.AddMinutes(20);$preparation=[DateTime]::UtcNow.AddMinutes(10)
 while(-not$worker.WaitForExit(5000)){
  $lines=@(& nvidia-smi.exe --query-gpu=index,uuid,temperature.gpu,memory.total,memory.used,power.limit --format=csv,noheader,nounits)
  if($LASTEXITCODE-ne0-or$lines.Count-ne2){throw 'processing-proof-supervisor-telemetry'};$gpus=@()
  for($index=0;$index-lt2;$index++){$value=$lines[$index].Split(',')|ForEach-Object{$_.Trim()};if([int]$value[0]-ne$index-or$value[1]-cne$uuids[$index]){throw 'processing-proof-supervisor-gpu'};$gpus+=@{index=$index;uuid=$value[1];temperatureC=[double]$value[2];totalMiB=[double]$value[3];usedMiB=[double]$value[4];watts=[double]$value[5]}}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes((@{time=[DateTime]::UtcNow.ToString('o');pid=$worker.Id;gpus=$gpus}|ConvertTo-Json -Compress)+"`n");$watch.Write($bytes,0,$bytes.Length);$watch.Flush()
  if(@($gpus|Where-Object{$_.temperatureC-ge85-or($_.totalMiB-$_.usedMiB)-lt1024}).Count-gt0){throw 'processing-proof-supervisor-hardware'}
  if([DateTime]::UtcNow-gt$deadline){throw 'processing-proof-supervisor-deadline'}
  if(-not(Test-Path -LiteralPath ($output+'\ready.json'))-and[DateTime]::UtcNow-gt$preparation){throw 'processing-proof-supervisor-preparation'}
  if((Get-Item -LiteralPath $stdout).Length-gt2097152-or(Get-Item -LiteralPath $stderr).Length-gt2097152){throw 'processing-proof-supervisor-output'}
 }
 $worker.WaitForExit();$code=$worker.ExitCode;if($null-eq$code){throw 'processing-proof-supervisor-exit'}
}catch{$failure=if($_.Exception.Message-match'^processing-proof-[a-z0-9-]+$'){$_.Exception.Message}else{'processing-proof-supervisor-failed'}}finally{
 try{
  if(-not$powerAuthorized){throw 'processing-proof-supervisor-power-not-owned'}
  if($null-ne$worker-and-not$worker.HasExited){$live=Get-Process -Id $worker.Id -ErrorAction Stop;try{if($live.StartTime.ToUniversalTime()-ne$started){throw 'processing-proof-supervisor-pid'}}finally{$live.Dispose()};Stop-Process -Id $worker.Id;if(-not$worker.WaitForExit(5000)){throw 'processing-proof-supervisor-stop'}}
  $remaining=@(Inventory)
  if($remaining.Count-gt0){$events=@(Get-Content -LiteralPath ($output+'\events.jsonl')|ForEach-Object{$_|ConvertFrom-Json});$loads=@($events|Where-Object{$_.type-ceq'load-response'-and$_.value.status-ceq'loaded'})
   foreach($item in $remaining){$match=@($loads|Where-Object{$_.key-ceq$item.key-and$_.value.instance_id-ceq$item.id});if($match.Count-ne1){throw 'processing-proof-supervisor-recovery-ambiguous'}}
   foreach($item in $remaining){$null=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models/unload' -Method Post -ContentType 'application/json' -Body (@{instance_id=$item.id}|ConvertTo-Json -Compress) -TimeoutSec 120};$recovered=$true
  }
  if(@(Inventory).Count-ne0){throw 'processing-proof-supervisor-residency'}
  foreach($uuid in $uuids){& nvidia-smi.exe -i $uuid -pl 260|Out-Null;if($LASTEXITCODE-ne0){throw 'processing-proof-supervisor-power-restore'}}
  $verify=@(& nvidia-smi.exe --query-gpu=uuid,power.limit --format=csv,noheader,nounits);for($index=0;$index-lt2;$index++){$value=$verify[$index].Split(',')|ForEach-Object{$_.Trim()};if($value[0]-cne$uuids[$index]-or[double]$value[1]-ne260){throw 'processing-proof-supervisor-power-unverified'}}
 }catch{if($null-eq$failure){$failure=if($_.Exception.Message-match'^processing-proof-[a-z0-9-]+$'){$_.Exception.Message}else{'processing-proof-supervisor-cleanup'}}}
 $watch.Dispose();Evidence 'supervisor-result.json' @{schemaVersion='runaai-native-processing-proof-supervisor-result/v1';proofId=[string]$config.proofId;sealSha256=$sealHash;endedAt=[DateTime]::UtcNow.ToString('o');failure=$failure;workerExitCode=$code;recovered=$recovered;zeroResidencyAndPowerRestored=($null-eq$failure);protectedDataIncluded=$false}
}
if($null-ne$failure-or$code-ne0){exit 1}
