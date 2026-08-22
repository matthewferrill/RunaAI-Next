[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'owner-passkey-amr-context-invalid'
}
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://127.0.0.1:9762'
$clientId = 'runaai-next'
$flowAlias = 'runaai-next-owner-passkey'
$password = $null
$token = $null
$priorMapperJson = $null
$priorMapperRemoved = $false
$replacementMapperId = $null

function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}
function Assert-SafeCandidateState {
  $readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  $ceremony = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
  if ($readiness.authority -ne 'shadow' -or $readiness.protectedDataImported -ne $false -or
      $readiness.productionTrafficChanged -ne $false -or $ceremony.revision -ne 1 -or
      $ceremony.nextStep -ne 'enroll-primary-credential') {
    throw 'owner-passkey-amr-safety-state-drift'
  }
}

try {
  Assert-SafeCandidateState
  $password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$password
    }).access_token
  $headers = @{ Authorization = "Bearer $token" }
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients?clientId=$clientId" -Headers $headers))
  if ($clients.Count -ne 1) { throw 'owner-passkey-amr-client-mismatch' }
  $client = $clients[0]
  if ($client.standardFlowEnabled -ne $true -or $client.directAccessGrantsEnabled -ne $false -or
      $client.implicitFlowEnabled -ne $false -or $client.serviceAccountsEnabled -ne $false) {
    throw 'owner-passkey-amr-grant-boundary-invalid'
  }
  $flows = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows" -Headers $headers))
  $flow = @($flows | Where-Object { $_.alias -eq $flowAlias })
  if ($flow.Count -ne 1 -or $client.authenticationFlowBindingOverrides.browser -ne $flow[0].id) {
    throw 'owner-passkey-amr-flow-binding-invalid'
  }
  $executions = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows/$flowAlias/executions" -Headers $headers))
  $passkey = @($executions | Where-Object {
    $_.providerId -eq 'webauthn-authenticator-passwordless' -and $_.requirement -eq 'REQUIRED'
  })
  if ($executions.Count -ne 1 -or $passkey.Count -ne 1) { throw 'owner-passkey-amr-flow-not-exclusive' }

  $mappers = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" -Headers $headers))
  $audience = @($mappers | Where-Object {
    $_.name -eq 'runaai-next-audience' -and $_.protocolMapper -eq 'oidc-audience-mapper' -and
    $_.config.'included.client.audience' -eq $clientId -and $_.config.'access.token.claim' -eq 'true' -and
    $_.config.'introspection.token.claim' -eq 'true'
  })
  $priorMapper = @($mappers | Where-Object {
    $_.name -eq 'runaai-next-amr' -and $_.protocolMapper -eq 'oidc-amr-mapper'
  })
  if ($audience.Count -ne 1 -or $priorMapper.Count -ne 1 -or
      @($mappers | Where-Object { $_.protocolMapper -eq 'oidc-hardcoded-claim-mapper' -and
        $_.config.'claim.name' -eq 'amr' }).Count -ne 0) {
    throw 'owner-passkey-amr-mapper-state-invalid'
  }
  $priorMapperJson = $priorMapper[0] | ConvertTo-Json -Depth 20 -Compress
  Invoke-RestMethod -Method Delete `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models/$($priorMapper[0].id)" `
    -Headers $headers | Out-Null
  $priorMapperRemoved = $true
  $replacement = [ordered]@{ name='runaai-next-amr'; protocol='openid-connect';
    protocolMapper='oidc-hardcoded-claim-mapper'; config=[ordered]@{
      'claim.name'='amr'; 'claim.value'='["webauthn"]'; 'jsonType.label'='JSON';
      'id.token.claim'='false'; 'access.token.claim'='true'; 'userinfo.token.claim'='false';
      'introspection.token.claim'='true'; 'lightweight.claim'='false'
    }
  }
  Invoke-RestMethod -Method Post `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" `
    -Headers $headers -ContentType 'application/json' `
    -Body ($replacement | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  $mappers = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" -Headers $headers))
  $verified = @($mappers | Where-Object {
    $_.name -eq 'runaai-next-amr' -and $_.protocolMapper -eq 'oidc-hardcoded-claim-mapper' -and
    $_.config.'claim.name' -eq 'amr' -and $_.config.'claim.value' -eq '["webauthn"]' -and
    $_.config.'jsonType.label' -eq 'JSON' -and $_.config.'access.token.claim' -eq 'true' -and
    $_.config.'introspection.token.claim' -eq 'true'
  })
  if ($verified.Count -ne 1) { throw 'owner-passkey-amr-replacement-invalid' }
  $replacementMapperId = [string]$verified[0].id
  Assert-SafeCandidateState
  [ordered]@{ schemaVersion='runa2-gate6c-control-owner-passkey-amr/v1'; passed=$true;
    targetClient=$clientId; passkeyOnlyFlowBound=$true; alternateGrantsDisabled=$true;
    audienceBound=$true; introspectionAmr='webauthn'; ceremonyRevision=1;
    nextStep='enroll-primary-credential'; rollbackAvailable=$true; legacyModified=$false;
    protectedDataImported=$false; productionTrafficChanged=$false; privateValuesIncluded=$false
  } | ConvertTo-Json -Compress
} catch {
  $failure = $_.Exception.Message
  if ($token -and $replacementMapperId) {
    try { Invoke-RestMethod -Method Delete `
      -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models/$replacementMapperId" `
      -Headers $headers | Out-Null } catch {}
  }
  if ($token -and $priorMapperRemoved -and $priorMapperJson) {
    try { Invoke-RestMethod -Method Post `
      -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" `
      -Headers $headers -ContentType 'application/json' -Body $priorMapperJson | Out-Null } catch {}
  }
  throw "owner-passkey-amr-configure-failed:$failure"
} finally {
  Remove-Variable password,token,priorMapperJson -ErrorAction SilentlyContinue
}
