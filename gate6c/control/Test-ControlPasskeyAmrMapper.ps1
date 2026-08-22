[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'passkey-amr-proof-context-invalid'
}
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://127.0.0.1:9762'
$realmName = 'runaai-next-gate6c-amr-proof'
$clientId = 'amr-proof'
$clientSecret = 'DisposableGate6cAmrProofOnly'
$password = $null
$adminToken = $null
$created = $false

function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}

try {
  $password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $adminToken = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$password
    }).access_token
  $headers = @{ Authorization = "Bearer $adminToken" }
  try {
    Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers | Out-Null
    throw 'disposable-passkey-amr-realm-already-exists'
  } catch {
    if ($_.Exception.Message -eq 'disposable-passkey-amr-realm-already-exists') { throw }
  }

  Invoke-RestMethod -Method Post -Uri "$base/admin/realms" -Headers $headers `
    -ContentType 'application/json' -Body (@{ realm=$realmName; enabled=$true } | ConvertTo-Json -Compress) | Out-Null
  $created = $true
  $clientBody = [ordered]@{ clientId=$clientId; enabled=$true; publicClient=$false;
    clientAuthenticatorType='client-secret'; secret=$clientSecret; standardFlowEnabled=$false;
    directAccessGrantsEnabled=$false; implicitFlowEnabled=$false; serviceAccountsEnabled=$true }
  Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/clients" -Headers $headers `
    -ContentType 'application/json' -Body ($clientBody | ConvertTo-Json -Compress) | Out-Null
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/clients?clientId=$clientId" -Headers $headers))
  if ($clients.Count -ne 1) { throw 'disposable-passkey-amr-client-invalid' }

  $mappers = @(
    [ordered]@{ name='hardcoded-passkey-amr'; protocol='openid-connect';
      protocolMapper='oidc-hardcoded-claim-mapper'; config=[ordered]@{
        'claim.name'='amr'; 'claim.value'='["webauthn"]'; 'jsonType.label'='JSON';
        'id.token.claim'='false'; 'access.token.claim'='true'; 'userinfo.token.claim'='false';
        'introspection.token.claim'='true'; 'lightweight.claim'='false'
      }
    },
    [ordered]@{ name='proof-audience'; protocol='openid-connect';
      protocolMapper='oidc-audience-mapper'; config=[ordered]@{
        'included.client.audience'=$clientId; 'included.custom.audience'='';
        'id.token.claim'='false'; 'access.token.claim'='true';
        'introspection.token.claim'='true'; 'lightweight.claim'='false'
      }
    }
  )
  foreach ($mapper in $mappers) {
    Invoke-RestMethod -Method Post `
      -Uri "$base/admin/realms/$realmName/clients/$($clients[0].id)/protocol-mappers/models" `
      -Headers $headers -ContentType 'application/json' `
      -Body ($mapper | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  }
  $issued = (Invoke-RestMethod -Method Post `
    -Uri "$base/realms/$realmName/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='client_credentials'; client_id=$clientId; client_secret=$clientSecret
    }).access_token
  $inspected = Invoke-RestMethod -Method Post `
    -Uri "$base/realms/$realmName/protocol/openid-connect/token/introspect" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      token=$issued; client_id=$clientId; client_secret=$clientSecret
    }
  $methods = @($inspected.amr)
  $audience = @($inspected.aud)
  if ($inspected.active -ne $true -or $methods.Count -ne 1 -or $methods[0] -ne 'webauthn' -or
      $audience -notcontains $clientId) { throw 'disposable-passkey-amr-introspection-invalid' }

  [ordered]@{ schemaVersion='runa2-gate6c-passkey-amr-proof/v1'; passed=$true;
    active=$true; amr=@('webauthn'); audiencePresent=$true; targetRealmModified=$false;
    protectedDataImported=$false; productionTrafficChanged=$false; privateValuesIncluded=$false
  } | ConvertTo-Json -Compress
} finally {
  if ($created) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName" -Headers $headers | Out-Null } catch {}
  }
  Remove-Variable password,adminToken,clientSecret,issued -ErrorAction SilentlyContinue
}
