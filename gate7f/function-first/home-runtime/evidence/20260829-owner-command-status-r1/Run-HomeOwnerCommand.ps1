param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$dispatched=$false
$root=[IO.Path]::GetDirectoryName($PSScriptRoot)
if($root-notmatch'^C:\\ProgramData\\RunaAI-Next-NativeCommand-[a-f0-9]{32}$'){throw 'owner-command-root'}
if($env:COMPUTERNAME-cne'RUNA-HOME'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-HOME\Matthew'){throw 'owner-command-identity'}
. ($PSScriptRoot+'\Runtime-Windows.ps1');$script:RuntimeRoot=$root
if((Get-FileHash -LiteralPath ($root+'\seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedSeal){throw 'owner-command-seal'}
$seal=Read-RuntimeJson ($root+'\seal.json')
if($seal.schemaVersion-cne'runaai-owner-command-package/v1'-or$seal.root-cne$root-or$seal.taskName-cnotmatch'^Runa-M1-NativeCommand-[a-f0-9]{32}$'){throw 'owner-command-schema'}
foreach($name in @('Runtime-Windows.ps1','Run-HomeOwnerCommand.ps1')){
 if((Get-FileHash -LiteralPath ($PSScriptRoot+'\'+$name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.sourceFiles.$name){throw 'owner-command-code-pin'}
}
$cli='C:\Users\Matthew\.lmstudio\bin\lms.exe';$descriptor='C:\Users\Matthew\.lmstudio\.internal\http-server.json';$engine='C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe'
foreach($file in @($cli,$descriptor,$engine)){for($current=$file;$current;$current=[IO.Path]::GetDirectoryName($current)){
 if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'owner-command-link'}
}}
if((Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.cliSha256-or(Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.engineSha256-or(Get-FileHash -LiteralPath $descriptor -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.descriptorSha256){throw 'owner-command-runtime-pin'}
$process=Get-Process -Id ([int]$seal.engine.pid) -ErrorAction Stop
try{if($process.Path-cne$engine-or$process.StartTime.ToUniversalTime().ToString('o')-cne$seal.engine.startedAt){throw 'owner-command-engine-drift'}}finally{$process.Dispose()}
Write-RuntimeJson ($root+'\results\worker.json') (Get-RuntimeIdentity $PID)
$arguments=switch($seal.mode){
 'status'{'ps --json'}
 'stop'{'server stop'}
 'start'{if($seal.bind-notin@('127.0.0.1','0.0.0.0')){throw 'owner-command-bind'};'server start --port 1234 --bind '+$seal.bind}
 default{throw 'owner-command-mode'}
}
$started=[DateTime]::UtcNow.ToString('o');$passed=$false;$errorCode=$null;$stdoutSha256=$null;$executionStopped=$true
try{
 $env:LMS_API_SERVER_INFO_PATH=$descriptor;$executionStopped=$false;$dispatched=$true
 $stdout=[RunaRuntimeProbe]::RunBounded($cli,$arguments,5000,8192);$executionStopped=$true
 $hash=[Security.Cryptography.SHA256]::Create();try{$stdoutSha256=([BitConverter]::ToString($hash.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($stdout)))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
 if($seal.mode-ceq'status'-and$stdout-cnotmatch'^\s*\[\s*\]\s*$'){throw 'owner-command-status-unconfirmed'}
 $passed=$true
}catch{
 $caught=$_.Exception;while($null-ne$caught.InnerException){$caught=$caught.InnerException}
 $errorCode=if($caught.Message-match'^(owner-command|runtime-probe)-[a-z0-9-]+$'){$caught.Message}else{'owner-command-unconfirmed'}
 if($errorCode-ceq'runtime-probe-stop-unconfirmed'){$executionStopped=$false}else{$executionStopped=$true}
}finally{
 $result=@{schemaVersion='runaai-owner-command-result/v1';packageSha256=$ExpectedSeal;commandId=$seal.commandId;mode=$seal.mode;bind=$seal.bind;
  startedAt=$started;endedAt=[DateTime]::UtcNow.ToString('o');passed=$passed;errorCode=$errorCode;dispatched=$dispatched;executionStopped=$executionStopped;
  stdoutSha256=$stdoutSha256;stderrSha256=('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');identity='RUNA-HOME\Matthew';
  credentialsCopied=$false;credentialReadByWrapper=$false;privateValuesIncluded=$false;inferenceCalled=$false;settingsChanged=$false;
  nativeOutcomeConfirmed=$false;admissionClosed=$false;drainProved=$false}
 Write-RuntimeJson ($root+'\results\result.json') $result
}
if(-not$passed){exit 1}
