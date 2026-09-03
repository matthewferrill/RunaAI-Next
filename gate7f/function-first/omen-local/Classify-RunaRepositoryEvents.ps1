param([Parameter(Mandatory=$true)][string]$Root)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$quiescenceSource=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\acceptance\Wait-R15WatcherQuiescence.ps1'))
if(-not[IO.File]::Exists($quiescenceSource)){throw 'diagnostic-quiescence-helper-missing'}
. $quiescenceSource

function Get-SecurityDigest([string]$Path) {
  $rootFull=[IO.Path]::GetFullPath($Path).TrimEnd('\')
  $items=@(Get-Item -LiteralPath $rootFull -Force)+@(Get-ChildItem -LiteralPath $rootFull -Force -Recurse)
  $lines=New-Object 'System.Collections.Generic.List[string]'
  foreach($item in @($items|Sort-Object FullName)){
    $relative=if($item.FullName-ceq$rootFull){'.'}else{$item.FullName.Substring($rootFull.Length).TrimStart('\').Replace('\','/')}
    $sections=[System.Security.AccessControl.AccessControlSections]::Owner-bor
      [System.Security.AccessControl.AccessControlSections]::Group-bor
      [System.Security.AccessControl.AccessControlSections]::Access
    $security=$item.GetAccessControl($sections)
    $sddl=$security.GetSecurityDescriptorSddlForm($sections)
    $lines.Add(($relative+"`0"+$sddl))
  }
  $bytes=[Text.Encoding]::UTF8.GetBytes(($lines-join"`n"))
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try{$digest=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}
  finally{$sha.Dispose()}
  return [pscustomobject]@{Count=$lines.Count;Sha256=$digest}
}

$full=[IO.Path]::GetFullPath($Root)
$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if(-not[IO.Directory]::Exists($full)-or-not$full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)-or
  -not$full.Contains('runa-m1-omen-git-diagnostic-')){throw 'diagnostic-root-invalid'}
$securityBefore=Get-SecurityDigest $full
$watchers=New-Object 'System.Collections.Generic.List[System.IO.FileSystemWatcher]'
$sourceIds=New-Object 'System.Collections.Generic.List[string]'
$specs=@(
  [pscustomobject]@{Kind='name';Filter=[IO.NotifyFilters]::FileName-bor[IO.NotifyFilters]::DirectoryName;Events=@('Created','Deleted','Renamed','Error')},
  [pscustomobject]@{Kind='content';Filter=[IO.NotifyFilters]::LastWrite-bor[IO.NotifyFilters]::Size;Events=@('Changed','Error')},
  [pscustomobject]@{Kind='metadata';Filter=[IO.NotifyFilters]::Attributes-bor[IO.NotifyFilters]::CreationTime;Events=@('Changed','Error')},
  [pscustomobject]@{Kind='security';Filter=[IO.NotifyFilters]::Security;Events=@('Changed','Error')}
)
try{
  foreach($spec in $specs){
    $watcher=New-Object IO.FileSystemWatcher($full)
    $watcher.IncludeSubdirectories=$true;$watcher.InternalBufferSize=65536;$watcher.NotifyFilter=$spec.Filter
    foreach($eventName in $spec.Events){
      $sourceId='runa-omen-diagnostic-'+$spec.Kind+'-'+$eventName.ToLowerInvariant()
      Register-ObjectEvent -InputObject $watcher -EventName $eventName -SourceIdentifier $sourceId|Out-Null
      $sourceIds.Add($sourceId)
    }
    $watchers.Add($watcher);$watcher.EnableRaisingEvents=$true
  }
  [Console]::Out.WriteLine('{"schemaVersion":"runa-omen-repository-event-witness-ready/v1"}')
  $null=[Console]::In.ReadLine()
  $events=New-Object 'System.Collections.Generic.List[System.Management.Automation.PSEventArgs]'
  Wait-R15WatcherQuiescence -SourceIdentifier @($sourceIds) -Destination $events `
    -QuietMilliseconds 250 -MaximumMilliseconds 5000 -PollMilliseconds 25
  foreach($watcher in $watchers){$watcher.EnableRaisingEvents=$false;$watcher.Dispose()}
  Wait-R15WatcherQuiescence -SourceIdentifier @($sourceIds) -Destination $events `
    -QuietMilliseconds 500 -MaximumMilliseconds 5000 -PollMilliseconds 25
  $counts=[ordered]@{name=0;content=0;metadata=0;security=0;errors=0}
  foreach($event in $events){
    if($event.SourceIdentifier.EndsWith('-error')){$counts.errors++;continue}
    foreach($kind in @('name','content','metadata','security')){
      if($event.SourceIdentifier.Contains('-'+$kind+'-')){$counts[$kind]++;break}
    }
  }
  $securityAfter=Get-SecurityDigest $full
  [Console]::Out.WriteLine(([ordered]@{schemaVersion='runa-omen-repository-event-witness-result/v1';counts=$counts;
    securityEntries=$securityAfter.Count;securityEqual=($securityBefore.Count-eq$securityAfter.Count-and
      $securityBefore.Sha256-ceq$securityAfter.Sha256);privateValuesIncluded=$false}|ConvertTo-Json -Compress -Depth 4))
}finally{
  foreach($watcher in $watchers){try{$watcher.EnableRaisingEvents=$false;$watcher.Dispose()}catch{}}
  foreach($sourceId in $sourceIds){Unregister-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue;Remove-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue}
}
