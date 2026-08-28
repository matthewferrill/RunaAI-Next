param([string]$LeaseId,[string]$ExpectedSeal,[ValidateSet('completed','abort')][string]$Reason='completed',[switch]$LibraryOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
function Publish-ClosedCompletion([string]$Directory,[byte[]]$Bytes){
  if([IO.Path]::GetFullPath($Directory)-cne$Directory-or$Bytes.Length-lt1-or$Bytes.Length-gt1024){throw 'completion-publication-input'}
  for($current=$Directory;$current;$current=[IO.Path]::GetDirectoryName($current)){
    $item=Get-Item -LiteralPath $current -Force
    if($item.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'completion-directory-link'}
  }
  $target=Join-Path $Directory 'complete.json';$pending=Join-Path $Directory ('complete.pending-'+[Guid]::NewGuid().ToString('N')+'.json')
  if(Test-Path -LiteralPath $target){throw 'completion-already-published'}
  $stream=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  # File.Move in Windows PowerShell5/.NET Framework does not overwrite. The writer is closed
  # before the destination becomes visible to the unmodified sealed lease's reader.
  [IO.File]::Move($pending,$target)
  $hash=[Security.Cryptography.SHA256]::Create()
  try{return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
}
if($LibraryOnly){return}
if($env:COMPUTERNAME-cne'RUNA-HOME'-or$LeaseId-notmatch'^20260828-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$'-or$ExpectedSeal-notmatch'^[a-f0-9]{64}$'){throw 'completion-host-binding'}
$root='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\'+$LeaseId
if((Get-FileHash -LiteralPath ($root+'\seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedSeal){throw 'completion-seal-drift'}
$seal=Get-Content -LiteralPath ($root+'\seal.json') -Raw|ConvertFrom-Json
if($seal.leaseId-cne$LeaseId-or$seal.schemaVersion-cne'runa-m1-campaign-lease-seal/v1'){throw 'completion-seal-binding'}
$task=Get-ScheduledTask -TaskPath '\' -TaskName ('Runa-M1-'+$LeaseId)
$actions=@($task.Actions)
$expected='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$root+'\Run-HomeSmokeLease.ps1"'
if($task.State-ne'Running'-or$actions.Count-ne1-or$actions[0].Execute-cne'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'-or$actions[0].Arguments-cne$expected){throw 'completion-task-drift'}
$sid=([Security.Principal.NTAccount]'RUNA-HOME\codex-audit').Translate([Security.Principal.SecurityIdentifier]).Value
$principal=[string]$task.Principal.UserId
if($principal-notmatch'^S-1-'){$principal=([Security.Principal.NTAccount]$principal).Translate([Security.Principal.SecurityIdentifier]).Value}
if($principal-cne$sid-or[string]$task.Principal.LogonType-cne'S4U'-or[string]$task.Principal.RunLevel-cne'Highest'){throw 'completion-task-owner'}
$marker=@{schemaVersion='runa-m1-campaign-completion/v1';leaseId=$LeaseId;sealSha256=$ExpectedSeal;reason=$Reason}
$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($marker|ConvertTo-Json -Compress))
$digest=Publish-ClosedCompletion $root $bytes
@{schemaVersion='runaai-atomic-completion-publication/v1';leaseId=$LeaseId;sealSha256=$ExpectedSeal;markerSha256=$digest;reason=$Reason;
  published=$true;time=[DateTime]::UtcNow.ToString('o');lifecycleCalled=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
