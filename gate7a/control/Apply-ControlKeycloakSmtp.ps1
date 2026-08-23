[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ExpectedReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [string]$Root='C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='http://127.0.0.1:9762';$realmName='runaai-next';$password=$null;$token=$null;$smtp=$null
$priorRealmJson=$null;$realmChanged=$false;$clearBytes=$null
if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7a-smtp-apply-context-invalid'
}
if([IO.Path]::GetFullPath($Root)-ne'C:\AI\RunaAI-Next-Candidate'-or
  $ExpectedReleaseId-notmatch'^[A-Za-z0-9._-]{1,100}$'-or$ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or
  $ExpectedArtifactDigest-notmatch'^[a-f0-9]{64}$'){throw 'gate7a-smtp-apply-pin-invalid'}
try{Add-Type -AssemblyName System.Security}catch{throw 'gate7a-smtp-apply-assembly-load-failed'}

function Assert-ActiveRelease {
  $runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  $readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  if($runtime.running.releaseId-ne$ExpectedReleaseId-or$runtime.running.commit-ne$ExpectedCommit-or
    $runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or$runtime.cutover.phase-ne'closed'-or
    $readiness.authority-ne'active'-or$readiness.protectedDataImported-ne$true-or
    $readiness.productionTrafficChanged-ne$true){throw 'gate7a-smtp-apply-safety-state-drift'}
}
function Safe-Smtp([object]$Value){
  $names=@('host','port','from','fromDisplayName','replyTo','replyToDisplayName','auth','user','password','starttls','ssl')
  if(@($Value.PSObject.Properties.Name|Where-Object{$_-notin$names}).Count-ne 0-or
    @($names|Where-Object{-not($Value.PSObject.Properties.Name-contains$_)}).Count-ne 0-or
    $Value.host-notmatch'^[A-Za-z0-9.-]{1,253}$'-or[uint16]$Value.port-lt 1-or
    $Value.auth-ne'true'-or$Value.starttls-notin@('true','false')-or$Value.ssl-notin@('true','false')-or
    [string]::IsNullOrWhiteSpace($Value.password)){throw 'gate7a-smtp-credential-invalid'}
  [ordered]@{host=[string]$Value.host;port=[string]$Value.port;from=[string]$Value.from;
    fromDisplayName=[string]$Value.fromDisplayName;replyTo=[string]$Value.replyTo;
    replyToDisplayName=[string]$Value.replyToDisplayName;auth='true';user=[string]$Value.user;
    password=[string]$Value.password;starttls=[string]$Value.starttls;ssl=[string]$Value.ssl}
}

try{
  Assert-ActiveRelease
  $credentialPath=Join-Path $Root 'secrets\keycloak-smtp.dpapi'
  if(-not(Test-Path -LiteralPath $credentialPath -PathType Leaf)){throw 'gate7a-smtp-credential-missing'}
  $protected=[IO.File]::ReadAllBytes($credentialPath)
  $clearBytes=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $smtp=Safe-Smtp ([Text.Encoding]::UTF8.GetString($clearBytes)|ConvertFrom-Json)
  $password=[IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{
    grant_type='password';client_id='admin-cli';username='candidate-bootstrap';password=$password}).access_token
  $headers=@{Authorization="Bearer $token"}
  $realm=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  $priorRealmJson=$realm|ConvertTo-Json -Depth 100 -Compress
  if($null-ne$realm.smtpServer-and@($realm.smtpServer.PSObject.Properties).Count-ne 0){throw 'gate7a-smtp-already-configured'}
  $realm.smtpServer=$smtp
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName" -Headers $headers -ContentType 'application/json' -Body ($realm|ConvertTo-Json -Depth 100 -Compress)|Out-Null
  $realmChanged=$true
  $verified=Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers
  foreach($name in @('host','port','from','fromDisplayName','replyTo','replyToDisplayName','auth','user','starttls','ssl')){
    if([string]$verified.smtpServer.$name-ne[string]$smtp.$name){throw 'gate7a-smtp-verification-failed'}
  }
  if([string]::IsNullOrWhiteSpace([string]$verified.smtpServer.password)){throw 'gate7a-smtp-verification-failed'}
  Assert-ActiveRelease
  [ordered]@{schemaVersion='runa2-gate7a-control-smtp-apply/v1';passed=$true;smtpConfigured=$true;
    connectionTested=$false;invitationDeliveryRequiredForAcceptance=$true;credentialRemainsDpapiCurrentUser=$true;
    ownerIdentityChanged=$false;protectedProductDataChanged=$false;legacyModified=$false;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  $failure=$_.Exception.Message
  if($realmChanged-and$token-and$priorRealmJson){try{Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName" -Headers $headers -ContentType 'application/json' -Body $priorRealmJson|Out-Null}catch{throw 'gate7a-smtp-rollback-failed'}}
  throw "gate7a-smtp-apply-failed:$failure"
}finally{
  if($clearBytes){[Array]::Clear($clearBytes,0,$clearBytes.Length)};$smtp=$null
  Remove-Variable password,token,smtp,protected,clearBytes,headers,realm,verified -ErrorAction SilentlyContinue
}
