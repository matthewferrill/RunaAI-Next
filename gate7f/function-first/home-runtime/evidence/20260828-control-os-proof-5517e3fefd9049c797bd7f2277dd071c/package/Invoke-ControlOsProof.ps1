param([Parameter(Mandatory=$true)][string]$Root,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedPackageSha256)
. (Join-Path $PSScriptRoot 'Windows-Ownership.ps1')
$ProgressPreference='SilentlyContinue'
Assert-ProofPath $Root $Root
if($env:COMPUTERNAME-cne'RUNA-CONTROL'){throw 'proof-host'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'proof-admin'}
if(Test-Path -LiteralPath $Root){throw 'proof-existing-root'}
$manifestFile=Join-Path $PSScriptRoot 'package.json'
if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedPackageSha256){throw 'proof-package-drift'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
$expectedFiles=@('Windows-Ownership.ps1','Invoke-ControlOsProof.ps1','Run-OsProofWorker.ps1','node-fixture.mjs')
if($manifest.schemaVersion-cne'runaai-windows-os-proof-package/v1'-or$manifest.root-cne$Root-or
 (($manifest.files.PSObject.Properties.Name|Sort-Object)-join',')-cne(($expectedFiles|Sort-Object)-join',')){throw 'proof-package-files'}
foreach($file in $expectedFiles){
  if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$manifest.files.$file){throw 'proof-source-drift'}
}
$node='C:\Program Files\nodejs\node.exe'
if($manifest.nodePath-cne$node-or(Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant()-cne$manifest.nodeSha256){throw 'proof-node-drift'}
$id=[IO.Path]::GetFileName($Root).Substring('m1-runtime-os-proof-'.Length)
$tasks=@(('Runa-M1-OsProof-'+$id+'-Supervisor'),('Runa-M1-OsProof-'+$id+'-LocalService'))
foreach($task in $tasks){if(Get-ScheduledTask -TaskPath '\' -TaskName $task -ErrorAction SilentlyContinue){throw 'proof-existing-task'}}
$registered=@();$failure=$null;$childIdentity=$null;$watchdogIdentity=$null;$checks=[ordered]@{};$taskResults=@()
function Await-ProofFile([string]$Relative,[int]$Seconds=20){
  $file=Join-Path $Root $Relative;$until=[DateTime]::UtcNow.AddSeconds($Seconds)
  while(-not(Test-Path -LiteralPath $file)){if([DateTime]::UtcNow-gt$until){throw 'proof-file-timeout'};Start-Sleep -Milliseconds 100}
  return $file
}
try{
  [void][IO.Directory]::CreateDirectory($Root);Set-ProofDirectoryAcl $Root $Root 'ReadAndExecute'
  foreach($folder in @('code','public','state','requests','replies')){[void][IO.Directory]::CreateDirectory((Join-Path $Root $folder))}
  Set-ProofDirectoryAcl (Join-Path $Root 'code') $Root 'ReadAndExecute'
  Set-ProofDirectoryAcl (Join-Path $Root 'public') $Root 'ReadAndExecute'
  Set-ProofDirectoryAcl (Join-Path $Root 'replies') $Root 'ReadAndExecute'
  Set-ProofDirectoryAcl (Join-Path $Root 'requests') $Root 'Modify'
  Set-ProofDirectoryAcl (Join-Path $Root 'state') $Root
  foreach($file in @('Windows-Ownership.ps1','Run-OsProofWorker.ps1','node-fixture.mjs')){
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $Root ('code\'+$file))
  }
  [IO.File]::WriteAllText((Join-Path $Root 'state\private-canary.txt'),'synthetic-private-not-a-credential')
  [IO.File]::WriteAllText((Join-Path $Root 'replies\system-probe.json'),'public-synthetic')
  Write-ProofJson (Join-Path $Root 'config.json') $Root @{nodePath=$node;nodeSha256=$manifest.nodeSha256;packageSha256=$ExpectedPackageSha256}
  foreach($mode in @('supervisor','localservice')){
    $index=if($mode-eq'supervisor'){0}else{1};$sid=if($mode-eq'supervisor'){'S-1-5-18'}else{'S-1-5-19'}
    $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType ServiceAccount -RunLevel Limited
    $arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $Root 'code\Run-OsProofWorker.ps1')+'" -Mode '+$mode+' -Root "'+$Root+'"'
    $action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument $arguments
    $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew
    [void](Register-ScheduledTask -TaskPath '\' -TaskName $tasks[$index] -Action $action -Principal $principal -Settings $settings)
    $registered+=$tasks[$index]
  }
  Start-ScheduledTask -TaskPath '\' -TaskName $tasks[0]
  $childIdentity=Get-Content -LiteralPath (Await-ProofFile 'public\child.json') -Raw|ConvertFrom-Json
  $watchdogIdentity=Get-Content -LiteralPath (Await-ProofFile 'public\watchdog.json') -Raw|ConvertFrom-Json
  [void](Await-ProofFile 'state\synthetic-ownership.jsonl')
  $checks.exclusiveLockDenied=$false
  try{$other=[IO.File]::Open((Join-Path $Root 'state\owner.lock'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$other.Dispose()}catch [IO.IOException]{$checks.exclusiveLockDenied=$true}
  if(-not$checks.exclusiveLockDenied){throw 'proof-lock-not-exclusive'}
  Start-ScheduledTask -TaskPath '\' -TaskName $tasks[1]
  $worker=Get-Content -LiteralPath (Await-ProofFile 'requests\localservice-result.json') -Raw|ConvertFrom-Json
  if($worker.passed-ne$true){throw 'proof-acl-failed'}
  $checks.localServiceAcl=$true
  # Only the helper recorded by the already-owned watchdog is deliberately terminated.
  Stop-ProofProcess $childIdentity
  $supervisor=Get-Content -LiteralPath (Await-ProofFile 'public\supervisor-result.json') -Raw|ConvertFrom-Json
  $checks.nativeWatchdogSurvived=($supervisor.survivedChildExit-eq$true-and$null-eq$supervisor.failure)
  $released=[IO.File]::Open((Join-Path $Root 'state\owner.lock'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$released.Dispose()
  $checks.lockReleasedAfterCleanup=$true
  if(-not$checks.nativeWatchdogSurvived){throw 'proof-watchdog-failed'}
}catch{$failure=if($_.Exception.Message-match'^proof-[a-z-]+$'){$_.Exception.Message}else{'proof-operation-failed'}}
finally{
  if($null-ne$childIdentity-and-not(Test-ProofStopped $childIdentity)){Stop-ProofProcess $childIdentity}
  foreach($task in $registered){
    $until=[DateTime]::UtcNow.AddSeconds(10)
    while((Get-ScheduledTask -TaskPath '\' -TaskName $task).State-eq'Running'-and[DateTime]::UtcNow-lt$until){Start-Sleep -Milliseconds 100}
    if((Get-ScheduledTask -TaskPath '\' -TaskName $task).State-eq'Running'){Stop-ScheduledTask -TaskPath '\' -TaskName $task}
    $taskResults+=@{name=$task;lastResult=(Get-ScheduledTaskInfo -TaskPath '\' -TaskName $task).LastTaskResult}
    Unregister-ScheduledTask -TaskPath '\' -TaskName $task -Confirm:$false
  }
  if($null-ne$watchdogIdentity-and-not(Test-ProofStopped $watchdogIdentity)){Stop-ProofProcess $watchdogIdentity}
  $checks.ownedTasksAbsent=(@($tasks|Where-Object{Get-ScheduledTask -TaskPath '\' -TaskName $_ -ErrorAction SilentlyContinue}).Count-eq0)
  $checks.ownedChildStopped=($null-eq$childIdentity-or(Test-ProofStopped $childIdentity))
  $checks.ownedWatchdogStopped=($null-eq$watchdogIdentity-or(Test-ProofStopped $watchdogIdentity))
  $result=@{schemaVersion='runaai-windows-ownership-proof/v1';time=[DateTime]::UtcNow.ToString('o');root=$Root;host=$env:COMPUTERNAME;
    passed=($null-eq$failure-and@($checks.Values|Where-Object{$_-ne$true}).Count-eq0);failure=$failure;checks=$checks;taskResults=$taskResults;packageSha256=$ExpectedPackageSha256;nodeVersion=$manifest.nodeVersion;filesRetained=$true;modelOperations=$false;networkListenersCreated=$false;productionChanges=$false}
  if(Test-Path -LiteralPath $Root){Write-ProofJson (Join-Path $Root 'result.json') $Root $result}
  $result|ConvertTo-Json -Depth 10 -Compress
}
if($failure){exit 1}
