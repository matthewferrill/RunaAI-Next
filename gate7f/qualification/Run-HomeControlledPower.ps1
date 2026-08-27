param(
  [Parameter(Mandatory=$true)][string]$PackageDirectory,
  [Parameter(Mandatory=$true)][string]$ExpectedPackageSha256
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME -ne 'RUNA-HOME'){throw 'qualification-wrong-host'}
$qualificationRoot=[IO.Path]::GetFullPath($PackageDirectory)
if($qualificationRoot -ne 'C:\Users\codex-audit\AppData\Local\RunaQualification\20260827-acceptance-power-v2'){throw 'qualification-package-directory'}
$qualificationManifestPath=Join-Path $qualificationRoot 'package-manifest.json'
if((Get-FileHash -LiteralPath $qualificationManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedPackageSha256){throw 'qualification-package-hash'}
$qualificationManifest=Get-Content -LiteralPath $qualificationManifestPath -Raw | ConvertFrom-Json
foreach($qualificationProperty in $qualificationManifest.files.PSObject.Properties){
  $qualificationFile=[IO.Path]::GetFullPath((Join-Path $qualificationRoot $qualificationProperty.Name))
  if(-not $qualificationFile.StartsWith($qualificationRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'qualification-file-boundary'}
  if((Get-Item -LiteralPath $qualificationFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'qualification-file-link'}
  if((Get-FileHash -LiteralPath $qualificationFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $qualificationProperty.Value){throw 'qualification-package-drift'}
}
function Get-QualificationGpus {
  $qualificationCsv=& nvidia-smi.exe --query-gpu=index,uuid,name,power.limit,power.min_limit,power.max_limit,temperature.gpu --format=csv,noheader,nounits
  if($LASTEXITCODE -ne 0){throw 'qualification-gpu-query'}
  $qualificationReadings=@($qualificationCsv | ForEach-Object {
    $qualificationParts=$_.Split(',') | ForEach-Object {$_.Trim()}
    [pscustomobject]@{index=[int]$qualificationParts[0];uuid=$qualificationParts[1];name=$qualificationParts[2];powerLimitWatts=[double]$qualificationParts[3];minimumWatts=[double]$qualificationParts[4];maximumWatts=[double]$qualificationParts[5];temperatureC=[double]$qualificationParts[6]}
  })
  if($qualificationReadings.Count -ne 2){throw 'qualification-gpu-count'}
  for($qualificationRowIndex=0;$qualificationRowIndex -lt 2;$qualificationRowIndex++){
    $qualificationReading=$qualificationReadings[$qualificationRowIndex]
    if($qualificationReading.index -ne $qualificationRowIndex -or $qualificationReading.uuid -ne $qualificationUuids[$qualificationRowIndex] -or $qualificationReading.name -ne 'Quadro RTX 6000'){throw 'qualification-gpu-identity'}
    foreach($qualificationNumber in @($qualificationReading.temperatureC,$qualificationReading.powerLimitWatts,$qualificationReading.minimumWatts,$qualificationReading.maximumWatts)){
      if([double]::IsNaN($qualificationNumber) -or [double]::IsInfinity($qualificationNumber) -or $qualificationNumber -lt 0){throw 'qualification-gpu-number'}
    }
  }
  $qualificationReadings
}
function Assert-QualificationEmpty {
  $qualificationInventory=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 20
  if(-not ($qualificationInventory.models -is [Array])){throw 'qualification-inventory-invalid'}
  foreach($qualificationModel in $qualificationInventory.models){
    if(-not ($qualificationModel.loaded_instances -is [Array])){throw 'qualification-residency-invalid'}
    if($qualificationModel.loaded_instances.Count -gt 0){throw 'qualification-resident-model'}
  }
}
function Write-QualificationEvidence($Name,$Payload) {
  $qualificationDestination=Join-Path $qualificationRoot $Name
  $qualificationStream=[IO.File]::Open($qualificationDestination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try{$qualificationBytes=[Text.UTF8Encoding]::new($false).GetBytes(($Payload | ConvertTo-Json -Depth 12)+"`n");$qualificationStream.Write($qualificationBytes,0,$qualificationBytes.Length)}finally{$qualificationStream.Dispose()}
}
$qualificationUuids=@('GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843')
Assert-QualificationEmpty
$qualificationBefore=@(Get-QualificationGpus)
if($qualificationBefore.Count -ne 2){throw 'qualification-gpu-count'}
for($qualificationIndex=0;$qualificationIndex -lt 2;$qualificationIndex++){
  $qualificationGpu=$qualificationBefore[$qualificationIndex]
  if($qualificationGpu.index -ne $qualificationIndex -or $qualificationGpu.uuid -ne $qualificationUuids[$qualificationIndex] -or $qualificationGpu.name -ne 'Quadro RTX 6000' -or $qualificationGpu.powerLimitWatts -ne 260 -or $qualificationGpu.minimumWatts -gt 160 -or $qualificationGpu.maximumWatts -lt 160){throw 'qualification-power-before-drift'}
}
Write-QualificationEvidence 'power-before.json' @{time=[DateTime]::UtcNow.ToString('o');gpus=$qualificationBefore;packageManifestSha256=$ExpectedPackageSha256;privateValuesIncluded=$false}
$qualificationChanged=@()
$qualificationArmResults=@()
$qualificationFailure=$null
$qualificationRestored=$false
try {
  foreach($qualificationGpu in $qualificationBefore){
    $qualificationChanged+=,$qualificationGpu
    & nvidia-smi.exe -i $qualificationGpu.uuid -pl 160
    if($LASTEXITCODE -ne 0){throw 'qualification-power-set-failed'}
  }
  $qualificationAfter=@(Get-QualificationGpus)
  if(@($qualificationAfter | Where-Object {$_.powerLimitWatts -ne 160}).Count -gt 0){throw 'qualification-power-not-applied'}
  Write-QualificationEvidence 'power-applied.json' @{time=[DateTime]::UtcNow.ToString('o');gpus=$qualificationAfter}
  foreach($qualificationCandidate in @('incumbent','gemma26')){
    Assert-QualificationEmpty
    $qualificationCapture=Join-Path $qualificationRoot ('qualification\capture-'+$qualificationCandidate)
    if(Test-Path -LiteralPath $qualificationCapture){throw 'qualification-capture-exists'}
    $qualificationCooldownDeadline=[DateTime]::UtcNow.AddMinutes(15)
    do{
      $qualificationCool=@(Get-QualificationGpus)
      if(@($qualificationCool | Where-Object {$_.powerLimitWatts -ne 160}).Count -gt 0){throw 'qualification-power-drift'}
      if(@($qualificationCool | Where-Object {$_.temperatureC -gt 45}).Count -eq 0){break}
      if([DateTime]::UtcNow -gt $qualificationCooldownDeadline){throw 'qualification-cooldown-timeout'}
      Start-Sleep -Seconds 5
    }while($true)
    $qualificationArmStarted=[DateTime]::UtcNow
    & node.exe (Join-Path $qualificationRoot 'qualification\runner.mjs') $qualificationCandidate --authorized-qualification
    $qualificationArmExit=$LASTEXITCODE
    $qualificationResult=Get-Content -LiteralPath (Join-Path $qualificationRoot ('qualification\capture-'+$qualificationCandidate+'\result.json')) -Raw | ConvertFrom-Json
    if($qualificationResult.candidate -ne $qualificationCandidate -or $qualificationResult.phase -ne 'acceptance-power-v2' -or -not ($qualificationResult.passed -is [bool]) -or -not ($qualificationResult.cleanupVerified -is [bool]) -or ([DateTime]::Parse($qualificationResult.startedAt).ToUniversalTime() -lt $qualificationArmStarted) -or (($qualificationArmExit -eq 0) -ne $qualificationResult.passed)){throw 'qualification-result-exit-mismatch'}
    $qualificationArmResults+=@{candidate=$qualificationCandidate;exitCode=$qualificationArmExit;result=$qualificationResult}
    if(-not $qualificationResult.cleanupVerified){throw 'qualification-owned-cleanup-unverified'}
    Assert-QualificationEmpty
  }
}catch{$qualificationFailure=if($_.Exception.Message -match '^qualification-[a-z0-9-]+$'){$_.Exception.Message}else{'qualification-controlled-power-failed'}}
finally {
  try{
    Assert-QualificationEmpty
    foreach($qualificationGpu in $qualificationChanged){
      & nvidia-smi.exe -i $qualificationGpu.uuid -pl $qualificationGpu.powerLimitWatts
      if($LASTEXITCODE -ne 0){throw 'qualification-power-restore-failed'}
    }
    $qualificationFinal=@(Get-QualificationGpus)
    if(@($qualificationFinal | Where-Object {$_.powerLimitWatts -ne 260}).Count -gt 0){throw 'qualification-power-restore-drift'}
    $qualificationRestored=$true
  }catch{if(-not $qualificationFailure){$qualificationFailure='qualification-power-restore-unverified'}}
  $qualificationSummary=@{schemaVersion='runa2-qualification-controlled-power/v1';time=[DateTime]::UtcNow.ToString('o');arms=$qualificationArmResults;failure=$qualificationFailure;powerRestored=$qualificationRestored;privateValuesIncluded=$false;productionRoutingChanged=$false}
  Write-QualificationEvidence 'power-result.json' $qualificationSummary
  $qualificationSummary | ConvertTo-Json -Depth 12 -Compress
}
if($qualificationFailure -or @($qualificationArmResults | Where-Object {-not $_.result.passed}).Count -gt 0){exit 1}
