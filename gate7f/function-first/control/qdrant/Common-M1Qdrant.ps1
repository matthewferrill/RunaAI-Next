Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:M1QdrantRoot='C:\AI\RunaAI-Next-Candidate\m1-qdrant'
$script:M1QdrantTaskPath='\RunaAI-Next\'
$script:M1QdrantTaskName='M1-Qdrant'
$script:M1QdrantBinarySha='369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4'
$script:M1QdrantShell='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
function Assert-M1Qdrant([bool]$Condition,[string]$Code){if(-not$Condition){throw "m1-qdrant-$Code"}}
function Assert-M1QdrantHost([switch]$Administrator){
  Assert-M1Qdrant ($env:COMPUTERNAME-eq'RUNA-CONTROL') 'host'
  if($Administrator){$p=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent());Assert-M1Qdrant ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'admin-required'}
}
function Initialize-M1QdrantNative {
  if('RunaM1Qdrant.Native'-as[type]){return}
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;
namespace RunaM1Qdrant {
 public static class Native {
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint attr; public System.Runtime.InteropServices.ComTypes.FILETIME a,b,c; public uint serial,hi,lo,links,indexhi,indexlo; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
  public static uint Links(string path){using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){Info i;if(!GetFileInformationByHandle(f.SafeFileHandle,out i))throw new IOException("m1-qdrant-file-info");return i.links;}}
 }
 public sealed class Ring {
  readonly object sync=new object(); readonly StringBuilder value=new StringBuilder(); readonly Task pump;
  public Ring(StreamReader input){pump=Task.Run(async()=>{var b=new char[4096];int n;while((n=await input.ReadAsync(b,0,b.Length))>0){lock(sync){value.Append(b,0,n);if(value.Length>32768)value.Remove(0,value.Length-32768);}}});}
  public string Snapshot(){lock(sync){return value.ToString();}}
 }
}
'@
}
function Assert-M1QdrantPath([string]$Path,[switch]$File){
  $full=[IO.Path]::GetFullPath($Path)
  Assert-M1Qdrant ($full-eq$Path-and$full-match'^[A-Za-z]:\\'-and$full.Substring(2)-notmatch'[:<>|?*]'-and$full-notmatch'[. ](\\|$)') 'path'
  $current=$full
  while($current){
    if(Test-Path -LiteralPath $current){$item=Get-Item -LiteralPath $current -Force;Assert-M1Qdrant (($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-eq0) 'reparse'}
    $parent=[IO.Path]::GetDirectoryName($current);if($parent-eq$current){break};$current=$parent
  }
  if($File){Assert-M1Qdrant (Test-Path -LiteralPath $full -PathType Leaf) 'file-missing';Initialize-M1QdrantNative;Assert-M1Qdrant ([RunaM1Qdrant.Native]::Links($full)-eq1) 'hardlink'}
}
function Assert-M1QdrantTree([string]$Path){
  Assert-M1QdrantPath $Path
  foreach($item in Get-ChildItem -LiteralPath $Path -Force){
    Assert-M1Qdrant (($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-eq0) 'reparse'
    if($item.PSIsContainer){Assert-M1QdrantTree $item.FullName}else{Assert-M1QdrantPath $item.FullName -File}
  }
}
function Get-M1QdrantHash([string]$Path){
  Assert-M1QdrantPath $Path -File
  $hash=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($Path)
  try{([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
}
function Get-M1QdrantManifest([string]$Directory,[string]$ExpectedPackageSha256){
  Assert-M1Qdrant ($ExpectedPackageSha256-match'^[a-f0-9]{64}$') 'package-sha'
  Assert-M1QdrantPath $Directory
  $manifestPath=Join-Path $Directory 'package.json'
  Assert-M1Qdrant ((Get-M1QdrantHash $manifestPath)-eq$ExpectedPackageSha256) 'package-drift'
  $m=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
  $keys='binaryBytes,binarySha256,files,grpcPort,host,httpPort,root,schemaVersion,serviceSid,taskName,taskPath,version'
  Assert-M1Qdrant ((($m.PSObject.Properties.Name|Sort-Object)-join',')-eq$keys) 'manifest-fields'
  Assert-M1Qdrant ($m.schemaVersion-eq'runaai-m1-qdrant-package/v1'-and$m.root-ceq$script:M1QdrantRoot-and$m.taskPath-ceq$script:M1QdrantTaskPath-and$m.taskName-ceq$script:M1QdrantTaskName-and$m.serviceSid-eq'S-1-5-19'-and$m.host-eq'127.0.0.1'-and$m.httpPort-eq9774-and$m.grpcPort-eq9775-and$m.version-eq'1.19.0'-and$m.binaryBytes-eq84184576-and$m.binarySha256-eq$script:M1QdrantBinarySha) 'manifest-contract'
  $names=@('Common-M1Qdrant.ps1','Install-ControlM1Qdrant.ps1','Rollback-ControlM1Qdrant.ps1','Run-M1Qdrant.ps1','Start-ControlM1Qdrant.ps1','qdrant.exe','qdrant.yaml')|Sort-Object
  Assert-M1Qdrant ((@($m.files.name|Sort-Object)-join',')-ceq($names-join',')) 'manifest-files'
  Assert-M1Qdrant ((@(Get-ChildItem -LiteralPath $Directory -Force|Select-Object -ExpandProperty Name|Sort-Object)-join',')-ceq((@($names)+@('package.json')|Sort-Object)-join',')) 'package-extra-files'
  foreach($file in $m.files){
    Assert-M1Qdrant ((($file.PSObject.Properties.Name|Sort-Object)-join',')-eq'bytes,name,sha256'-and$file.sha256-match'^[a-f0-9]{64}$'-and$file.bytes-gt0) 'manifest-file-shape'
    $p=Join-Path $Directory $file.name
    Assert-M1Qdrant ((Get-M1QdrantHash $p)-eq$file.sha256-and(Get-Item -LiteralPath $p).Length-eq$file.bytes) 'file-drift'
  }
  $binary=@($m.files|Where-Object{$_.name-eq'qdrant.exe'})[0]
  Assert-M1Qdrant ($binary.sha256-eq$script:M1QdrantBinarySha-and$binary.bytes-eq84184576) 'binary-drift'
  Assert-M1Qdrant ([IO.File]::ReadAllText((Join-Path $Directory 'qdrant.yaml'))-ceq(Get-M1QdrantConfiguration)) 'configuration-drift'
  return $m
}
function Get-M1QdrantConfiguration {
  $state=$script:M1QdrantRoot.Replace('\','/')+'/state'
  return (@"
log_level: ERROR
telemetry_disabled: true
service:
  host: 127.0.0.1
  http_port: 9774
  grpc_port: 9775
  max_request_size_mb: 8
  max_workers: 2
  enable_cors: false
  enable_tls: false
  enable_snapshot_url_recovery: false
cluster:
  enabled: false
storage:
  storage_path: "$state/storage"
  snapshots_path: "$state/snapshots"
  temp_path: "$state/tmp"
  snapshots_config:
    snapshots_storage: local
  performance:
    max_search_threads: 2
    optimizer_cpu_budget: 2
"@).Replace("`r`n","`n")+"`n"
}
function Get-M1QdrantSecurity([ValidateSet('Read','State')][string]$Mode){
  $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
  $admin=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544');$acl.SetOwner($admin);$acl.SetGroup($admin)
  foreach($sid in @('S-1-5-32-544','S-1-5-18','S-1-5-19')){
    $rights=if($sid-ne'S-1-5-19'){'FullControl'}elseif($Mode-eq'State'){'Modify'}else{'ReadAndExecute'}
    $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),$rights,'ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  };return $acl
}
function Assert-M1QdrantSecurity([string]$Path,[string]$Mode){
  $actual=Get-Acl -LiteralPath $Path;$expected=Get-M1QdrantSecurity $Mode
  Assert-M1Qdrant ($actual.AreAccessRulesProtected-and$actual.GetOwner([Security.Principal.SecurityIdentifier]).Value-eq'S-1-5-32-544') 'acl-owner'
  $a=@($actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$e=@($expected.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  Assert-M1Qdrant ($a.Count-eq3) 'acl-rules'
  foreach($rule in $e){$match=@($a|Where-Object{$_.IdentityReference.Value-eq$rule.IdentityReference.Value-and$_.AccessControlType-eq$rule.AccessControlType-and$_.FileSystemRights-eq$rule.FileSystemRights-and$_.InheritanceFlags-eq$rule.InheritanceFlags-and$_.PropagationFlags-eq$rule.PropagationFlags-and-not$_.IsInherited});Assert-M1Qdrant ($match.Count-eq1) 'acl-rule'}
}
function Get-M1QdrantArguments([string]$Sha){'-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script:M1QdrantRoot+'\code\Run-M1Qdrant.ps1" -ExpectedPackageSha256 '+$Sha}
function Assert-M1QdrantTask($Task,[string]$Sha){
  Assert-M1Qdrant ($null-ne$Task-and$Task.TaskPath-ceq$script:M1QdrantTaskPath-and$Task.TaskName-ceq$script:M1QdrantTaskName) 'task-identity'
  $sid=if($Task.Principal.UserId-match'^S-1-'){$Task.Principal.UserId}else{([Security.Principal.NTAccount]::new($Task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
  Assert-M1Qdrant ($sid-eq'S-1-5-19'-and[string]$Task.Principal.RunLevel-in@('Limited','0')-and[string]$Task.Principal.LogonType-in@('ServiceAccount','5')) 'task-principal'
  $actions=@($Task.Actions);$triggers=@($Task.Triggers)
  Assert-M1Qdrant ($actions.Count-eq1-and$actions[0].Execute-ieq$script:M1QdrantShell-and$actions[0].Arguments-ceq(Get-M1QdrantArguments $Sha)-and$actions[0].WorkingDirectory-ceq($script:M1QdrantRoot+'\code')) 'task-action'
  Assert-M1Qdrant ($triggers.Count-eq1-and$triggers[0].CimClass.CimClassName-eq'MSFT_TaskBootTrigger') 'task-trigger'
  Assert-M1Qdrant ($Task.Settings.RestartCount-eq5-and$Task.Settings.RestartInterval-eq'PT1M'-and$Task.Settings.ExecutionTimeLimit-eq'PT0S'-and[string]$Task.Settings.MultipleInstances-in@('IgnoreNew','2')-and$Task.Settings.StartWhenAvailable-and-not$Task.Settings.DisallowStartIfOnBatteries-and-not$Task.Settings.StopIfGoingOnBatteries-and$Task.Settings.Hidden) 'task-settings'
  Assert-M1Qdrant ($Task.Description-ceq('RunaAI M1 derived index; package '+$Sha)) 'task-package'
}
function Assert-M1QdrantPortsFree {
  $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object{$_.LocalPort-in@(9774,9775)})
  Assert-M1Qdrant ($listeners.Count-eq0) 'ports-occupied'
}
function Assert-M1QdrantChild($Proof,$Live){
  $exe=$script:M1QdrantRoot+'\code\qdrant.exe';$arguments='"'+$exe+'" --config-path "'+$script:M1QdrantRoot+'\code\qdrant.yaml"'
  Assert-M1Qdrant ($null-ne$Proof-and$null-ne$Live-and$Proof.pid-eq$Live.ProcessId-and$Live.ExecutablePath-ieq$exe-and$Live.CommandLine-ceq$arguments-and$Live.CreationDate.ToUniversalTime().ToString('o')-ceq$Proof.startedAt-and$Proof.executable-ceq$exe) 'child-ownership'
}
function Assert-M1QdrantListeners([int]$PidValue){
  $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object{$_.OwningProcess-eq$PidValue-or$_.LocalPort-in@(9774,9775)})
  Assert-M1Qdrant ($listeners.Count-eq2) 'listener-count'
  foreach($port in @(9774,9775)){Assert-M1Qdrant (@($listeners|Where-Object{$_.OwningProcess-eq$PidValue-and$_.LocalAddress-eq'127.0.0.1'-and$_.LocalPort-eq$port}).Count-eq1) 'listener-binding'}
}
function Write-M1QdrantJson([string]$Path,$Value,[switch]$New){
  Assert-M1QdrantPath $Path
  if(Test-Path -LiteralPath $Path){Assert-M1QdrantPath $Path -File;Assert-M1Qdrant (-not$New) 'receipt-exists'}
  $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 12 -Compress)+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  # Windows PowerShell5 coerces ordinary $null to an empty string for this .NET string argument.
  if(Test-Path -LiteralPath $Path){[IO.File]::Replace($temporary,$Path,[System.Management.Automation.Language.NullString]::Value)}else{[IO.File]::Move($temporary,$Path)}
}
function Get-M1QdrantInstallation([string]$Sha){
  $root=$script:M1QdrantRoot;Assert-M1QdrantPath $root
  foreach($entry in @(@($root,'Read'),@((Join-Path $root 'code'),'Read'),@((Join-Path $root 'state'),'State'))){Assert-M1QdrantSecurity $entry[0] $entry[1]}
  $m=Get-M1QdrantManifest (Join-Path $root 'code') $Sha
  $receipt=Join-Path $root 'installation.json';Assert-M1QdrantPath $receipt -File
  $i=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
  Assert-M1Qdrant ($i.schemaVersion-eq'runaai-m1-qdrant-installation/v1'-and$i.packageSha256-eq$Sha-and$i.root-ceq$root-and$i.taskName-ceq$script:M1QdrantTaskName) 'installation-drift'
  return $m
}
