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
$locks=[Collections.Generic.List[IDisposable]]::new();$writer=$null;$terminalWritten=$false;$stage='initialization';$admissionSecret=$null
$phaseTimer=[Threading.Timer]::new([Threading.TimerCallback]{param($state)[Environment]::Exit(124)},$null,605000,[Threading.Timeout]::Infinite)
function Digest([byte[]]$bytes){$h=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($h.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function PlainPath([string]$path){
  $item=Get-Item -LiteralPath $path -Force
  if([IO.Path]::GetFullPath($item.FullName)-ine[IO.Path]::GetFullPath($path)){throw 'm1-supervisor-path-alias'}
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
function ExactKeys([object]$value,[string[]]$expected){
  if($null-eq$value){return $false};$actual=@($value.PSObject.Properties.Name)
  $actual.Count-eq$expected.Count-and@($actual|Where-Object{$_-cnotin$expected}).Count-eq0-and@($expected|Where-Object{$_-cnotin$actual}).Count-eq0
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
  # Authenticate and hold the request before deciding whether the v2-only
  # host scratch boundary must precede Add-Type. The later C# pin revalidates
  # the same read-locked file and its hard-link count.
  $previewInfo=PlainPath $full
  if($previewInfo.PSIsContainer-or$previewInfo.Length-lt1-or$previewInfo.Length-gt65536){throw 'm1-supervisor-request-bounds'}
  $previewLock=[IO.File]::Open($full,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$locks.Add($previewLock)
  $previewRaw=New-Object byte[] $previewLock.Length;$previewOffset=0
  while($previewOffset-lt$previewRaw.Length){$previewRead=$previewLock.Read($previewRaw,$previewOffset,$previewRaw.Length-$previewOffset);if($previewRead-le0){throw 'm1-supervisor-short-read'};$previewOffset+=$previewRead}
  if((Digest $previewRaw)-cne$ExpectedRequestSha256){throw 'm1-supervisor-file-drift'}
  $previewRequest=[Text.UTF8Encoding]::new($false,$true).GetString($previewRaw)|ConvertFrom-Json
  if($previewRequest.schemaVersion-ceq'runaai-m1-watchdog-request/v2'){throw 'm1-supervisor-legacy-request-read-only'}
  $previewV2=$previewRequest.schemaVersion-ceq'runaai-m1-watchdog-request/v3'
  if($previewV2){
    $hostLocal=Join-Path $directory 'host-localappdata';$hostTemp=Join-Path $directory 'host-temp'
    if($env:ComSpec-cne'C:\Windows\System32\cmd.exe'-or$env:LOCALAPPDATA-cne$hostLocal-or$env:OS-cne'Windows_NT'-or
      $env:PATHEXT-cne'.COM;.EXE;.BAT;.CMD;.CPL'-or$env:PROCESSOR_ARCHITECTURE-cne'AMD64'-or$env:SystemDrive-cne'C:'-or
      $env:SystemRoot-cne'C:\Windows'-or$env:TEMP-cne$hostTemp-or$env:TMP-cne$hostTemp-or$env:WINDIR-cne'C:\Windows'){
      throw 'm1-supervisor-host-environment'
    }
    OwnerPrivate $hostLocal;OwnerPrivate $hostTemp
  }
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
  if($request.schemaVersion-ceq'runaai-m1-watchdog-request/v2'){throw 'm1-supervisor-legacy-request-read-only'}
  $v2=$request.schemaVersion-ceq'runaai-m1-watchdog-request/v3';$diagnosticV3=$v2
  if($v2-ne$previewV2){throw 'm1-supervisor-request-drift'}
  $expectedKeys=$(if($v2){'admission,arguments,argumentsSha256,createdAt,deadline,descriptorSha256,entrypoint,environment,executable,executableSha256,manifest,maximumBytes,maximumMs,operationId,packageSha256,pins,schemaVersion,supervisorExecutable,supervisorExecutableSha256,transitionId'.Split(',')}else{'arguments,argumentsSha256,createdAt,deadline,descriptorSha256,executable,executableSha256,maximumBytes,maximumMs,operationId,packageSha256,pins,schemaVersion,supervisorExecutable,supervisorExecutableSha256,transitionId'.Split(',')})
  if(-not(ExactKeys $request $expectedKeys)-or($request.schemaVersion-cne'runaai-m1-watchdog-request/v1'-and-not$v2)-or$request.operationId-notmatch'^[a-f0-9]{32}$'-or$request.transitionId-notmatch'^[a-f0-9]{32}$'-or
    $request.maximumMs-lt1-or$request.maximumMs-gt600000-or$request.maximumBytes-lt1-or$request.maximumBytes-gt262144-or
    [IO.Path]::GetFullPath($request.executable)-cne$request.executable-or@($request.arguments).Count-gt100-or
    @($request.pins).Count-lt1-or@($request.pins).Count-gt12-or($v2-and@($request.pins).Count-ne6)){throw 'm1-supervisor-request-binding'}
  foreach($pin in @($request.descriptorSha256,$request.packageSha256,$request.executableSha256,$request.supervisorExecutableSha256,$request.argumentsSha256)){
    if($pin-notmatch'^[a-f0-9]{64}$'){throw 'm1-supervisor-request-pin'}
  }
  $environmentEntries=$null
  if($v2){
    if(-not(ExactKeys $request.admission @('eligibilitySealSha256','envelopeSha256','phase'))-or
      $request.admission.phase-notin@('eligibility','resource-proof')-or$request.admission.envelopeSha256-notmatch'^[a-f0-9]{64}$'-or
      ($request.admission.phase-ceq'eligibility'-and$null-ne$request.admission.eligibilitySealSha256)-or
      ($request.admission.phase-ceq'resource-proof'-and$request.admission.eligibilitySealSha256-notmatch'^[a-f0-9]{64}$')){throw 'm1-supervisor-admission'}
    if(-not(ExactKeys $request.entrypoint @('path','sha256'))-or
      [IO.Path]::GetFullPath($request.entrypoint.path)-cne$request.entrypoint.path-or$request.entrypoint.sha256-notmatch'^[a-f0-9]{64}$'-or
      [IO.Path]::GetFileName($request.entrypoint.path)-cne'native-gate3-control-node-bootstrap.mjs'-or
      [IO.Path]::GetFileName($request.executable)-ine'node.exe'-or
      ($diagnosticV3-and(@($request.arguments).Count-ne2-or$request.arguments[0]-cne'--no-warnings'-or$request.arguments[1]-cne$request.entrypoint.path))-or
      (-not$diagnosticV3-and(@($request.arguments).Count-ne1-or$request.arguments[0]-cne$request.entrypoint.path))){throw 'm1-supervisor-entrypoint'}
    if(-not(ExactKeys $request.manifest @('path','sha256'))-or
      [IO.Path]::GetFullPath($request.manifest.path)-cne$request.manifest.path-or$request.manifest.sha256-notmatch'^[a-f0-9]{64}$'){throw 'm1-supervisor-manifest'}
    $environmentEntries=[Collections.Generic.List[string]]::new();$names=@($request.environment.PSObject.Properties.Name|Sort-Object)
    $allowed=@('ComSpec','LOCALAPPDATA','OS','PATHEXT','PROCESSOR_ARCHITECTURE','SystemDrive','SystemRoot','TEMP','TMP','WINDIR','RUNAAI_GATE3_RESOURCE_PROOF_METHOD')
    if($names.Count-ne11-or@($names|Where-Object{$_-notin$allowed}).Count-ne0-or@($allowed|Where-Object{$_-notin$names}).Count-ne0){throw 'm1-supervisor-environment'}
    foreach($name in $names){$value=$request.environment.$name;if($value-isnot[string]-or$value.Length-gt4096-or$value.Contains([char]0)){throw 'm1-supervisor-environment'};$environmentEntries.Add($name+'='+$value)}
    $scratch=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($request.environment.LOCALAPPDATA));$temp=[IO.Path]::GetFullPath($request.environment.TEMP)
    if($request.environment.ComSpec-cne'C:\Windows\System32\cmd.exe'-or$request.environment.OS-cne'Windows_NT'-or
      $request.environment.PATHEXT-cne'.COM;.EXE;.BAT;.CMD'-or$request.environment.PROCESSOR_ARCHITECTURE-cne'AMD64'-or
      $request.environment.SystemDrive-cne'C:'-or$request.environment.SystemRoot-cne'C:\Windows'-or$request.environment.WINDIR-cne'C:\Windows'-or
      $request.environment.RUNAAI_GATE3_RESOURCE_PROOF_METHOD-notmatch'^[a-f0-9]{32}$'-or
      [IO.Path]::GetFullPath($request.environment.LOCALAPPDATA)-cne$request.environment.LOCALAPPDATA-or
      [IO.Path]::GetFileName($request.environment.LOCALAPPDATA)-cne'localappdata'-or$temp-cne$request.environment.TEMP-or
      [IO.Path]::GetFullPath($request.environment.TMP)-cne$temp-or[IO.Path]::GetFileName($temp)-cne'temp'-or
      [IO.Path]::GetDirectoryName($temp)-cne$scratch){throw 'm1-supervisor-environment'}
    OwnerPrivate $scratch;OwnerPrivate $request.environment.LOCALAPPDATA;OwnerPrivate $request.environment.TEMP
    $environmentEntries.Add('RUNAAI_GATE3_CONTROL_PHASE='+$request.admission.phase)
    $environmentEntries.Add('RUNAAI_GATE3_CONTROL_LAUNCHER_PID='+$PID)
    $environmentEntries.Add('RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256='+$request.admission.envelopeSha256)
    $environmentEntries.Add('RUNAAI_GATE3_MANIFEST_SHA256='+$request.manifest.sha256)
    $environmentEntries.Add('RUNAAI_GATE3_PACKAGE_SHA256='+$request.packageSha256)
    if($null-ne$request.admission.eligibilitySealSha256){$environmentEntries.Add('RUNAAI_GATE3_EXPECTED_ELIGIBILITY_SEAL_SHA256='+$request.admission.eligibilitySealSha256)}
    $stage='admission';$admissionSecret=New-Object byte[] 32;$admissionInput=[Console]::OpenStandardInput();$offset=0
    while($offset-lt32){$read=$admissionInput.Read($admissionSecret,$offset,32-$offset);if($read-le0){throw 'm1-supervisor-admission-framing'};$offset+=$read}
    if($admissionInput.ReadByte()-ne-1){throw 'm1-supervisor-admission-framing'}
  }
  $created=[DateTimeOffset]::Parse($request.createdAt);$deadline=[DateTimeOffset]::Parse($request.deadline)
  if($deadline.ToUnixTimeMilliseconds()-$created.ToUnixTimeMilliseconds()-ne$request.maximumMs-or
    $created-gt[DateTimeOffset]::UtcNow-or$deadline-le[DateTimeOffset]::UtcNow){throw 'm1-supervisor-request-expired'}
  $remaining=$deadline.ToUnixTimeMilliseconds()-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if($remaining-lt1-or$remaining-gt600000){throw 'm1-supervisor-request-expired'}
  # The child execution deadline is not the supervisor cleanup deadline.
  # Preserve the sealed 5-second window for job termination and fsynced proof.
  $null=$phaseTimer.Change([int]($remaining+5000),[Threading.Timeout]::Infinite)
  foreach($arg in @($request.arguments)){if($arg-isnot[string]-or$arg.Contains([char]0)){throw 'm1-supervisor-argument'}}
  $argumentRaw=(@($request.arguments|ForEach-Object{([Text.Encoding]::UTF8.GetByteCount($_)).ToString()+':'+$_})-join'')
  if((Digest ([Text.Encoding]::UTF8.GetBytes($argumentRaw)))-cne$request.argumentsSha256){throw 'm1-supervisor-argv-drift'}
  # Existing files never grant a second launch. Exclusive handle also denies
  # parallel launchers and remains held until after the durable terminal write.
  $expectedRecordSet=$(if($v2){@('host-localappdata','host-temp','host.json','request.json')}else{@('host.json','request.json')})
  $stage='writer';$actualRecordSet=@(Get-ChildItem -LiteralPath $directory -Force|Select-Object -ExpandProperty Name)
  if($actualRecordSet.Count-ne$expectedRecordSet.Count-or@($actualRecordSet|Where-Object{$_-cnotin$expectedRecordSet}).Count-ne0-or
    @($expectedRecordSet|Where-Object{$_-cnotin$actualRecordSet}).Count-ne0){throw 'm1-supervisor-existing-operation'}
  $writer=[IO.File]::Open((Join-Path $directory 'writer.lock'),[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $writer.WriteByte(1);$writer.Flush($true)
  $stage='pins';$null=Pinned $request.executable $request.executableSha256 104857600 $true
  $seen=@{}
  foreach($pin in $request.pins){
    if(-not(ExactKeys $pin @('path','sha256'))-or$pin.sha256-notmatch'^[a-f0-9]{64}$'-or
      [IO.Path]::GetFullPath($pin.path)-cne$pin.path-or$seen.ContainsKey($pin.path)){throw 'm1-supervisor-package-pin'}
    $seen[$pin.path]=$true;$pinMaximum=$(if($v2-and$pin.path-ceq$request.manifest.path){16777216}elseif($v2-and$pin.path-ceq$request.executable){104857600}else{1048576});$null=Pinned $pin.path $pin.sha256 $pinMaximum
  }
  if($v2){
    $frame=[Text.StringBuilder]::new();$previous=$null
    foreach($pin in @($request.pins)){
      if($null-ne$previous-and[StringComparer]::OrdinalIgnoreCase.Compare($previous,$pin.path)-ge0){throw 'm1-supervisor-package-order'}
      $null=$frame.Append(([Text.Encoding]::UTF8.GetByteCount($pin.path)).ToString()).Append(':').Append($pin.path).Append($pin.sha256);$previous=$pin.path
    }
    if((Digest ([Text.Encoding]::UTF8.GetBytes($frame.ToString())))-cne$request.packageSha256){throw 'm1-supervisor-package-binding'}
    if(-not$seen.ContainsKey($request.manifest.path)-or-not$seen.ContainsKey($request.entrypoint.path)-or-not$seen.ContainsKey($request.executable)-or
      $request.manifest.sha256-cne(@($request.pins|Where-Object{$_.path-ceq$request.manifest.path})[0].sha256)-or
      $request.entrypoint.sha256-cne(@($request.pins|Where-Object{$_.path-ceq$request.entrypoint.path})[0].sha256)){throw 'm1-supervisor-manifest-binding'}
    $null=Pinned $request.entrypoint.path $request.entrypoint.sha256 1048576
    $manifestRaw=Pinned $request.manifest.path $request.manifest.sha256 16777216
    try{$manifestContract=[Text.UTF8Encoding]::new($false,$true).GetString($manifestRaw)|ConvertFrom-Json}catch{throw 'm1-supervisor-manifest-json'}
    if(-not(ExactKeys $manifestContract @('members','privateValuesIncluded','schemaVersion'))-or
      $manifestContract.schemaVersion-cne'runaai-native-gate3-supervisor-package/v1'-or$manifestContract.privateValuesIncluded-ne$false-or
      @($manifestContract.members).Count-ne5){throw 'm1-supervisor-manifest-contract'}
    $hostScript=(PlainPath (Join-Path $PSScriptRoot 'Watchdog-Host.mjs')).FullName
    $wrapperScript=(PlainPath $PSCommandPath).FullName
    $hostPins=@($request.pins|Where-Object{$_.path-ceq$hostScript});$wrapperPins=@($request.pins|Where-Object{$_.path-ceq$wrapperScript});$helperPins=@($request.pins|Where-Object{$_.path-ceq$helper})
    if($hostPins.Count-ne1-or$wrapperPins.Count-ne1-or$helperPins.Count-ne1){throw 'm1-supervisor-manifest-role-pin'}
    $expectedRoles=@{
      'node-runtime'=@($request.executable,$request.executableSha256)
      'control-bootstrap'=@($request.entrypoint.path,$request.entrypoint.sha256)
      'supervisor-host'=@($hostScript,$hostPins[0].sha256)
      'supervisor-wrapper'=@($wrapperScript,$wrapperPins[0].sha256)
      'supervisor-helper'=@($helper,$helperPins[0].sha256)
    }
    $manifestRoles=@{}
    foreach($member in @($manifestContract.members)){
      if(-not(ExactKeys $member @('path','role','sha256'))-or-not$expectedRoles.ContainsKey($member.role)-or$manifestRoles.ContainsKey($member.role)-or
        $member.path-cne$expectedRoles[$member.role][0]-or$member.sha256-cne$expectedRoles[$member.role][1]){throw 'm1-supervisor-manifest-member'}
      $manifestRoles[$member.role]=$true
    }
    if($manifestRoles.Count-ne5){throw 'm1-supervisor-manifest-membership'}
  }
  $null=Pinned $request.supervisorExecutable $request.supervisorExecutableSha256 104857600
  $hostPath=Join-Path $directory 'host.json'
  $hostRaw=[IO.File]::ReadAllBytes($hostPath);$hostSha=Digest $hostRaw
  $null=Pinned $hostPath $hostSha 65536
  $hostRecord=[Text.UTF8Encoding]::new($false,$true).GetString($hostRaw)|ConvertFrom-Json
  $expectedHostSchema=$(if($v2){'runaai-m1-watchdog-host/v2'}else{'runaai-m1-watchdog-host/v1'})
  if($hostRecord.schemaVersion-cne$expectedHostSchema-or$hostRecord.operationId-cne$request.operationId-or
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
  $eligibilityBinding=$(if($v2-and$null-eq$request.admission.eligibilitySealSha256){'-'}elseif($v2){$request.admission.eligibilitySealSha256}else{$null})
  $stage='run';$result=$(if($v2){[RunaAI.Next.M1.ClosedCompanionJob]::RunV2($request.executable,[string[]]$request.arguments,$directory,[string[]]$environmentEntries,$deadline.ToUnixTimeMilliseconds(),$request.maximumBytes,$admissionSecret,$request.admission.phase,$request.admission.envelopeSha256,$eligibilityBinding,$observer)}else{[RunaAI.Next.M1.ClosedCompanionJob]::Run($request.executable,[string[]]$request.arguments,$directory,$deadline.ToUnixTimeMilliseconds(),$request.maximumBytes,$observer)})
  $acknowledgement=$null;$acknowledgementCandidateSha256=$null;$candidateValid=$false;$acknowledged=$false
  if($v2-and$result.OutputComplete-and-not$result.OutputFaulted-and-not$result.OutputLimited-and$result.StdoutBytes-le8192-and$result.Stdout-match'^[^\r\n]{1,8192}\r?\n?$'){
    try{$candidate=$result.Stdout|ConvertFrom-Json
      $candidateValid=(ExactKeys $candidate @('capabilitySha256','childProcessId','consumed','envelopeSha256','eofObserved','eligibilitySealSha256','manifestSha256','nodeVersion','packageSha256','phase','privateValuesIncluded','schemaVersion','supervisorProcessId'))-and
        $candidate.schemaVersion-ceq'runaai-m1-supervisor-child-ack/v1'-and$candidate.phase-ceq$request.admission.phase-and
        $candidate.envelopeSha256-ceq$request.admission.envelopeSha256-and$candidate.eligibilitySealSha256-ceq$request.admission.eligibilitySealSha256-and
        $candidate.supervisorProcessId-eq$PID-and$candidate.childProcessId-eq$result.ProcessId-and$candidate.capabilitySha256-ceq$result.AdmissionSha256-and
        $candidate.manifestSha256-ceq$request.manifest.sha256-and$candidate.packageSha256-ceq$request.packageSha256-and$candidate.nodeVersion-ceq'v22.22.0'-and
        $candidate.consumed-eq$true-and$candidate.eofObserved-eq$true-and$candidate.privateValuesIncluded-eq$false
      if($candidateValid){$acknowledgementCandidateSha256=$result.StdoutSha256}
    }catch{$candidateValid=$false}
  }
  $acknowledged=$candidateValid-and$result.StderrBytes-eq0-and$result.StderrClassification-ceq'none'
  if($acknowledged){$acknowledgement=$candidate}
  $confirmed=$result.Resumed-and$result.StopConfirmed-and$result.ProcessAbsent-and$result.TreeAbsent-and$result.ExitCodeObserved-and$result.OutputComplete-and-not$result.OutputFaulted-and-not$result.TimedOut-and-not$result.OutputLimited-and(!$v2-or($result.AdmissionWritten-and$acknowledged))
  $resultRecord=$(if($diagnosticV3){[ordered]@{ProcessId=$result.ProcessId;ExitCode=$result.ExitCode;StdoutBytes=$result.StdoutBytes;StderrBytes=$result.StderrBytes;ActiveProcesses=$result.ActiveProcesses;
      StdoutSha256=$result.StdoutSha256;StderrSha256=$result.StderrSha256;StderrClassification=$result.StderrClassification;
      AcknowledgementCandidateValid=$candidateValid;AcknowledgementCandidateSha256=$acknowledgementCandidateSha256;
      CreatedSuspended=$result.CreatedSuspended;AtomicJobAssigned=$result.AtomicJobAssigned;AdmissionWritten=$result.AdmissionWritten;AdmissionSha256=$result.AdmissionSha256;AdmissionAcknowledged=$acknowledged;
      Resumed=$result.Resumed;StopConfirmed=$result.StopConfirmed;ProcessAbsent=$result.ProcessAbsent;TreeAbsent=$result.TreeAbsent;ExitCodeObserved=$result.ExitCodeObserved;
      TimedOut=$result.TimedOut;OutputLimited=$result.OutputLimited;OutputComplete=$result.OutputComplete;OutputFaulted=$result.OutputFaulted;
      ProcessStartedAt=$result.ProcessStartedAt;StartedAt=$result.StartedAt;FinishedAt=$result.FinishedAt;Acknowledgement=$acknowledgement}}
    elseif($v2){[ordered]@{ProcessId=$result.ProcessId;ExitCode=$result.ExitCode;StdoutBytes=$result.StdoutBytes;StderrBytes=$result.StderrBytes;ActiveProcesses=$result.ActiveProcesses;
      CreatedSuspended=$result.CreatedSuspended;AtomicJobAssigned=$result.AtomicJobAssigned;AdmissionWritten=$result.AdmissionWritten;AdmissionSha256=$result.AdmissionSha256;AdmissionAcknowledged=$acknowledged;
      Resumed=$result.Resumed;StopConfirmed=$result.StopConfirmed;ProcessAbsent=$result.ProcessAbsent;TreeAbsent=$result.TreeAbsent;ExitCodeObserved=$result.ExitCodeObserved;
      TimedOut=$result.TimedOut;OutputLimited=$result.OutputLimited;OutputComplete=$result.OutputComplete;OutputFaulted=$result.OutputFaulted;
      ProcessStartedAt=$result.ProcessStartedAt;StartedAt=$result.StartedAt;FinishedAt=$result.FinishedAt;Acknowledgement=$acknowledgement}}
    else{[ordered]@{ProcessId=$result.ProcessId;ExitCode=$result.ExitCode;StdoutBytes=$result.StdoutBytes;StderrBytes=$result.StderrBytes;ActiveProcesses=$result.ActiveProcesses;
      CreatedSuspended=$result.CreatedSuspended;AtomicJobAssigned=$result.AtomicJobAssigned;Resumed=$result.Resumed;StopConfirmed=$result.StopConfirmed;TimedOut=$result.TimedOut;
      OutputLimited=$result.OutputLimited;OutputComplete=$result.OutputComplete;ProcessStartedAt=$result.ProcessStartedAt;StartedAt=$result.StartedAt;FinishedAt=$result.FinishedAt;Stdout=$result.Stdout}})
  $terminal=[ordered]@{schemaVersion=$(if($diagnosticV3){'runaai-m1-watchdog-terminal/v3'}elseif($v2){'runaai-m1-watchdog-terminal/v2'}else{'runaai-m1-watchdog-terminal/v1'});operationId=$request.operationId;intentSha256=$intentSha;
    supervisorSha256=$supervisorSha;startedSha256=$script:startedSha;outcome=$(if($confirmed){'terminal'}else{'unknown'});
    result=$resultRecord;recordedAt=[DateTime]::UtcNow.ToString('o');admissionOpened=$false;automaticReplayPermitted=$false;automaticRollbackPermitted=$false}
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
  $phaseTimer.Dispose()
  if($null-ne$admissionSecret){[Array]::Clear($admissionSecret,0,$admissionSecret.Length)}
  if($null-ne$writer){$writer.Dispose()}
  foreach($item in $locks){$item.Dispose()}
}
