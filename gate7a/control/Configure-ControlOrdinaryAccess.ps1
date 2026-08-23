[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ExpectedReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='http://127.0.0.1:9762';$realmName='runaai-next';$clientId='runaai-next-user'
$flowAlias='runaai-next-ordinary-password';$origin='https://runa.bridgebuildersai.com'
$redirectUri="$origin/session/user/callback";$secretPath=Join-Path $Root 'secrets\keycloak-ordinary-client'
$password=$null;$token=$null;$clientSecret=$null;$createdClientId=$null;$createdFlowId=$null
$priorRealmJson=$null;$realmChanged=$false;$secretCreated=$false;$alreadyConfigured=$false

if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7a-ordinary-access-context-invalid'
}
if([IO.Path]::GetFullPath($Root)-ne'C:\AI\RunaAI-Next-Candidate'-or
  $ExpectedReleaseId-notmatch'^[A-Za-z0-9._-]{1,100}$'-or$ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or
  $ExpectedArtifactDigest-notmatch'^[a-f0-9]{64}$'){throw 'gate7a-ordinary-access-pin-invalid'}

function Expand-Response([object]$Response){foreach($item in @($Response)){if($item-is [Array]){foreach($nested in $item){$nested}}elseif($null-ne$item){$item}}}
function Assert-ActiveRelease {
  $runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  $readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  if($runtime.running.releaseId-ne$ExpectedReleaseId-or$runtime.running.commit-ne$ExpectedCommit-or
    $runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or$runtime.cutover.phase-ne'closed'-or
    $readiness.authority-ne'active'-or$readiness.protectedDataImported-ne$true-or
    $readiness.productionTrafficChanged-ne$true){throw 'gate7a-ordinary-access-safety-state-drift'}
}
function Get-Clients([hashtable]$Headers){@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients?clientId=$clientId" -Headers $Headers))}
function Get-Flows([hashtable]$Headers){@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/authentication/flows" -Headers $Headers))}

try{
  Assert-ActiveRelease
  $password=[IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{
    grant_type='password';client_id='admin-cli';username='candidate-bootstrap';password=$password}).access_token
  $headers=@{Authorization="Bearer $token"}
  $realm=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  $priorRealmJson=$realm|ConvertTo-Json -Depth 100 -Compress
  if([bool]$realm.registrationAllowed-ne$false-or[bool]$realm.duplicateEmailsAllowed-ne$false){throw 'gate7a-ordinary-realm-policy-invalid'}

  $clients=@(Get-Clients $headers);$flows=@(Get-Flows $headers)
  $matchingFlows=@($flows|Where-Object{$_.alias-eq$flowAlias})
  $secretExists=Test-Path -LiteralPath $secretPath -PathType Leaf
  $alreadyConfigured=$clients.Count-eq 1-and$matchingFlows.Count-eq 1-and$secretExists
  if(($clients.Count-ne 0-or$matchingFlows.Count-ne 0-or$secretExists)-and-not$alreadyConfigured){throw 'gate7a-ordinary-access-partial-state'}

  if(-not$alreadyConfigured){
    Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/authentication/flows" -Headers $headers -ContentType 'application/json' -Body ([ordered]@{
      alias=$flowAlias;description='RunaAI invitation-only ordinary username and password browser flow';
      providerId='basic-flow';topLevel=$true;builtIn=$false}|ConvertTo-Json -Compress)|Out-Null
    $matchingFlows=@((Get-Flows $headers)|Where-Object{$_.alias-eq$flowAlias})
    if($matchingFlows.Count-ne 1){throw 'gate7a-ordinary-flow-create-invalid'}
    $createdFlowId=[string]$matchingFlows[0].id
    Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions/execution" -Headers $headers -ContentType 'application/json' -Body (@{provider='auth-username-password-form'}|ConvertTo-Json -Compress)|Out-Null
    $executions=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions" -Headers $headers))
    $form=@($executions|Where-Object{$_.providerId-eq'auth-username-password-form'})
    if($form.Count-ne 1){throw 'gate7a-ordinary-password-execution-invalid'}
    Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions" -Headers $headers -ContentType 'application/json' -Body ([ordered]@{
      id=$form[0].id;requirement='REQUIRED';priority=$form[0].priority}|ConvertTo-Json -Compress)|Out-Null

    $clientBody=[ordered]@{clientId=$clientId;name='RunaAI ordinary users';enabled=$true;protocol='openid-connect';
      publicClient=$false;clientAuthenticatorType='client-secret';standardFlowEnabled=$true;
      directAccessGrantsEnabled=$false;implicitFlowEnabled=$false;serviceAccountsEnabled=$false;
      redirectUris=@($redirectUri);webOrigins=@($origin);baseUrl=$origin;
      authenticationFlowBindingOverrides=@{browser=$createdFlowId};attributes=@{'pkce.code.challenge.method'='S256'} }
    Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/clients" -Headers $headers -ContentType 'application/json' -Body ($clientBody|ConvertTo-Json -Depth 10 -Compress)|Out-Null
    $clients=@(Get-Clients $headers);if($clients.Count-ne 1){throw 'gate7a-ordinary-client-create-invalid'};$createdClientId=[string]$clients[0].id
    $mappers=@(
      [ordered]@{name='runaai-next-user-audience';protocol='openid-connect';protocolMapper='oidc-audience-mapper';config=[ordered]@{
        'included.client.audience'=$clientId;'id.token.claim'='true';'access.token.claim'='true';'introspection.token.claim'='true'}},
      [ordered]@{name='runaai-next-user-amr';protocol='openid-connect';protocolMapper='oidc-hardcoded-claim-mapper';config=[ordered]@{
        'claim.name'='amr';'claim.value'='["pwd"]';'jsonType.label'='JSON';'id.token.claim'='true';'access.token.claim'='true';'introspection.token.claim'='true'}})
    foreach($mapper in $mappers){Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/clients/$createdClientId/protocol-mappers/models" -Headers $headers -ContentType 'application/json' -Body ($mapper|ConvertTo-Json -Depth 8 -Compress)|Out-Null}
    $clientSecret=[string](Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients/$createdClientId/client-secret" -Headers $headers).value
    if($clientSecret.Length-lt 32){throw 'gate7a-ordinary-client-secret-invalid'}
    [IO.File]::WriteAllText($secretPath,$clientSecret,[Text.UTF8Encoding]::new($false));$secretCreated=$true
    Set-Acl -LiteralPath $secretPath -AclObject (Get-Acl -LiteralPath (Join-Path $Root 'secrets\keycloak-client'))
    $realm.editUsernameAllowed=$true
    Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName" -Headers $headers -ContentType 'application/json' -Body ($realm|ConvertTo-Json -Depth 100 -Compress)|Out-Null
    $realmChanged=$true
  }

  $verifiedClients=@(Get-Clients $headers);$verifiedFlows=@((Get-Flows $headers)|Where-Object{$_.alias-eq$flowAlias})
  if($verifiedClients.Count-ne 1-or$verifiedFlows.Count-ne 1){throw 'gate7a-ordinary-access-verification-failed'}
  $verified=$verifiedClients[0];$verifiedExecutions=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions" -Headers $headers))
  $verifiedMappers=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients/$($verified.id)/protocol-mappers/models" -Headers $headers))
  $retainedSecret=[IO.File]::ReadAllText($secretPath).Trim();$liveSecret=[string](Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients/$($verified.id)/client-secret" -Headers $headers).value
  $verifiedRealm=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  if($verified.publicClient-ne$false-or$verified.standardFlowEnabled-ne$true-or$verified.directAccessGrantsEnabled-ne$false-or
    @($verified.redirectUris).Count-ne 1-or$verified.redirectUris[0]-ne$redirectUri-or@($verified.webOrigins).Count-ne 1-or$verified.webOrigins[0]-ne$origin-or
    $verified.authenticationFlowBindingOverrides.browser-ne$verifiedFlows[0].id-or
    @($verifiedExecutions|Where-Object{$_.providerId-eq'auth-username-password-form'-and$_.requirement-eq'REQUIRED'}).Count-ne 1-or
    @($verifiedMappers|Where-Object{$_.name-eq'runaai-next-user-audience'-and$_.protocolMapper-eq'oidc-audience-mapper'}).Count-ne 1-or
    @($verifiedMappers|Where-Object{$_.name-eq'runaai-next-user-amr'-and$_.protocolMapper-eq'oidc-hardcoded-claim-mapper'-and$_.config.'claim.value'-eq'["pwd"]'}).Count-ne 1-or
    $retainedSecret-ne$liveSecret-or[bool]$verifiedRealm.registrationAllowed-ne$false-or[bool]$verifiedRealm.editUsernameAllowed-ne$true){throw 'gate7a-ordinary-access-verification-failed'}
  Assert-ActiveRelease
  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-access/v1';passed=$true;alreadyConfigured=$alreadyConfigured;
    ordinaryClient=$clientId;passwordOnly=$true;publicSelfRegistration=$false;usernameChosenByInvitee=$true;
    ownerClientChanged=$false;secretRetained=$true;rollbackAvailable=$true;legacyModified=$false;
    protectedDataChanged=$false;productionTrafficChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  $failure=$_.Exception.Message
  if($token-and-not$alreadyConfigured){
    if($createdClientId){try{Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName/clients/$createdClientId" -Headers $headers|Out-Null}catch{}}
    if($createdFlowId){try{Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName/authentication/flows/$createdFlowId" -Headers $headers|Out-Null}catch{}}
    if($secretCreated-and(Test-Path -LiteralPath $secretPath)){try{Remove-Item -LiteralPath $secretPath -Force}catch{}}
    if($realmChanged-and$priorRealmJson){try{Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName" -Headers $headers -ContentType 'application/json' -Body $priorRealmJson|Out-Null}catch{}}
  }
  throw "gate7a-ordinary-access-configure-failed:$failure"
}finally{Remove-Variable password,token,clientSecret,retainedSecret,liveSecret,headers -ErrorAction SilentlyContinue}
