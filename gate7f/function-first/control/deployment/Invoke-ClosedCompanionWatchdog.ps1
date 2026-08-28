[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RequestFile,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRequestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedHelperSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$env:PSModulePath='C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules'
$env:NODE_OPTIONS=$null;$env:NODE_PATH=$null
$locks=[Collections.Generic.List[IDisposable]]::new();$writer=$null;$terminalWritten=$false;$stage='initialization'
function Digest([byte[]]$bytes){$h=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($h.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function PlainPath([string]$path){
  $item=Get-Item -LiteralPath $path -Force
  for($cursor=$item;$null-ne$cursor;$cursor=$(if($cursor-is[IO.DirectoryInfo]){$cursor.Parent}else{$cursor.Directory})){
    if($cursor.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'm1-supervisor-linked-path'}
  }
  $item
}
function OwnerPrivate([string]$path){
  $item=PlainPath $path;if(-not$item.PSIsContainer){throw 'm1-supervisor-directory'}
  $acl=Get-Acl -LiteralPath $path
  $allowed=@('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
  if($acl.Owner-and$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value-notin$allowed){throw 'm1-supervisor-owner'}
  foreach($rule in $acl.Access){if($rule.AccessControlType-eq'Allow'-and$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-notin$allowed){throw 'm1-supervisor-acl'}}
}
function Pinned([string]$path,[string]$expected,[int]$maximum,[bool]$systemExecutable=$false){
  $item=PlainPath $path
  if($item.PSIsContainer-or$item.Length-lt1-or$item.Length-gt$maximum){throw 'm1-supervisor-file-bounds'}
  if($systemExecutable-and$path-ceq'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'){
    $stream=[RunaAI.Next.M1.ClosedCompanionJob]::LockSystemPowerShell($path)
  }else{$stream=[RunaAI.Next.M1.ClosedCompanionJob]::LockPlainFile($path)}
  $locks.Add($stream)
  $bytes=New-Object byte[] $stream.Length;$offset=0
  while($offset-lt$bytes.Length){$n=$stream.Read($bytes,$offset,$bytes.Length-$offset);if($n-le0){throw 'm1-supervisor-short-read'};$offset+=$n}
  if((Digest $bytes)-cne$expected){throw 'm1-supervisor-file-drift'}
  ,$bytes
}
function Retain([string]$name,[object]$record){
  OwnerPrivate $directory
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($record|ConvertTo-Json -Depth 12 -Compress))
  if($bytes.Length-gt524288){throw 'm1-supervisor-record-cap'}
  $stream=[IO.File]::Open((Join-Path $directory $name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  Digest $bytes
}
try {
  $full=[IO.Path]::GetFullPath($RequestFile)
  if($full-cne$RequestFile-or[IO.Path]::GetFileName($full)-cne'request.json'){throw 'm1-supervisor-request-path'}
  $directory=[IO.Path]::GetDirectoryName($full);OwnerPrivate $directory
  # The helper is authenticated before compilation, then kept read-locked. No
  # companion exists until the atomic job creation call later in this script.
  $helper=Join-Path $PSScriptRoot 'ClosedCompanionJob.cs';$info=PlainPath $helper
  if($info.PSIsContainer-or$info.Length-gt65536){throw 'm1-supervisor-helper-bounds'}
  $helperLock=[IO.File]::Open($helper,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$locks.Add($helperLock)
  $helperBytes=New-Object byte[] $helperLock.Length
  if($helperLock.Read($helperBytes,0,$helperBytes.Length)-ne$helperBytes.Length-or(Digest $helperBytes)-cne$ExpectedHelperSha256){throw 'm1-supervisor-helper-drift'}
  $stage='helper';Add-Type -TypeDefinition ([Text.UTF8Encoding]::new($false,$true).GetString($helperBytes))
  $null=Pinned $helper $ExpectedHelperSha256 65536
  $stage='request';$raw=Pinned $full $ExpectedRequestSha256 65536
  $request=[Text.UTF8Encoding]::new($false,$true).GetString($raw)|ConvertFrom-Json
  $keys=@($request.PSObject.Properties.Name|Sort-Object)-join','
  if($keys-cne'arguments,argumentsSha256,createdAt,deadline,descriptorSha256,executable,executableSha256,maximumBytes,maximumMs,operationId,packageSha256,pins,schemaVersion,supervisorExecutable,supervisorExecutableSha256,transitionId'-or
    $request.schemaVersion-cne'runaai-m1-watchdog-request/v1'-or$request.operationId-notmatch'^[a-f0-9]{32}$'-or$request.transitionId-notmatch'^[a-f0-9]{32}$'-or
    $request.maximumMs-lt1-or$request.maximumMs-gt600000-or$request.maximumBytes-lt1-or$request.maximumBytes-gt262144-or
    [IO.Path]::GetFullPath($request.executable)-cne$request.executable-or@($request.arguments).Count-gt100-or
    @($request.pins).Count-lt1-or@($request.pins).Count-gt12){throw 'm1-supervisor-request-binding'}
  foreach($pin in @($request.descriptorSha256,$request.packageSha256,$request.executableSha256,$request.supervisorExecutableSha256,$request.argumentsSha256)){
    if($pin-notmatch'^[a-f0-9]{64}$'){throw 'm1-supervisor-request-pin'}
  }
  $created=[DateTimeOffset]::Parse($request.createdAt);$deadline=[DateTimeOffset]::Parse($request.deadline)
  if($deadline.ToUnixTimeMilliseconds()-$created.ToUnixTimeMilliseconds()-ne$request.maximumMs-or
    $created-gt[DateTimeOffset]::UtcNow-or$deadline-le[DateTimeOffset]::UtcNow){throw 'm1-supervisor-request-expired'}
  foreach($arg in @($request.arguments)){if($arg-isnot[string]-or$arg.Contains([char]0)){throw 'm1-supervisor-argument'}}
  $argumentRaw=(@($request.arguments|ForEach-Object{([Text.Encoding]::UTF8.GetByteCount($_)).ToString()+':'+$_})-join'')
  if((Digest ([Text.Encoding]::UTF8.GetBytes($argumentRaw)))-cne$request.argumentsSha256){throw 'm1-supervisor-argv-drift'}
  # Existing files never grant a second launch. Exclusive handle also denies
  # parallel launchers and remains held until after the durable terminal write.
  $stage='writer';if((@(Get-ChildItem -LiteralPath $directory -Force|Select-Object -ExpandProperty Name|Sort-Object)-join',')-cne'host.json,request.json'){throw 'm1-supervisor-existing-operation'}
  $writer=[IO.File]::Open((Join-Path $directory 'writer.lock'),[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $writer.WriteByte(1);$writer.Flush($true)
  $stage='pins';$null=Pinned $request.executable $request.executableSha256 104857600 $true
  $seen=@{}
  foreach($pin in $request.pins){
    if((@($pin.PSObject.Properties.Name|Sort-Object)-join',')-cne'path,sha256'-or$pin.sha256-notmatch'^[a-f0-9]{64}$'-or
      [IO.Path]::GetFullPath($pin.path)-cne$pin.path-or$seen.ContainsKey($pin.path)){throw 'm1-supervisor-package-pin'}
    $seen[$pin.path]=$true;$null=Pinned $pin.path $pin.sha256 1048576
  }
  $null=Pinned $request.supervisorExecutable $request.supervisorExecutableSha256 104857600
  $hostPath=Join-Path $directory 'host.json'
  $hostRaw=[IO.File]::ReadAllBytes($hostPath);$hostSha=Digest $hostRaw
  $null=Pinned $hostPath $hostSha 65536
  $hostRecord=[Text.UTF8Encoding]::new($false,$true).GetString($hostRaw)|ConvertFrom-Json
  if($hostRecord.schemaVersion-cne'runaai-m1-watchdog-host/v1'-or$hostRecord.operationId-cne$request.operationId-or
    $hostRecord.requestSha256-cne$ExpectedRequestSha256-or$hostRecord.executableSha256-cne$request.supervisorExecutableSha256-or
    $hostRecord.helperSha256-cne$ExpectedHelperSha256){throw 'm1-supervisor-host-binding'}
  $hostProcess=[Diagnostics.Process]::GetProcessById($hostRecord.processId)
  if($hostProcess.HasExited-or$hostProcess.MainModule.FileName-cne$request.supervisorExecutable){throw 'm1-supervisor-host-identity'}
  $intent=[ordered]@{schemaVersion='runaai-m1-watchdog-intent/v1';operationId=$request.operationId;transitionId=$request.transitionId;
    requestSha256=$ExpectedRequestSha256;descriptorSha256=$request.descriptorSha256;packageSha256=$request.packageSha256;
    executableSha256=$request.executableSha256;argumentsSha256=$request.argumentsSha256;deadline=$request.deadline;
    recordedAt=[DateTime]::UtcNow.ToString('o');privateValuesIncluded=$false}
  $stage='intent';$intentSha=Retain 'intent.json' $intent
  $me=[Diagnostics.Process]::GetCurrentProcess()
  $supervisorSha=Retain 'supervisor.json' ([ordered]@{schemaVersion='runaai-m1-watchdog-supervisor/v1';operationId=$request.operationId;
    intentSha256=$intentSha;hostSha256=$hostSha;hostProcessId=$hostRecord.processId;hostProcessStartedAt=$hostProcess.StartTime.ToUniversalTime().ToString('o');
    processId=$PID;processStartedAt=$me.StartTime.ToUniversalTime().ToString('o');recordedAt=[DateTime]::UtcNow.ToString('o')})
  $script:startedSha=$null
  $observer=[Action[object]]{param($observed)
    $script:startedSha=Retain 'started.json' ([ordered]@{schemaVersion='runaai-m1-watchdog-started/v1';operationId=$request.operationId;
      intentSha256=$intentSha;supervisorSha256=$supervisorSha;processId=$observed.ProcessId;processStartedAt=$observed.ProcessStartedAt;
      createdSuspended=$observed.CreatedSuspended;atomicJobAssigned=$observed.AtomicJobAssigned;recordedAt=[DateTime]::UtcNow.ToString('o')})
  }
  $stage='run';$result=[RunaAI.Next.M1.ClosedCompanionJob]::Run($request.executable,[string[]]$request.arguments,$directory,$deadline.ToUnixTimeMilliseconds(),$request.maximumBytes,$observer)
  $confirmed=$result.Resumed-and$result.StopConfirmed-and$result.OutputComplete-and-not$result.TimedOut-and-not$result.OutputLimited
  $terminal=[ordered]@{schemaVersion='runaai-m1-watchdog-terminal/v1';operationId=$request.operationId;intentSha256=$intentSha;
    supervisorSha256=$supervisorSha;startedSha256=$script:startedSha;outcome=$(if($confirmed){'terminal'}else{'unknown'});
    result=$result;recordedAt=[DateTime]::UtcNow.ToString('o');admissionOpened=$false;automaticReplayPermitted=$false;automaticRollbackPermitted=$false}
  $stage='terminal';$null=Retain 'terminal.json' $terminal;$terminalWritten=$true
  @{schemaVersion='runaai-m1-watchdog-notice/v1';terminalRetained=$true;outcome=$terminal.outcome;privateValuesIncluded=$false}|ConvertTo-Json -Compress
  if(-not$confirmed){exit 2}
} catch {
  # Never echo exception text, paths, argv, stderr or a guessed stopped state.
  $code='m1-supervisor-unconfirmed'
  if($_.Exception.Message-match'^m1-supervisor-[a-z-]+$'){$code=$_.Exception.Message}
  try{$null=Retain 'failure.json' ([ordered]@{schemaVersion='runaai-m1-watchdog-failure/v1';requestSha256=$ExpectedRequestSha256;
    stage=$stage;errorCode=$code;recordedAt=[DateTime]::UtcNow.ToString('o');outcome='unknown';privateValuesIncluded=$false})}catch{}
  @{schemaVersion='runaai-m1-watchdog-notice/v1';terminalRetained=$terminalWritten;outcome='unknown';stage=$stage;errorCode=$code;privateValuesIncluded=$false}|ConvertTo-Json -Compress
  exit 2
} finally {
  if($null-ne$writer){$writer.Dispose()}
  foreach($item in $locks){$item.Dispose()}
}
