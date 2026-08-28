# Private operator filesystem primitive. Importing defines functions only. The production caller
# binds Target to the exact vendor settings path and Directory to its new protected transaction.
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
function Assert-SettingsPlain([string]$Path,[bool]$Directory=$false){
  if([IO.Path]::GetFullPath($Path)-cne$Path-or$Path.StartsWith('\\')-or$Path.Substring(2).Contains(':')){throw 'settings-path'}
  for($current=$Path;$current;$current=[IO.Path]::GetDirectoryName($current)){
    if(Test-Path -LiteralPath $current){if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'settings-path-link'}}
  }
  if($Directory-and-not(Test-Path -LiteralPath $Path -PathType Container)){throw 'settings-directory'}
}
function Read-SettingsBytes([string]$Path){
  Assert-SettingsPlain $Path;$stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try{$info=New-Object RunaRuntimeFile+Info
    if(-not[RunaRuntimeFile]::GetFileInformationByHandle($stream.SafeFileHandle,[ref]$info)-or$info.links-ne1-or$stream.Length-gt65536){throw 'settings-file-bounds'}
    $bytes=New-Object byte[] $stream.Length;$count=0
    while($count-lt$bytes.Length){$n=$stream.Read($bytes,$count,$bytes.Length-$count);if($n-le0){throw 'settings-short-read'};$count+=$n};return ,$bytes
  }finally{$stream.Dispose()}
}
function Settings-Hash([byte[]]$Bytes){$hash=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}}
function Write-SettingsNew([string]$Path,[byte[]]$Bytes){
  Assert-SettingsPlain $Path;if($Bytes.Length-gt65536){throw 'settings-output-cap'}
  $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Write-SettingsRecord([string]$Path,$Value){Write-SettingsNew $Path ([Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 10 -Compress)+"`n"))}
function Read-SettingsRecord([string]$Path){[Text.UTF8Encoding]::new($false,$true).GetString((Read-SettingsBytes $Path))|ConvertFrom-Json}
function Settings-Acl([string]$Path){(Get-Acl -LiteralPath $Path).Sddl}
function Set-SettingsAcl([string]$Path,[string]$Sddl){
  $acl=New-Object Security.AccessControl.FileSecurity;$acl.SetSecurityDescriptorSddlForm($Sddl)
  Set-Acl -LiteralPath $Path -AclObject $acl;if((Settings-Acl $Path)-cne$Sddl){throw 'settings-acl-unconfirmed'}
}
function New-SettingsFileIntent([string]$Target,[string]$Directory,[string]$ExpectedOriginalSha256,[byte[]]$Candidate){
  Assert-SettingsPlain $Target;Assert-SettingsPlain $Directory $true
  if($ExpectedOriginalSha256-notmatch'^[a-f0-9]{64}$'-or$Candidate.Length-gt4096){throw 'settings-intent'}
  $original=Read-SettingsBytes $Target
  if((Settings-Hash $original)-cne$ExpectedOriginalSha256){throw 'settings-baseline-drift'}
  $acl=Settings-Acl $Target
  Write-SettingsNew ($Directory+'\observed-original.bin') $original
  Write-SettingsNew ($Directory+'\candidate.bin') $Candidate
  $intent=@{schemaVersion='runaai-settings-file-intent/v1';target=$Target;directory=$Directory;originalSha256=$ExpectedOriginalSha256;
    candidateSha256=(Settings-Hash $Candidate);aclSddl=$acl;createdAt=[DateTime]::UtcNow.ToString('o')}
  Write-SettingsRecord ($Directory+'\intent.json') $intent
  return $intent
}
function Read-SettingsIntent([string]$Directory){
  Assert-SettingsPlain $Directory $true;$intent=Read-SettingsRecord ($Directory+'\intent.json')
  if($intent.schemaVersion-cne'runaai-settings-file-intent/v1'-or$intent.directory-cne$Directory-or
    $intent.originalSha256-notmatch'^[a-f0-9]{64}$'-or$intent.candidateSha256-notmatch'^[a-f0-9]{64}$'){throw 'settings-intent-drift'}
  Assert-SettingsPlain $intent.target
  if((Settings-Hash (Read-SettingsBytes ($Directory+'\observed-original.bin')))-cne$intent.originalSha256){throw 'settings-original-drift'}
  return $intent
}
function Assert-SettingsNoRetainedConflict([string]$Directory,$Intent){
  # A crash may happen after ReplaceFile but before its failure receipt. Every prior rollback
  # preimage must still be inspected before an already-restored target can be declared clean.
  $files=@(Get-ChildItem -LiteralPath $Directory -Filter 'displaced-*.bin' -File)
  if($files.Count-gt32){throw 'settings-recovery-attempt-cap'}
  foreach($file in $files){
    if($file.Name-notmatch'^displaced-[a-f0-9]{32}\.bin$'-or
      (Settings-Hash (Read-SettingsBytes $file.FullName))-cne$Intent.candidateSha256-or(Settings-Acl $file.FullName)-cne$Intent.aclSddl){throw 'settings-conflict-retained'}
  }
}
function Restore-SettingsActualPreimage([string]$Directory,[string]$ExpectedCurrentSha256,[scriptblock]$BeforeReplace=$null){
  $intent=Read-SettingsIntent $Directory;$backup=$Directory+'\actual-preimage.bin';$target=$intent.target
  Assert-SettingsNoRetainedConflict $Directory $intent
  $prior=Read-SettingsBytes $backup;$priorAcl=Settings-Acl $backup
  if((Settings-Hash (Read-SettingsBytes $target))-cne$ExpectedCurrentSha256-or(Settings-Acl $target)-cne$priorAcl){throw 'settings-rollback-unrelated-drift'}
  $id=[Guid]::NewGuid().ToString('N');$pending=$Directory+'\restore-'+$id+'.bin';$displaced=$Directory+'\displaced-'+$id+'.bin'
  Write-SettingsNew $pending $prior;Set-SettingsAcl $pending $priorAcl
  # Replace captures the exact bytes actually displaced, including a writer racing our last check.
  if($null-ne$BeforeReplace){& $BeforeReplace}
  [IO.File]::Replace($pending,$target,$displaced,$false)
  $displacedBytes=Read-SettingsBytes $displaced
  if((Settings-Hash $displacedBytes)-cne$ExpectedCurrentSha256-or(Settings-Acl $displaced)-cne$priorAcl){
    # ReplaceFile is not general compare-and-swap. Another replacement to compensate could
    # displace a still newer writer. Retain the actual displaced bytes/ACL and close admission.
    # Only a separately authorized fresh reconciliation under proven quiescence may choose them.
    throw 'settings-rollback-conflict-retained'
  }
  # File.Replace preserves the target ACL. Never repair it after the replacement: an unrelated
  # ACL writer could have acted meanwhile. A mismatch is retained and requires reconciliation.
  if((Settings-Hash (Read-SettingsBytes $target))-cne(Settings-Hash $prior)-or(Settings-Acl $target)-cne$priorAcl){throw 'settings-rollback-unconfirmed'}
  Write-SettingsRecord ($Directory+'\rollback-'+$id+'.json') @{schemaVersion='runaai-settings-file-rollback/v1';restoredSha256=(Settings-Hash $prior);aclPreserved=$true;actualPreimageRetained=$true}
  return @{restoredSha256=(Settings-Hash $prior);aclPreserved=$true;actualPreimageRetained=$true}
}
function Invoke-SettingsFileSwap([string]$Directory,[scriptblock]$BeforeReplace=$null,[scriptblock]$AfterReplace=$null){
  $intent=Read-SettingsIntent $Directory;$target=$intent.target;$pending=$Directory+'\candidate.bin'
  if((Settings-Hash (Read-SettingsBytes $pending))-cne$intent.candidateSha256){throw 'settings-candidate-drift'}
  if((Settings-Hash (Read-SettingsBytes $target))-cne$intent.originalSha256-or(Settings-Acl $target)-cne$intent.aclSddl){throw 'settings-preapply-unrelated-drift'}
  $backup=$Directory+'\actual-preimage.bin';if(Test-Path -LiteralPath $backup){throw 'settings-existing-swap'}
  Set-SettingsAcl $pending $intent.aclSddl
  # Test-only injected race seam. Production entrypoints never accept a script block/input command.
  if($null-ne$BeforeReplace){& $BeforeReplace}
  [IO.File]::Replace($pending,$target,$backup,$false)
  if($null-ne$AfterReplace){& $AfterReplace}
  $actual=Settings-Hash (Read-SettingsBytes $backup)
  if($actual-cne$intent.originalSha256-or(Settings-Acl $backup)-cne$intent.aclSddl){
    throw 'settings-apply-conflict-retained'
  }
  if((Settings-Hash (Read-SettingsBytes $target))-cne$intent.candidateSha256-or(Settings-Acl $target)-cne$intent.aclSddl){throw 'settings-applied-unconfirmed'}
  $receipt=@{schemaVersion='runaai-settings-file-applied/v1';originalSha256=$actual;candidateSha256=$intent.candidateSha256;aclPreserved=$true;inMemoryEnforcementProved=$false}
  Write-SettingsRecord ($Directory+'\applied.json') $receipt;return $receipt
}
function Repair-InterruptedSettingsSwap([string]$Directory){
  $intent=Read-SettingsIntent $Directory
  Assert-SettingsNoRetainedConflict $Directory $intent
  if(-not(Test-Path -LiteralPath ($Directory+'\actual-preimage.bin'))){
    if((Settings-Hash (Read-SettingsBytes $intent.target))-cne$intent.originalSha256){throw 'settings-unstarted-unrelated-drift'}
    return @{changed=$false;alreadyOriginal=$true}
  }
  # The actual atomic preimage is retained, but a foreign preimage is not our rollback authority.
  $backup=$Directory+'\actual-preimage.bin'
  if((Settings-Hash (Read-SettingsBytes $backup))-cne$intent.originalSha256-or(Settings-Acl $backup)-cne$intent.aclSddl){throw 'settings-unowned-preimage-retained'}
  # Never invent completion/retry after a crash: restore only from our unchanged candidate.
  if((Settings-Hash (Read-SettingsBytes $intent.target))-ceq(Settings-Hash (Read-SettingsBytes $backup))-and
    (Settings-Acl $intent.target)-ceq(Settings-Acl $backup)){
    return @{changed=$false;alreadyRestored=$true;actualPreimageRetained=$true}
  }
  return Restore-SettingsActualPreimage $Directory $intent.candidateSha256
}
