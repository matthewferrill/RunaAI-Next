param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# A single finite, read-only CLI probe under its real owner identity. No credentials are read here.
if($env:COMPUTERNAME-cne'RUNA-HOME'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-HOME\Matthew'){throw 'owner-status-identity'}
$root=[IO.Path]::GetDirectoryName($PSScriptRoot)
if($root-notmatch'^C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Readiness\\owner-status-[a-f0-9]{32}$'){throw 'owner-status-root'}
$sealFile=$root+'\seal.json'
if((Get-FileHash -LiteralPath $sealFile -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedSeal){throw 'owner-status-seal'}
$seal=[IO.File]::ReadAllText($sealFile)|ConvertFrom-Json
if($seal.schemaVersion-cne'runaai-owner-status-package/v1'-or$seal.root-cne$root){throw 'owner-status-seal-schema'}
foreach($name in @('Runtime-Windows.ps1','Run-HomeOwnerStatus.ps1')){
 if((Get-FileHash -LiteralPath ($PSScriptRoot+'\'+$name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.sourceFiles.$name){throw 'owner-status-code-pin'}
}
. ($PSScriptRoot+'\Runtime-Windows.ps1')
$script:RuntimeRoot=$root
Write-RuntimeJson ($root+'\results\worker.json') (Get-RuntimeIdentity $PID)
$cli='C:\Users\Matthew\.lmstudio\bin\lms.exe'
$descriptor='C:\Users\Matthew\.lmstudio\.internal\http-server.json'
$engine='C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe'
foreach($file in @($cli,$descriptor,$engine)){
 for($current=$file;$current;$current=[IO.Path]::GetDirectoryName($current)){
  if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'owner-status-link'}
 }
}
if((Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.cliSha256-or
 (Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash.ToLowerInvariant()-cne$seal.engineSha256){throw 'owner-status-runtime-pin'}
$descriptorHash=(Get-FileHash -LiteralPath $descriptor -Algorithm SHA256).Hash.ToLowerInvariant()
if($descriptorHash-cne$seal.descriptorSha256){throw 'owner-status-descriptor-drift'}
function Snapshot {
 $process=Get-Process -Id ([int]$seal.engine.pid) -ErrorAction Stop
 try{
  if($process.Path-cne$engine-or$process.StartTime.ToUniversalTime().ToString('o')-cne$seal.engine.startedAt){throw 'owner-status-engine-drift'}
 }finally{$process.Dispose()}
 $http=@(Get-NetTCPConnection -State Listen -LocalPort 1234,41343 -ErrorAction Stop)
 if(@($http|Where-Object{$_.OwningProcess-ne$seal.engine.pid}).Count-ne0-or@($http|Select-Object -ExpandProperty LocalPort -Unique).Count-ne2){throw 'owner-status-listener-owner'}
 $reply=Invoke-WebRequest -Uri 'http://127.0.0.1:1234/api/v1/models' -UseBasicParsing -TimeoutSec 5 -DisableKeepAlive
 if($reply.StatusCode-ne200-or$reply.RawContentLength-gt1048576){throw 'owner-status-registry'}
 $data=$reply.Content|ConvertFrom-Json
 if($null-eq$data.PSObject.Properties['models']){throw 'owner-status-registry-shape'}
 $loaded=0;foreach($model in $data.models){if($null-eq$model.PSObject.Properties['loaded_instances']){throw 'owner-status-registry-shape'};$loaded+=@($model.loaded_instances).Count}
 if($loaded-ne0){throw 'owner-status-resident-models'}
 return $loaded
}
$started=[DateTime]::UtcNow.ToString('o');$passed=$false;$failure=$null;$before=$null;$after=$null;$rawHash=$null;$executionStopped=$true
try{
 $before=Snapshot
 # The supported selector prevents findOrStartLlmster. The real Matthew token supplies normal CLI auth.
 $env:LMS_API_SERVER_INFO_PATH=$descriptor
 $executionStopped=$false
 $raw=[RunaRuntimeProbe]::RunBounded($cli,'ps --json',5000,8192)
 $executionStopped=$true
 if($raw-cnotmatch'^\s*\[\s*\]\s*$'){throw 'owner-status-empty-unconfirmed'}
 $hash=[Security.Cryptography.SHA256]::Create();try{$rawHash=([BitConverter]::ToString($hash.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($raw)))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
 $after=Snapshot
 if((Get-FileHash -LiteralPath $descriptor -Algorithm SHA256).Hash.ToLowerInvariant()-cne$descriptorHash){throw 'owner-status-descriptor-drift'}
 $passed=$true
}catch{
 # Never put a CLI error, passkey, raw output, or account credential into a public result.
 $caught=$_.Exception
 while($null-ne$caught.InnerException){$caught=$caught.InnerException}
 $failure=if($caught.Message-match'^(owner-status|runtime-probe)-[a-z0-9-]+$'){$caught.Message}else{'owner-status-unconfirmed'}
 if($failure-in@('runtime-probe-exit','runtime-probe-timeout','runtime-probe-cap','runtime-probe-start')){$executionStopped=$true}
 if($failure-ceq'runtime-probe-stop-unconfirmed'){$executionStopped=$false}
}finally{
 $result=@{schemaVersion='runaai-owner-status-result/v1';packageSha256=$ExpectedSeal;startedAt=$started;endedAt=[DateTime]::UtcNow.ToString('o');
  passed=$passed;errorCode=$failure;executionStopped=$executionStopped;identity='RUNA-HOME\Matthew';beforeResidentCount=$before;afterResidentCount=$after;stdoutSha256=$rawHash;
  descriptorSha256=$descriptorHash;command=@('ps','--json');privateValuesIncluded=$false;credentialsCopied=$false;credentialReadByWrapper=$false;
  cliUsesNormalOwnerAuthentication=$true;inferenceCalled=$false;settingsChanged=$false;admissionClosed=$false;drainProved=$false;positiveBusyStateProved=$false}
 Write-RuntimeJson ($root+'\results\result.json') $result
}
if(-not$passed){exit 1}
