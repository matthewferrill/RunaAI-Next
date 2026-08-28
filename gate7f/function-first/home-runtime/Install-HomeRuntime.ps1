param([Parameter(Mandatory=$true)][ValidatePattern('^C:\\Users\\codex-audit\\AppData\\Local\\RunaRuntimePackages\\[a-f0-9]{64}$')][string]$PackageRoot,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal)
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
if($env:COMPUTERNAME-cne'RUNA-HOME'-or-not([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'runtime-install-host-authority'}
$manifestFile=$PackageRoot+'\installation.json'
for($current=$PackageRoot;$current;$current=[IO.Path]::GetDirectoryName($current)){
  if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'runtime-package-link'}
}
if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedSeal){throw 'runtime-package-pin'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
if($manifest.schemaVersion-cne'runaai-qualified-home-installation/v1'-or$manifest.installationId-cne[IO.Path]::GetFileName($PackageRoot)){throw 'runtime-package-binding'}
foreach($file in $manifest.codeFiles.PSObject.Properties){
  Assert-RuntimeCodeName $file.Name
  $path=$PackageRoot+'\code\'+$file.Name.Replace('/','\')
  for($current=$path;$current.StartsWith($PackageRoot,[StringComparison]::Ordinal);$current=[IO.Path]::GetDirectoryName($current)){
    if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'runtime-package-link'}
    if($current-ceq$PackageRoot){break}
  }
  if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()-cne$file.Value){throw 'runtime-package-source-pin'}
}
if(Test-Path -LiteralPath $script:RuntimeRoot){throw 'runtime-install-existing-root'}
$taskNames=@('RunaAI-Next-HomeRuntime-Supervisor','RunaAI-Next-HomeRuntime-Worker')
foreach($name in $taskNames){if(Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue){throw 'runtime-install-existing-task'}}
if(Get-NetTCPConnection -State Listen -LocalPort 9776 -ErrorAction SilentlyContinue){throw 'runtime-install-existing-port'}
$registered=@();$passed=$false
try{
  Assert-RuntimePath $script:RuntimeRoot;[void][IO.Directory]::CreateDirectory($script:RuntimeRoot)
  Set-RuntimeDirectoryAcl $script:RuntimeRoot 'ReadAndExecute'
  foreach($name in @('code','tls','ipc','state','state\sessions')){[void][IO.Directory]::CreateDirectory(($script:RuntimeRoot+'\'+$name))}
  foreach($name in @('code','tls','ipc')){Set-RuntimeDirectoryAcl ($script:RuntimeRoot+'\'+$name) 'ReadAndExecute'}
  Set-RuntimeDirectoryAcl ($script:RuntimeRoot+'\state');Set-RuntimeDirectoryAcl ($script:RuntimeRoot+'\state\sessions')
  Copy-Item -LiteralPath $manifestFile -Destination ($script:RuntimeRoot+'\installation.json')
  foreach($file in $manifest.codeFiles.PSObject.Properties){
    $destination=$script:RuntimeRoot+'\code\'+$file.Name.Replace('/','\');Assert-RuntimePath $destination
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
    Copy-Item -LiteralPath ($PackageRoot+'\code\'+$file.Name.Replace('/','\')) -Destination $destination
  }
  [void](Assert-RuntimeInstallation $ExpectedSeal)
  Write-RuntimeJson ($script:RuntimeRoot+'\state\disabled.json') @{schemaVersion='runaai-runtime-disabled/v1';installationSha256=$ExpectedSeal;reason='prepared-not-activated'}
  for($index=0;$index-lt2;$index++){
    $role=if($index-eq0){'Supervisor'}else{'Worker'};$sid=if($index-eq0){'S-1-5-18'}else{'S-1-5-19'}
    $arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script:RuntimeRoot+'\code\home-runtime\Run-HomeRuntime'+$role+'.ps1" -ExpectedSeal '+$ExpectedSeal
    $action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument $arguments
    $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType ServiceAccount -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Hidden -StartWhenAvailable
    # Disabled in the registration itself, not just a later disable call: preparation cannot race
    # a missed startup trigger into activation.
    $settings.Enabled=$false
    if($index-eq0){$settings.RestartCount=3;$settings.RestartInterval='PT1M'
      $triggers=@((New-ScheduledTaskTrigger -AtStartup),(New-ScheduledTaskTrigger -AtLogOn -User 'RUNA-HOME\Matthew'))
      [void](Register-ScheduledTask -TaskPath '\' -TaskName $taskNames[$index] -Action $action -Principal $principal -Settings $settings -Trigger $triggers)
    }else{[void](Register-ScheduledTask -TaskPath '\' -TaskName $taskNames[$index] -Action $action -Principal $principal -Settings $settings)}
    $registered+=$taskNames[$index];[void](Disable-ScheduledTask -TaskPath '\' -TaskName $taskNames[$index])
    $service=New-Object -ComObject 'Schedule.Service';$service.Connect()
    $service.GetFolder('\').GetTask($taskNames[$index]).SetSecurityDescriptor('O:BAG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)',0)
    Assert-RuntimeTask (Get-ScheduledTask -TaskPath '\' -TaskName $taskNames[$index]) $role $ExpectedSeal
  }
  $passed=$true
}finally{
  if(-not$passed){foreach($name in $registered){Unregister-ScheduledTask -TaskPath '\' -TaskName $name -Confirm:$false}}
}
@{schemaVersion='runaai-runtime-install-preparation/v1';passed=$passed;installationSha256=$ExpectedSeal;
  tasksDisabled=$true;filesRetained=$true;modelsLoaded=$false;settingsChanged=$false;networkActivated=$false;productionRoutingChanged=$false}|ConvertTo-Json -Compress
