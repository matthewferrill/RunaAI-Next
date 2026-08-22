[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate';$legacy='C:\AI\Projects\RunaAI'
$configPath=Join-Path $root 'config\candidate.json';$legacyCommit='b4db04090d8f0df87234fab573b396e7824c5354'
if($env:COMPUTERNAME-ne 'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne 'RUNA-CONTROL\Matthew'){throw 'owner-relationships-context-invalid'}
if($ReleaseId-notmatch '^[A-Za-z0-9._-]{1,100}$'-or$ExpectedCommit-notmatch '^[a-f0-9]{40}$'-or$ExpectedArtifactDigest-notmatch '^[a-f0-9]{64}$'){throw 'owner-relationships-pin-invalid'}
$config=Get-Content -Raw -LiteralPath $configPath|ConvertFrom-Json;$manifestPath=Join-Path (Split-Path -Parent $configPath) $config.releaseManifestPath
$manifest=Get-Content -Raw -LiteralPath $manifestPath|ConvertFrom-Json;$runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10;$ceremony=Invoke-RestMethod 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
$marker=Get-Content -Raw -LiteralPath (Join-Path $root 'gate6c\freeze-lease.json')|ConvertFrom-Json
if($config.openfga.baseUrl-ne 'http://127.0.0.1:9763'-or$config.openfga.credentialRef-ne 'file:../secrets/openfga-token'-or
  $manifest.releaseId-ne$ReleaseId-or$manifest.commit-ne$ExpectedCommit-or$manifest.artifactDigest-ne$ExpectedArtifactDigest-or
  $runtime.running.releaseId-ne$ReleaseId-or$runtime.running.commit-ne$ExpectedCommit-or$runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or
  $runtime.cutover.phase-notin @('planned','rolled-back')-or$readiness.authority-ne 'shadow'-or$readiness.protectedDataImported-ne$false-or
  $readiness.productionTrafficChanged-ne$false-or$ceremony.complete-ne$true-or$ceremony.revision-ne 7-or
  $marker.status-ne 'released'-or$marker.selectedWritesFrozen-ne$false){throw 'owner-relationships-safety-state-invalid'}
if((& git.exe -C $legacy rev-parse HEAD).Trim()-ne$legacyCommit-or(& git.exe -C $legacy branch --show-current).Trim()-ne'main'-or
  ((& git.exe -C $legacy status --porcelain --untracked-files=no)-join '')-ne''){throw 'owner-relationships-legacy-drift'}
$relations=@('chat_ephemeral','use_local_workspace_evidence','propose_own_preference','approve_workspace_action')
$user='user:matthew-owner';$object='project:runa%3Apersonal';$store=[string]$config.openfga.storeId;$model=[string]$config.openfga.modelId
if($store-notmatch '^[A-Z0-9]{26}$'-or$model-notmatch '^[A-Z0-9]{26}$'){throw 'owner-relationships-openfga-pins-invalid'}
$token=$null;$headers=$null;$wrote=$false
function Tuple-Key([string]$Relation){[ordered]@{user=$user;relation=$Relation;object=$object}}
function Read-Count([string]$Relation){$body=@{tuple_key=(Tuple-Key $Relation);page_size=2}|ConvertTo-Json -Depth 5 -Compress;$value=Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/read" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 10;@($value.tuples).Count}
function Check-Allowed([string]$Relation){$body=@{tuple_key=(Tuple-Key $Relation);authorization_model_id=$model}|ConvertTo-Json -Depth 5 -Compress;$value=Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/check" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 10;$value.allowed-eq$true}
try{
  $token=[IO.File]::ReadAllText((Join-Path $root 'secrets\openfga-token')).Trim();if($token.Length-lt 32){throw 'owner-relationships-credential-invalid'};$headers=@{Authorization="Bearer $token"}
  $modelValue=Invoke-RestMethod -Method Get -Uri "$($config.openfga.baseUrl)/stores/$store/authorization-models/$model" -Headers $headers -TimeoutSec 10
  if(-not($modelValue.PSObject.Properties.Name-contains'authorization_model')-or$modelValue.authorization_model.id-ne$model){throw 'owner-relationships-model-invalid'}
  $project=@($modelValue.authorization_model.type_definitions|Where-Object{$_.type-eq'project'});if($project.Count-ne 1){throw 'owner-relationships-model-invalid'}
  foreach($relation in $relations){if(-not($project[0].relations.PSObject.Properties.Name-contains$relation)){throw 'owner-relationships-model-invalid'}}
  $before=@($relations|ForEach-Object{Read-Count $_});if(@($before|Where-Object{$_-notin@(0,1)}).Count-ne 0){throw 'owner-relationships-duplicate-state'}
  $present=@($before|Where-Object{$_-eq 1}).Count;if($present-notin@(0,$relations.Count)){throw 'owner-relationships-partial-state'}
  if($present-eq 0){$keys=@($relations|ForEach-Object{Tuple-Key $_});$body=@{writes=@{tuple_keys=$keys};authorization_model_id=$model}|ConvertTo-Json -Depth 7 -Compress;Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/write" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 10|Out-Null;$wrote=$true}
  $after=@($relations|ForEach-Object{Read-Count $_});$allowed=@($relations|ForEach-Object{Check-Allowed $_})
  if(@($after|Where-Object{$_-ne 1}).Count-ne 0-or@($allowed|Where-Object{$_-ne$true}).Count-ne 0){throw 'owner-relationships-verification-failed'}
  [ordered]@{schemaVersion='runa2-gate6c-owner-relationships/v1';passed=$true;relationCount=$relations.Count;alreadyConfigured=($present-eq$relations.Count);ownerBound=$true;legacyModified=$false;protectedDataImported=$false;productionTrafficChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{$failure=$_.Exception.Message
  if($wrote){try{$keys=@($relations|ForEach-Object{Tuple-Key $_});$body=@{deletes=@{tuple_keys=$keys};authorization_model_id=$model}|ConvertTo-Json -Depth 7 -Compress;Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/write" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 10|Out-Null;$remaining=@($relations|ForEach-Object{Read-Count $_});if(@($remaining|Where-Object{$_-ne 0}).Count-ne 0){throw 'owner-relationships-rollback-incomplete'}}catch{throw 'owner-relationships-rollback-failed'}}
  throw $failure
}finally{Remove-Variable token,headers,body,keys -ErrorAction SilentlyContinue}
