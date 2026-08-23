[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [string]$Domain = 'bridgebuildersai.com'
)

$ErrorActionPreference = 'Stop'
$clearBytes = $null
$apiKey = $null
$secretKey = $null

function Clear-Bytes([byte[]]$Value) {
  if ($null -ne $Value) { [Array]::Clear($Value, 0, $Value.Length) }
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or $identity -ne 'RUNA-CONTROL\Matthew') {
    throw 'gate7a-porkbun-owner-context-required'
  }
  if ($Domain -ne 'bridgebuildersai.com') { throw 'gate7a-porkbun-domain-invalid' }
  Add-Type -AssemblyName System.Security
  $path = Join-Path $Root 'secrets\porkbun-api.dpapi'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw 'gate7a-porkbun-credential-missing'
  }

  $entropy = [Text.Encoding]::UTF8.GetBytes('runa2-gate7a-porkbun-credential/v1')
  $clearBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($path), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $credential = [Text.Encoding]::UTF8.GetString($clearBytes) | ConvertFrom-Json
  if ($credential.schemaVersion -ne 'runa2-gate7a-porkbun-credential/v1' -or
      $credential.domain -ne $Domain -or
      $credential.apiKey -notmatch '^pk1_[A-Za-z0-9_-]{16,}$' -or
      $credential.secretApiKey -notmatch '^sk1_[A-Za-z0-9_-]{16,}$') {
    throw 'gate7a-porkbun-credential-invalid'
  }
  $apiKey = [string]$credential.apiKey
  $secretKey = [string]$credential.secretApiKey
  $headers = @{
    'X-API-Key' = $apiKey
    'X-Secret-API-Key' = $secretKey
  }
  $base = 'https://api.porkbun.com/api/json/v3'
  $ping = Invoke-RestMethod -Method Get -Uri "$base/ping" -Headers $headers
  if ($ping.status -ne 'SUCCESS') { throw 'gate7a-porkbun-authentication-failed' }
  $dns = Invoke-RestMethod -Method Get -Uri "$base/dns/retrieve/$Domain" -Headers $headers
  if ($dns.status -ne 'SUCCESS' -or $null -eq $dns.records) {
    throw 'gate7a-porkbun-domain-access-failed'
  }
  $selected = @($dns.records | Where-Object {
    $_.type -in @('A','AAAA','CNAME') -and
    $_.name -in @('runa', 'runa.bridgebuildersai.com')
  })
  if ($selected.Count -ne 0) { throw 'gate7a-porkbun-selected-record-drift' }

  [ordered]@{
    schemaVersion = 'runa2-gate7a-porkbun-readiness/v1'
    passed = $true
    authenticated = $true
    domainAccess = $true
    domain = $Domain
    selectedHostRecordCount = 0
    selectedHostRecordState = 'absent'
    sslBundleOpened = $false
    dnsChanged = $false
    certificateRetrieved = $false
    productionChanged = $false
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
} catch {
  [ordered]@{
    schemaVersion = 'runa2-gate7a-error/v1'
    errorCode = if ($_.Exception.Message -match '^gate7a-[a-z0-9-]+$') {
      $_.Exception.Message
    } else { 'gate7a-porkbun-readiness-failed' }
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
  exit 1
} finally {
  Clear-Bytes $clearBytes
  $apiKey = $null
  $secretKey = $null
}
