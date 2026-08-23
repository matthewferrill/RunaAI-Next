[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ExpectedReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [string]$Root='C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='http://127.0.0.1:9762';$realmName='runaai-next';$clientId='runaai-next-user'
$flowAlias='runaai-next-ordinary-password';$origin='https://runa.bridgebuildersai.com'
$secretPath=Join-Path $Root 'secrets\keycloak-ordinary-client';$password=$null;$token=$null

if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7a-ordinary-access-remove-context-invalid'
}
if([IO.Path]::GetFullPath($Root)-ne'C:\AI\RunaAI-Next-Candidate'-or
  $ExpectedReleaseId-notmatch'^[A-Za-z0-9._-]{1,100}$'-or$ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or
  $ExpectedArtifactDigest-notmatch'^[a-f0-9]{64}$'){throw 'gate7a-ordinary-access-remove-pin-invalid'}

function Expand-Response([object]$Response){foreach($item in @($Response)){if($item-is[Array]){foreach($nested in $item){$nested}}elseif($null-ne$item){$item}}}
function Assert-ActiveRelease {
  $runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  $readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  if($runtime.running.releaseId-ne$ExpectedReleaseId-or$runtime.running.commit-ne$ExpectedCommit-or
    $runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or$runtime.cutover.phase-ne'closed'-or
    $readiness.authority-ne'active'-or$readiness.protectedDataImported-ne$true-or
    $readiness.productionTrafficChanged-ne$true){throw 'gate7a-ordinary-access-remove-safety-state-drift'}
}

try{
  Assert-ActiveRelease
  $password=[IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{
    grant_type='password';client_id='admin-cli';username='candidate-bootstrap';password=$password}).access_token
  $headers=@{Authorization="Bearer $token"}
  $clients=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients?clientId=$clientId" -Headers $headers))
  $flows=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/authentication/flows" -Headers $headers))
  $matchingFlows=@($flows|Where-Object{$_.alias-eq$flowAlias})
  if($clients.Count-ne 1-or$matchingFlows.Count-ne 1-or-not(Test-Path -LiteralPath $secretPath -PathType Leaf)){
    throw 'gate7a-ordinary-access-remove-state-invalid'
  }
  $client=$clients[0];$flow=$matchingFlows[0]
  if($client.publicClient-ne$false-or$client.standardFlowEnabled-ne$true-or$client.directAccessGrantsEnabled-ne$false-or
    @($client.redirectUris).Count-ne 1-or$client.redirectUris[0]-ne"$origin/session/user/callback"-or
    @($client.webOrigins).Count-ne 1-or$client.webOrigins[0]-ne$origin-or
    $client.authenticationFlowBindingOverrides.browser-ne$flow.id){throw 'gate7a-ordinary-access-remove-target-invalid'}
  $realm=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  if([bool]$realm.registrationAllowed-ne$false-or[bool]$realm.editUsernameAllowed-ne$true){throw 'gate7a-ordinary-access-remove-realm-invalid'}
  Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName/clients/$($client.id)" -Headers $headers|Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName/authentication/flows/$($flow.id)" -Headers $headers|Out-Null
  Remove-Item -LiteralPath $secretPath -Force
  $realm.editUsernameAllowed=$false
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName" -Headers $headers -ContentType 'application/json' -Body ($realm|ConvertTo-Json -Depth 100 -Compress)|Out-Null
  $remainingClients=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients?clientId=$clientId" -Headers $headers))
  $remainingFlows=@((Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/authentication/flows" -Headers $headers))|Where-Object{$_.alias-eq$flowAlias})
  $verifiedRealm=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  if($remainingClients.Count-ne 0-or$remainingFlows.Count-ne 0-or(Test-Path -LiteralPath $secretPath)-or
    [bool]$verifiedRealm.registrationAllowed-ne$false-or[bool]$verifiedRealm.editUsernameAllowed-ne$false){throw 'gate7a-ordinary-access-remove-verification-failed'}
  Assert-ActiveRelease
  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-access-removal/v1';passed=$true;
    removedOnlyOrdinaryClient=$true;removedOnlyOrdinaryFlow=$true;ownerClientChanged=$false;
    protectedProductDataChanged=$false;productionTrafficChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
}finally{Remove-Variable password,token,headers,realm,verifiedRealm -ErrorAction SilentlyContinue}
