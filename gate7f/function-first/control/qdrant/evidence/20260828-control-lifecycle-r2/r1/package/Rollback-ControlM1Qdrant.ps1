[CmdletBinding()]
param([Parameter(Mandatory)][string]$ExpectedPackageSha256)
. (Join-Path $PSScriptRoot 'Common-M1Qdrant.ps1')
Assert-M1QdrantHost -Administrator
$null=Get-M1QdrantInstallation $ExpectedPackageSha256
$task=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName -ErrorAction SilentlyContinue
$state=Join-Path $script:M1QdrantRoot 'state';$proofPath=Join-Path $state 'process.json'
if($null-eq$task){
  Assert-M1QdrantPortsFree
  $owned=@(Get-CimInstance Win32_Process -Filter "Name='qdrant.exe'"|Where-Object{$_.ExecutablePath-ieq($script:M1QdrantRoot+'\code\qdrant.exe')})
  Assert-M1Qdrant ($owned.Count-eq0) 'unregistered-child-still-present'
  [ordered]@{schemaVersion='runaai-m1-qdrant-rollback/v1';alreadyUnregistered=$true;dataRetained=$true;changed=$false}|ConvertTo-Json -Compress
  exit 0
}
Assert-M1QdrantTask $task $ExpectedPackageSha256
Disable-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName|Out-Null
$stopPath=Join-Path $state 'stop-request.json'
if(-not(Test-Path -LiteralPath $stopPath)){
  Write-M1QdrantJson $stopPath (@{schemaVersion='runaai-m1-qdrant-stop/v1';packageSha256=$ExpectedPackageSha256;requestedAt=[DateTime]::UtcNow.ToString('o')}) -New
}else{
  Assert-M1QdrantPath $stopPath -File;$s=Get-Content -LiteralPath $stopPath -Raw|ConvertFrom-Json
  Assert-M1Qdrant ($s.schemaVersion-eq'runaai-m1-qdrant-stop/v1'-and$s.packageSha256-eq$ExpectedPackageSha256) 'stop-binding'
}
$deadline=[DateTime]::UtcNow.AddSeconds(15)
do{
  $running=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
  Assert-M1QdrantTask $running $ExpectedPackageSha256
  if([string]$running.State-ne'Running'){break};Start-Sleep -Milliseconds 500
}while([DateTime]::UtcNow-lt$deadline)
if([string]$running.State-eq'Running'){
  # Task definition is revalidated immediately before stopping precisely that registration.
  Stop-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
}
# Task Scheduler may terminate its wrapper before finally. Independently verify and stop only its child.
if(Test-Path -LiteralPath $proofPath){
  Assert-M1QdrantPath $proofPath -File;$proof=Get-Content -LiteralPath $proofPath -Raw|ConvertFrom-Json
  Assert-M1Qdrant ($proof.schemaVersion-eq'runaai-m1-qdrant-process/v1'-and$proof.packageSha256-eq$ExpectedPackageSha256) 'process-package'
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$proof.pid)
  if($null-ne$live){
    Assert-M1QdrantChild $proof $live
    Stop-Process -Id ([int]$proof.pid) -ErrorAction Stop
    $deadline=[DateTime]::UtcNow.AddSeconds(10)
    while(Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$proof.pid)){
      Assert-M1Qdrant ([DateTime]::UtcNow-lt$deadline) 'rollback-stop-timeout';Start-Sleep -Milliseconds 250
    }
  }
}
$owned=@(Get-CimInstance Win32_Process -Filter "Name='qdrant.exe'"|Where-Object{$_.ExecutablePath-ieq($script:M1QdrantRoot+'\code\qdrant.exe')})
Assert-M1Qdrant ($owned.Count-eq0) 'unowned-unrecorded-child'
Assert-M1QdrantPortsFree
$task=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
Assert-M1QdrantTask $task $ExpectedPackageSha256
Assert-M1Qdrant ([string]$task.State-ne'Running') 'task-still-running'
Unregister-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName -Confirm:$false
Write-M1QdrantJson (Join-Path $state ('rollback-'+[Guid]::NewGuid().ToString('N')+'.json')) (@{
  schemaVersion='runaai-m1-qdrant-rollback/v1';packageSha256=$ExpectedPackageSha256;time=[DateTime]::UtcNow.ToString('o');
  stopped=$true;taskUnregistered=$true;dataRetained=$true;otherServicesChanged=$false
}) -New
[ordered]@{schemaVersion='runaai-m1-qdrant-rollback/v1';stopped=$true;taskUnregistered=$true;
  dataRetained=$true;otherServicesChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
