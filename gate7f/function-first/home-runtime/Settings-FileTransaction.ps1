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
function Settings-AclDescriptorFromSddl([string]$Sddl){
  $raw=[Security.AccessControl.RawSecurityDescriptor]::new($Sddl)
  if($null-eq$raw.Owner-or$null-eq$raw.Group-or$null-eq$raw.DiscretionaryAcl){throw 'settings-acl-policy-invalid'}
  $dacl=New-Object byte[] $raw.DiscretionaryAcl.BinaryLength;$raw.DiscretionaryAcl.GetBinaryForm($dacl,0)
  if($null-eq$raw.SystemAcl){$saclMaterial='null'}else{
    $sacl=New-Object byte[] $raw.SystemAcl.BinaryLength;$raw.SystemAcl.GetBinaryForm($sacl,0)
    $saclMaterial='present:'+[Convert]::ToBase64String($sacl)
  }
  $flags=[int]$raw.ControlFlags
  $common=@($raw.Owner.Value,$raw.Group.Value,[Convert]::ToBase64String($dacl),$saclMaterial)
  $exact=[string]::Join('|',@([string]$flags)+$common)
  $replacement=[string]::Join('|',@([string]($flags-band(-bnot 1024)))+$common)
  [pscustomobject]@{ExactSha256=(Settings-Hash ([Text.UTF8Encoding]::new($false).GetBytes($exact)));
    ReplacementSha256=(Settings-Hash ([Text.UTF8Encoding]::new($false).GetBytes($replacement)));ControlFlags=$flags}
}
function Settings-AclDescriptor([string]$Path){
  try{$acl=Get-Acl -LiteralPath $Path -Audit -ErrorAction Stop}catch{throw 'settings-acl-audit-unavailable'}
  Settings-AclDescriptorFromSddl $acl.Sddl
}
function Settings-AclPolicyFromSddl([string]$Sddl){(Settings-AclDescriptorFromSddl $Sddl).ExactSha256}
function Settings-AclPolicy([string]$Path){(Settings-AclDescriptor $Path).ExactSha256}
function Test-SettingsAclDescriptorAfterReplace($Actual,[string]$ExpectedExactSha256,[string]$ExpectedReplacementSha256,[int]$ExpectedControlFlags){
  if($Actual.ExactSha256-ceq$ExpectedExactSha256){return $true}
  return $Actual.ReplacementSha256-ceq$ExpectedReplacementSha256-and
    $Actual.ControlFlags-eq($ExpectedControlFlags-bor 1024)-and($ExpectedControlFlags-band 1024)-eq0
}
function Test-SettingsAclAfterReplace([string]$Path,[string]$ExpectedExactSha256,[string]$ExpectedReplacementSha256,[int]$ExpectedControlFlags){
  Test-SettingsAclDescriptorAfterReplace (Settings-AclDescriptor $Path) $ExpectedExactSha256 $ExpectedReplacementSha256 $ExpectedControlFlags
}
function Write-SettingsNew([string]$Path,[byte[]]$Bytes){
  Assert-SettingsPlain $Path;if($Bytes.Length-gt65536){throw 'settings-output-cap'}
  $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Write-SettingsRecord([string]$Path,$Value){Write-SettingsNew $Path ([Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 10 -Compress)+"`n"))}
function Read-SettingsRecord([string]$Path){[Text.UTF8Encoding]::new($false,$true).GetString((Read-SettingsBytes $Path))|ConvertFrom-Json}
function New-SettingsFileIntent([string]$Target,[string]$Directory,[string]$ExpectedOriginalSha256,[byte[]]$Candidate){
  Assert-SettingsPlain $Target;Assert-SettingsPlain $Directory $true
  if($ExpectedOriginalSha256-notmatch'^[a-f0-9]{64}$'-or$Candidate.Length-gt4096){throw 'settings-intent'}
  $original=Read-SettingsBytes $Target
  if((Settings-Hash $original)-cne$ExpectedOriginalSha256){throw 'settings-baseline-drift'}
  $acl=Settings-AclDescriptor $Target
  Write-SettingsNew ($Directory+'\observed-original.bin') $original
  Write-SettingsNew ($Directory+'\candidate.bin') $Candidate
  $intent=@{schemaVersion='runaai-settings-file-intent/v3';target=$Target;directory=$Directory;originalSha256=$ExpectedOriginalSha256;
    candidateSha256=(Settings-Hash $Candidate);aclExactSha256=$acl.ExactSha256;aclReplacementSha256=$acl.ReplacementSha256;
    aclControlFlags=$acl.ControlFlags;createdAt=[DateTime]::UtcNow.ToString('o')}
  Write-SettingsRecord ($Directory+'\intent.json') $intent
  return $intent
}
function Read-SettingsIntent([string]$Directory){
  Assert-SettingsPlain $Directory $true
  $rawIntent=[Text.UTF8Encoding]::new($false,$true).GetString((Read-SettingsBytes ($Directory+'\intent.json')))
  $rawKeys=@([regex]::Matches($rawIntent,'"([A-Za-z][A-Za-z0-9]*)"\s*:')|ForEach-Object{$_.Groups[1].Value});[Array]::Sort($rawKeys)
  if(($rawKeys-join',')-cne'aclControlFlags,aclExactSha256,aclReplacementSha256,candidateSha256,createdAt,directory,originalSha256,schemaVersion,target'){throw 'settings-intent-drift'}
  try{$intent=$rawIntent|ConvertFrom-Json}catch{throw 'settings-intent-drift'}
  $keys=@($intent.PSObject.Properties.Name);[Array]::Sort($keys)
  if(($keys-join',')-cne'aclControlFlags,aclExactSha256,aclReplacementSha256,candidateSha256,createdAt,directory,originalSha256,schemaVersion,target'-or
    $intent.schemaVersion-cne'runaai-settings-file-intent/v3'-or$intent.directory-cne$Directory-or
    $intent.originalSha256-notmatch'^[a-f0-9]{64}$'-or$intent.candidateSha256-notmatch'^[a-f0-9]{64}$'-or
    $intent.aclExactSha256-notmatch'^[a-f0-9]{64}$'-or$intent.aclReplacementSha256-notmatch'^[a-f0-9]{64}$'-or
    $intent.aclControlFlags-isnot[int]-or$intent.aclControlFlags-lt0-or$intent.aclControlFlags-gt65535){throw 'settings-intent-drift'}
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
      (Settings-Hash (Read-SettingsBytes $file.FullName))-cne$Intent.candidateSha256-or
      -not(Test-SettingsAclAfterReplace $file.FullName $Intent.aclExactSha256 $Intent.aclReplacementSha256 $Intent.aclControlFlags)){throw 'settings-conflict-retained'}
  }
}
function Restore-SettingsActualPreimage([string]$Directory,[string]$ExpectedCurrentSha256,[scriptblock]$BeforeReplace=$null){
  $intent=Read-SettingsIntent $Directory;$backup=$Directory+'\actual-preimage.bin';$target=$intent.target
  Assert-SettingsNoRetainedConflict $Directory $intent
  $prior=Read-SettingsBytes $backup;$priorAcl=Settings-AclDescriptor $backup
  # Direct explicit restoration has the same ownership boundary as interrupted-swap recovery.
  # A retained foreign atomic preimage is evidence, not authority to write those foreign bytes.
  if((Settings-Hash $prior)-cne$intent.originalSha256-or$priorAcl.ExactSha256-cne$intent.aclExactSha256){throw 'settings-unowned-preimage-retained'}
  if((Settings-Hash (Read-SettingsBytes $target))-cne$ExpectedCurrentSha256-or
    -not(Test-SettingsAclAfterReplace $target $intent.aclExactSha256 $intent.aclReplacementSha256 $intent.aclControlFlags)){throw 'settings-rollback-unrelated-drift'}
  $currentAcl=Settings-AclDescriptor $target
  $id=[Guid]::NewGuid().ToString('N');$pending=$Directory+'\restore-'+$id+'.bin';$displaced=$Directory+'\displaced-'+$id+'.bin'
  # ReplaceFile preserves the target permission policy. Rebuilding it on the
  # staging file is neither needed nor a policy-preservation proof. Verify the
  # target and displaced owner/group/control/DACL/SACL fingerprint instead.
  Write-SettingsNew $pending $prior
  # Replace captures the exact bytes actually displaced, including a writer racing our last check.
  if($null-ne$BeforeReplace){& $BeforeReplace}
  [IO.File]::Replace($pending,$target,$displaced,$false)
  $displacedBytes=Read-SettingsBytes $displaced
  if((Settings-Hash $displacedBytes)-cne$ExpectedCurrentSha256-or(Settings-AclPolicy $displaced)-cne$currentAcl.ExactSha256){
    # ReplaceFile is not general compare-and-swap. Another replacement to compensate could
    # displace a still newer writer. Retain the actual displaced bytes/ACL and close admission.
    # Only a separately authorized fresh reconciliation under proven quiescence may choose them.
    throw 'settings-rollback-conflict-retained'
  }
  # File.Replace preserves the target ACL. Never repair it after the replacement: an unrelated
  # ACL writer could have acted meanwhile. A mismatch is retained and requires reconciliation.
  if((Settings-Hash (Read-SettingsBytes $target))-cne(Settings-Hash $prior)-or
    -not(Test-SettingsAclAfterReplace $target $currentAcl.ExactSha256 $currentAcl.ReplacementSha256 $currentAcl.ControlFlags)){throw 'settings-rollback-unconfirmed'}
  Write-SettingsRecord ($Directory+'\rollback-'+$id+'.json') @{schemaVersion='runaai-settings-file-rollback/v3';restoredSha256=(Settings-Hash $prior);aclPolicyPreserved=$true;actualPreimageRetained=$true}
  return @{restoredSha256=(Settings-Hash $prior);aclPolicyPreserved=$true;actualPreimageRetained=$true}
}
function Invoke-SettingsFileSwap([string]$Directory,[scriptblock]$BeforeReplace=$null,[scriptblock]$AfterReplace=$null){
  $intent=Read-SettingsIntent $Directory;$target=$intent.target;$pending=$Directory+'\candidate.bin'
  if((Settings-Hash (Read-SettingsBytes $pending))-cne$intent.candidateSha256){throw 'settings-candidate-drift'}
  if((Settings-Hash (Read-SettingsBytes $target))-cne$intent.originalSha256-or(Settings-AclPolicy $target)-cne$intent.aclExactSha256){throw 'settings-preapply-unrelated-drift'}
  $backup=$Directory+'\actual-preimage.bin';if(Test-Path -LiteralPath $backup){throw 'settings-existing-swap'}
  # Test-only injected race seam. Production entrypoints never accept a script block/input command.
  if($null-ne$BeforeReplace){& $BeforeReplace}
  [IO.File]::Replace($pending,$target,$backup,$false)
  if($null-ne$AfterReplace){& $AfterReplace}
  $actual=Settings-Hash (Read-SettingsBytes $backup)
  if($actual-cne$intent.originalSha256-or(Settings-AclPolicy $backup)-cne$intent.aclExactSha256){
    throw 'settings-apply-conflict-retained'
  }
  if((Settings-Hash (Read-SettingsBytes $target))-cne$intent.candidateSha256-or
    -not(Test-SettingsAclAfterReplace $target $intent.aclExactSha256 $intent.aclReplacementSha256 $intent.aclControlFlags)){throw 'settings-applied-unconfirmed'}
  $receipt=@{schemaVersion='runaai-settings-file-applied/v3';originalSha256=$actual;candidateSha256=$intent.candidateSha256;aclPolicyPreserved=$true;inMemoryEnforcementProved=$false}
  Write-SettingsRecord ($Directory+'\applied.json') $receipt;return $receipt
}
function Repair-InterruptedSettingsSwap([string]$Directory){
  $intent=Read-SettingsIntent $Directory
  Assert-SettingsNoRetainedConflict $Directory $intent
  if(-not(Test-Path -LiteralPath ($Directory+'\actual-preimage.bin'))){
    if((Settings-Hash (Read-SettingsBytes $intent.target))-cne$intent.originalSha256-or
      (Settings-AclPolicy $intent.target)-cne$intent.aclExactSha256){throw 'settings-unstarted-unrelated-drift'}
    return @{changed=$false;alreadyOriginal=$true}
  }
  # The actual atomic preimage is retained, but a foreign preimage is not our rollback authority.
  $backup=$Directory+'\actual-preimage.bin'
  if((Settings-Hash (Read-SettingsBytes $backup))-cne$intent.originalSha256-or(Settings-AclPolicy $backup)-cne$intent.aclExactSha256){throw 'settings-unowned-preimage-retained'}
  # Never invent completion/retry after a crash: restore only from our unchanged candidate.
  if((Settings-Hash (Read-SettingsBytes $intent.target))-ceq(Settings-Hash (Read-SettingsBytes $backup))-and
    (Test-SettingsAclAfterReplace $intent.target $intent.aclExactSha256 $intent.aclReplacementSha256 $intent.aclControlFlags)){
    return @{changed=$false;alreadyRestored=$true;actualPreimageRetained=$true}
  }
  return Restore-SettingsActualPreimage $Directory $intent.candidateSha256
}
