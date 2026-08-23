[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$AttemptId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][int]$ExpectedArtifactFileCount,
  [Parameter(Mandatory)][string]$ArchiveSha256,
  [Parameter(Mandatory)][string]$ConfigSha256,
  [Parameter(Mandatory)][string]$ManifestSha256,
  [Parameter(Mandatory)][string]$CaddyfileSha256,
  [Parameter(Mandatory)][string]$ApplicationLauncherSha256,
  [Parameter(Mandatory)][string]$KeycloakLauncherSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$domain = 'bridgebuildersai.com'
$recordName = 'runa'
$canonicalHost = 'runa.bridgebuildersai.com'
$canonicalOrigin = 'https://runa.bridgebuildersai.com'
$browserIssuer = 'https://runa.bridgebuildersai.com/auth/realms/runaai-next'
$backchannelIssuer = 'http://127.0.0.1:9762/realms/runaai-next'
$privateAddress = '192.168.50.169'
$taskPath = '\RunaAI-Next\'
$firewallName = 'RunaAI Next Canonical HTTPS'
$priorReleaseId = 'runaai-next-gate6d-promotion-2026-08-22-a886754'
$priorCommit = 'a8867543f914cabd997f161950016723355138d2'
$priorArtifactDigest = '2e1f909941f3021530c83c3d288953f0d3144b8603eb006f8502b32022905235'
$priorRuntimeManifestDigest = '93f2c9b3ddecec5f552308f973abd10005b9abd47e822baed7dc1427c8fc7b3b'
$apiBase = 'https://api.porkbun.com/api/json/v3'

$apiKey = $null
$secretKey = $null
$credentialBytes = $null
$adminPassword = $null
$adminToken = $null
$headers = $null
$dnsHeaders = $null
$dnsRecordId = $null
$dnsCreated = $false
$firewallCreated = $false
$identityChanged = $false
$filesChanged = $false
$frontendsStopped = $false
$releaseCreated = $false
$releaseRoot = $null
$rollbackRoot = $null
$failureStage = 'initialization'

function Clear-Bytes([byte[]]$Value) {
  if ($null -ne $Value) { [Array]::Clear($Value, 0, $Value.Length) }
}

function Hash([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw 'gate7a-activation-staged-file-missing'
  }
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Expand-Response([object]$Response) {
  foreach ($item in @($Response)) {
    if ($item -is [Array]) { foreach ($nested in $item) { $nested } } else { $item }
  }
}

function Wait-PortClosed([int]$Port, [int]$Seconds = 90) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Milliseconds 500
  } until ([DateTime]::UtcNow -gt $deadline)
  throw "gate7a-activation-port-close-timeout-$Port"
}

function Wait-Port([int]$Port, [int]$Minutes = 4) {
  $deadline = [DateTime]::UtcNow.AddMinutes($Minutes)
  do {
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { return }
    Start-Sleep -Seconds 1
  } until ([DateTime]::UtcNow -gt $deadline)
  throw "gate7a-activation-port-start-timeout-$Port"
}

function Wait-Json([string]$Uri, [scriptblock]$Accept, [int]$Minutes = 8) {
  $deadline = [DateTime]::UtcNow.AddMinutes($Minutes)
  do {
    try {
      $value = Invoke-RestMethod -Uri $Uri -TimeoutSec 5
      if (& $Accept $value) { return $value }
    } catch {}
    Start-Sleep -Seconds 2
  } until ([DateTime]::UtcNow -gt $deadline)
  throw 'gate7a-activation-health-timeout'
}

function Invoke-NoRedirect([string]$Uri) {
  $request = [Net.HttpWebRequest]::Create($Uri)
  $request.Method = 'GET'
  $request.AllowAutoRedirect = $false
  $request.Timeout = 15000
  try {
    $response = $request.GetResponse()
  } catch [Net.WebException] {
    if ($null -eq $_.Exception.Response) { throw }
    $response = $_.Exception.Response
  }
  try {
    [ordered]@{
      statusCode = [int]$response.StatusCode
      location = [string]$response.Headers['Location']
    }
  } finally {
    $response.Dispose()
  }
}

function Get-KeycloakAdminHeaders {
  $script:adminPassword = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $script:adminToken = (Invoke-RestMethod -Method Post `
    -Uri 'http://127.0.0.1:9762/realms/master/protocol/openid-connect/token' `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{ grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap';
      password=$script:adminPassword }).access_token
  if (-not $script:adminToken) { throw 'gate7a-activation-keycloak-admin-token-invalid' }
  $script:headers = @{ Authorization = "Bearer $script:adminToken" }
}

function Restore-Predecessor {
  $rollbackErrors = [Collections.Generic.List[string]]::new()
  try {
    foreach ($name in @('Application','Caddy','Keycloak')) {
      Stop-ScheduledTask -TaskPath $taskPath -TaskName $name -ErrorAction SilentlyContinue
    }
    foreach ($port in @(9760,9761,9762,9770,443)) {
      try { Wait-PortClosed $port 90 } catch {
        if ($port -ne 443) { throw }
      }
    }
    if (Test-Path -LiteralPath $nextManifestPath -PathType Leaf) {
      $failedManifestPath = Join-Path $rollbackRoot 'failed-successor-manifest.json'
      if (Test-Path -LiteralPath $failedManifestPath) {
        throw 'failed-successor-manifest-already-retained'
      }
      Move-Item -LiteralPath $nextManifestPath -Destination $failedManifestPath
    }
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'candidate.json') -Destination $configPath -Force
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'release-manifest.json') -Destination $priorManifestPath -Force
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'Caddyfile') -Destination $caddyPath -Force
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'Run-Application.ps1') -Destination $applicationLauncher -Force
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'Run-Keycloak.ps1') -Destination $keycloakLauncher -Force
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Keycloak'
    Wait-Json 'http://127.0.0.1:9762/realms/runaai-next/.well-known/openid-configuration' {
      param($value) $value.issuer -eq 'http://localhost:9762/realms/runaai-next'
    } 5 | Out-Null
  } catch { $rollbackErrors.Add('launcher-restore') }
  try {
    if ($identityChanged) {
      Get-KeycloakAdminHeaders
      $savedRealm = [IO.File]::ReadAllText((Join-Path $rollbackRoot 'keycloak-realm.json'))
      $savedClient = [IO.File]::ReadAllText((Join-Path $rollbackRoot 'keycloak-client.json'))
      $realmObject = $savedRealm | ConvertFrom-Json
      $clientObject = $savedClient | ConvertFrom-Json
      Invoke-RestMethod -Method Put -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next' `
        -Headers $headers -ContentType 'application/json' -Body $savedRealm | Out-Null
      Invoke-RestMethod -Method Put `
        -Uri "http://127.0.0.1:9762/admin/realms/runaai-next/clients/$($clientObject.id)" `
        -Headers $headers -ContentType 'application/json' -Body $savedClient | Out-Null
      $restoredRealm = Invoke-RestMethod -Method Get `
        -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next' -Headers $headers
      $restoredClients = @(Expand-Response (Invoke-RestMethod -Method Get `
        -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next/clients?clientId=runaai-next' `
        -Headers $headers))
      if ($restoredRealm.webAuthnPolicyRpId -ne $realmObject.webAuthnPolicyRpId -or
          $restoredRealm.webAuthnPolicyPasswordlessRpId -ne
            $realmObject.webAuthnPolicyPasswordlessRpId -or
          $restoredClients.Count -ne 1 -or
          (($restoredClients[0].redirectUris | ConvertTo-Json -Compress) -ne
            ($clientObject.redirectUris | ConvertTo-Json -Compress)) -or
          (($restoredClients[0].webOrigins | ConvertTo-Json -Compress) -ne
            ($clientObject.webOrigins | ConvertTo-Json -Compress))) {
        throw 'identity-restore-reconciliation-failed'
      }
    }
  } catch { $rollbackErrors.Add('identity') }
  try {
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Caddy'
    Wait-Port 9761 3
    Wait-Port 9770 3
    Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
    $restored = Wait-Json 'http://127.0.0.1:9760/api/runtime/status' {
      param($value) $value.running.releaseId -eq $priorReleaseId
    } 10
    $legacyRequest = Invoke-NoRedirect 'https://192.168.50.169:9761/health/live'
    if ($legacyRequest.statusCode -ne 200) { throw 'predecessor-route-invalid' }
  } catch { $rollbackErrors.Add('route-restore') }
  try {
    if ($firewallCreated) {
      Remove-NetFirewallRule -DisplayName $firewallName -ErrorAction Stop
    }
  } catch { $rollbackErrors.Add('firewall') }
  try {
    if ($dnsCreated) {
      if (-not $dnsRecordId) {
        $rollbackRecords = Invoke-RestMethod -Method Get `
          -Uri "$apiBase/dns/retrieve/$domain" -Headers $dnsHeaders
        $rollbackMatch = @($rollbackRecords.records | Where-Object {
          $_.type -eq 'A' -and $_.name -in @($recordName,$canonicalHost) -and
          $_.content -eq $privateAddress
        })
        if ($rollbackRecords.status -ne 'SUCCESS' -or $rollbackMatch.Count -ne 1) {
          throw 'dns-created-record-not-uniquely-identifiable'
        }
        $dnsRecordId = [string]$rollbackMatch[0].id
      }
      $deleteHeaders = @{} + $dnsHeaders
      $deleteHeaders['Idempotency-Key'] = "runaai-next-gate7a-delete-$AttemptId"
      $deleted = Invoke-RestMethod -Method Post `
        -Uri "$apiBase/dns/delete/$domain/$dnsRecordId" -Headers $deleteHeaders
      if ($deleted.status -ne 'SUCCESS') { throw 'dns-delete-failed' }
    }
  } catch { $rollbackErrors.Add('dns') }
  [ordered]@{
    restored = $rollbackErrors.Count -eq 0
    errors = @($rollbackErrors)
  }
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or $identity -ne 'RUNA-CONTROL\Matthew') {
    throw 'gate7a-activation-owner-context-required'
  }
  if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') {
    throw 'gate7a-activation-root-invalid'
  }
  if ($ReleaseId -notmatch '^runaai-next-gate7a-lan-[A-Za-z0-9._-]{1,70}$' -or
      $AttemptId -notmatch '^gate7a-attempt-[A-Za-z0-9._-]{1,70}$' -or
      $ExpectedCommit -notmatch '^[a-f0-9]{40}$' -or
      $ExpectedArtifactDigest -notmatch '^[a-f0-9]{64}$' -or
      $ExpectedArtifactFileCount -lt 1) {
    throw 'gate7a-activation-release-pin-invalid'
  }
  foreach ($digest in @($ArchiveSha256,$ConfigSha256,$ManifestSha256,$CaddyfileSha256,
      $ApplicationLauncherSha256,$KeycloakLauncherSha256)) {
    if ($digest -notmatch '^[a-f0-9]{64}$') { throw 'gate7a-activation-digest-pin-invalid' }
  }

  $staging = Join-Path $Root "staging\$ReleaseId"
  $releaseRoot = Join-Path $Root "releases\$ReleaseId"
  $archive = Join-Path $staging 'release.tar.gz'
  $stagedConfig = Join-Path $staging 'candidate.json'
  $stagedManifest = Join-Path $staging 'gate7a-release.json'
  $stagedCaddy = Join-Path $staging 'Caddyfile'
  $stagedApplication = Join-Path $staging 'Run-Application.ps1'
  $stagedKeycloak = Join-Path $staging 'Run-Keycloak.ps1'
  $configPath = Join-Path $Root 'config\candidate.json'
  $nextManifestPath = Join-Path $Root 'config\gate7a-release.json'
  $caddyPath = Join-Path $Root 'config\Caddyfile'
  $applicationLauncher = Join-Path $Root 'control\Run-Application.ps1'
  $keycloakLauncher = Join-Path $Root 'control\Run-Keycloak.ps1'
  $rollbackRoot = Join-Path $Root "secrets\gate7a-lan-rollback-$AttemptId"

  $failureStage = 'preflight'
  $pins = [ordered]@{
    $archive=$ArchiveSha256
    $stagedConfig=$ConfigSha256
    $stagedManifest=$ManifestSha256
    $stagedCaddy=$CaddyfileSha256
    $stagedApplication=$ApplicationLauncherSha256
    $stagedKeycloak=$KeycloakLauncherSha256
  }
  foreach ($entry in $pins.GetEnumerator()) {
    if ((Hash $entry.Key) -ne $entry.Value) { throw 'gate7a-activation-staged-hash-mismatch' }
  }
  foreach ($path in @($nextManifestPath,$rollbackRoot)) {
    if (Test-Path -LiteralPath $path) { throw 'gate7a-activation-new-path-already-exists' }
  }
  $existing443 = Get-NetTCPConnection -State Listen -LocalPort 443 -ErrorAction SilentlyContinue
  if ($existing443) { throw 'gate7a-activation-port-443-in-use' }
  if (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue) {
    throw 'gate7a-activation-firewall-rule-already-exists'
  }
  foreach ($name in @('Application','Caddy','Keycloak','OpenFga','Postgresql','ProtectedBackup')) {
    if (-not (Get-ScheduledTask -TaskPath $taskPath -TaskName $name -ErrorAction SilentlyContinue)) {
      throw 'gate7a-activation-task-missing'
    }
  }
  $runtime = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
  $readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
  $currentConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ($currentConfig.releaseManifestPath -ne 'release-gate6d-promotion-a886754.json') {
    throw 'gate7a-activation-predecessor-manifest-path-drift'
  }
  $priorManifestPath = Join-Path (Join-Path $Root 'config') $currentConfig.releaseManifestPath
  $currentManifest = Get-Content -LiteralPath $priorManifestPath -Raw | ConvertFrom-Json
  if ($runtime.running.releaseId -ne $priorReleaseId -or $runtime.running.commit -ne $priorCommit -or
      $runtime.running.artifactDigest -ne $priorArtifactDigest -or
      $runtime.cutover.phase -ne 'closed' -or
      $runtime.authorityGeneration -ne $currentConfig.targetGeneration -or
      $currentManifest.manifestDigest -ne $priorRuntimeManifestDigest -or
      $readiness.authority -ne 'active' -or $readiness.protectedDataImported -ne $true -or
      $readiness.productionTrafficChanged -ne $true -or
      $currentConfig.publicBaseUrl -ne 'https://192.168.50.169:9761') {
    throw 'gate7a-activation-predecessor-drift'
  }
  $candidate = Get-Content -LiteralPath $stagedConfig -Raw | ConvertFrom-Json
  $manifest = Get-Content -LiteralPath $stagedManifest -Raw | ConvertFrom-Json
  if ($candidate.mode -ne 'active' -or $candidate.publicBaseUrl -ne $canonicalOrigin -or
      $candidate.keycloak.issuer -ne $browserIssuer -or
      $candidate.keycloak.backchannelIssuer -ne $backchannelIssuer -or
      $candidate.gate7a.enabled -ne $true -or
      $candidate.gate7a.relyingPartyId -ne $canonicalHost -or
      $candidate.gate7a.predecessorManifestDigest -ne $priorRuntimeManifestDigest -or
      $candidate.releaseManifestPath -ne 'gate7a-release.json' -or
      $manifest.releaseId -ne $ReleaseId -or $manifest.commit -ne $ExpectedCommit -or
      $manifest.artifactDigest -ne $ExpectedArtifactDigest) {
    throw 'gate7a-activation-successor-invalid'
  }
  $expectedCaddy = [IO.File]::ReadAllText($stagedCaddy)
  if ($expectedCaddy -notmatch [regex]::Escape("$canonicalOrigin {") -or
      $expectedCaddy -notmatch 'bind 192\.168\.50\.169' -or
      $expectedCaddy -notmatch [regex]::Escape('handle_path /auth/*') -or
      $expectedCaddy -notmatch [regex]::Escape('https://192.168.50.169:9761') -or
      $expectedCaddy -notmatch [regex]::Escape('http://127.0.0.1:9770')) {
    throw 'gate7a-activation-caddy-scope-invalid'
  }
  if ([IO.File]::ReadAllText($stagedApplication) -notmatch [regex]::Escape($releaseRoot) -or
      [IO.File]::ReadAllText($stagedKeycloak) -notmatch
        [regex]::Escape("--hostname=$canonicalOrigin/auth --hostname-strict=true --proxy-headers=xforwarded")) {
    throw 'gate7a-activation-launcher-scope-invalid'
  }
  & (Join-Path $Root 'tools\caddy\caddy.exe') validate --config $stagedCaddy --adapter caddyfile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'gate7a-activation-caddy-validation-failed' }

  $failureStage = 'artifact'
  if (-not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $releaseRoot | Out-Null
    $releaseCreated = $true
    & tar.exe -xzf $archive -C $releaseRoot
    if ($LASTEXITCODE -ne 0) { throw 'gate7a-activation-release-extract-failed' }
  }
  $artifact = Get-Content -LiteralPath (Join-Path $releaseRoot 'artifact-files.json') -Raw | ConvertFrom-Json
  if ($artifact.artifactDigest -ne $ExpectedArtifactDigest -or
      @($artifact.entries).Count -ne $ExpectedArtifactFileCount) {
    throw 'gate7a-activation-artifact-invalid'
  }
  $serverSource = [IO.File]::ReadAllText((Join-Path $releaseRoot 'gate6b\http-server.mjs'))
  if ($serverSource -notmatch [regex]::Escape('Secure; HttpOnly; SameSite=Lax') -or
      $serverSource -match [regex]::Escape('Secure; HttpOnly; SameSite=Strict')) {
    throw 'gate7a-activation-cookie-policy-invalid'
  }
  Push-Location $releaseRoot
  try {
    $verification = & (Join-Path $releaseRoot 'runtime\node.exe') --input-type=module -e `
      "import {readFile} from 'node:fs/promises';import {verifyReleaseArtifact} from './gate6b/artifact.mjs';const a=JSON.parse(await readFile('./artifact-files.json','utf8'));await verifyReleaseArtifact('.',a.artifactDigest);process.stdout.write('verified');"
    if ($LASTEXITCODE -ne 0 -or (($verification | ForEach-Object { [string]$_ }) -join '') -ne 'verified') {
      throw 'gate7a-activation-artifact-verification-failed'
    }
  } finally { Pop-Location }

  $failureStage = 'snapshot'
  New-Item -ItemType Directory -Path $rollbackRoot | Out-Null
  Set-Acl -LiteralPath $rollbackRoot -AclObject (Get-Acl -LiteralPath (Join-Path $Root 'secrets'))
  Copy-Item -LiteralPath $configPath -Destination (Join-Path $rollbackRoot 'candidate.json')
  Copy-Item -LiteralPath $priorManifestPath -Destination (Join-Path $rollbackRoot 'release-manifest.json')
  Copy-Item -LiteralPath $caddyPath -Destination (Join-Path $rollbackRoot 'Caddyfile')
  Copy-Item -LiteralPath $applicationLauncher -Destination (Join-Path $rollbackRoot 'Run-Application.ps1')
  Copy-Item -LiteralPath $keycloakLauncher -Destination (Join-Path $rollbackRoot 'Run-Keycloak.ps1')

  Get-KeycloakAdminHeaders
  $priorRealmJson = Invoke-RestMethod -Method Get `
    -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next' -Headers $headers |
    ConvertTo-Json -Depth 100 -Compress
  $clients = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next/clients?clientId=runaai-next' `
    -Headers $headers))
  if ($clients.Count -ne 1) { throw 'gate7a-activation-client-mismatch' }
  $priorClientJson = $clients[0] | ConvertTo-Json -Depth 100 -Compress
  [IO.File]::WriteAllText((Join-Path $rollbackRoot 'keycloak-realm.json'),$priorRealmJson,
    (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $rollbackRoot 'keycloak-client.json'),$priorClientJson,
    (New-Object Text.UTF8Encoding($false)))

  $failureStage = 'credential'
  Add-Type -AssemblyName System.Security
  $credentialPath = Join-Path $Root 'secrets\porkbun-api.dpapi'
  $entropy = [Text.Encoding]::UTF8.GetBytes('runa2-gate7a-porkbun-credential/v1')
  $credentialBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($credentialPath), $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $credential = [Text.Encoding]::UTF8.GetString($credentialBytes) | ConvertFrom-Json
  if ($credential.schemaVersion -ne 'runa2-gate7a-porkbun-credential/v1' -or
      $credential.domain -ne $domain) { throw 'gate7a-activation-porkbun-credential-invalid' }
  $apiKey = [string]$credential.apiKey
  $secretKey = [string]$credential.secretApiKey
  $dnsHeaders = @{'X-API-Key'=$apiKey;'X-Secret-API-Key'=$secretKey}
  $records = Invoke-RestMethod -Method Get -Uri "$apiBase/dns/retrieve/$domain" -Headers $dnsHeaders
  $selected = @($records.records | Where-Object {
    $_.type -in @('A','AAAA','CNAME') -and $_.name -in @($recordName,$canonicalHost)
  })
  if ($records.status -ne 'SUCCESS' -or $selected.Count -ne 0) {
    throw 'gate7a-activation-dns-predecessor-drift'
  }

  $failureStage = 'dns'
  $createBody = [ordered]@{ name=$recordName; type='A'; content=$privateAddress; ttl='600' }
  $dryRunBody = [ordered]@{} + $createBody
  $dryRunBody['dryRun'] = $true
  $dryRunHeaders = @{} + $dnsHeaders
  $dryRunHeaders['Idempotency-Key'] = "runaai-next-gate7a-dry-run-$AttemptId"
  $dryRun = Invoke-RestMethod -Method Post -Uri "$apiBase/dns/create/$domain" `
    -Headers $dryRunHeaders -ContentType 'application/json' `
    -Body ($dryRunBody | ConvertTo-Json -Compress)
  if ($dryRun.status -ne 'SUCCESS') { throw 'gate7a-activation-dns-dry-run-failed' }
  $createHeaders = @{} + $dnsHeaders
  $createHeaders['Idempotency-Key'] = "runaai-next-gate7a-apply-$AttemptId"
  $createdDns = Invoke-RestMethod -Method Post -Uri "$apiBase/dns/create/$domain" `
    -Headers $createHeaders -ContentType 'application/json' `
    -Body ($createBody | ConvertTo-Json -Compress)
  if ($createdDns.status -ne 'SUCCESS') { throw 'gate7a-activation-dns-create-failed' }
  $dnsCreated = $true
  $dnsRecordId = if ($createdDns.id) { [string]$createdDns.id }
    elseif ($createdDns.record -and $createdDns.record.id) { [string]$createdDns.record.id }
    else { $null }
  if (-not $dnsRecordId) {
    $createdRecords = Invoke-RestMethod -Method Get `
      -Uri "$apiBase/dns/retrieve/$domain" -Headers $dnsHeaders
    $createdMatch = @($createdRecords.records | Where-Object {
      $_.type -eq 'A' -and $_.name -in @($recordName,$canonicalHost) -and
      $_.content -eq $privateAddress
    })
    if ($createdRecords.status -eq 'SUCCESS' -and $createdMatch.Count -eq 1) {
      $dnsRecordId = [string]$createdMatch[0].id
    }
  }
  if (-not $dnsRecordId -or $dnsRecordId -notmatch '^[0-9]+$') {
    throw 'gate7a-activation-dns-record-id-invalid'
  }

  $failureStage = 'identity'
  $nextRealm = $priorRealmJson | ConvertFrom-Json
  $nextRealm.webAuthnPolicyRpId = $canonicalHost
  $nextRealm.webAuthnPolicyPasswordlessRpId = $canonicalHost
  $nextRealm.webAuthnPolicyUserVerificationRequirement = 'required'
  $nextRealm.webAuthnPolicyPasswordlessUserVerificationRequirement = 'required'
  $nextClient = $priorClientJson | ConvertFrom-Json
  $nextClient.redirectUris = @("$canonicalOrigin/session/callback")
  $nextClient.webOrigins = @($canonicalOrigin)
  Invoke-RestMethod -Method Put -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next' `
    -Headers $headers -ContentType 'application/json' `
    -Body ($nextRealm | ConvertTo-Json -Depth 100 -Compress) | Out-Null
  Invoke-RestMethod -Method Put `
    -Uri "http://127.0.0.1:9762/admin/realms/runaai-next/clients/$($nextClient.id)" `
    -Headers $headers -ContentType 'application/json' `
    -Body ($nextClient | ConvertTo-Json -Depth 100 -Compress) | Out-Null
  $identityChanged = $true

  $failureStage = 'files'
  Copy-Item -LiteralPath $stagedManifest -Destination $nextManifestPath
  Copy-Item -LiteralPath $stagedConfig -Destination "$configPath.gate7a-new"
  Copy-Item -LiteralPath $stagedCaddy -Destination "$caddyPath.gate7a-new"
  Copy-Item -LiteralPath $stagedApplication -Destination "$applicationLauncher.gate7a-new"
  Copy-Item -LiteralPath $stagedKeycloak -Destination "$keycloakLauncher.gate7a-new"
  Move-Item -LiteralPath "$configPath.gate7a-new" -Destination $configPath -Force
  Move-Item -LiteralPath "$caddyPath.gate7a-new" -Destination $caddyPath -Force
  Move-Item -LiteralPath "$applicationLauncher.gate7a-new" -Destination $applicationLauncher -Force
  Move-Item -LiteralPath "$keycloakLauncher.gate7a-new" -Destination $keycloakLauncher -Force
  $filesChanged = $true

  $failureStage = 'firewall'
  New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort 443 -Profile Private -RemoteAddress LocalSubnet | Out-Null
  $firewallCreated = $true

  $failureStage = 'restart'
  foreach ($name in @('Application','Caddy','Keycloak')) {
    Stop-ScheduledTask -TaskPath $taskPath -TaskName $name
  }
  $frontendsStopped = $true
  foreach ($port in @(9760,9761,9762,9770)) { Wait-PortClosed $port 90 }
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Keycloak'
  Wait-Json "$backchannelIssuer/.well-known/openid-configuration" {
    param($value) $value.issuer -eq $browserIssuer
  } 5 | Out-Null
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Caddy'
  Wait-Port 443 3
  Wait-Port 9761 3
  Wait-Port 9770 3
  Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
  $nextRuntime = Wait-Json 'http://127.0.0.1:9760/api/runtime/status' {
    param($value) $value.running.releaseId -eq $ReleaseId
  } 12

  $failureStage = 'runtime-reconciliation'
  $nextReadiness = Invoke-RestMethod -Uri 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 20
  if ($nextRuntime.running.commit -ne $ExpectedCommit -or
      $nextRuntime.running.artifactDigest -ne $ExpectedArtifactDigest -or
      $nextRuntime.cutover.phase -ne 'closed' -or $nextReadiness.authority -ne 'active' -or
      $nextReadiness.protectedDataImported -ne $true -or
      $nextReadiness.productionTrafficChanged -ne $true) {
    throw 'gate7a-activation-runtime-reconciliation-failed'
  }
  $failureStage = 'identity-reconciliation'
  $identityCheck = Invoke-RestMethod -Method Get `
    -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next' -Headers $headers
  $clientCheck = @(Expand-Response (Invoke-RestMethod -Method Get `
    -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next/clients?clientId=runaai-next' `
    -Headers $headers))
  if ($identityCheck.webAuthnPolicyRpId -ne $canonicalHost -or
      $identityCheck.webAuthnPolicyPasswordlessRpId -ne $canonicalHost -or
      $identityCheck.webAuthnPolicyUserVerificationRequirement -ne 'required' -or
      $identityCheck.webAuthnPolicyPasswordlessUserVerificationRequirement -ne 'required' -or
      $clientCheck.Count -ne 1 -or
      @($clientCheck[0].redirectUris).Count -ne 1 -or
      $clientCheck[0].redirectUris[0] -ne "$canonicalOrigin/session/callback" -or
      @($clientCheck[0].webOrigins).Count -ne 1 -or $clientCheck[0].webOrigins[0] -ne $canonicalOrigin) {
    throw 'gate7a-activation-identity-reconciliation-failed'
  }
  $failureStage = 'dns-reconciliation'
  $dnsCheck = Invoke-RestMethod -Method Get -Uri "$apiBase/dns/retrieve/$domain" -Headers $dnsHeaders
  $matching = @($dnsCheck.records | Where-Object {
    [string]$_.id -eq $dnsRecordId -and $_.type -eq 'A' -and
    $_.name -in @($recordName,$canonicalHost) -and $_.content -eq $privateAddress
  })
  if ($dnsCheck.status -ne 'SUCCESS' -or $matching.Count -ne 1) {
    throw 'gate7a-activation-dns-reconciliation-failed'
  }
  $failureStage = 'dns-resolution'
  $deadline = [DateTime]::UtcNow.AddMinutes(10)
  do {
    Clear-DnsClientCache
    $resolved = @(Resolve-DnsName -Name $canonicalHost -Type A -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress -Unique)
    if ($resolved.Count -eq 1 -and $resolved[0] -eq $privateAddress) { break }
    if (@($resolved | Where-Object { $_ -ne $privateAddress }).Count -gt 0) {
      throw 'gate7a-activation-dns-rebind-detected'
    }
    Start-Sleep -Seconds 5
  } until ([DateTime]::UtcNow -gt $deadline)
  if ($resolved.Count -ne 1 -or $resolved[0] -ne $privateAddress) {
    throw 'gate7a-activation-dns-resolution-timeout'
  }
  $failureStage = 'browser-route'
  $live = Invoke-RestMethod -Uri "$canonicalOrigin/health/live" -TimeoutSec 20
  $wellKnown = Invoke-RestMethod -Uri "$browserIssuer/.well-known/openid-configuration" -TimeoutSec 20
  $start = Invoke-NoRedirect "$canonicalOrigin/session/start"
  $legacy = Invoke-RestMethod -Uri 'https://192.168.50.169:9761/health/live' -TimeoutSec 20
  if ($live.live -ne $true -or $legacy.live -ne $true -or $wellKnown.issuer -ne $browserIssuer -or
      $start.statusCode -ne 303 -or
      $start.location -notmatch '^https://runa\.bridgebuildersai\.com/auth/realms/runaai-next/protocol/openid-connect/auth\?') {
    throw 'gate7a-activation-browser-route-invalid'
  }
  $failureStage = 'listener-reconciliation'
  $listeners = @(Get-NetTCPConnection -State Listen)
  foreach ($port in @(9760,9762,9763,9764,9765,9766,9770)) {
    $addresses = @($listeners | Where-Object LocalPort -eq $port |
      Select-Object -ExpandProperty LocalAddress -Unique)
    if ($addresses.Count -ne 1 -or $addresses[0] -notin @('127.0.0.1','::1')) {
      throw 'gate7a-activation-private-listener-boundary-invalid'
    }
  }
  $publicAddresses = @($listeners | Where-Object LocalPort -eq 443 |
    Select-Object -ExpandProperty LocalAddress -Unique)
  if ($publicAddresses.Count -ne 1 -or $publicAddresses[0] -ne $privateAddress) {
    throw 'gate7a-activation-public-listener-boundary-invalid'
  }
  $failureStage = 'firewall-reconciliation'
  $firewall = Get-NetFirewallRule -DisplayName $firewallName
  $portFilter = $firewall | Get-NetFirewallPortFilter
  $addressFilter = $firewall | Get-NetFirewallAddressFilter
  if ($firewall.Enabled -ne 'True' -or $firewall.Profile -ne 'Private' -or
      $portFilter.LocalPort -ne '443' -or $addressFilter.RemoteAddress -ne 'LocalSubnet') {
    throw 'gate7a-activation-firewall-reconciliation-failed'
  }

  [ordered]@{
    schemaVersion = 'runa2-gate7a-control-lan-activation/v1'
    passed = $true
    rolledBack = $false
    releaseId = $ReleaseId
    attemptId = $AttemptId
    commit = $ExpectedCommit
    artifactDigest = $ExpectedArtifactDigest
    canonicalOrigin = $canonicalOrigin
    browserIssuer = $browserIssuer
    relyingPartyId = $canonicalHost
    backchannelLoopback = $true
    canonicalHttps = $true
    commissioningRouteRetained = $true
    sameSite = 'Lax'
    firewallPrivateLocalSubnetOnly = $true
    dnsRecordExact = $true
    identityReconciled = $true
    protectedDataRewritten = $false
    legacyModified = $false
    offLanIngressEnabled = $false
    rollbackRetained = $true
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
} catch {
  $failure = if ($_.Exception.Message -match '^gate7a-[a-z0-9-]+$') {
    $_.Exception.Message
  } else { "gate7a-activation-$failureStage-failed" }
  $rollback = $null
  $liveChangeStarted = $dnsCreated -or $firewallCreated -or $identityChanged -or
    $filesChanged -or $frontendsStopped
  if ($liveChangeStarted) {
    try { $rollback = Restore-Predecessor } catch {
      $rollback = [ordered]@{ restored=$false; errors=@('rollback-exception') }
    }
  } else {
    if ($releaseCreated -and $releaseRoot -and (Test-Path -LiteralPath $releaseRoot)) {
      Remove-Item -LiteralPath $releaseRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($rollbackRoot -and (Test-Path -LiteralPath $rollbackRoot)) {
      Remove-Item -LiteralPath $rollbackRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  [ordered]@{
    schemaVersion = 'runa2-gate7a-error/v1'
    errorCode = $failure
    rolledBack = if ($rollback) { [bool]$rollback.restored } else { $false }
    rollbackErrors = if ($rollback) { @($rollback.errors) } else { @() }
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
  exit 1
} finally {
  Clear-Bytes $credentialBytes
  Remove-Variable apiKey,secretKey,adminPassword,adminToken,headers,dnsHeaders,
    priorRealmJson,priorClientJson -ErrorAction SilentlyContinue
}
