[CmdletBinding()]
param([Parameter(Mandatory)][string]$PackageDirectory,[Parameter(Mandatory)][string]$ExpectedPackageSha256)
. (Join-Path $PSScriptRoot 'Common-M1Qdrant.ps1')
Assert-M1QdrantHost -Administrator
$package=[IO.Path]::GetFullPath($PackageDirectory)
$manifest=Get-M1QdrantManifest $package $ExpectedPackageSha256
$root=$script:M1QdrantRoot;$parent=[IO.Path]::GetDirectoryName($root)
Assert-M1QdrantPath $parent
Assert-M1Qdrant (Test-Path -LiteralPath $parent -PathType Container) 'candidate-parent-missing'
$existing=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName -ErrorAction SilentlyContinue
$retained=$false
if(Test-Path -LiteralPath $root){
  $null=Get-M1QdrantInstallation $ExpectedPackageSha256
  Assert-M1QdrantTree (Join-Path $root 'state')
  if($null-ne$existing){
    Assert-M1QdrantTask $existing $ExpectedPackageSha256
    [ordered]@{schemaVersion='runaai-m1-qdrant-install/v1';alreadyInstalled=$true;changed=$false;servicesStarted=$false}|ConvertTo-Json -Compress
    exit 0
  }
  # Re-register an exactly verified retained rollback installation, without copying/overwriting data.
  $owned=@(Get-CimInstance Win32_Process -Filter "Name='qdrant.exe'"|Where-Object{$_.ExecutablePath-ieq($root+'\code\qdrant.exe')})
  Assert-M1Qdrant ($owned.Count-eq0) 'retained-child-present'
  $retained=$true
}
Assert-M1Qdrant ($null-eq$existing) 'task-exists'
Assert-M1QdrantPortsFree
$code=Join-Path $root 'code';$state=Join-Path $root 'state'
$registered=$false
try{
 if(-not$retained){
  # No -Force, no ancestor ACL changes, no recursive permissions or deletion.
  New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null
  Set-Acl -LiteralPath $root -AclObject (Get-M1QdrantSecurity 'Read')
  New-Item -ItemType Directory -Path $code -ErrorAction Stop|Out-Null
  Set-Acl -LiteralPath $code -AclObject (Get-M1QdrantSecurity 'Read')
  New-Item -ItemType Directory -Path $state -ErrorAction Stop|Out-Null
  Set-Acl -LiteralPath $state -AclObject (Get-M1QdrantSecurity 'State')
  foreach($name in @('storage','snapshots','tmp','logs')){New-Item -ItemType Directory -Path (Join-Path $state $name) -ErrorAction Stop|Out-Null}
  foreach($name in @($manifest.files.name)+@('package.json')){
    $source=Join-Path $package $name;$destination=Join-Path $code $name
    Assert-M1QdrantPath $source -File
    [IO.File]::Copy($source,$destination,$false)
  }
  $null=Get-M1QdrantManifest $code $ExpectedPackageSha256
  Write-M1QdrantJson (Join-Path $root 'installation.json') ([ordered]@{
    schemaVersion='runaai-m1-qdrant-installation/v1';root=$root;packageSha256=$ExpectedPackageSha256;
    taskName=$script:M1QdrantTaskName;createdAt=[DateTime]::UtcNow.ToString('o');activationPerformed=$false
  }) -New
  $null=Get-M1QdrantInstallation $ExpectedPackageSha256
 }
  Assert-M1QdrantPortsFree
  $action=New-ScheduledTaskAction -Execute $script:M1QdrantShell -Argument (Get-M1QdrantArguments $ExpectedPackageSha256) -WorkingDirectory $code
  $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -Disable
  $null=Register-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description ('RunaAI M1 derived index; package '+$ExpectedPackageSha256)
  $registered=$true
  $task=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
  Assert-M1QdrantTask $task $ExpectedPackageSha256
  Assert-M1Qdrant (-not$task.Settings.Enabled) 'installed-task-enabled'
}catch{
  if($registered){
    $task=Get-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName
    Assert-M1QdrantTask $task $ExpectedPackageSha256
    Assert-M1Qdrant ([string]$task.State-ne'Running') 'unexpected-start'
    Unregister-ScheduledTask -TaskPath $script:M1QdrantTaskPath -TaskName $script:M1QdrantTaskName -Confirm:$false
  }
  # Incomplete new files stay in place for explicit inspection; never erase a partial installation.
  throw
}
[ordered]@{schemaVersion='runaai-m1-qdrant-install/v1';installed=$true;taskEnabled=$false;
  recoveredRetainedInstallation=$retained;servicesStarted=$false;root=$root;packageSha256=$ExpectedPackageSha256;productionChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
