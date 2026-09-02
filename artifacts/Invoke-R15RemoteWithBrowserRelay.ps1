[CmdletBinding()]
param()

Set-StrictMode -Version Latest

function Stop-R15ChildProcess {
  param([Diagnostics.Process]$Process)
  if ($null -eq $Process) { return }
  $stopFailure = $null
  $killer = $null
  try {
    if (-not $Process.HasExited) {
      # The relay creates one SSH subprocess per browser connection. Terminate
      # the exact process tree this operator started so an expired checkpoint
      # cannot leave a detached relay or SSH path behind.
      $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
      $killInfo = [Diagnostics.ProcessStartInfo]::new()
      $killInfo.FileName = $taskkill
      $killInfo.Arguments = '/PID ' + $Process.Id + ' /T /F'
      $killInfo.UseShellExecute = $false
      $killInfo.CreateNoWindow = $true
      $killInfo.RedirectStandardOutput = $true
      $killInfo.RedirectStandardError = $true
      $killer = [Diagnostics.Process]::new()
      $killer.StartInfo = $killInfo
      if ($killer.Start()) {
        $killerOutput = $killer.StandardOutput.ReadToEndAsync()
        $killerError = $killer.StandardError.ReadToEndAsync()
        if (-not $killer.WaitForExit(10000) -or $killer.ExitCode -ne 0) {
          $stopFailure = 'r15-child-process-tree-stop-unconfirmed'
          try { if (-not $killer.HasExited) { $killer.Kill();[void]$killer.WaitForExit(1000) } } catch {}
        } else {
          [void]$killerOutput.Wait(1000)
          [void]$killerError.Wait(1000)
        }
      }
      if (-not $Process.WaitForExit(10000)) {
        $Process.Kill()
        if (-not $Process.WaitForExit(10000)) { $stopFailure = 'r15-child-process-stop-unconfirmed' }
      }
    }
  } catch {
    $stopFailure = 'r15-child-process-tree-stop-unconfirmed'
    try {
      if (-not $Process.HasExited) {
        $Process.Kill()
        if (-not $Process.WaitForExit(10000)) { $stopFailure = 'r15-child-process-stop-unconfirmed' }
      }
    } catch {}
  } finally {
    if ($null -ne $killer) { $killer.Dispose() }
  }
  try {
    if (-not $Process.HasExited) { $stopFailure = 'r15-child-process-stop-unconfirmed' }
  } finally {
    $Process.Dispose()
  }
  if ($null -ne $stopFailure) { throw $stopFailure }
}

function Invoke-R15BrowserCleanup {
  param(
    [AllowNull()][object]$RelayState,
    [Parameter(Mandatory)][object]$RemoteProcess,
    [Parameter(Mandatory)][bool]$RemoteStarted,
    [scriptblock]$StopProcess={param($OwnedProcess) Stop-R15ChildProcess $OwnedProcess}
  )
  $failures=New-Object 'System.Collections.Generic.List[string]'
  if($null-ne$RelayState){
    try{& $StopProcess $RelayState.Process}catch{$failures.Add(('relay: '+$_.Exception.Message))|Out-Null}
  }
  if($RemoteStarted){
    try{& $StopProcess $RemoteProcess}catch{$failures.Add(('remote: '+$_.Exception.Message))|Out-Null}
  }else{$RemoteProcess.Dispose()}
  @($failures)
}

function Start-R15BrowserRelay {
  param(
    [Parameter(Mandatory)][ValidateRange(1024,65535)][int]$RemotePort,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId
  )
  $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop|Select-Object -First 1).Source
  $relay=Join-Path $PSScriptRoot 'm1-browser-loopback-command-relay.cjs'
  if(-not(Test-Path -LiteralPath $relay -PathType Leaf)-or
     ((Get-Item -LiteralPath $relay -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){
    throw 'r15-browser-relay-source-invalid'
  }
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=$node
  $info.Arguments='"'+$relay+'" '+$RemotePort+' m1-task-native-'+$StageId+' loopback'
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::new();$process.StartInfo=$info
  try{
    if(-not$process.Start()){throw 'r15-browser-relay-start-failed'}
    $errorRead=$process.StandardError.ReadToEndAsync()
    $readyRead=$process.StandardOutput.ReadLineAsync()
    if(-not$readyRead.Wait(10000)){throw 'r15-browser-relay-ready-timeout'}
    $line=$readyRead.Result
    try{$ready=$line|ConvertFrom-Json}catch{throw 'r15-browser-relay-ready-invalid'}
    if($ready.schemaVersion-cne'runaai-m1-loopback-command-relay/v2'-or$ready.active-cne$true-or
       $ready.listenHost-cne'127.0.0.1'-or$ready.listenPort-ne$RemotePort-or$ready.remotePort-ne$RemotePort-or
       $ready.productionChanged-cne$false){throw 'r15-browser-relay-ready-invalid'}
    [pscustomobject]@{Process=$process;ErrorRead=$errorRead;Port=$RemotePort}
  }catch{
    $startFailure=$_.Exception.Message
    try{Stop-R15ChildProcess $process}catch{throw ('r15-browser-relay-start-cleanup-failed: '+$startFailure+'; '+$_.Exception.Message)}
    throw $startFailure
  }
}

function ConvertTo-R15CheckpointExpiry {
  param([Parameter(Mandatory)][object]$Value)
  $parsed=[DateTimeOffset]::MinValue
  if($Value-is[DateTime]){
    $date=[DateTime]$Value
    if($date.Kind-ne[DateTimeKind]::Utc){throw 'r15-browser-checkpoint-expiry-invalid'}
    $parsed=[DateTimeOffset]$date
  }elseif($Value-is[DateTimeOffset]){
    $parsed=[DateTimeOffset]$Value
  }elseif($Value-is[string]){
    if($Value-notmatch'Z$'-or-not[DateTimeOffset]::TryParse($Value,[Globalization.CultureInfo]::InvariantCulture,
       [Globalization.DateTimeStyles]::RoundtripKind,[ref]$parsed)){throw 'r15-browser-checkpoint-expiry-invalid'}
  }else{throw 'r15-browser-checkpoint-expiry-invalid'}
  if($parsed.Offset-ne[TimeSpan]::Zero){throw 'r15-browser-checkpoint-expiry-invalid'}
  $parsed.ToUniversalTime()
}

function Get-R15ObjectSha256 {
  param([Parameter(Mandatory)][object]$Value)
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 8 -Compress))
  $sha=[Security.Cryptography.SHA256]::Create()
  try{([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}

function Read-R15RemoteCheckpointBootstrap {
  param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')][string]$CheckpointId,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$RequestSha256,
    [Parameter(Mandatory)][string]$RequestPath
  )
  $quotedPath=$RequestPath.Replace("'","''")
  $root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
  $quotedRoot=$root.Replace("'","''")
  $remote=@"
Set-StrictMode -Version Latest
`$ErrorActionPreference='Stop'
`$path='$quotedPath'
`$root='$quotedRoot'
`$item=Get-Item -LiteralPath `$path -Force
if(`$item.PSIsContainer-or`$item.Length-gt262144){throw 'r15-browser-bootstrap-request-file-invalid'}
`$cursor=`$item
while(`$true){
  if((`$cursor.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-browser-bootstrap-request-reparse'}
  if(`$cursor.FullName-ceq`$root){break}
  `$parent=Split-Path -Parent `$cursor.FullName
  if([string]::IsNullOrEmpty(`$parent)){throw 'r15-browser-bootstrap-request-ancestor'}
  `$cursor=Get-Item -LiteralPath `$parent -Force
}
`$bytes=[IO.File]::ReadAllBytes(`$path)
`$sha=[Security.Cryptography.SHA256]::Create()
try{`$actualHash=([BitConverter]::ToString(`$sha.ComputeHash(`$bytes))).Replace('-','').ToLowerInvariant()}finally{`$sha.Dispose()}
`$utf8=[Text.UTF8Encoding]::new(`$false,`$true)
`$request=`$utf8.GetString(`$bytes)|ConvertFrom-Json
[ordered]@{schemaVersion=[string]`$request.schemaVersion;checkpointId=[string]`$request.checkpointId;
  stage=[string]`$request.stage;baseUrl=[string]`$request.baseUrl;expiresAt=`$request.expiresAt;
  requestSha256=`$actualHash;preparationOnly=`$request.preparationOnly;reusePreparedBrowser=`$request.reusePreparedBrowser;
  preparationCheckpointId=`$request.preparationCheckpointId;scope=`$request.scope;cancellationAt=`$request.cancellationAt;
  bootstrap=`$request.bootstrap}|ConvertTo-Json -Depth 8 -Compress
"@
  $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName='ssh.exe'
  $info.Arguments='-F "C:\Users\matth\.ssh\config" -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand '+$encoded
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::new();$process.StartInfo=$info
  try{
    if(-not$process.Start()){throw 'r15-browser-bootstrap-read-start-failed'}
    $outputRead=$process.StandardOutput.ReadToEndAsync();$errorRead=$process.StandardError.ReadToEndAsync()
    if(-not$process.WaitForExit(15000)){
      try{Stop-R15ChildProcess $process;$process=$null}catch{throw 'r15-browser-bootstrap-read-stop-unconfirmed'}
      throw 'r15-browser-bootstrap-read-timeout'
    }
    [void]$errorRead.Result
    if($process.ExitCode-ne0){throw 'r15-browser-bootstrap-read-failed'}
    $line=@($outputRead.Result-split"`r?`n"|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
    try{$line|ConvertFrom-Json}catch{throw 'r15-browser-bootstrap-read-invalid'}
  }finally{if($null-ne$process){$process.Dispose()}}
}

function Set-R15BrowserBootstrapHandoff {
  param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
    [Parameter(Mandatory)][object]$Checkpoint,
    [AllowNull()][scriptblock]$ReadRequest=$null,
    [scriptblock]$WriteClipboard={param($Value) Set-Clipboard -Value $Value},
    [scriptblock]$ClearClipboard={Clear-Clipboard},
    [hashtable]$PreparedScopes=@{}
  )
  $checkpointId=[string]$Checkpoint.checkpointId;$requestSha256=[string]$Checkpoint.requestSha256
  if($checkpointId-notmatch'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'-or$requestSha256-notmatch'^[a-f0-9]{64}$'){
    throw 'r15-browser-bootstrap-binding-invalid'
  }
  $root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
  if(([string]$Checkpoint.requestPath)-match'[\r\n\0]'){throw 'r15-browser-bootstrap-request-path-invalid'}
  try{$requestPath=[IO.Path]::GetFullPath([string]$Checkpoint.requestPath)}catch{throw 'r15-browser-bootstrap-request-path-invalid'}
  $evidenceRoot=Join-Path $root 'acceptance-evidence'
  $relative=$requestPath.Substring([Math]::Min($requestPath.Length,($evidenceRoot+'\').Length))
  $direct='browser-'+$checkpointId+'\request.json'
  $campaignPattern='^campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}\\browser-'+[regex]::Escape($checkpointId)+'\\request\.json$'
  if(-not$requestPath.StartsWith($evidenceRoot+'\',[StringComparison]::Ordinal)-or
     ($relative-cne$direct-and$relative-cnotmatch$campaignPattern)){
    throw 'r15-browser-bootstrap-request-path-invalid'
  }
  $request=if($null-ne$ReadRequest){& $ReadRequest $requestPath}else{Read-R15RemoteCheckpointBootstrap -StageId $StageId -CheckpointId $checkpointId -RequestSha256 $requestSha256 -RequestPath $requestPath}
  if($null-eq$request-or$request.schemaVersion-cne'runaai-m1-browser-checkpoint/v1'-or
     $request.checkpointId-cne$checkpointId-or$request.stage-cne$Checkpoint.stage-or
     $request.baseUrl-cne$Checkpoint.baseUrl-or$request.requestSha256-cne$requestSha256){
    throw 'r15-browser-bootstrap-binding-invalid'
  }
  try{$requestExpiry=ConvertTo-R15CheckpointExpiry -Value $request.expiresAt;$announcedExpiry=ConvertTo-R15CheckpointExpiry -Value $Checkpoint.expiresAt}catch{
    throw 'r15-browser-bootstrap-binding-invalid'
  }
  if($requestExpiry.UtcTicks-ne$announcedExpiry.UtcTicks-or$requestExpiry-le[DateTimeOffset]::UtcNow){throw 'r15-browser-bootstrap-expired'}
  try{$baseUri=[Uri]$request.baseUrl}catch{throw 'r15-browser-bootstrap-binding-invalid'}
  if($null-eq$request.bootstrap){
    $scope=$request.scope
    if($request.stage-cne'in-flight'-or$request.preparationOnly-ne$false-or$request.reusePreparedBrowser-ne$true-or
       $request.preparationCheckpointId-notmatch'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'-or
       $request.cancellationAt-notmatch'^\d{4}-\d{2}-\d{2}T.*Z$'-or$null-eq$scope-or
       $scope.principalId-notmatch'^m1-test-[a-f0-9]{24,64}$'-or$scope.sessionSha256-notmatch'^[a-f0-9]{64}$'-or
       [string]::IsNullOrWhiteSpace([string]$scope.projectId)-or[string]::IsNullOrWhiteSpace([string]$scope.taskId)-or
       [string]::IsNullOrWhiteSpace([string]$scope.experience)){throw 'r15-browser-bootstrap-in-flight-invalid'}
    $scopeSha256=Get-R15ObjectSha256 $scope
    if(-not$PreparedScopes.ContainsKey([string]$request.preparationCheckpointId)-or
       $PreparedScopes[[string]$request.preparationCheckpointId]-cne$scopeSha256){throw 'r15-browser-bootstrap-preparation-unbound'}
    return [pscustomobject]@{BrowserUrl=('http://127.0.0.1:'+$baseUri.Port+'/');SyntheticBootstrapRequired=$false;NonceCopiedToClipboard=$false;ReusePreparedBrowser=$true}
  }
  if($request.stage-ceq'in-flight'){throw 'r15-browser-bootstrap-in-flight-invalid'}
  $preparation=$request.stage-ceq'before-native-dispatch'
  if($preparation-and($request.preparationOnly-ne$true-or$request.reusePreparedBrowser-ne$false-or$null-eq$request.scope)){
    throw 'r15-browser-bootstrap-preparation-invalid'
  }
  try{$bootstrapUri=[Uri]$request.bootstrap.url}catch{throw 'r15-browser-bootstrap-binding-invalid'}
  $ttl=$request.bootstrap.expiresInSeconds
  if($bootstrapUri.Scheme-cne'http'-or$bootstrapUri.Host-cne'127.0.0.1'-or$bootstrapUri.Port-ne$baseUri.Port-or
     -not[string]::IsNullOrEmpty($bootstrapUri.UserInfo)-or$bootstrapUri.AbsolutePath-cne'/__acceptance/session'-or-not[string]::IsNullOrEmpty($bootstrapUri.Query)-or
     -not[string]::IsNullOrEmpty($bootstrapUri.Fragment)-or$request.bootstrap.nonce-notmatch'^[a-f0-9]{64}$'-or
     (($ttl-isnot[int])-and($ttl-isnot[long]))-or$ttl-ne900){throw 'r15-browser-bootstrap-binding-invalid'}
  if([DateTimeOffset]::UtcNow-ge$requestExpiry){throw 'r15-browser-bootstrap-expired'}
  [void](& $WriteClipboard ([string]$request.bootstrap.nonce))
  if([DateTimeOffset]::UtcNow-ge$requestExpiry){[void](& $ClearClipboard);throw 'r15-browser-bootstrap-expired'}
  if($preparation){$PreparedScopes[$checkpointId]=Get-R15ObjectSha256 $request.scope}
  [pscustomobject]@{BrowserUrl=('http://127.0.0.1:'+$baseUri.Port+'/__acceptance/session');SyntheticBootstrapRequired=$true;NonceCopiedToClipboard=$true;ReusePreparedBrowser=$false;PreparationCheckpoint=$preparation}
}

function Invoke-R15RemoteWithBrowserRelay {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9+/=]+$')][string]$EncodedCommand,
    [Parameter(Mandatory)][switch]$BrowserWitnessReady
  )
  if(-not$BrowserWitnessReady){throw 'r15-browser-witness-presence-required'}
  $ssh=[Diagnostics.ProcessStartInfo]::new()
  $ssh.FileName='ssh.exe'
  $ssh.Arguments='-F "C:\Users\matth\.ssh\config" -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand '+$EncodedCommand
  $ssh.UseShellExecute=$false;$ssh.CreateNoWindow=$true
  $ssh.RedirectStandardOutput=$true;$ssh.RedirectStandardError=$true
  $remote=[Diagnostics.Process]::new();$remote.StartInfo=$ssh
  $remoteStarted=$false
  $relayState=$null
  $relayExpiry=[DateTimeOffset]::MinValue
  $clipboardClearAt=[DateTimeOffset]::MinValue
  $clipboardPending=$false
  $preparedScopes=@{}
  $operationFailure=$null
  $cleanupFailures=@()
  try{
    if(-not$remote.Start()){throw 'r15-remote-start-failed'}
    $remoteStarted=$true
    $remoteErrorRead=$remote.StandardError.ReadToEndAsync()
    $lineRead=$remote.StandardOutput.ReadLineAsync()
    while($true){
      if($clipboardPending-and[DateTimeOffset]::UtcNow-ge$clipboardClearAt){
        Clear-Clipboard;$clipboardPending=$false
      }
      if($null-ne$relayState){
        if($relayState.Process.HasExited){
          [void]$relayState.ErrorRead.Result
          throw 'r15-browser-relay-exited-before-remote-phase'
        }
        if([DateTimeOffset]::UtcNow-ge$relayExpiry){
          Stop-R15ChildProcess $relayState.Process;$relayState=$null
          throw 'r15-browser-checkpoint-expired-before-remote-phase'
        }
      }
      if(-not$lineRead.Wait(250)){continue}
      $line=$lineRead.Result
      if($null-eq$line){break}
      $lineRead=$remote.StandardOutput.ReadLineAsync()
      $checkpoint=$null
      try{$candidate=$line|ConvertFrom-Json;if($candidate.schemaVersion-ceq'runaai-m1-browser-checkpoint-ready/v1'){$checkpoint=$candidate}}catch{}
      if($null-eq$checkpoint){Write-Output $line;continue}
      try{$parsedExpiry=ConvertTo-R15CheckpointExpiry -Value $checkpoint.expiresAt}catch{
        throw 'r15-browser-checkpoint-announcement-invalid'
      }
      if($checkpoint.checkpointId-notmatch'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'-or
         $parsedExpiry-le[DateTimeOffset]::UtcNow){
        throw 'r15-browser-checkpoint-announcement-invalid'
      }
      try{$uri=[Uri]$checkpoint.baseUrl}catch{throw 'r15-browser-checkpoint-base-url-invalid'}
      if($uri.Scheme-cne'http'-or$uri.Host-cne'127.0.0.1'-or$uri.AbsolutePath-cne'/'-or
         -not[string]::IsNullOrEmpty($uri.Query)-or-not[string]::IsNullOrEmpty($uri.Fragment)-or
         $uri.Port-lt1024-or$uri.Port-gt65535){throw 'r15-browser-checkpoint-base-url-invalid'}
      if($null-ne$relayState){Stop-R15ChildProcess $relayState.Process;$relayState=$null}
      $relayState=Start-R15BrowserRelay -RemotePort $uri.Port -StageId $StageId
      $relayExpiry=$parsedExpiry
      if($relayState.Process.HasExited-or[DateTimeOffset]::UtcNow-ge$relayExpiry){
        Stop-R15ChildProcess $relayState.Process;$relayState=$null
        throw 'r15-browser-relay-not-live-before-publication'
      }
      $handoff=Set-R15BrowserBootstrapHandoff -StageId $StageId -Checkpoint $checkpoint -PreparedScopes $preparedScopes
      if($handoff.NonceCopiedToClipboard){$clipboardClearAt=[DateTimeOffset]::UtcNow.AddSeconds(60);$clipboardPending=$true}
      if($relayState.Process.HasExited-or[DateTimeOffset]::UtcNow-ge$relayExpiry){
        if($clipboardPending){Clear-Clipboard;$clipboardPending=$false}
        throw 'r15-browser-relay-not-live-before-publication'
      }
      [ordered]@{schemaVersion='runaai-m1-browser-relay-ready/v1';checkpointId=$checkpoint.checkpointId;
        browserUrl=$handoff.BrowserUrl;expiresAt=$parsedExpiry.ToString('O');
        syntheticBootstrapRequired=$handoff.SyntheticBootstrapRequired;nonceCopiedToClipboard=$handoff.NonceCopiedToClipboard;
        reusePreparedBrowser=$handoff.ReusePreparedBrowser;clipboardAutoClearSeconds=$(if($handoff.NonceCopiedToClipboard){60}else{0});
        ordinarySignInForbidden=$true;relaySupervised=$true;humanBrowserRequired=$true;productionChanged=$false}|ConvertTo-Json -Compress|Write-Output
    }
    $remote.WaitForExit()
    $remoteErrors=$remoteErrorRead.Result
    if(-not[string]::IsNullOrWhiteSpace($remoteErrors)){Write-Error -Message $remoteErrors -ErrorAction Continue}
    if($remote.ExitCode-ne0){throw ('r15-remote-exit-'+$remote.ExitCode)}
  }catch{
    $operationFailure=$_.Exception.Message
  }finally{
    if($clipboardPending){try{Clear-Clipboard}catch{$cleanupFailures+=@('clipboard: '+$_.Exception.Message)}}
    $cleanupFailures+=@(Invoke-R15BrowserCleanup -RelayState $relayState -RemoteProcess $remote -RemoteStarted $remoteStarted)
  }
  if($cleanupFailures.Count-gt0){throw ('r15-browser-operator-cleanup-failed: '+($cleanupFailures-join'; '))}
  if($null-ne$operationFailure){throw $operationFailure}
}
