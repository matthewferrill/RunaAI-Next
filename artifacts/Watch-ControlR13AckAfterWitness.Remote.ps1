[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ControlOwnedRoot,
  [Parameter(Mandatory)][ValidatePattern('^(?:campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}|supplemental-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}-[a-f0-9]{12})$')][string]$CampaignDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRuntimeSeal,
  [ValidateRange(300,7200)][int]$DiscoveryTimeoutSeconds=5400,
  [ValidateRange(10,60)][int]$ObservationTimeoutSeconds=45,
  [ValidateRange(30,180)][int]$PublicationTimeoutSeconds=120
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$root=[IO.Path]::GetFullPath($ControlOwnedRoot)
if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'-or
   [IO.Path]::GetDirectoryName($root)-cne'C:\AI\RunaAI-Next-Candidate\staging'-or
   [IO.Path]::GetFileName($root)-notmatch'^m1-task-native-[a-f0-9]{32}$'-or
   -not$CampaignDirectory.Contains($ExpectedRuntimeSeal.Substring(0,16),[StringComparison]::Ordinal)){
  throw 'r13-ack-watcher-binding-invalid'
}

$campaignRoot=Join-Path (Join-Path $root 'acceptance-evidence') $CampaignDirectory
$helper=Join-Path $root 'gate7f\function-first\acceptance\operator-browser-ack-helper.mjs'
if(-not(Test-Path -LiteralPath $helper -PathType Leaf)-or
   ((Get-Item -LiteralPath $helper).Attributes-band[IO.FileAttributes]::ReparsePoint)){
  throw 'r13-ack-watcher-helper-invalid'
}

function ConvertTo-Base64Json([object]$Value){
  $raw=$Value|ConvertTo-Json -Depth 30 -Compress
  return [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($raw))
}

function Publish-WatcherArm([string]$Directory,[object]$Request,[string]$RequestPath){
  $requestSha=(Get-FileHash -LiteralPath $RequestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $receipt=[ordered]@{
    schemaVersion='runaai-m1-browser-watcher-armed/v1'
    checkpointId=[string]$Request.checkpointId
    caseId=[string]$Request.caseId
    stage=[string]$Request.stage
    runtimeSealSha256=[string]$Request.runtimeSealSha256
    requestSha256=$requestSha
    watcherSourceSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    armedAt=[DateTimeOffset]::UtcNow.ToString('o')
    exactCheckpointStatusRequired=$true
    globalCounterUsed=$false
  }
  $target=Join-Path $Directory 'watcher-armed.json'
  if(Test-Path -LiteralPath $target -PathType Leaf){
    $existing=Get-Content -LiteralPath $target -Raw|ConvertFrom-Json
    if($existing.checkpointId-cne$receipt.checkpointId-or$existing.requestSha256-cne$receipt.requestSha256){throw 'r13-ack-watcher-arm-conflict'}
    return $existing
  }
  $temporary=Join-Path $Directory ('watcher-armed-'+[Guid]::NewGuid().ToString('N')+'.tmp')
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt|ConvertTo-Json -Depth 10))
  $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  Move-Item -LiteralPath $temporary -Destination $target -ErrorAction Stop
  return [pscustomobject]$receipt
}

$notice='Cancellation requested. No new steps will start. An already-dispatched step may still be finishing or awaiting reconciliation; its actual result will be retained when observed.'
$details=[ordered]@{
  observation='The exact checkpoint-specific witness was accepted from the visible application state.'
  taskStatus='cancelled'
  notice=$notice
  claimedImmediateKill=$false
  boundedDrain=[ordered]@{noNewSteps=$true;alreadyDispatchedMayFinish=$true;awaitingReconciliation=$true;resultWillBeRetained=$true}
}
$actualBase64=ConvertTo-Base64Json $false
$detailsBase64=ConvertTo-Base64Json $details
$discoveryDeadline=[DateTimeOffset]::UtcNow.AddSeconds($DiscoveryTimeoutSeconds)
$prepared=@{}
$completed=@{}

while([DateTimeOffset]::UtcNow-lt$discoveryDeadline){
  if(Test-Path -LiteralPath $campaignRoot -PathType Container){
    foreach($directory in @(Get-ChildItem -LiteralPath $campaignRoot -Directory -Filter 'browser-*' -ErrorAction SilentlyContinue|Sort-Object LastWriteTimeUtc)){
      $requestPath=Join-Path $directory.FullName 'request.json'
      if(-not(Test-Path -LiteralPath $requestPath -PathType Leaf)){continue}
      try{$request=Get-Content -LiteralPath $requestPath -Raw|ConvertFrom-Json}catch{continue}
      if($request.caseId-cne'agent-05-cancel-drain'-or$request.runtimeSealSha256-cne$ExpectedRuntimeSeal){continue}
      $checkpoint=[string]$request.checkpointId
      if($completed.ContainsKey($checkpoint)){continue}
      if($request.stage-ceq'before-native-dispatch'-and$request.preparationOnly-eq$true){
        $arm=Publish-WatcherArm $directory.FullName $request $requestPath
        $prepared[$checkpoint]=[ordered]@{scope=$request.scope;arm=$arm}
        continue
      }
      if($request.stage-cne'in-flight'-or$request.reusePreparedBrowser-ne$true-or$null-eq$request.observationEndpoint){continue}
      $preparationCheckpoint=[string]$request.preparationCheckpointId
      if(-not$prepared.ContainsKey($preparationCheckpoint)-or
         (($prepared[$preparationCheckpoint].scope|ConvertTo-Json -Depth 10 -Compress)-cne($request.scope|ConvertTo-Json -Depth 10 -Compress))){
        throw 'r13-ack-watcher-in-flight-binding-invalid'
      }
      $statusUrl=[string]$request.baseUrl+'/__acceptance/browser-observation-status?checkpointId='+[Uri]::EscapeDataString($checkpoint)
      $observationDeadline=[DateTimeOffset]::Parse([string]$request.observationDeadline)
      $boundedObservationDeadline=[DateTimeOffset]::UtcNow.AddSeconds($ObservationTimeoutSeconds)
      if($boundedObservationDeadline-gt$observationDeadline){$boundedObservationDeadline=$observationDeadline}
      $status=$null
      while([DateTimeOffset]::UtcNow-lt$boundedObservationDeadline){
        try{$candidateStatus=Invoke-RestMethod -Uri $statusUrl -Method Get -TimeoutSec 2}catch{Start-Sleep -Milliseconds 25;continue}
        if($candidateStatus.checkpointId-cne$checkpoint){throw 'r13-ack-watcher-status-binding-invalid'}
        if($candidateStatus.witnessAccepted-eq$true){$status=$candidateStatus;break}
        Start-Sleep -Milliseconds 25
      }
      if($null-eq$status){throw 'r13-ack-watcher-observation-timeout'}
      $witnessAt=[DateTimeOffset]::Parse([string]$status.witnessReceivedAt)
      if($witnessAt-gt$observationDeadline-or$status.witnessSha256-notmatch'^[a-f0-9]{64}$'-or
         $status.domBindingSha256-notmatch'^[a-f0-9]{64}$'-or$null-eq$status.domBinding-or
         $status.domBinding.taskId-cne$request.taskId-or$status.domBinding.projectId-cne$request.projectId-or
         $status.domBinding.experience-cne$request.experience-or$status.domBinding.taskObjective-cne$request.taskObjective-or
         $status.domBinding.cancellationAt-cne$request.cancellationAt){throw 'r13-ack-watcher-witness-invalid'}
      $ackPath=Join-Path $directory.FullName 'browser-ack.json'
      & node $helper graded $requestPath $ackPath ([string]$status.domBinding.witnessedUrl) $actualBase64 $detailsBase64 $witnessAt.ToString('o')
      if($LASTEXITCODE-ne0){throw 'r13-ack-watcher-publication-failed'}
      $publicationDeadline=[DateTimeOffset]::Parse([string]$request.expiresAt)
      $boundedPublicationDeadline=[DateTimeOffset]::UtcNow.AddSeconds($PublicationTimeoutSeconds)
      if($boundedPublicationDeadline-gt$publicationDeadline){$boundedPublicationDeadline=$publicationDeadline}
      $publishedAccepted=$false
      while([DateTimeOffset]::UtcNow-lt$boundedPublicationDeadline){
        $published=Invoke-RestMethod -Uri $statusUrl -Method Get -TimeoutSec 2
        if($published.acknowledgementAccepted-eq$true){$publishedAccepted=$true;break}
        Start-Sleep -Milliseconds 25
      }
      if(-not$publishedAccepted){throw 'r13-ack-watcher-publication-timeout'}
      $completed[$checkpoint]=$true
      $prepared.Remove($preparationCheckpoint)
    }
  }
  Start-Sleep -Milliseconds 100
}
throw 'r13-ack-watcher-discovery-timeout'
