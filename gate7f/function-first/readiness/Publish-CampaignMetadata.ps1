# Operator-only metadata writer. The caller verifies the exact owned stage and lease.
function Publish-CampaignMetadata {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Target,[Parameter(Mandatory)][string]$Raw)
  $ErrorActionPreference='Stop'
  $targetFull=[IO.Path]::GetFullPath($Target)
  if([IO.Path]::GetFileName($targetFull)-cne'home-live.json'){throw 'mirror-publication-target-invalid'}
  $parent=[IO.Path]::GetDirectoryName($targetFull)
  $temporary=Join-Path $parent 'home-live.json.new'
  if(-not(Test-Path -LiteralPath $parent -PathType Container)-or((Get-Item -LiteralPath $parent).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'mirror-publication-parent-invalid'}
  foreach($item in @($targetFull,$temporary)){if((Test-Path -LiteralPath $item)-and((Get-Item -LiteralPath $item).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'mirror-publication-reparse'}}
  if(Test-Path -LiteralPath $temporary){throw 'mirror-staged-write-exists'}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes($Raw)
  if($bytes.Length-eq0-or$bytes.Length-gt1048576){throw 'mirror-publication-size-invalid'}
  $expectedPrevious=$null
  if(Test-Path -LiteralPath $targetFull){$expectedPrevious=(Get-FileHash -LiteralPath $targetFull -Algorithm SHA256).Hash}
  $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  $expectedNew=(Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash
  if($null-eq$expectedPrevious){[IO.File]::Move($temporary,$targetFull);return [ordered]@{published=$true;sharingRetries=0;created=$true}}
  if(-not('RunaCampaignMetadataRename' -as[type])){
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class RunaCampaignMetadataRename { [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool MoveFileExW(string existing, string replacement, uint flags); }'
  }
  $clock=[Diagnostics.Stopwatch]::StartNew();$retries=0
  do{
    if(-not[IO.File]::Exists($temporary)-or-not[IO.File]::Exists($targetFull)){throw 'mirror-publication-state-unknown'}
    if((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash-cne$expectedNew-or(Get-FileHash -LiteralPath $targetFull -Algorithm SHA256).Hash-cne$expectedPrevious){throw 'mirror-publication-drift'}
    # 1=REPLACE_EXISTING, 8=WRITE_THROUGH. No COPY_ALLOWED or delayed operation.
    if([RunaCampaignMetadataRename]::MoveFileExW($temporary,$targetFull,9)){return [ordered]@{published=$true;sharingRetries=$retries;created=$false}}
    $nativeError=[Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if($nativeError-notin@(5,32)){throw ('mirror-publication-native-'+$nativeError)}
    $retries++
    if($clock.ElapsedMilliseconds-ge250){throw 'mirror-publication-sharing-timeout'}
    [Threading.Thread]::Sleep(2)
  }while($clock.ElapsedMilliseconds-lt250)
  throw 'mirror-publication-sharing-timeout'
}
