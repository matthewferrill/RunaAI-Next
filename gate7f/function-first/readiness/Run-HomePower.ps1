param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME -ne 'RUNA-HOME'){throw 'readiness-wrong-host'}
$root=$PSScriptRoot
if($root -ne 'C:\Users\codex-audit\AppData\Local\RunaM1Readiness\20260828-readiness-r3'){throw 'readiness-package-root'}
$seal=Get-Content -LiteralPath (Join-Path $root 'seal.json') -Raw | ConvertFrom-Json
foreach($file in $seal.files.PSObject.Properties){
 if($file.Name -notmatch '^[a-zA-Z-]+\.(mjs|json|ps1)$'){throw 'readiness-seal-path'}
 $source=Join-Path $root $file.Name
 if((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'readiness-seal-link'}
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.Value){throw 'readiness-package-drift'}
}
$uuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
function Gpus {
 $csv=& nvidia-smi.exe --query-gpu=index,uuid,name,power.limit,power.min_limit,power.max_limit,temperature.gpu --format=csv,noheader,nounits
 if($LASTEXITCODE -ne 0){throw 'readiness-gpu-query'}
 $values=@($csv | ForEach-Object{$p=$_.Split(',')|ForEach-Object{$_.Trim()};[pscustomobject]@{index=[int]$p[0];uuid=$p[1];name=$p[2];powerLimitWatts=[double]$p[3];minimumWatts=[double]$p[4];maximumWatts=[double]$p[5];temperatureC=[double]$p[6]}})
 if($values.Count -ne 2){throw 'readiness-gpu-count'}
 for($i=0;$i -lt 2;$i++){
  if($values[$i].index -ne $i -or $values[$i].uuid -ne $uuids[$i] -or $values[$i].name -ne 'Quadro RTX 6000'){throw 'readiness-gpu-identity'}
  foreach($n in @($values[$i].temperatureC,$values[$i].powerLimitWatts,$values[$i].minimumWatts,$values[$i].maximumWatts)){if([double]::IsNaN($n)-or[double]::IsInfinity($n)-or$n-lt 0){throw 'readiness-gpu-number'}}
 }
 $values
}
function Empty {
 $inventory=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 15
 if(-not($inventory.models -is [Array])){throw 'readiness-inventory-shape'}
 foreach($model in $inventory.models){if(-not($model.loaded_instances -is [Array])-or$model.loaded_instances.Count-gt 0){throw 'readiness-unowned-residency'}}
}
function Evidence($Name,$Value){
 $stream=[IO.File]::Open((Join-Path $root $Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 25)+"`n");$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}
Empty
$before=@(Gpus)
foreach($gpu in $before){if($gpu.powerLimitWatts-ne 260-or$gpu.minimumWatts-gt 160-or$gpu.maximumWatts-lt 160){throw 'readiness-power-baseline'}}
Evidence 'power-before.json' @{time=[DateTime]::UtcNow.ToString('o');gpus=$before}
$changed=@();$results=@();$failure=$null;$restored=$false
try{
 foreach($gpu in $before){$changed+=,$gpu;& nvidia-smi.exe -i $gpu.uuid -pl 160;if($LASTEXITCODE-ne 0){throw 'readiness-power-set'}}
 $applied=@(Gpus);if(@($applied|Where-Object{$_.powerLimitWatts-ne 160}).Count-gt 0){throw 'readiness-power-verify'}
 Evidence 'power-applied.json' @{time=[DateTime]::UtcNow.ToString('o');gpus=$applied}
 foreach($candidate in @('qwen36','gemma','coder')){
  Empty
  $until=[DateTime]::UtcNow.AddMinutes(15)
  do{
   $current=@(Gpus)
   if(@($current|Where-Object{$_.powerLimitWatts-ne 160}).Count-gt 0){throw 'readiness-power-drift'}
   if(@($current|Where-Object{$_.temperatureC-gt 45}).Count-eq 0){break}
   if([DateTime]::UtcNow-gt$until){throw 'readiness-cooldown-deadline'}
   Start-Sleep -Seconds 5
  }while($true)
  @{status='controlled-power-arm';candidate=$candidate;powerWatts=160}|ConvertTo-Json -Compress
  & node.exe (Join-Path $root 'runner.mjs') $candidate
  $code=$LASTEXITCODE
  $result=Get-Content -LiteralPath (Join-Path $root ('result-'+$candidate+'.json')) -Raw|ConvertFrom-Json
  if($result.candidate-ne$candidate-or-not$result.cleanupVerified){throw 'readiness-owned-cleanup-unverified'}
  $results+=@{candidate=$candidate;exitCode=$code;result=$result}
  Empty
  if($result.errorCode-eq'readiness-hardware-boundary'){throw 'readiness-controlled-power-thermal-stop'}
 }
}catch{$failure=if($_.Exception.Message-match'^readiness-[a-z0-9-]+$'){$_.Exception.Message}else{'readiness-power-wrapper-failed'}}
finally{
 try{
  Empty
  foreach($gpu in $changed){& nvidia-smi.exe -i $gpu.uuid -pl $gpu.powerLimitWatts;if($LASTEXITCODE-ne 0){throw 'readiness-power-restore'}}
  $final=@(Gpus);if(@($final|Where-Object{$_.powerLimitWatts-ne 260}).Count-gt 0){throw 'readiness-power-restore-drift'}
  $restored=$true
 }catch{if(-not$failure){$failure='readiness-power-restore-unverified'}}
 $summary=@{schemaVersion='runa-m1-readiness-controlled-power/v1';time=[DateTime]::UtcNow.ToString('o');arms=$results;failure=$failure;powerRestored=$restored;productionRoutingChanged=$false;protectedDataIncluded=$false}
 Evidence 'power-result.json' $summary
 $summary|ConvertTo-Json -Depth 25 -Compress
}
if($failure){exit 1}
