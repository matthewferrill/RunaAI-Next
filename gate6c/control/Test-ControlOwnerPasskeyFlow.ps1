[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'passkey-flow-proof-context-invalid'
}
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://127.0.0.1:9762'
$realmName = 'runaai-next-gate6c-flow-proof'
$flowAlias = 'owner-passkey'
$password = $null
$token = $null
$created = $false

function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}

try {
  $password = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$password
    }).access_token
  $headers = @{ Authorization = "Bearer $token" }

  try {
    Invoke-RestMethod -Method Get -Uri "$base/admin/realms/$realmName" -Headers $headers | Out-Null
    throw 'disposable-passkey-flow-realm-already-exists'
  } catch {
    if ($_.Exception.Message -eq 'disposable-passkey-flow-realm-already-exists') { throw }
  }

  Invoke-RestMethod -Method Post -Uri "$base/admin/realms" -Headers $headers `
    -ContentType 'application/json' -Body (@{ realm=$realmName; enabled=$true } | ConvertTo-Json -Compress) | Out-Null
  $created = $true
  Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/authentication/flows" -Headers $headers `
    -ContentType 'application/json' -Body ([ordered]@{ alias=$flowAlias;
      description='Disposable Gate 6C owner passkey flow proof'; providerId='basic-flow';
      topLevel=$true; builtIn=$false } | ConvertTo-Json -Compress) | Out-Null
  $flows = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/authentication/flows" -Headers $headers))
  $flow = @($flows | Where-Object { $_.alias -eq $flowAlias })
  if ($flow.Count -ne 1) { throw 'disposable-passkey-flow-create-invalid' }

  Invoke-RestMethod -Method Post `
    -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions/execution" `
    -Headers $headers -ContentType 'application/json' `
    -Body (@{ provider='webauthn-authenticator-passwordless' } | ConvertTo-Json -Compress) | Out-Null
  $executions = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions" -Headers $headers))
  $execution = @($executions | Where-Object { $_.providerId -eq 'webauthn-authenticator-passwordless' })
  if ($execution.Count -ne 1) { throw 'disposable-passkey-execution-create-invalid' }
  Invoke-RestMethod -Method Put `
    -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions" `
    -Headers $headers -ContentType 'application/json' -Body ([ordered]@{
      id=$execution[0].id; requirement='REQUIRED'; priority=$execution[0].priority
    } | ConvertTo-Json -Compress) | Out-Null
  Invoke-RestMethod -Method Post `
    -Uri "$base/admin/realms/$realmName/authentication/executions/$($execution[0].id)/config" `
    -Headers $headers -ContentType 'application/json' -Body ([ordered]@{
      alias='owner-passkey-amr'; config=[ordered]@{
        'default.reference.value'='webauthn'; 'default.reference.maxAge'='300'
      }
    } | ConvertTo-Json -Depth 5 -Compress) | Out-Null

  Invoke-RestMethod -Method Post -Uri "$base/admin/realms/$realmName/clients" -Headers $headers `
    -ContentType 'application/json' -Body ([ordered]@{ clientId='proof-client'; enabled=$true;
      publicClient=$true; standardFlowEnabled=$true; redirectUris=@('http://localhost/proof')
    } | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/clients?clientId=proof-client" -Headers $headers))
  if ($clients.Count -ne 1) { throw 'disposable-passkey-client-create-invalid' }
  $client = $clients[0]
  $client | Add-Member -MemberType NoteProperty -Name authenticationFlowBindingOverrides `
    -Value @{ browser=$flow[0].id } -Force
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/$realmName/clients/$($client.id)" `
    -Headers $headers -ContentType 'application/json' `
    -Body ($client | ConvertTo-Json -Depth 50 -Compress) | Out-Null

  $verifiedExecutions = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/authentication/flows/$flowAlias/executions" -Headers $headers))
  $verifiedExecution = @($verifiedExecutions | Where-Object {
    $_.providerId -eq 'webauthn-authenticator-passwordless'
  })
  $verifiedClients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/clients?clientId=proof-client" -Headers $headers))
  if ($verifiedExecution.Count -ne 1 -or $verifiedExecution[0].requirement -ne 'REQUIRED' -or
      $verifiedClients.Count -ne 1 -or
      $verifiedClients[0].authenticationFlowBindingOverrides.browser -ne $flow[0].id) {
    throw 'disposable-passkey-flow-verification-failed'
  }
  $config = Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/$realmName/authentication/executions/$($verifiedExecution[0].id)/config/$($verifiedExecution[0].authenticationConfig)" `
    -Headers $headers
  if ($config.config.'default.reference.value' -ne 'webauthn' -or
      $config.config.'default.reference.maxAge' -ne '300') {
    throw 'disposable-passkey-amr-verification-failed'
  }

  [ordered]@{ schemaVersion='runa2-gate6c-disposable-passkey-flow-proof/v1'; passed=$true;
    passkeyOnly=$true; amrReference='webauthn'; maxAgeSeconds=300; clientOverride=$true;
    targetRealmModified=$false; protectedDataImported=$false; productionTrafficChanged=$false;
    privateValuesIncluded=$false } | ConvertTo-Json -Compress
} finally {
  if ($created) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/admin/realms/$realmName" -Headers $headers | Out-Null } catch {}
  }
  Remove-Variable password,token -ErrorAction SilentlyContinue
}
