param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
. ($PSScriptRoot+'\Runtime-Windows.ps1')
if($env:COMPUTERNAME-cne'RUNA-HOME'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-HOME\Matthew'){throw 'processing-proof-sampler-identity'}
$root=$PSScriptRoot;$seal=Get-Content -LiteralPath ($root+'\seal.json') -Raw|ConvertFrom-Json;$config=Get-Content -LiteralPath ($root+'\config.json') -Raw|ConvertFrom-Json;$output=[string]$config.outputRoot
if((Get-FileHash -LiteralPath ($root+'\seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedSeal-or$seal.proofId-cne$config.proofId){throw 'processing-proof-sampler-seal'}
foreach($file in $seal.files.PSObject.Properties){if((Get-FileHash -LiteralPath ($root+'\'+$file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$file.Value){throw 'processing-proof-sampler-source'} }
$ready=Get-Content -LiteralPath ($output+'\ready.json') -Raw|ConvertFrom-Json
if($ready.sealSha256-cne$ExpectedSeal-or$ready.proofId-cne$config.proofId-or$ready.modelId-cne'text-embedding-nomic-embed-text-v1.5'){throw 'processing-proof-sampler-ready'}
$cli='C:\Users\Matthew\.lmstudio\bin\lms.exe';$engine='C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe';$descriptor='C:\Users\Matthew\.lmstudio\.internal\http-server.json';
if((Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash.ToLowerInvariant()-cne$config.preflight.cliSha256-or(Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash.ToLowerInvariant()-cne$config.preflight.engineSha256-or(Get-FileHash -LiteralPath $descriptor -Algorithm SHA256).Hash.ToLowerInvariant()-cne$config.preflight.descriptorSha256){throw 'processing-proof-sampler-runtime'}
$process=Get-Process -Id ([int]$config.preflight.engine.pid) -ErrorAction Stop
try{if($process.Path-cne$engine-or$process.StartTime.ToUniversalTime().ToString('o')-cne$config.preflight.engine.startedAt){throw 'processing-proof-sampler-engine'}}finally{$process.Dispose()}
$samples=$output+'\samples.jsonl';$stream=[IO.File]::Open($samples,'CreateNew','Write','Read');$count=0;$positive=$false;$queued=$false;$maximumQueued=0;$statuses=[Collections.Generic.HashSet[string]]::new();$passed=$false;$errorCode=$null
$allowed=@('type','modelKey','format','displayName','publisher','path','sizeBytes','indexedModelIdentifier','deviceIdentifier','paramsString','architecture','quantization','variants','selectedVariant','identifier','ttlMs','lastUsedTime','vision','trainedForToolUse','maxContextLength','contextLength','status','queued','parallel')
Write-RuntimeJson ($output+'\sampler-worker.json') (Get-RuntimeIdentity $PID)
try{
 $deadline=[DateTime]::UtcNow.AddMilliseconds([int]$config.policy.sampleDeadlineMs);$doneAfter=$null
 while([DateTime]::UtcNow-lt$deadline){
  $started=[DateTime]::UtcNow;$env:LMS_API_SERVER_INFO_PATH=$descriptor;$raw=[RunaRuntimeProbe]::RunBounded($cli,'ps --json',5000,8192);$finished=[DateTime]::UtcNow
  $value=@($raw|ConvertFrom-Json);if($value.Count-ne1){throw 'processing-proof-sampler-model-count'};$item=$value[0]
  foreach($name in $item.PSObject.Properties.Name){if($name-notin$allowed){throw 'processing-proof-sampler-model-field'}}
  if($item.identifier-cne$ready.instanceId-or$item.modelKey-cne$ready.modelId-or$item.type-cne'embedding'-or$null-ne$item.deviceIdentifier-or$item.status-notin@('idle','processingPrompt','generating','computingEmbedding')-or$item.queued-isnot[int]-or$item.queued-lt0-or$item.queued-gt100000){throw 'processing-proof-sampler-model'}
  $record=[ordered]@{startedAt=$started.ToString('o');finishedAt=$finished.ToString('o');identifier=[string]$item.identifier;modelKey=[string]$item.modelKey;type='embedding';status=[string]$item.status;queued=[int]$item.queued}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($record|ConvertTo-Json -Compress)+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush();$count++;$null=$statuses.Add([string]$item.status)
  if($item.status-ceq'computingEmbedding'){$positive=$true};if([int]$item.queued-gt0){$queued=$true;$maximumQueued=[Math]::Max($maximumQueued,[int]$item.queued)}
  if(Test-Path -LiteralPath ($output+'\requests.json')){if($null-eq$doneAfter){$doneAfter=[DateTime]::UtcNow.AddSeconds(2)}elseif([DateTime]::UtcNow-ge$doneAfter){break}}
  Start-Sleep -Milliseconds ([int]$config.policy.sampleIntervalMs)
 }
 if(-not$positive-or-not$queued){throw 'processing-proof-sampler-positive-missing'};$passed=$true
}catch{$errorCode=if($_.Exception.Message-match'^processing-proof-[a-z0-9-]+$'){$_.Exception.Message}else{'processing-proof-sampler-failed'}}finally{
 $stream.Dispose();$samplesSha256=(Get-FileHash -LiteralPath $samples -Algorithm SHA256).Hash.ToLowerInvariant()
 $result=[ordered]@{schemaVersion='runaai-native-processing-sampler-result/v1';proofId=[string]$config.proofId;sealSha256=$ExpectedSeal;instanceId=[string]$ready.instanceId;
  sampleCount=$count;positiveObserved=$positive;queueObserved=$queued;maximumQueued=$maximumQueued;statuses=@($statuses|Sort-Object);samplesSha256=$samplesSha256;
  passed=$passed;errorCode=$errorCode;identity='RUNA-HOME\Matthew';inferenceCalled=$false;privateValuesIncluded=$false;admissionClosed=$false;drainProved=$false}
 Write-RuntimeJson ($output+'\sampler-result.json') $result
}
if(-not$passed){exit 1}
