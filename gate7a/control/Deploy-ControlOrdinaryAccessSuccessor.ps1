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
  [Parameter(Mandatory)][string]$CaddyfileSha256,
  [ValidateSet('none','gate7d-chat-code-navigation')][string]$ExpectedUiContract='none',
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
foreach($value in @($ExpectedArtifactDigest,$PriorArtifactDigest,$ArchiveSha256,$ConfigSha256,$ManifestSha256,$LauncherSha256,$CaddyfileSha256)){if($value-notmatch'^[a-f0-9]{64}$'){throw 'gate7a-ordinary-deploy-pin-invalid'}}
foreach($value in @($ReleaseId,$PriorReleaseId)){if($value-notmatch'^[A-Za-z0-9._-]{1,100}$'){throw 'gate7a-ordinary-deploy-pin-invalid'}}

$staging=Join-Path $Root "staging\$ReleaseId";$release=Join-Path $Root "releases\$ReleaseId"
$archive=Join-Path $staging 'release.tar.gz';$stagedConfig=Join-Path $staging 'candidate.json'
$stagedManifest=Join-Path $staging $manifestName;$stagedLauncher=Join-Path $staging 'Run-Application.ps1'
$stagedCaddy=Join-Path $staging 'Caddyfile'
$config=Join-Path $Root 'config\candidate.json';$manifest=Join-Path $Root "config\$manifestName"
$launcher=Join-Path $Root 'control\Run-Application.ps1';$caddy=Join-Path $Root 'config\Caddyfile'
$caddyExe=Join-Path $Root 'tools\caddy\caddy.exe';$rollback=Join-Path $Root "secrets\gate7a-ordinary-rollback-$ReleaseId"
$expectedCaddyBinarySha256='5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b'
$changed=$false

function Hash([string]$Path){if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'gate7a-ordinary-deploy-staged-file-missing'};(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function TextHash([string]$Value){$algorithm=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}}
function Run-Caddy([ValidateSet('validate','reload')][string]$Command,[string]$ConfigPath){
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$caddyExe
  $start.Arguments="$Command --config `"$ConfigPath`" --adapter caddyfile"
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    if(-not$process.Start()){throw 'gate7a-ordinary-deploy-caddy-start-failed'}
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit();$stdout.GetAwaiter().GetResult()|Out-Null;$stderr.GetAwaiter().GetResult()|Out-Null
    $process.ExitCode
  }finally{$process.Dispose()}
}
function JsonFacts([object]$Value){
  $facts=@{}
  function Add-Facts([object]$Node,[string]$Path){
    if($null-eq$Node){$facts["$Path#type"]='null';return}
    if($Node-is[Management.Automation.PSCustomObject]){
      $facts["$Path#type"]='object'
      foreach($property in @($Node.PSObject.Properties)){
        Add-Facts $property.Value "$Path.$($property.Name)"
      }
      return
    }
    if($Node-is[Collections.IEnumerable]-and$Node-isnot[string]){
      $items=@($Node);$facts["$Path#type"]="array:$($items.Count)"
      for($index=0;$index-lt$items.Count;$index++){Add-Facts $items[$index] "$Path[$index]"}
      return
    }
    $facts["$Path#type"]='scalar';$facts[$Path]=$Node|ConvertTo-Json -Compress
  }
  Add-Facts $Value '$';$facts
}
function Wait-PortClosed { $deadline=[DateTime]::UtcNow.AddSeconds(90);do{if(-not(Get-NetTCPConnection -State Listen -LocalPort 9760 -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 500}until([DateTime]::UtcNow-gt$deadline);throw 'gate7a-ordinary-deploy-stop-timeout' }
function Wait-Release([string]$Id){$deadline=[DateTime]::UtcNow.AddMinutes(12);do{Start-Sleep -Seconds 2;try{$value=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 3;if($value.running.releaseId-eq$Id){return $value}}catch{}}until([DateTime]::UtcNow-gt$deadline);throw 'gate7a-ordinary-deploy-start-timeout'}
function Expand-Response([object]$Response){foreach($item in @($Response)){if($item-is [Array]){foreach($nested in $item){$nested}}elseif($null-ne$item){$item}}}
function Get-OwnerSubject {
  $base='http://127.0.0.1:9762';$bootstrap=$null;$adminToken=$null
  try{
    $bootstrap=[IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
    $adminToken=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
      -ContentType 'application/x-www-form-urlencoded' -Body @{grant_type='password';client_id='admin-cli';
        username='candidate-bootstrap';password=$bootstrap}).access_token
    $users=@(Expand-Response (Invoke-RestMethod -Method Get `
      -Uri "$base/admin/realms/runaai-next/users?username=matthew-owner&exact=true" `
      -Headers @{Authorization="Bearer $adminToken"}))
    if($users.Count-ne1-or$users[0].username-ne'matthew-owner'-or$users[0].enabled-ne$true-or
      [string]$users[0].id-notmatch'^[0-9a-f-]{36}$'){throw 'gate7a-ordinary-deploy-owner-subject-invalid'}
    [string]$users[0].id
  }finally{Remove-Variable bootstrap,adminToken,users -ErrorAction SilentlyContinue}
}
function Get-Redirect([string]$Path){
  $request=[Net.HttpWebRequest]::Create("http://127.0.0.1:9760$Path");$request.AllowAutoRedirect=$false;$request.Timeout=10000
  try{$response=$request.GetResponse()}catch{
    $cursor=$_.Exception;$response=$null
    while($null-ne$cursor-and$null-eq$response){
      $property=$cursor.PSObject.Properties['Response']
      if($null-ne$property-and$null-ne$property.Value){$response=$property.Value;break}
      $cursor=$cursor.InnerException
    }
    if($null-eq$response){throw}
  }
  try{
    if([int]$response.StatusCode-ne303){
      $safeCode=$null
      try{$reader=[IO.StreamReader]::new($response.GetResponseStream());$body=$reader.ReadToEnd();$reader.Close()
        $errorBody=$body|ConvertFrom-Json
        if($errorBody.privateValuesIncluded-eq$false-and[string]$errorBody.errorCode-match'^[a-z0-9-]{1,100}$'){$safeCode=[string]$errorBody.errorCode}
      }catch{}
      if($safeCode){throw "gate7a-ordinary-deploy-route-status-invalid:$([int]$response.StatusCode):$safeCode"}
      throw "gate7a-ordinary-deploy-route-status-invalid:$([int]$response.StatusCode)"
    }
    [string]$response.Headers['Location']
  }finally{$response.Close()}
}

$pins=@{$archive=$ArchiveSha256;$stagedConfig=$ConfigSha256;$stagedManifest=$ManifestSha256;$stagedLauncher=$LauncherSha256;$stagedCaddy=$CaddyfileSha256}
foreach($entry in $pins.GetEnumerator()){if((Hash $entry.Key)-ne$entry.Value){throw 'gate7a-ordinary-deploy-staged-hash-mismatch'}}
if((Hash $caddyExe)-ne$expectedCaddyBinarySha256){throw 'gate7a-ordinary-deploy-caddy-binary-drift'}
if((Run-Caddy validate $stagedCaddy)-ne0){throw 'gate7a-ordinary-deploy-caddy-invalid'}
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
  [int]$candidate.limits.totalDeadlineMs-ne60000-or
  $candidate.services.caddy.configurationDigest-ne(TextHash ([IO.File]::ReadAllText($stagedCaddy)+$expectedCaddyBinarySha256))-or
  $releaseFacts.releaseId-ne$ReleaseId-or$releaseFacts.commit-ne$ExpectedCommit-or
  $releaseFacts.artifactDigest-ne$ExpectedArtifactDigest){throw 'gate7a-ordinary-deploy-successor-invalid'}
$launcherText=[IO.File]::ReadAllText($stagedLauncher)
if(-not$launcherText.Contains((Join-Path $release 'runtime\node.exe'))-or
  -not$launcherText.Contains((Join-Path $release 'gate6b\server.mjs'))-or
  $launcherText.Contains($PriorReleaseId)){
  throw 'gate7a-ordinary-deploy-launcher-binding-invalid'
}
$preservedCandidate=Get-Content -Raw -LiteralPath $stagedConfig|ConvertFrom-Json
$preservedCandidate.limits.totalDeadlineMs=$currentConfig.limits.totalDeadlineMs
$preservedCandidate.services.caddy.configurationDigest=$currentConfig.services.caddy.configurationDigest
$currentFacts=JsonFacts $currentConfig;$candidateFacts=JsonFacts $preservedCandidate
if($currentFacts.Count-ne$candidateFacts.Count){throw 'gate7a-ordinary-deploy-protected-binding-drift'}
foreach($entry in $currentFacts.GetEnumerator()){
  if(-not$candidateFacts.ContainsKey($entry.Key)-or$candidateFacts[$entry.Key]-ne$entry.Value){
    throw 'gate7a-ordinary-deploy-protected-binding-drift'
  }
}
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
Copy-Item -LiteralPath $caddy -Destination (Join-Path $rollback 'Caddyfile')
Copy-Item -LiteralPath $stagedConfig -Destination "$config.new"
Copy-Item -LiteralPath $stagedManifest -Destination "$manifest.new"
Copy-Item -LiteralPath $stagedLauncher -Destination "$launcher.new"
Copy-Item -LiteralPath $stagedCaddy -Destination "$caddy.new"

try{
  Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application';Wait-PortClosed;$changed=$true
  Move-Item -LiteralPath "$config.new" -Destination $config -Force
  Move-Item -LiteralPath "$manifest.new" -Destination $manifest -Force
  Move-Item -LiteralPath "$launcher.new" -Destination $launcher -Force
  Move-Item -LiteralPath "$caddy.new" -Destination $caddy -Force
  if((Run-Caddy reload $caddy)-ne0){throw 'gate7a-ordinary-deploy-caddy-reload-failed'}
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$runtime=Wait-Release $ReleaseId
  $readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20
  if($runtime.running.commit-ne$ExpectedCommit-or$runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or
    $runtime.cutover.phase-ne'closed'-or$readiness.authority-ne'active'-or
    $readiness.protectedDataImported-ne$true-or$readiness.productionTrafficChanged-ne$true){throw 'gate7a-ordinary-deploy-readiness-invalid'}
  $operator=Join-Path $release 'gate7a\control\Rebind-ControlOrdinaryOwnerSession.mjs'
  if(-not(Test-Path -LiteralPath $operator -PathType Leaf)){throw 'gate7a-ordinary-deploy-owner-rebind-operator-missing'}
  $ownerSubject=Get-OwnerSubject
  $priorErrorActionPreference=$ErrorActionPreference
  try{
    $env:RUNA_GATE7A_OWNER_SUBJECT=$ownerSubject
    $ErrorActionPreference='Continue'
    $rebindOutput=& node $operator --release-root $release --successor-config $config `
      --successor-manifest $manifest --expected-release-id $ReleaseId --expected-commit $ExpectedCommit `
      --expected-artifact-digest $ExpectedArtifactDigest --prior-config (Join-Path $rollback 'candidate.json') `
      --prior-manifest (Join-Path $rollback $manifestName) --prior-release-id $PriorReleaseId `
      --prior-commit $PriorCommit --prior-artifact-digest $PriorArtifactDigest 2>&1
    $rebindExit=$LASTEXITCODE
  }finally{$ErrorActionPreference=$priorErrorActionPreference;Remove-Item Env:\RUNA_GATE7A_OWNER_SUBJECT -ErrorAction SilentlyContinue;Remove-Variable ownerSubject -ErrorAction SilentlyContinue}
  $rebindText=(@($rebindOutput|ForEach-Object{[string]$_})-join"`n").Trim();$rebindErrorCode=$null
  if($rebindExit-ne0){
    try{$rebindError=$rebindText|ConvertFrom-Json
      if($rebindError.privateValuesIncluded-eq$false-and[string]$rebindError.errorCode-match'^[a-z0-9-]{1,100}$'){$rebindErrorCode=[string]$rebindError.errorCode}
    }catch{}
    if($rebindErrorCode){throw "gate7a-ordinary-deploy-owner-rebind-failed:$rebindErrorCode"}
    throw 'gate7a-ordinary-deploy-owner-rebind-failed'
  }
  $rebind=$rebindText|ConvertFrom-Json
  if($rebind.passed-ne$true-or$rebind.ceremonyComplete-ne$true-or$rebind.priorCeremonyRetained-ne$true-or
    $rebind.authorityChanged-ne$false-or$rebind.protectedProductDataChanged-ne$false-or
    $rebind.privateValuesIncluded-ne$false){throw 'gate7a-ordinary-deploy-owner-rebind-invalid'}
  $ordinaryLocation=Get-Redirect '/session/user/start';$ownerLocation=Get-Redirect '/session/start'
  if($ordinaryLocation-notlike'https://runa.bridgebuildersai.com/auth/realms/runaai-next/protocol/openid-connect/auth*'-or
    $ordinaryLocation-notmatch'client_id=runaai-next-user'-or$ordinaryLocation-notmatch'code_challenge='-or
    $ownerLocation-notmatch'client_id=runaai-next(&|$)'){throw 'gate7a-ordinary-deploy-route-invalid'}
  if($ExpectedUiContract-eq'gate7d-chat-code-navigation'){
    $page=Invoke-WebRequest -UseBasicParsing -Uri 'https://runa.bridgebuildersai.com/' -TimeoutSec 20
    $module=Invoke-WebRequest -UseBasicParsing -Uri 'https://runa.bridgebuildersai.com/status.js' -TimeoutSec 20
    $requiredPage=@('id="session-avatar"','id="session-name"','id="chat-tab"','id="code-tab"',
      'id="new-chat"','id="new-project"','id="project-list"','id="record-list"','id="right-rail-body"')
    $requiredModule=@('/api/selected/navigation/query','/api/selected/chat/read','/api/selected/projects',
      'submittedExperience === "code" ? "code" : "general"')
    if([int]$page.StatusCode-ne200-or[int]$module.StatusCode-ne200-or
      [string]$module.Headers['Content-Type']-notmatch'^(?:text|application)/(?:java|ecma)script'){
      throw 'gate7a-ordinary-deploy-gate7d-presentation-invalid'
    }
    foreach($marker in $requiredPage){if(-not$page.Content.Contains($marker)){throw 'gate7a-ordinary-deploy-gate7d-presentation-invalid'}}
    foreach($marker in $requiredModule){if(-not$module.Content.Contains($marker)){throw 'gate7a-ordinary-deploy-gate7d-controller-invalid'}}
  }
  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-successor/v1';deployed=$true;
    releaseId=$ReleaseId;commit=$ExpectedCommit;artifactDigest=$ExpectedArtifactDigest;
    selectedCoreAuthorityUnchanged=$true;ownerProofRebound=$true;ownerRouteUnchanged=$true;ordinaryPasswordRouteReady=$true;applicationAndCaddyChangedTogether=$true;
    rollbackRetained=$true;legacyModified=$false;protectedProductDataChanged=$false;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  $failure=$_.Exception.Message
  if($changed){
    Stop-ScheduledTask -TaskPath $taskPath -TaskName 'Application' -ErrorAction SilentlyContinue;Wait-PortClosed
    Copy-Item -LiteralPath (Join-Path $rollback 'candidate.json') -Destination $config -Force
    Copy-Item -LiteralPath (Join-Path $rollback $manifestName) -Destination $manifest -Force
    Copy-Item -LiteralPath (Join-Path $rollback 'Run-Application.ps1') -Destination $launcher -Force
    Copy-Item -LiteralPath (Join-Path $rollback 'Caddyfile') -Destination $caddy -Force
    $caddyRollbackFailed=$false
    if((Run-Caddy reload $caddy)-ne0){$caddyRollbackFailed=$true}
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application';$restored=Wait-Release $PriorReleaseId
    if($restored.running.commit-ne$PriorCommit-or$restored.running.artifactDigest-ne$PriorArtifactDigest){throw 'gate7a-ordinary-deploy-rollback-failed'}
    if($caddyRollbackFailed){throw 'gate7a-ordinary-deploy-caddy-rollback-failed'}
  }
  throw "gate7a-ordinary-deploy-failed:$failure"
}finally{Remove-Item -LiteralPath "$config.new","$manifest.new","$launcher.new","$caddy.new" -Force -ErrorAction SilentlyContinue}
