[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'owner-passkey-flow-rollback-context-invalid'
}
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://127.0.0.1:9762'
$flowAlias = 'runaai-next-owner-passkey'
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
    throw 'owner-passkey-flow-rollback-safety-state-drift'
  }
  $password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$password
    }).access_token
  $headers = @{ Authorization = "Bearer $token" }
  $flows = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows" -Headers $headers))
  $flow = @($flows | Where-Object { $_.alias -eq $flowAlias })
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients?clientId=runaai-next" -Headers $headers))
  if ($flow.Count -ne 1 -or $clients.Count -ne 1 -or
      $clients[0].authenticationFlowBindingOverrides.browser -ne $flow[0].id) {
    throw 'owner-passkey-flow-rollback-binding-mismatch'
  }
  $client = $clients[0]
  $client | Add-Member -MemberType NoteProperty -Name authenticationFlowBindingOverrides -Value @{} -Force
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next/clients/$($client.id)" `
    -Headers $headers -ContentType 'application/json' `
    -Body ($client | ConvertTo-Json -Depth 100 -Compress) | Out-Null
  Invoke-RestMethod -Method Delete `
    -Uri "$base/admin/realms/runaai-next/authentication/flows/$($flow[0].id)" -Headers $headers | Out-Null

  $remainingFlows = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows" -Headers $headers))
  $verifiedClients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients?clientId=runaai-next" -Headers $headers))
  if (@($remainingFlows | Where-Object { $_.alias -eq $flowAlias }).Count -ne 0 -or
      $verifiedClients.Count -ne 1 -or
      @($verifiedClients[0].authenticationFlowBindingOverrides.PSObject.Properties).Count -ne 0) {
    throw 'owner-passkey-flow-rollback-verification-failed'
  }
  [ordered]@{ schemaVersion='runa2-gate6c-control-owner-passkey-flow-rollback/v1'; rolledBack=$true;
    ownerCredentialRetained=$true; ceremonyRevision=1; nextStep='enroll-primary-credential';
    legacyModified=$false; protectedDataImported=$false; productionTrafficChanged=$false;
    privateValuesIncluded=$false } | ConvertTo-Json -Compress
} finally {
  Remove-Variable password,token -ErrorAction SilentlyContinue
}
