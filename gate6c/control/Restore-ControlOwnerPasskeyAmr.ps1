[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'owner-passkey-amr-rollback-context-invalid'
}
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://127.0.0.1:9762'
$password = $null
$token = $null
function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}

try {
  $readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  $ceremony = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
  if ($readiness.authority -ne 'shadow' -or $readiness.protectedDataImported -ne $false -or
      $readiness.productionTrafficChanged -ne $false -or $ceremony.revision -ne 1 -or
      $ceremony.nextStep -ne 'enroll-primary-credential') {
    throw 'owner-passkey-amr-rollback-safety-state-drift'
  }
  $password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$password
    }).access_token
  $headers = @{ Authorization = "Bearer $token" }
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients?clientId=runaai-next" -Headers $headers))
  if ($clients.Count -ne 1) { throw 'owner-passkey-amr-rollback-client-mismatch' }
  $client = $clients[0]
  $mappers = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" -Headers $headers))
  $replacement = @($mappers | Where-Object {
    $_.name -eq 'runaai-next-amr' -and $_.protocolMapper -eq 'oidc-hardcoded-claim-mapper' -and
    $_.config.'claim.name' -eq 'amr' -and $_.config.'claim.value' -eq '["webauthn"]'
  })
  if ($replacement.Count -ne 1 -or
      @($mappers | Where-Object { $_.protocolMapper -eq 'oidc-amr-mapper' }).Count -ne 0) {
    throw 'owner-passkey-amr-rollback-mapper-mismatch'
  }
  Invoke-RestMethod -Method Delete `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models/$($replacement[0].id)" `
    -Headers $headers | Out-Null
  $prior = [ordered]@{ name='runaai-next-amr'; protocol='openid-connect';
    protocolMapper='oidc-amr-mapper'; config=[ordered]@{
      'id.token.claim'='false'; 'access.token.claim'='true'; 'userinfo.token.claim'='false';
      'introspection.token.claim'='true'; 'lightweight.claim'='false'
    }
  }
  Invoke-RestMethod -Method Post `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" `
    -Headers $headers -ContentType 'application/json' `
    -Body ($prior | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  $verified = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients/$($client.id)/protocol-mappers/models" -Headers $headers))
  if (@($verified | Where-Object { $_.name -eq 'runaai-next-amr' -and
    $_.protocolMapper -eq 'oidc-amr-mapper' }).Count -ne 1) {
    throw 'owner-passkey-amr-rollback-verification-failed'
  }
  [ordered]@{ schemaVersion='runa2-gate6c-control-owner-passkey-amr-rollback/v1'; rolledBack=$true;
    ownerCredentialRetained=$true; passkeyFlowRetained=$true; ceremonyRevision=1;
    nextStep='enroll-primary-credential'; legacyModified=$false; protectedDataImported=$false;
    productionTrafficChanged=$false; privateValuesIncluded=$false } | ConvertTo-Json -Compress
} finally {
  Remove-Variable password,token -ErrorAction SilentlyContinue
}
