Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Assert-ProofPath([string]$Path,[string]$Root){
  if($Root-notmatch'^C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-proof-[a-f0-9]{32}$'){throw 'proof-root'}
  $full=[IO.Path]::GetFullPath($Path)
  if($full-cne$Path-or($Path-cne$Root-and-not$Path.StartsWith($Root+'\',[StringComparison]::Ordinal))){throw 'proof-path'}
  # Inspect every ancestor, not only the new subtree. No ancestor ACL is changed.
  for($current=$Path;$current;$current=[IO.Path]::GetDirectoryName($current)){
    if(Test-Path -LiteralPath $current){$item=Get-Item -LiteralPath $current -Force
      if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'proof-reparse'}
    }
  }
}
function Set-ProofDirectoryAcl([string]$Path,[string]$Root,[string]$LocalServiceRights=''){
  Assert-ProofPath $Path $Root
  if(-not(Test-Path -LiteralPath $Path -PathType Container)){throw 'proof-directory'}
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
  foreach($sid in @('S-1-5-18','S-1-5-32-544')){
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  }
  if($LocalServiceRights){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),$LocalServiceRights,'ContainerInherit,ObjectInherit','None','Allow')))}
  Set-Acl -LiteralPath $Path -AclObject $acl
  $actual=Get-Acl -LiteralPath $Path
  if(-not$actual.AreAccessRulesProtected){throw 'proof-acl-inheritance'}
}
function Write-ProofJson([string]$Path,[string]$Root,$Value){
  Assert-ProofPath $Path $Root
  $pending=$Path+'.pending';Assert-ProofPath $pending $Root
  $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($Value|ConvertTo-Json -Depth 20 -Compress))
  $stream=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  # .NET File.Move fails if the destination exists; readers never see a partial JSON document.
  [IO.File]::Move($pending,$Path)
}
function Get-ProofIdentity([int]$ProcessId){
  $process=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if($null-eq$process){return $null}
  [void]$process.Handle
  try{[pscustomobject]@{pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o');executable=$process.Path}}
  finally{$process.Dispose()}
}
function Test-ProofStopped($Identity){
  $current=Get-ProofIdentity ([int]$Identity.pid)
  return ($null-eq$current-or$current.startedAt-cne$Identity.startedAt-or$current.executable-cne$Identity.executable)
}
function Stop-ProofProcess($Identity){
  $process=Get-Process -Id ([int]$Identity.pid) -ErrorAction SilentlyContinue
  if($null-eq$process){return}
  try{
    # Hold the native handle before checking start time and terminating this exact process.
    [void]$process.Handle
    if($process.StartTime.ToUniversalTime().ToString('o')-cne$Identity.startedAt-or$process.Path-cne$Identity.executable){throw 'proof-process-reused'}
    $process.Kill();if(-not$process.WaitForExit(5000)){throw 'proof-process-stop-timeout'}
  }finally{$process.Dispose()}
}
