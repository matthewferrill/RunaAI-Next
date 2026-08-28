param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME -ne 'RUNA-HOME'){throw 'readiness-wrong-host'}
$root=$PSScriptRoot
if($root -ne 'C:\Users\codex-audit\AppData\Local\RunaM1Readiness\20260828-readiness-r4'){throw 'readiness-package-root'}
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
function RecoverOwned($Candidate){
 $inventory=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 15
 $loaded=@($inventory.models|ForEach-Object{$model=$_;foreach($instance in $model.loaded_instances){@{key=$model.key;id=$instance.id}}})
 if($loaded.Count-eq0){return}
 $key=if($Candidate-eq'gemma'){'gemma-4-26b-a4b-it-qat'}elseif($Candidate-eq'coder'){'qwen3-coder-30b-a3b-instruct'}else{throw 'readiness-recovery-candidate'}
 $capture=Join-Path $root ('capture-'+$Candidate+'.jsonl')
 $events=@(Get-Content -LiteralPath $capture|ForEach-Object{$_|ConvertFrom-Json})
 $loads=@($events|Where-Object{$_.type-eq'load-response'})
 if($loaded.Count-ne1-or$loads.Count-ne1-or$loads[0].value.status-ne'loaded'-or$loaded[0].key-ne$key-or$loaded[0].id-ne$loads[0].value.instance_id){throw 'readiness-child-recovery-ambiguous'}
 $body=@{instance_id=$loaded[0].id}|ConvertTo-Json -Compress
 $null=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models/unload' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 120
 Empty
 Evidence ('worker-'+$Candidate+'-recovery.json') @{time=[DateTime]::UtcNow.ToString('o');ownedInstance=$loaded[0].id;cleanupVerified=$true;partialEvidenceRetained=$true}
}
$watchPath=Join-Path $root 'watchdog.jsonl'
$watch=[IO.File]::Open($watchPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
function Watch($Candidate,$WorkerPid,$Phase){
 $gpus=@(Gpus)
 $value=@{time=[DateTime]::UtcNow.ToString('o');candidate=$Candidate;workerPid=$WorkerPid;phase=$Phase;gpus=$gpus}
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 10 -Compress)+"`n")
 $watch.Write($bytes,0,$bytes.Length);$watch.Flush()
 if(@($gpus|Where-Object{$_.temperatureC-ge85-or$_.powerLimitWatts-ne160}).Count-gt0){throw 'readiness-watchdog-hardware'}
 $gpus
}
Empty
$before=@(Gpus)
foreach($gpu in $before){if($gpu.powerLimitWatts-ne 260-or$gpu.minimumWatts-gt 160-or$gpu.maximumWatts-lt 160){throw 'readiness-power-baseline'}}
Evidence 'power-before.json' @{time=[DateTime]::UtcNow.ToString('o');gpus=$before}
$changed=@();$results=@();$failure=$null;$restored=$false;$worker=$null;$activeCandidate=$null
try{
 foreach($gpu in $before){$changed+=,$gpu;& nvidia-smi.exe -i $gpu.uuid -pl 160;if($LASTEXITCODE-ne 0){throw 'readiness-power-set'}}
 $applied=@(Gpus);if(@($applied|Where-Object{$_.powerLimitWatts-ne 160}).Count-gt 0){throw 'readiness-power-verify'}
 Evidence 'power-applied.json' @{time=[DateTime]::UtcNow.ToString('o');gpus=$applied}
 # Qwen's complete r3 arm is retained; only the interrupted/unstarted arms repeat here.
 foreach($candidate in @('gemma','coder')){
  $activeCandidate=$candidate
  Empty
  $until=[DateTime]::UtcNow.AddMinutes(15)
  do{
   $current=@(Watch $candidate $null 'cooldown')
   if(@($current|Where-Object{$_.powerLimitWatts-ne 160}).Count-gt 0){throw 'readiness-power-drift'}
   if(@($current|Where-Object{$_.temperatureC-gt 45}).Count-eq 0){break}
   if([DateTime]::UtcNow-gt$until){throw 'readiness-cooldown-deadline'}
   Start-Sleep -Seconds 5
  }while($true)
  @{status='controlled-power-arm';candidate=$candidate;powerWatts=160}|ConvertTo-Json -Compress
  $stdout=Join-Path $root ('worker-'+$candidate+'-stdout.txt')
  $stderr=Join-Path $root ('worker-'+$candidate+'-stderr.txt')
  if((Test-Path -LiteralPath $stdout)-or(Test-Path -LiteralPath $stderr)){throw 'readiness-worker-log-exists'}
  $runner=Join-Path $root 'runner.mjs'
  $worker=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @(('"'+$runner+'"'),$candidate) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  $workerStarted=$worker.StartTime.ToUniversalTime()
  Evidence ('worker-'+$candidate+'.json') @{time=[DateTime]::UtcNow.ToString('o');pid=$worker.Id;startedAt=$workerStarted.ToString('o');candidate=$candidate;nodePath='C:\Program Files\nodejs\node.exe';sshIndependent=$true}
  $workerDeadline=[DateTime]::UtcNow.AddMinutes(31)
  $null=Watch $candidate $worker.Id 'worker-started'
  while(-not$worker.WaitForExit(5000)){
   $null=Watch $candidate $worker.Id 'worker-running'
   if([DateTime]::UtcNow-gt$workerDeadline){throw 'readiness-watchdog-deadline'}
   if((Get-Item -LiteralPath $stdout).Length-gt2097152-or(Get-Item -LiteralPath $stderr).Length-gt2097152){throw 'readiness-watchdog-output-cap'}
  }
  $worker.WaitForExit();$code=$worker.ExitCode
  Evidence ('worker-'+$candidate+'-exit.json') @{time=[DateTime]::UtcNow.ToString('o');pid=$worker.Id;exitCode=$code;stdoutBytes=(Get-Item -LiteralPath $stdout).Length;stderrBytes=(Get-Item -LiteralPath $stderr).Length}
  $worker=$null
  if(-not(Test-Path -LiteralPath (Join-Path $root ('result-'+$candidate+'.json')))){RecoverOwned $candidate;throw 'readiness-worker-result-missing'}
  $result=Get-Content -LiteralPath (Join-Path $root ('result-'+$candidate+'.json')) -Raw|ConvertFrom-Json
  if($result.candidate-ne$candidate-or-not$result.cleanupVerified){throw 'readiness-owned-cleanup-unverified'}
  $results+=@{candidate=$candidate;exitCode=$code;result=$result}
  Empty
  if($result.errorCode-eq'readiness-hardware-boundary'){throw 'readiness-controlled-power-thermal-stop'}
 }
}catch{$failure=if($_.Exception.Message-match'^readiness-[a-z0-9-]+$'){$_.Exception.Message}else{'readiness-power-wrapper-failed'}}
finally{
 try{
  if($null-ne$worker-and-not$worker.HasExited){
   $live=Get-Process -Id $worker.Id
   if($live.StartTime.ToUniversalTime()-ne$workerStarted){throw 'readiness-worker-pid-drift'}
   Stop-Process -Id $worker.Id
   if(-not$worker.WaitForExit(5000)){throw 'readiness-worker-stop-unverified'}
  }
  if($null-ne$activeCandidate){RecoverOwned $activeCandidate}
  Empty
  foreach($gpu in $changed){& nvidia-smi.exe -i $gpu.uuid -pl $gpu.powerLimitWatts;if($LASTEXITCODE-ne 0){throw 'readiness-power-restore'}}
  $final=@(Gpus);if(@($final|Where-Object{$_.powerLimitWatts-ne 260}).Count-gt 0){throw 'readiness-power-restore-drift'}
  $restored=$true
 }catch{if(-not$failure){$failure='readiness-power-restore-unverified'}}
 $summary=@{schemaVersion='runa-m1-readiness-controlled-power/v1';time=[DateTime]::UtcNow.ToString('o');arms=$results;failure=$failure;powerRestored=$restored;productionRoutingChanged=$false;protectedDataIncluded=$false}
 Evidence 'power-result.json' $summary
 $watch.Dispose()
 $summary|ConvertTo-Json -Depth 25 -Compress
}
if($failure){exit 1}
