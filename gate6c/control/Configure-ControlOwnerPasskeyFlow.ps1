[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or
    [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') {
  throw 'owner-passkey-flow-context-invalid'
}
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://127.0.0.1:9762'
$flowAlias = 'runaai-next-owner-passkey'
$clientId = 'runaai-next'
$username = 'matthew-owner'
$password = $null
$token = $null
$createdFlowId = $null
$clientChanged = $false
$priorClientJson = $null

function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}
function Assert-SafeCandidateState {
  $runtime = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  $readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  $ceremony = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/owner-ceremony/status' -TimeoutSec 10
  if ($runtime.running.releaseId -ne 'runaai-next-gate6c-resume-2026-08-22-ad4e686' -or
      $runtime.running.commit -ne 'ad4e686243726dea188b50751176a00e2338fd9e' -or
      $runtime.running.artifactDigest -ne '688f102b7d5e9014d73f41ee381ed7fe00d7d40d9f28fc1ae938ca70cd9cabf6' -or
      $readiness.authority -ne 'shadow' -or $readiness.protectedDataImported -ne $false -or
      $readiness.productionTrafficChanged -ne $false -or $ceremony.revision -ne 1 -or
      $ceremony.nextStep -ne 'enroll-primary-credential') {
    throw 'candidate-owner-passkey-flow-safety-state-drift'
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

  $users = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/users?username=$username&exact=true" -Headers $headers))
  if ($users.Count -ne 1 -or $users[0].enabled -ne $true) { throw 'owner-passkey-flow-user-mismatch' }
  $credentials = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/users/$($users[0].id)/credentials" -Headers $headers))
  if (@($credentials | Where-Object { $_.type -eq 'password' }).Count -ne 1 -or
      @($credentials | Where-Object { $_.type -eq 'webauthn-passwordless' }).Count -ne 1) {
    throw 'owner-passkey-flow-credential-state-mismatch'
  }
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients?clientId=$clientId" -Headers $headers))
  if ($clients.Count -ne 1) { throw 'owner-passkey-flow-client-mismatch' }
  $client = $clients[0]
  $priorClientJson = $client | ConvertTo-Json -Depth 100 -Compress
  if ($null -ne $client.authenticationFlowBindingOverrides -and
      @($client.authenticationFlowBindingOverrides.PSObject.Properties).Count -ne 0) {
    throw 'owner-passkey-flow-client-already-overridden'
  }
  $flows = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows" -Headers $headers))
  if (@($flows | Where-Object { $_.alias -eq $flowAlias }).Count -ne 0) {
    throw 'owner-passkey-flow-already-exists'
  }

  Invoke-RestMethod -Method Post -Uri "$base/admin/realms/runaai-next/authentication/flows" `
    -Headers $headers -ContentType 'application/json' -Body ([ordered]@{ alias=$flowAlias;
      description='RunaAI Next target-owner user-verified passkey-only browser flow';
      providerId='basic-flow'; topLevel=$true; builtIn=$false } | ConvertTo-Json -Compress) | Out-Null
  $flows = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows" -Headers $headers))
  $flow = @($flows | Where-Object { $_.alias -eq $flowAlias })
  if ($flow.Count -ne 1) { throw 'owner-passkey-flow-create-invalid' }
  $createdFlowId = [string]$flow[0].id
  Invoke-RestMethod -Method Post `
    -Uri "$base/admin/realms/runaai-next/authentication/flows/$flowAlias/executions/execution" `
    -Headers $headers -ContentType 'application/json' `
    -Body (@{ provider='webauthn-authenticator-passwordless' } | ConvertTo-Json -Compress) | Out-Null
  $executions = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows/$flowAlias/executions" -Headers $headers))
  $execution = @($executions | Where-Object { $_.providerId -eq 'webauthn-authenticator-passwordless' })
  if ($execution.Count -ne 1) { throw 'owner-passkey-execution-create-invalid' }
  Invoke-RestMethod -Method Put `
    -Uri "$base/admin/realms/runaai-next/authentication/flows/$flowAlias/executions" `
    -Headers $headers -ContentType 'application/json' -Body ([ordered]@{
      id=$execution[0].id; requirement='REQUIRED'; priority=$execution[0].priority
    } | ConvertTo-Json -Compress) | Out-Null
  Invoke-RestMethod -Method Post `
    -Uri "$base/admin/realms/runaai-next/authentication/executions/$($execution[0].id)/config" `
    -Headers $headers -ContentType 'application/json' -Body ([ordered]@{
      alias='runaai-next-owner-passkey-amr'; config=[ordered]@{
        'default.reference.value'='webauthn'; 'default.reference.maxAge'='300'
      }
    } | ConvertTo-Json -Depth 5 -Compress) | Out-Null

  $client | Add-Member -MemberType NoteProperty -Name authenticationFlowBindingOverrides `
    -Value @{ browser=$createdFlowId } -Force
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next/clients/$($client.id)" `
    -Headers $headers -ContentType 'application/json' `
    -Body ($client | ConvertTo-Json -Depth 100 -Compress) | Out-Null
  $clientChanged = $true

  $verifiedExecutions = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/flows/$flowAlias/executions" -Headers $headers))
  $verifiedExecution = @($verifiedExecutions | Where-Object {
    $_.providerId -eq 'webauthn-authenticator-passwordless'
  })
  $verifiedClients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/clients?clientId=$clientId" -Headers $headers))
  if ($verifiedExecution.Count -ne 1 -or $verifiedExecution[0].requirement -ne 'REQUIRED' -or
      $verifiedClients.Count -ne 1 -or
      $verifiedClients[0].authenticationFlowBindingOverrides.browser -ne $createdFlowId) {
    throw 'owner-passkey-flow-verification-failed'
  }
  $config = Invoke-RestMethod -Method Get `
    -Uri "$base/admin/realms/runaai-next/authentication/executions/$($verifiedExecution[0].id)/config/$($verifiedExecution[0].authenticationConfig)" `
    -Headers $headers
  if ($config.config.'default.reference.value' -ne 'webauthn' -or
      $config.config.'default.reference.maxAge' -ne '300') {
    throw 'owner-passkey-flow-amr-verification-failed'
  }
  Assert-SafeCandidateState

  [ordered]@{ schemaVersion='runa2-gate6c-control-owner-passkey-flow/v1'; passed=$true;
    targetClient=$clientId; targetUser=$username; passkeyOnly=$true; userVerificationRequired=$true;
    amrReference='webauthn'; maxAgeSeconds=300; ceremonyRevision=1;
    nextStep='enroll-primary-credential'; legacyModified=$false; protectedDataImported=$false;
    productionTrafficChanged=$false; rollbackAvailable=$true; privateValuesIncluded=$false
  } | ConvertTo-Json -Compress
} catch {
  $failure = $_.Exception.Message
  if ($token -and $priorClientJson -and $clientChanged) {
    try {
      $priorClient = $priorClientJson | ConvertFrom-Json
      Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next/clients/$($priorClient.id)" `
        -Headers $headers -ContentType 'application/json' -Body $priorClientJson | Out-Null
    } catch {}
  }
  if ($token -and $createdFlowId) {
    try { Invoke-RestMethod -Method Delete `
      -Uri "$base/admin/realms/runaai-next/authentication/flows/$createdFlowId" -Headers $headers | Out-Null } catch {}
  }
  throw "owner-passkey-flow-configure-failed:$failure"
} finally {
  Remove-Variable password,token,priorClientJson -ErrorAction SilentlyContinue
}
