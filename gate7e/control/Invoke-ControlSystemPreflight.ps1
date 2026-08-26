[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SourceRoot,
  [Parameter(Mandatory)][string]$NodeExecutable,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [string]$Root='C:\AI\RunaAI-Next-Candidate',
  [string]$TaskName='Gate7E-RealSystemPreflight',
  [switch]$Worker
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Write-SafeReceipt([hashtable]$Receipt,[string]$Path) {
  $Receipt.privateValuesIncluded=$false
  [IO.File]::WriteAllText($Path,($Receipt|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false))
}

$rootPath=[IO.Path]::GetFullPath($Root)
$sourcePath=[IO.Path]::GetFullPath($SourceRoot)
$nodePath=[IO.Path]::GetFullPath($NodeExecutable)
$resultPath=Join-Path $rootPath 'staging\gate7e-system-preflight-result.json'

if($rootPath-ne'C:\AI\RunaAI-Next-Candidate'-or
  -not$sourcePath.StartsWith("$rootPath\staging\gate7e-source-",[StringComparison]::OrdinalIgnoreCase)-or
  -not$nodePath.StartsWith("$rootPath\releases\",[StringComparison]::OrdinalIgnoreCase)-or
  $ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or$TaskName-notmatch'^[A-Za-z0-9._-]{1,100}$'){
  throw 'gate7e-system-preflight-pin-invalid'
}

if($Worker){
  $receipt=[ordered]@{
    schemaVersion='runa2-gate7e-system-preflight-wrapper/v1'
    passed=$false
    systemContext=([Security.Principal.WindowsIdentity]::GetCurrent().Name-eq'NT AUTHORITY\SYSTEM')
    tempUnderWindows=([IO.Path]::GetTempPath().StartsWith('C:\Windows\Temp',[StringComparison]::OrdinalIgnoreCase))
    processExitCode=$null
    preflight=$null
    preflightDiagnostic=$null
    errorCode=$null
    privateValuesIncluded=$false
  }
  try{
    if(-not$receipt.systemContext){throw 'system-context-required'}
    if(-not(Test-Path -LiteralPath $nodePath -PathType Leaf)-or
      -not(Test-Path -LiteralPath $sourcePath -PathType Container)){
      throw 'preflight-input-missing'
    }
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$nodePath
    $start.Arguments='gate7e\run-control-preflight.mjs'
    $start.WorkingDirectory=$sourcePath
    $start.UseShellExecute=$false
    $start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true
    $start.RedirectStandardError=$true
    $process=[Diagnostics.Process]::new()
    $process.StartInfo=$start
    try{
      if(-not$process.Start()){throw 'preflight-process-start-failed'}
      $stdoutTask=$process.StandardOutput.ReadToEndAsync()
      $stderrTask=$process.StandardError.ReadToEndAsync()
      if(-not$process.WaitForExit(240000)){
        try{$process.Kill($true)}catch{}
        throw 'preflight-process-timeout'
      }
      $stdoutText=$stdoutTask.GetAwaiter().GetResult().Trim()
      $stderrText=$stderrTask.GetAwaiter().GetResult().Trim()
      $receipt.processExitCode=$process.ExitCode
    }finally{$process.Dispose()}

    if($stdoutText){
      $candidate=$stdoutText|ConvertFrom-Json
      if($candidate.privateValuesIncluded-ne$false-or
        $candidate.schemaVersion-ne'runa2-gate7e-control-real-preflight/v1'){
        throw 'preflight-output-invalid'
      }
      $receipt.preflight=$candidate
    }
    if($receipt.processExitCode-ne0){
      if($stderrText){
        try{
          $failure=$stderrText|ConvertFrom-Json
          if($failure.privateValuesIncluded-eq$false-and
            [string]$failure.errorCode-match'^[a-z0-9-]{1,100}$'){
            $receipt.errorCode=[string]$failure.errorCode
            if($failure.schemaVersion-eq'runa2-gate7e-control-real-preflight-error/v1'){
              $receipt.preflightDiagnostic=$failure.diagnostic
            }
          }
        }catch{}
      }
      if(-not$receipt.errorCode){$receipt.errorCode='control-real-preflight-failed'}
    }elseif($null-eq$receipt.preflight-or$receipt.preflight.passed-ne$true){
      $receipt.errorCode='preflight-success-receipt-missing'
    }else{$receipt.passed=$true}
  }catch{
    if(-not$receipt.errorCode){
      $safeMessage=[string]$_.Exception.Message
      $receipt.errorCode=if($safeMessage-match'^[a-z0-9-]{1,100}$'){$safeMessage}else{'system-preflight-wrapper-failed'}
    }
  }finally{Write-SafeReceipt $receipt $resultPath}
  exit $(if($receipt.passed){0}else{1})
}

if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or
  [Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7e-system-preflight-owner-context-invalid'
}
foreach($path in @($sourcePath,$nodePath,$PSCommandPath)){
  if(-not(Test-Path -LiteralPath $path)){throw 'gate7e-system-preflight-input-missing'}
}
$head=(& git -C $sourcePath rev-parse HEAD 2>$null).Trim();$headExit=$LASTEXITCODE
$tracked=(& git -C $sourcePath status --porcelain --untracked-files=no 2>$null)-join'';$statusExit=$LASTEXITCODE
$nodeVersion=(& $nodePath -p 'process.version' 2>$null).Trim();$nodeExit=$LASTEXITCODE
if($headExit-ne0-or$statusExit-ne0-or$nodeExit-ne0-or$head-ne$ExpectedCommit-or
  $tracked-or$nodeVersion-ne'v22.22.0'){
  throw 'gate7e-system-preflight-authority-mismatch'
}

$taskPath='\RunaAI-Next\'
if(Get-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction SilentlyContinue){
  throw 'gate7e-system-preflight-task-exists'
}
Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
$arguments=@(
  '-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"'-f$PSCommandPath),
  '-SourceRoot',('"{0}"'-f$sourcePath),'-NodeExecutable',('"{0}"'-f$nodePath),
  '-ExpectedCommit',$ExpectedCommit,'-Root',('"{0}"'-f$rootPath),'-TaskName',$TaskName,'-Worker'
)-join' '
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 6) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
try{
  Register-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -Action $action `
    -Principal $principal -Settings $settings|Out-Null
  Start-ScheduledTask -TaskPath $taskPath -TaskName $TaskName
  $deadline=[DateTime]::UtcNow.AddMinutes(5)
  do{
    Start-Sleep -Milliseconds 500
    $exists=Test-Path -LiteralPath $resultPath
    $state=(Get-ScheduledTask -TaskPath $taskPath -TaskName $TaskName).State
  }until($exists-or($state-ne'Running'-and$state-ne'Queued')-or[DateTime]::UtcNow-gt$deadline)
  $info=Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $TaskName
  if(-not(Test-Path -LiteralPath $resultPath -PathType Leaf)){
    throw "gate7e-system-preflight-result-missing:$($info.LastTaskResult)"
  }
  $receipt=Get-Content -Raw -LiteralPath $resultPath|ConvertFrom-Json
  if($receipt.privateValuesIncluded-ne$false){throw 'gate7e-system-preflight-result-unsafe'}
  $receipt|Add-Member -NotePropertyName taskLastResult -NotePropertyValue ([int64]$info.LastTaskResult)
  $receipt|ConvertTo-Json -Depth 12 -Compress
}finally{
  Stop-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
}
