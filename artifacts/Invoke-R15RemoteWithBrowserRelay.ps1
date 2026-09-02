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
  $operationFailure=$null
  $cleanupFailures=@()
  try{
    if(-not$remote.Start()){throw 'r15-remote-start-failed'}
    $remoteStarted=$true
    $remoteErrorRead=$remote.StandardError.ReadToEndAsync()
    $lineRead=$remote.StandardOutput.ReadLineAsync()
    while($true){
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
      Write-Output $line
      $lineRead=$remote.StandardOutput.ReadLineAsync()
      $checkpoint=$null
      try{$candidate=$line|ConvertFrom-Json;if($candidate.schemaVersion-ceq'runaai-m1-browser-checkpoint-ready/v1'){$checkpoint=$candidate}}catch{}
      if($null-eq$checkpoint){continue}
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
      [ordered]@{schemaVersion='runaai-m1-browser-relay-ready/v1';checkpointId=$checkpoint.checkpointId;
        browserUrl=('http://127.0.0.1:'+$uri.Port+'/');expiresAt=$parsedExpiry.ToString('O');
        relaySupervised=$true;humanBrowserRequired=$true;productionChanged=$false}|ConvertTo-Json -Compress|Write-Output
    }
    $remote.WaitForExit()
    $remoteErrors=$remoteErrorRead.Result
    if(-not[string]::IsNullOrWhiteSpace($remoteErrors)){Write-Error -Message $remoteErrors -ErrorAction Continue}
    if($remote.ExitCode-ne0){throw ('r15-remote-exit-'+$remote.ExitCode)}
  }catch{
    $operationFailure=$_.Exception.Message
  }finally{
    $cleanupFailures=@(Invoke-R15BrowserCleanup -RelayState $relayState -RemoteProcess $remote -RemoteStarted $remoteStarted)
  }
  if($cleanupFailures.Count-gt0){throw ('r15-browser-operator-cleanup-failed: '+($cleanupFailures-join'; '))}
  if($null-ne$operationFailure){throw $operationFailure}
}
