[CmdletBinding()]
param([Parameter(Mandatory)][string]$ExpectedPackageSha256)
. (Join-Path $PSScriptRoot 'Common-M1Qdrant.ps1')
Assert-M1QdrantHost -Administrator
$null=Get-M1QdrantInstallation $ExpectedPackageSha256
$task=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
Assert-M1QdrantTask $task $ExpectedPackageSha256
$state=Join-Path $script:M1QdrantRoot 'state'
if([string]$task.State-eq'Running'){
  Assert-M1QdrantPath (Join-Path $state 'process.json') -File
  $proof=Get-Content -LiteralPath (Join-Path $state 'process.json') -Raw|ConvertFrom-Json
  Assert-M1Qdrant ($proof.packageSha256-eq$ExpectedPackageSha256) 'process-package'
  Assert-M1QdrantChild $proof (Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$proof.pid))
  Assert-M1QdrantListeners $proof.pid
  $r=Get-Content -LiteralPath (Join-Path $state 'ready.json') -Raw|ConvertFrom-Json
  Assert-M1Qdrant ($r.packageSha256-eq$ExpectedPackageSha256-and$r.runId-eq$proof.runId-and$r.pid-eq$proof.pid) 'existing-readiness'
  $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9774/readyz' -TimeoutSec 2 -MaximumRedirection 0
  Assert-M1Qdrant ($response.StatusCode-eq200) 'existing-health'
  [ordered]@{schemaVersion='runaai-m1-qdrant-activation/v1';alreadyRunning=$true;changed=$false;dataRetained=$true}|ConvertTo-Json -Compress
  exit 0
}
Assert-M1QdrantPortsFree
Assert-M1QdrantTree $state
$stopPath=Join-Path $state 'stop-request.json'
if(Test-Path -LiteralPath $stopPath){
  Assert-M1QdrantPath $stopPath -File
  $stop=Get-Content -LiteralPath $stopPath -Raw|ConvertFrom-Json
  Assert-M1Qdrant ($stop.schemaVersion-eq'runaai-m1-qdrant-stop/v1'-and$stop.packageSha256-eq$ExpectedPackageSha256) 'stop-binding'
  # Retain the old stop marker rather than delete it.
  Move-Item -LiteralPath $stopPath -Destination (Join-Path $state ('stop-retained-'+[Guid]::NewGuid().ToString('N')+'.json'))
}
$began=[DateTime]::UtcNow
try{
  Enable-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName|Out-Null
  Start-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
  $deadline=[DateTime]::UtcNow.AddSeconds(70);$ready=$false
  while([DateTime]::UtcNow-lt$deadline){
    Start-Sleep -Milliseconds 500
    try{
      $readyPath=Join-Path $state 'ready.json';$proofPath=Join-Path $state 'process.json'
      Assert-M1QdrantPath $readyPath -File;Assert-M1QdrantPath $proofPath -File
      $r=Get-Content -LiteralPath $readyPath -Raw|ConvertFrom-Json;$proof=Get-Content -LiteralPath $proofPath -Raw|ConvertFrom-Json
      Assert-M1Qdrant ($r.schemaVersion-eq'runaai-m1-qdrant-ready/v1'-and$r.packageSha256-eq$ExpectedPackageSha256-and$proof.packageSha256-eq$ExpectedPackageSha256-and$r.runId-eq$proof.runId-and$r.pid-eq$proof.pid-and[DateTime]::Parse($r.readyAt).ToUniversalTime()-ge$began) 'readiness-binding'
      Assert-M1QdrantChild $proof (Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$proof.pid))
      Assert-M1QdrantListeners $proof.pid
      $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9774/readyz' -TimeoutSec 2 -MaximumRedirection 0
      if($response.StatusCode-eq200){$ready=$true;break}
    }catch{}
  }
  Assert-M1Qdrant $ready 'activation-timeout'
}catch{
  # This rollback operates only on the exact new task and leaves all files recoverable.
  & (Join-Path $PSScriptRoot 'Rollback-ControlM1Qdrant.ps1') -ExpectedPackageSha256 $ExpectedPackageSha256
  throw
}
[ordered]@{schemaVersion='runaai-m1-qdrant-activation/v1';ready=$true;packageSha256=$ExpectedPackageSha256;
  http='http://127.0.0.1:9774';grpc='127.0.0.1:9775';ordinaryAuthorityChanged=$false;protectedDataChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
