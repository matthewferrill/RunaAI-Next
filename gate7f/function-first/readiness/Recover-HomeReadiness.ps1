param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-ne'RUNA-HOME'){throw 'readiness-recovery-host'}
$root='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\20260828-readiness-r3'
$receipt=Join-Path $root 'recovery.json'
if(Test-Path -LiteralPath $receipt){throw 'readiness-recovery-already-recorded'}
$expectedSeal='4a17bf88c5d77af50b2c46b9063d1ded7f42dd114f9bb78f7d0754cd048bbe10'
if((Get-FileHash -LiteralPath (Join-Path $root 'seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()-ne$expectedSeal){throw 'readiness-recovery-seal'}
if(@(Get-Process node -ErrorAction SilentlyContinue).Count-gt0){throw 'readiness-recovery-node-still-present'}
$uuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
$before=Get-Content -LiteralPath (Join-Path $root 'power-before.json') -Raw|ConvertFrom-Json
if($before.gpus.Count-ne2){throw 'readiness-recovery-before'}
for($i=0;$i-lt2;$i++){if($before.gpus[$i].uuid-ne$uuids[$i]-or$before.gpus[$i].powerLimitWatts-ne260){throw 'readiness-recovery-before'}}
$events=@(Get-Content -LiteralPath (Join-Path $root 'capture-gemma.jsonl')|ForEach-Object{$_|ConvertFrom-Json})
$loads=@($events|Where-Object{$_.type-eq'load-response'})
if($loads.Count-ne1-or$loads[0].value.instance_id-ne'gemma-4-26b-a4b-it-qat'-or$loads[0].value.status-ne'loaded'){throw 'readiness-recovery-ownership'}
if(Test-Path -LiteralPath (Join-Path $root 'result-gemma.json')){throw 'readiness-recovery-arm-already-finished'}
function Loaded {
 $inventory=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 15
 @($inventory.models|ForEach-Object{$model=$_;foreach($instance in $model.loaded_instances){@{key=$model.key;id=$instance.id}}})
}
$failure=$null;$unloaded=$false;$restored=$false;$gpus=@()
try{
 $current=@(Loaded)
 if($current.Count-ne1-or$current[0].key-ne'gemma-4-26b-a4b-it-qat'-or$current[0].id-ne$loads[0].value.instance_id){throw 'readiness-recovery-unowned-residency'}
 $body=@{instance_id=$loads[0].value.instance_id}|ConvertTo-Json -Compress
 $null=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models/unload' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 30
 if(@(Loaded).Count-ne0){throw 'readiness-recovery-unload-unverified'}
 $unloaded=$true
 foreach($uuid in $uuids){
  $row=(& nvidia-smi.exe -i $uuid --query-gpu=uuid,power.limit --format=csv,noheader,nounits).Split(',')|ForEach-Object{$_.Trim()}
  if($LASTEXITCODE-ne0-or$row[0]-ne$uuid-or[double]$row[1]-notin@(160,260)){throw 'readiness-recovery-power-drift'}
  & nvidia-smi.exe -i $uuid -pl 260
  if($LASTEXITCODE-ne0){throw 'readiness-recovery-power-restore'}
 }
 $gpus=@(& nvidia-smi.exe --query-gpu=index,uuid,power.limit,temperature.gpu,memory.used --format=csv,noheader,nounits)
 for($i=0;$i-lt2;$i++){$row=$gpus[$i].Split(',')|ForEach-Object{$_.Trim()};if($row[1]-ne$uuids[$i]-or[double]$row[2]-ne260){throw 'readiness-recovery-power-verify'}}
 $restored=$true
}catch{$failure=if($_.Exception.Message-match'^readiness-[a-z0-9-]+$'){$_.Exception.Message}else{'readiness-recovery-operation-failed'}}
$result=@{schemaVersion='runa-m1-readiness-recovery/v1';time=[DateTime]::UtcNow.ToString('o');sourceSeal=$expectedSeal;ownedInstance='gemma-4-26b-a4b-it-qat';unloaded=$unloaded;powerRestored=$restored;gpus=$gpus;failure=$failure;incompleteCaptureRetained=$true;modelQualityQualified=$false;productionRoutingChanged=$false;protectedDataIncluded=$false}
$stream=[IO.File]::Open($receipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($result|ConvertTo-Json -Depth 10)+"`n");$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
$result|ConvertTo-Json -Depth 10 -Compress
if($failure){exit 1}
