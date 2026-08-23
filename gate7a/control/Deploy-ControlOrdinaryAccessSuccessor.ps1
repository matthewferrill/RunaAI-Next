[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][int]$ExpectedArtifactFileCount,
  [Parameter(Mandatory)][string]$PriorReleaseId,
  [Parameter(Mandatory)][string]$PriorCommit,
  [Parameter(Mandatory)][string]$PriorArtifactDigest,
  [Parameter(Mandatory)][string]$ArchiveSha256,
  [Parameter(Mandatory)][string]$ConfigSha256,
  [Parameter(Mandatory)][string]$ManifestSha256,
  [Parameter(Mandatory)][string]$LauncherSha256,
  [string]$Root='C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$taskPath='\RunaAI-Next\';$manifestName='gate7a-release.json'
if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7a-ordinary-deploy-context-invalid'
}
if([IO.Path]::GetFullPath($Root)-ne'C:\AI\RunaAI-Next-Candidate'-or$ExpectedArtifactFileCount-lt 1){throw 'gate7a-ordinary-deploy-pin-invalid'}
foreach($value in @($ExpectedCommit,$PriorCommit)){if($value-notmatch'^[a-f0-9]{40}$'){throw 'gate7a-ordinary-deploy-pin-invalid'}}
foreach($value in @($ExpectedArtifactDigest,$PriorArtifactDigest,$ArchiveSha256,$ConfigSha256,$ManifestSha256,$LauncherSha256)){if($value-notmatch'^[a-f0-9]{64}$'){throw 'gate7a-ordinary-deploy-pin-invalid'}}
foreach($value in @($ReleaseId,$PriorReleaseId)){if($value-notmatch'^[A-Za-z0-9._-]{1,100}$'){throw 'gate7a-ordinary-deploy-pin-invalid'}}

$staging=Join-Path $Root "staging\$ReleaseId";$release=Join-Path $Root "releases\$ReleaseId"
$archive=Join-Path $staging 'release.tar.gz';$stagedConfig=Join-Path $staging 'candidate.json'
$stagedManifest=Join-Path $staging $manifestName;$stagedLauncher=Join-Path $staging 'Run-Application.ps1'
$config=Join-Path $Root 'config\candidate.json';$manifest=Join-Path $Root "config\$manifestName"
$launcher=Join-Path $Root 'control\Run-Application.ps1';$rollback=Join-Path $Root "secrets\gate7a-ordinary-rollback-$ReleaseId"
$changed=$false

function Hash([string]$Path){if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'gate7a-ordinary-deploy-staged-file-missing'};(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Wait-PortClosed { $deadline=[DateTime]::UtcNow.AddSeconds(90);do{if(-not(Get-NetTCPConnection -State Listen -LocalPort 9760 -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 500}until([DateTime]::UtcNow-gt$deadline);throw 'gate7a-ordinary-deploy-stop-timeout' }
function Wait-Release([string]$Id){$deadline=[DateTime]::UtcNow.AddMinutes(12);do{Start-Sleep -Seconds 2;try{$value=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 3;if($value.running.releaseId-eq$Id){return $value}}catch{}}until([DateTime]::UtcNow-gt$deadline);throw 'gate7a-ordinary-deploy-start-timeout'}
function Get-Redirect([string]$Path){
  $request=[Net.HttpWebRequest]::Create("http://127.0.0.1:9760$Path");$request.AllowAutoRedirect=$false;$request.Timeout=10000
  try{$response=$request.GetResponse()}catch{if($_.Exception.Response){$response=$_.Exception.Response}else{throw}}
  try{if([int]$response.StatusCode-ne302){throw 'gate7a-ordinary-deploy-route-status-invalid'};[string]$response.Headers['Location']}finally{$response.Close()}
}

$pins=@{$archive=$ArchiveSha256;$stagedConfig=$ConfigSha256;$stagedManifest=$ManifestSha256;$stagedLauncher=$LauncherSha256}
foreach($entry in $pins.GetEnumerator()){if((Hash $entry.Key)-ne$entry.Value){throw 'gate7a-ordinary-deploy-staged-hash-mismatch'}}
foreach($path in @($release,$rollback)){if(Test-Path -LiteralPath $path){throw 'gate7a-ordinary-deploy-new-path-exists'}}
$beforeRuntime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$beforeReadiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
if($beforeRuntime.running.releaseId-ne$PriorReleaseId-or$beforeRuntime.running.commit-ne$PriorCommit-or
  $beforeRuntime.running.artifactDigest-ne$PriorArtifactDigest-or$beforeRuntime.cutover.phase-ne'closed'-or
  $beforeReadiness.authority-ne'active'-or$beforeReadiness.protectedDataImported-ne$true-or
  $beforeReadiness.productionTrafficChanged-ne$true){throw 'gate7a-ordinary-deploy-current-state-drift'}
$currentConfig=Get-Content -Raw -LiteralPath $config|ConvertFrom-Json
$candidate=Get-Content -Raw -LiteralPath $stagedConfig|ConvertFrom-Json
$releaseFacts=Get-Content -Raw -LiteralPath $stagedManifest|ConvertFrom-Json
if($currentConfig.releaseManifestPath-ne$manifestName-or$candidate.releaseManifestPath-ne$manifestName-or
  $candidate.publicBaseUrl-ne'https://runa.bridgebuildersai.com'-or$candidate.gate7a.enabled-ne$true-or
  $candidate.gate7a.ordinaryClient.clientId-ne'runaai-next-user'-or
  $candidate.gate7a.ordinaryClient.redirectUri-ne'https://runa.bridgebuildersai.com/session/user/callback'-or
  $candidate.gate7a.ordinaryClient.clientCredentialRef-ne'file:../secrets/keycloak-ordinary-client'-or
  $releaseFacts.releaseId-ne$ReleaseId-or$releaseFacts.commit-ne$ExpectedCommit-or
  $releaseFacts.artifactDigest-ne$ExpectedArtifactDigest){throw 'gate7a-ordinary-deploy-successor-invalid'}
if(-not(Test-Path -LiteralPath (Join-Path $Root 'secrets\keycloak-ordinary-client') -PathType Leaf)){throw 'gate7a-ordinary-deploy-client-secret-missing'}

New-Item -ItemType Directory -Path $release|Out-Null
& tar.exe -xzf $archive -C $release
if($LASTEXITCODE-ne0){throw 'gate7a-ordinary-deploy-extract-failed'}
$artifact=Get-Content -Raw -LiteralPath (Join-Path $release 'artifact-files.json')|ConvertFrom-Json
if($artifact.artifactDigest-ne$ExpectedArtifactDigest-or@($artifact.entries).Count-ne$ExpectedArtifactFileCount){throw 'gate7a-ordinary-deploy-artifact-invalid'}
New-Item -ItemType Directory -Path $rollback|Out-Null
Set-Acl -LiteralPath $rollback -AclObject (Get-Acl -LiteralPath (Join-Path $Root 'secrets'))
Copy-Item -LiteralPath $config -Destination (Join-Path $rollback 'candidate.json')
Copy-Item -LiteralPath $manifest -Destination (Join-Path $rollback $manifestName)
Copy-Item -LiteralPath $launcher -Destination (Join-Path $rollback 'Run-Application.ps1')
Copy-Item -LiteralPath $stagedConfig -Destination "$config.new"
Copy-Item -LiteralPath $stagedManifest -Destination "$manifest.new"
Copy-Item -LiteralPath $stagedLauncher -Destination "$launcher.new"

try{
  Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application';Wait-PortClosed
  Move-Item -LiteralPath "$config.new" -Destination $config -Force
  Move-Item -LiteralPath "$manifest.new" -Destination $manifest -Force
  Move-Item -LiteralPath "$launcher.new" -Destination $launcher -Force;$changed=$true
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$runtime=Wait-Release $ReleaseId
  $readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20
  if($runtime.running.commit-ne$ExpectedCommit-or$runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or
    $runtime.cutover.phase-ne'closed'-or$readiness.authority-ne'active'-or
    $readiness.protectedDataImported-ne$true-or$readiness.productionTrafficChanged-ne$true){throw 'gate7a-ordinary-deploy-readiness-invalid'}
  $ordinaryLocation=Get-Redirect '/session/user/start';$ownerLocation=Get-Redirect '/session/start'
  if($ordinaryLocation-notlike'https://runa.bridgebuildersai.com/auth/realms/runaai-next/protocol/openid-connect/auth*'-or
    $ordinaryLocation-notmatch'client_id=runaai-next-user'-or$ordinaryLocation-notmatch'code_challenge='-or
    $ownerLocation-notmatch'client_id=runaai-next(&|$)'){throw 'gate7a-ordinary-deploy-route-invalid'}
  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-successor/v1';deployed=$true;
    releaseId=$ReleaseId;commit=$ExpectedCommit;artifactDigest=$ExpectedArtifactDigest;
    selectedCoreAuthorityUnchanged=$true;ownerRouteUnchanged=$true;ordinaryPasswordRouteReady=$true;
    rollbackRetained=$true;legacyModified=$false;protectedProductDataChanged=$false;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  $failure=$_.Exception.Message
  if($changed){
    Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application' -ErrorAction SilentlyContinue;Wait-PortClosed
    Copy-Item -LiteralPath (Join-Path $rollback 'candidate.json') -Destination $config -Force
    Copy-Item -LiteralPath (Join-Path $rollback $manifestName) -Destination $manifest -Force
    Copy-Item -LiteralPath (Join-Path $rollback 'Run-Application.ps1') -Destination $launcher -Force
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$restored=Wait-Release $PriorReleaseId
    if($restored.running.commit-ne$PriorCommit-or$restored.running.artifactDigest-ne$PriorArtifactDigest){throw 'gate7a-ordinary-deploy-rollback-failed'}
  }
  throw "gate7a-ordinary-deploy-failed:$failure"
}finally{Remove-Item -LiteralPath "$config.new","$manifest.new","$launcher.new" -Force -ErrorAction SilentlyContinue}
