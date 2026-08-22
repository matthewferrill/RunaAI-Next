[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ToolPath,
  [Parameter(Mandatory)][string]$ExpectedToolSha256,
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][string]$ExpectedRootSha256,
  [Parameter(Mandatory)][string]$ExpectedRootThumbprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$candidateRoot='C:\AI\RunaAI-Next-Candidate';$taskPath='\RunaAI-Next\'
if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){throw 'control-caddy-interactive-context-invalid'}
if($ExpectedToolSha256-notmatch'^[a-f0-9]{64}$'){throw 'control-caddy-interactive-tool-pin-invalid'}
$exactToolPath=[IO.Path]::GetFullPath($ToolPath);$staging=Join-Path $candidateRoot "staging\caddy-trust-$($ExpectedToolSha256.Substring(0,12))"
if($exactToolPath-ne(Join-Path $staging 'Trust-ControlCaddyRoot.ps1')-or-not(Test-Path -LiteralPath $exactToolPath -PathType Leaf)-or
  (Get-FileHash -LiteralPath $exactToolPath -Algorithm SHA256).Hash.ToLowerInvariant()-ne$ExpectedToolSha256){throw 'control-caddy-interactive-tool-mismatch'}
$interactive=@(Get-CimInstance Win32_LogonSession|Where-Object{$_.LogonType-in@(2,10)}|ForEach-Object{$session=$_;Get-CimAssociatedInstance -InputObject $session -Association Win32_LoggedOnUser|Where-Object{$_.Name-eq'Matthew'-and$_.Domain-eq'RUNA-CONTROL'}})
if($interactive.Count-eq 0){throw 'control-caddy-interactive-owner-session-missing'}
$resultPath=Join-Path $staging 'result.json';$taskName="CaddyTrust-$($ExpectedToolSha256.Substring(0,12))"
if(Test-Path -LiteralPath $resultPath){throw 'control-caddy-interactive-result-exists'}
if(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue){throw 'control-caddy-interactive-task-exists'}
$arguments=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$exactToolPath+'"'),
  '-ReleaseId',('"'+$ReleaseId+'"'),'-ExpectedCommit',('"'+$ExpectedCommit+'"'),'-ExpectedArtifactDigest',('"'+$ExpectedArtifactDigest+'"'),
  '-ExpectedRootSha256',('"'+$ExpectedRootSha256+'"'),'-ExpectedRootThumbprint',('"'+$ExpectedRootThumbprint+'"'),'-ResultPath',('"'+$resultPath+'"'))-join' '
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$principal=New-ScheduledTaskPrincipal -UserId 'RUNA-CONTROL\Matthew' -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$registered=$false
try{
  Register-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Action $action -Principal $principal -Settings $settings|Out-Null;$registered=$true
  Start-ScheduledTask -TaskPath $taskPath -TaskName $taskName
  $deadline=[DateTime]::UtcNow.AddSeconds(90)
  do{Start-Sleep -Milliseconds 500;if(Test-Path -LiteralPath $resultPath){break};$state=(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName).State}until([DateTime]::UtcNow-gt$deadline-or$state-eq'Ready')
  if(-not(Test-Path -LiteralPath $resultPath)){throw 'control-caddy-interactive-result-missing'}
  $result=Get-Content -Raw -LiteralPath $resultPath|ConvertFrom-Json
  if($result.schemaVersion-eq'runa2-gate6b-control-caddy-trust-error/v1'-and$result.passed-eq$false-and
    [string]$result.errorCode-match'^control-caddy-trust-[a-z-]+$'-and$result.privateValuesIncluded-eq$false){throw [string]$result.errorCode}
  if($result.schemaVersion-ne'runa2-gate6b-control-caddy-trust/v1'-or$result.passed-ne$true-or$result.scope-ne'CurrentUser\Root'-or
    $result.thumbprint-ne$ExpectedRootThumbprint-or$result.httpsStatus-ne 200-or$result.certificateValidationBypassed-ne$false-or$result.privateValuesIncluded-ne$false){throw 'control-caddy-interactive-result-invalid'}
  $result|ConvertTo-Json -Compress
}finally{if($registered){Unregister-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Confirm:$false}}
