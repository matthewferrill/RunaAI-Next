param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal,[switch]$Unregister)
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
if(-not([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'runtime-stop-authority'}
[void](Assert-RuntimeInstallation $ExpectedSeal)
$names=@('RunaAI-Next-HomeRuntime-Supervisor','RunaAI-Next-HomeRuntime-Worker')
foreach($role in @('Supervisor','Worker')){$task=Get-ScheduledTask -TaskPath '\' -TaskName ('RunaAI-Next-HomeRuntime-'+$role)
  Assert-RuntimeTask $task $role $ExpectedSeal
}
[void](Disable-ScheduledTask -TaskPath '\' -TaskName $names[0])
Write-RuntimeJson ($script:RuntimeRoot+'\state\disabled.json') @{schemaVersion='runaai-runtime-disabled/v1';installationSha256=$ExpectedSeal;reason='operator-stop'} $true
$until=[DateTime]::UtcNow.AddMinutes(15)
while((Get-ScheduledTask -TaskPath '\' -TaskName $names[0]).State-eq'Running'){
  if([DateTime]::UtcNow-gt$until){throw 'runtime-stop-timeout'};Start-Sleep -Seconds 2
}
$activeFile=$script:RuntimeRoot+'\active-session.json'
if(Test-Path -LiteralPath $activeFile){
  $active=Read-RuntimeJson $activeFile;if($active.installationSha256-cne$ExpectedSeal){throw 'runtime-stop-session'}
  $paths=Runtime-SessionPaths $active.sessionId;$result=Read-RuntimeJson ($paths.state+'\native-result.json')
  if($result.recovered-ne$true){throw 'runtime-stop-cleanup-unconfirmed'}
  $processes=Read-RuntimeJson ($paths.state+'\processes.json')
  if(-not(Test-RuntimeStopped $processes.worker)-or-not(Test-RuntimeStopped $processes.supervisor)){throw 'runtime-stop-processes-live'}
}
$until=[DateTime]::UtcNow.AddSeconds(10)
while((Get-ScheduledTask -TaskPath '\' -TaskName $names[1]).State-eq'Running'){
  if([DateTime]::UtcNow-gt$until){throw 'runtime-stop-worker-task'};Start-Sleep -Milliseconds 200
}
[void](Disable-ScheduledTask -TaskPath '\' -TaskName $names[1])
if($Unregister){foreach($name in $names){Unregister-ScheduledTask -TaskPath '\' -TaskName $name -Confirm:$false}}
@{schemaVersion='runaai-runtime-stop/v1';passed=$true;installationSha256=$ExpectedSeal;tasksDisabled=$true;tasksUnregistered=[bool]$Unregister;
  filesRetained=$true;settingsRestored=$false;productionRoutingChanged=$false}|ConvertTo-Json -Compress
