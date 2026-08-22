[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [string]$ReleaseId = 'runaai-next-gate6c-shadow-2026-08-22-ff15c61',
  [string]$ExpectedCommit = 'ff15c618ecbcb5095f362c6055f4a485af3148e7',
  [string]$ExpectedArtifactDigest = 'fff3c379258efe4a2cabf2835c91897c4df528b4ab20b229e967d86a12354668',
  [string]$LegacyRepo = 'C:\AI\Projects\RunaAI',
  [string]$LegacyCommit = 'b4db04090d8f0df87234fab573b396e7824c5354'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'owner-authority-context-invalid' }
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
$releaseRoot = Join-Path $Root "releases\$ReleaseId"
$configPath = Join-Path $Root 'config\release.json'
$operatorPath = Join-Path $Root 'staging\gate6c-ff15c61\Advance-ControlRecoveryAuthority.mjs'
$bootstrapPath = Join-Path $Root 'secrets\owner-bootstrap-password.dpapi'
$base = 'http://127.0.0.1:9762'
$clientId = 'runaai-next'
$username = 'matthew-owner'

function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}
function Get-PropertyValue([object]$Object, [string]$Name) {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}
function Set-PropertyValue([object]$Object, [string]$Name, [object]$Value) {
  $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value -Force
}

foreach ($path in @($releaseRoot,$configPath,$operatorPath,$LegacyRepo)) { if (-not (Test-Path -LiteralPath $path)) { throw 'owner-required-path-missing' } }
if (Test-Path -LiteralPath $bootstrapPath) { throw 'owner-bootstrap-already-exists' }
$createdClientUuid = $null
$clientUuid = $null
$createdUserUuid = $null
$realmChanged = $false
$authorityCommitted = $false
$priorRealmJson = $null
$createdMapperIds = [Collections.Generic.List[string]]::new()
$bootstrapPassword = $null
$token = $null

try {
  $adminPassword = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$adminPassword
    }).access_token
  Remove-Variable adminPassword -ErrorAction SilentlyContinue
  $headers = @{ Authorization = "Bearer $token" }
  $realm = Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next" -Headers $headers
  $priorRealmJson = $realm | ConvertTo-Json -Depth 100 -Compress
  $actions = @(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/authentication/required-actions" -Headers $headers))
  $passwordlessAction = @($actions | Where-Object { (Get-PropertyValue $_ 'providerId') -eq 'webauthn-register-passwordless' })
  if ($passwordlessAction.Count -ne 1 -or (Get-PropertyValue $passwordlessAction[0] 'enabled') -ne $true) { throw 'passwordless-required-action-invalid' }
  $userCount = [int](Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users/count" -Headers $headers)
  if ($userCount -ne 0) { throw 'target-user-store-not-empty' }

  Set-PropertyValue $realm 'webAuthnPolicyPasswordlessRpEntityName' 'RunaAI Next'
  Set-PropertyValue $realm 'webAuthnPolicyPasswordlessResidentKey' 'required'
  Set-PropertyValue $realm 'webAuthnPolicyPasswordlessUserVerificationRequirement' 'required'
  Set-PropertyValue $realm 'webAuthnPolicyPasswordlessAvoidSameAuthenticatorRegister' $true
  Set-PropertyValue $realm 'webAuthnPolicyPasswordlessPasskeysEnabled' $true
  Set-PropertyValue $realm 'webAuthnPolicyPasswordlessMediation' 'required'
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next" -Headers $headers `
    -ContentType 'application/json' -Body ($realm | ConvertTo-Json -Depth 100 -Compress) | Out-Null
  $realmChanged = $true

  $allClients = @(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/clients?max=200" -Headers $headers))
  $clients = @($allClients | Where-Object { (Get-PropertyValue $_ 'clientId') -eq $clientId })
  if ($clients.Count -gt 1) { throw 'target-client-duplicate' }
  if ($clients.Count -eq 0) {
    $clientSecret = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-client')).Trim()
    $body = [ordered]@{ clientId=$clientId; name='RunaAI Next candidate'; enabled=$true; publicClient=$false;
      clientAuthenticatorType='client-secret'; secret=$clientSecret; serviceAccountsEnabled=$false;
      standardFlowEnabled=$true; directAccessGrantsEnabled=$false; fullScopeAllowed=$true;
      redirectUris=@('https://192.168.50.169:9761/*'); webOrigins=@('https://192.168.50.169:9761') }
    Invoke-RestMethod -Method Post -Uri "$base/admin/realms/runaai-next/clients" -Headers $headers `
      -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress) | Out-Null
    Remove-Variable clientSecret -ErrorAction SilentlyContinue
    $allClients = @(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/clients?max=200" -Headers $headers))
    $clients = @($allClients | Where-Object { (Get-PropertyValue $_ 'clientId') -eq $clientId })
    if ($clients.Count -ne 1) { throw 'target-client-create-failed' }
    $createdClientUuid = [string](Get-PropertyValue $clients[0] 'id')
  }
  $clientUuid = [string](Get-PropertyValue $clients[0] 'id')
  $mappers = @(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/clients/$clientUuid/protocol-mappers/models" -Headers $headers))
  foreach ($name in @('runaai-next-audience','runaai-next-amr')) { if (@($mappers | Where-Object { (Get-PropertyValue $_ 'name') -eq $name }).Count -ne 0) { throw 'target-mapper-already-exists' } }
  $mapperBodies = @(
    [ordered]@{ name='runaai-next-audience'; protocol='openid-connect'; protocolMapper='oidc-audience-mapper';
      config=[ordered]@{ 'included.client.audience'=$clientId; 'included.custom.audience'='';
        'id.token.claim'='false'; 'access.token.claim'='true'; 'lightweight.claim'='false'; 'introspection.token.claim'='true' } },
    [ordered]@{ name='runaai-next-amr'; protocol='openid-connect'; protocolMapper='oidc-amr-mapper';
      config=[ordered]@{ 'id.token.claim'='false'; 'access.token.claim'='true';
        'lightweight.claim'='false'; 'introspection.token.claim'='true' } }
  )
  foreach ($mapperBody in $mapperBodies) {
    Invoke-RestMethod -Method Post -Uri "$base/admin/realms/runaai-next/clients/$clientUuid/protocol-mappers/models" `
      -Headers $headers -ContentType 'application/json' -Body ($mapperBody | ConvertTo-Json -Depth 10 -Compress) | Out-Null
  }
  $mappers = @(Expand-Response (Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/clients/$clientUuid/protocol-mappers/models" -Headers $headers))
  foreach ($name in @('runaai-next-audience','runaai-next-amr')) {
    $matching = @($mappers | Where-Object { (Get-PropertyValue $_ 'name') -eq $name })
    if ($matching.Count -ne 1) { throw 'target-mapper-create-failed' }
    $createdMapperIds.Add([string](Get-PropertyValue $matching[0] 'id'))
  }

  $userResponse = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$base/admin/realms/runaai-next/users" `
    -Headers $headers -ContentType 'application/json' -Body (@{ username=$username; enabled=$true;
      emailVerified=$false; requiredActions=@() } | ConvertTo-Json -Depth 5 -Compress)
  $createdUserUuid = ([string]$userResponse.Headers.Location).TrimEnd('/').Split('/')[-1]
  if ($createdUserUuid -notmatch '^[a-f0-9-]{36}$') { throw 'target-user-id-invalid' }
  $random = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($random) } finally { $rng.Dispose() }
  $bootstrapPassword = 'Aa1!' + [Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_')
  [Array]::Clear($random,0,$random.Length)
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next/users/$createdUserUuid/reset-password" `
    -Headers $headers -ContentType 'application/json' -Body (@{ type='password'; value=$bootstrapPassword; temporary=$false } | ConvertTo-Json -Compress) | Out-Null
  $clearBytes = [Text.Encoding]::UTF8.GetBytes($bootstrapPassword)
  $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($clearBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Array]::Clear($clearBytes,0,$clearBytes.Length)
  [IO.File]::WriteAllText($bootstrapPath,[Convert]::ToBase64String($protectedBytes),(New-Object Text.UTF8Encoding($false)))
  [Array]::Clear($protectedBytes,0,$protectedBytes.Length)
  $bootstrapPassword = $null

  $env:RUNA_GATE6C_OWNER_SUBJECT = $createdUserUuid
  $operatorOutput = & node.exe $operatorPath --release-root $releaseRoot --config $configPath `
    --expected-release-id $ReleaseId --expected-commit $ExpectedCommit `
    --expected-artifact-digest $ExpectedArtifactDigest --legacy-repo $LegacyRepo --legacy-commit $LegacyCommit 2>&1
  $operatorExit = $LASTEXITCODE
  Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  $operatorText = ($operatorOutput | ForEach-Object { [string]$_ }) -join ''
  if ($operatorExit -ne 0) { throw "owner-authority-operator-failed:$operatorText" }
  $operatorResult = $operatorText | ConvertFrom-Json
  if ($operatorResult.passed -ne $true -or $operatorResult.ceremonyRevision -ne 1 -or $operatorResult.nextStep -ne 'enroll-primary-credential') { throw 'owner-authority-result-invalid' }
  $authorityCommitted = $true
  [ordered]@{ schemaVersion='runa2-gate6c-control-owner-preparation/v1'; passed=$true;
    targetRealm='runaai-next'; targetClient=$clientId; targetUser=$username; passkeysEnabled=$true;
    audienceMapper=$true; amrMapper=$true; bootstrapProtected=$true;
    ceremonyRevision=1; nextStep='enroll-primary-credential'; legacyModified=$false;
    protectedDataImported=$false; productionTrafficChanged=$false; privateValuesIncluded=$false } | ConvertTo-Json -Compress
} catch {
  if (-not $authorityCommitted -and $token) {
    $headers = @{ Authorization = "Bearer $token" }
    if ($createdUserUuid) { try { Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/runaai-next/users/$createdUserUuid" -Headers $headers | Out-Null } catch {} }
    if ($createdClientUuid) { try { Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/runaai-next/clients/$createdClientUuid" -Headers $headers | Out-Null } catch {} }
    elseif ($clientUuid) { foreach ($mapperId in $createdMapperIds) { try { Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/runaai-next/clients/$clientUuid/protocol-mappers/models/$mapperId" -Headers $headers | Out-Null } catch {} } }
    if ($realmChanged -and $priorRealmJson) { try { Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next" -Headers $headers -ContentType 'application/json' -Body $priorRealmJson | Out-Null } catch {} }
    if (Test-Path -LiteralPath $bootstrapPath) { Remove-Item -LiteralPath $bootstrapPath -Force }
  }
  throw
} finally {
  Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  Remove-Variable bootstrapPassword,token -ErrorAction SilentlyContinue
}
