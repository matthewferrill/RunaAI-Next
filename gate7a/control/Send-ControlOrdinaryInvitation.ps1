[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ExpectedReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [string]$PrincipalId = 'matthew-personal',
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='http://127.0.0.1:9762';$realmName='runaai-next';$clientId='runaai-next-user'
$origin='https://runa.bridgebuildersai.com';$pgBin=Join-Path $Root 'tools\postgresql\pgsql\bin'
$password=$null;$token=$null;$openfgaToken=$null;$dbPassword=$null
$createdUserId=$null;$principalWritten=$false;$relationWritten=$false

if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7a-invitation-context-invalid'
}
if([IO.Path]::GetFullPath($Root)-ne'C:\AI\RunaAI-Next-Candidate'-or
  $ExpectedReleaseId-notmatch'^[A-Za-z0-9._-]{1,100}$'-or$ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or
  $ExpectedArtifactDigest-notmatch'^[a-f0-9]{64}$'-or$PrincipalId-notmatch'^[a-z0-9][a-z0-9-]{0,63}$'){
  throw 'gate7a-invitation-pin-invalid'
}
[Console]::Error.Write('Invitation email: ')
$Email=[Console]::In.ReadLine()
if([string]::IsNullOrWhiteSpace($Email)){throw 'gate7a-invitation-email-invalid'}
try{$address=[Net.Mail.MailAddress]::new($Email.Trim().ToLowerInvariant())}catch{throw 'gate7a-invitation-email-invalid'}
if($address.Address-ne$Email.Trim().ToLowerInvariant()-or$address.Address.Length-gt 254){throw 'gate7a-invitation-email-invalid'}
$Email=$address.Address

function Expand-Response([object]$Response){foreach($item in @($Response)){if($item-is [Array]){foreach($nested in $item){$nested}}elseif($null-ne$item){$item}}}
function Assert-ActiveRelease {
  $runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  $readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  if($runtime.running.releaseId-ne$ExpectedReleaseId-or$runtime.running.commit-ne$ExpectedCommit-or
    $runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or$runtime.cutover.phase-ne'closed'-or
    $readiness.authority-ne'active'-or$readiness.protectedDataImported-ne$true-or
    $readiness.productionTrafficChanged-ne$true){throw 'gate7a-invitation-safety-state-drift'}
}
function Invoke-Psql([string]$Sql){
  $env:PGPASSWORD=$dbPassword
  try{$value=& (Join-Path $pgBin 'psql.exe') -w -X -h 127.0.0.1 -p 9765 -U postgres -d runaai_next -A -t -v ON_ERROR_STOP=1 -c $Sql
    if($LASTEXITCODE-ne 0){throw 'gate7a-invitation-database-command-failed'};($value-join'').Trim()}
  finally{Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}
}

try{
  Assert-ActiveRelease
  $password=[IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{
    grant_type='password';client_id='admin-cli';username='candidate-bootstrap';password=$password}).access_token
  $headers=@{Authorization="Bearer $token"}
  $realm=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  if([bool]$realm.registrationAllowed-ne$false-or[bool]$realm.editUsernameAllowed-ne$true-or
    -not[bool]$realm.smtpServer.host-or-not[bool]$realm.smtpServer.from){throw 'gate7a-invitation-email-delivery-unavailable'}
  $profile=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/users/profile" -Headers $headers
  $requiredProfile=@($profile.attributes|Where-Object{
    $requiredProperty=$_.PSObject.Properties['required']
    if($null-eq$requiredProperty-or$null-eq$requiredProperty.Value){$false}
    else{
      $rolesProperty=$requiredProperty.Value.PSObject.Properties['roles']
      $null-ne$rolesProperty-and@($rolesProperty.Value)-contains'user'
    }
  }|
    ForEach-Object{[string]$_.name}|Sort-Object)
  if(@(Compare-Object -ReferenceObject @('email','firstName','lastName') -DifferenceObject $requiredProfile).Count-ne 0){
    throw 'gate7a-invitation-user-profile-drift'
  }
  $clients=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/clients?clientId=$clientId" -Headers $headers))
  if($clients.Count-ne 1-or$clients[0].enabled-ne$true-or$clients[0].publicClient-ne$false-or
    @($clients[0].redirectUris).Count-ne 1-or$clients[0].redirectUris[0]-ne"$origin/session/user/callback"){
    throw 'gate7a-invitation-client-invalid'
  }
  $encodedEmail=[Uri]::EscapeDataString($Email)
  $existing=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/users?email=$encodedEmail&exact=true" -Headers $headers))
  if($existing.Count-ne 0){throw 'gate7a-invitation-email-already-registered'}
  $dbPassword=[IO.File]::ReadAllText((Join-Path $Root 'secrets\postgres-admin')).Trim()
  if((Invoke-Psql "SELECT count(*) FROM gate5.principals WHERE principal_id='$PrincipalId'")-ne'0'){
    throw 'gate7a-invitation-principal-already-registered'
  }
  $placeholder='invited-'+[Guid]::NewGuid().ToString('N').Substring(0,20)
  $userBody=[ordered]@{username=$placeholder;email=$Email;firstName='Invited';lastName='Member';enabled=$true;emailVerified=$false;
    requiredActions=@('VERIFY_EMAIL','UPDATE_PROFILE','UPDATE_PASSWORD')}
  try{Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/users" -Headers $headers -ContentType 'application/json' -Body ($userBody|ConvertTo-Json -Depth 8 -Compress)|Out-Null}
  catch{throw 'gate7a-invitation-user-create-rejected'}
  $created=@(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName/users?email=$encodedEmail&exact=true" -Headers $headers))
  if($created.Count-ne 1-or$created[0].emailVerified-ne$false-or$created[0].enabled-ne$true){throw 'gate7a-invitation-user-create-invalid'}
  $createdUserId=[string]$created[0].id
  if($createdUserId-notmatch'^[a-f0-9-]{36}$'){throw 'gate7a-invitation-subject-invalid'}
  Invoke-Psql "INSERT INTO gate5.principals(principal_id,oidc_subject,role,age_class,status,record_version) VALUES('$PrincipalId','$createdUserId','adult-member','adult','active',1)"|Out-Null
  $principalWritten=$true

  $config=Get-Content -Raw -LiteralPath (Join-Path $Root 'config\candidate.json')|ConvertFrom-Json
  $store=[string]$config.openfga.storeId;$model=[string]$config.openfga.modelId
  if($store-notmatch'^[A-Z0-9]{26}$'-or$model-notmatch'^[A-Z0-9]{26}$'){throw 'gate7a-invitation-openfga-pin-invalid'}
  $openfgaToken=[IO.File]::ReadAllText((Join-Path $Root 'secrets\openfga-token')).Trim();$fgaHeaders=@{Authorization="Bearer $openfgaToken"}
  $tuple=[ordered]@{user="user:$PrincipalId";relation='chat_ephemeral';object='project:runa%3Apersonal'}
  $writeBody=@{writes=@{tuple_keys=@($tuple)};authorization_model_id=$model}|ConvertTo-Json -Depth 7 -Compress
  Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/write" -Headers $fgaHeaders -ContentType 'application/json' -Body $writeBody -TimeoutSec 10|Out-Null
  $relationWritten=$true
  $checkBody=@{tuple_key=$tuple;authorization_model_id=$model}|ConvertTo-Json -Depth 6 -Compress
  if((Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/check" -Headers $fgaHeaders -ContentType 'application/json' -Body $checkBody -TimeoutSec 10).allowed-ne$true){throw 'gate7a-invitation-openfga-verification-failed'}

  $actions=@('VERIFY_EMAIL','UPDATE_PROFILE','UPDATE_PASSWORD')
  # The setup email does not redirect after required actions. A redirect must
  # exactly match a client allow-list entry, and the only approved entry is the
  # OIDC callback route, which is not a valid post-enrollment destination.
  $actionUri="$base/admin/realms/$realmName/users/$createdUserId/execute-actions-email?lifespan=600"
  Invoke-RestMethod -Method Put -Uri $actionUri -Headers $headers -ContentType 'application/json' -Body ($actions|ConvertTo-Json -Compress)|Out-Null
  Assert-ActiveRelease
  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-invitation/v1';passed=$true;principalId=$PrincipalId;
    role='adult-member';invitationSingleUse=$true;invitationMaximumMinutes=10;verifiedEmailRequired=$true;
    passwordSetByInvitee=$true;usernameSetByInvitee=$true;passkeyOptional=$true;chatOnlyRelationship=$true;
    ownerIdentityChanged=$false;protectedIdentityChanged=$true;protectedProductDataChanged=$false;
    legacyModified=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  $failure=$_.Exception.Message
  if($relationWritten){try{$deleteBody=@{deletes=@{tuple_keys=@($tuple)};authorization_model_id=$model}|ConvertTo-Json -Depth 7 -Compress;Invoke-RestMethod -Method Post -Uri "$($config.openfga.baseUrl)/stores/$store/write" -Headers $fgaHeaders -ContentType 'application/json' -Body $deleteBody -TimeoutSec 10|Out-Null}catch{}}
  if($principalWritten){try{Invoke-Psql "DELETE FROM gate5.principals WHERE principal_id='$PrincipalId'"|Out-Null}catch{}}
  if($createdUserId-and$token){try{Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName/users/$createdUserId" -Headers $headers|Out-Null}catch{}}
  throw "gate7a-ordinary-invitation-failed:$failure"
}finally{
  $Email=$null;Remove-Variable address,password,token,openfgaToken,dbPassword,headers,fgaHeaders,userBody,writeBody,deleteBody,profile,requiredProfile -ErrorAction SilentlyContinue
}
