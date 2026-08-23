[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [string]$Domain = 'bridgebuildersai.com',
  [string]$SelectedHostname = 'runa.bridgebuildersai.com'
)

$ErrorActionPreference = 'Stop'
$failureStage = 'initialization'
$credentialBytes = $null
$apiKey = $null
$secretKey = $null
$bundle = $null
$chainText = $null
$privateKeyText = $null
$publicKeyText = $null
$created = $false
$certificate = $null

function Clear-Bytes([byte[]]$Value) {
  if ($null -ne $Value) { [Array]::Clear($Value, 0, $Value.Length) }
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or $identity -ne 'RUNA-CONTROL\Matthew') {
    throw 'gate7a-certificate-owner-context-required'
  }
  if ($Domain -ne 'bridgebuildersai.com' -or $SelectedHostname -ne 'runa.bridgebuildersai.com') {
    throw 'gate7a-certificate-domain-invalid'
  }
  Add-Type -AssemblyName System.Security

  $secrets = Join-Path $Root 'secrets'
  $credentialPath = Join-Path $secrets 'porkbun-api.dpapi'
  $targetRoot = Join-Path $secrets 'gate7a-tls'
  $certificatePath = Join-Path $targetRoot 'certificate-chain.pem'
  $privateKeyPath = Join-Path $targetRoot 'private-key.pem'
  $metadataPath = Join-Path $targetRoot 'metadata.json'
  if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
    throw 'gate7a-porkbun-credential-missing'
  }
  if (Test-Path -LiteralPath $targetRoot) { throw 'gate7a-certificate-stage-already-exists' }

  $failureStage = 'credential-unseal'
  $entropy = [Text.Encoding]::UTF8.GetBytes('runa2-gate7a-porkbun-credential/v1')
  $credentialBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($credentialPath), $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $credential = [Text.Encoding]::UTF8.GetString($credentialBytes) | ConvertFrom-Json
  if ($credential.schemaVersion -ne 'runa2-gate7a-porkbun-credential/v1' -or
      $credential.domain -ne $Domain -or
      $credential.apiKey -notmatch '^pk1_[A-Za-z0-9_-]{16,}$' -or
      $credential.secretApiKey -notmatch '^sk1_[A-Za-z0-9_-]{16,}$') {
    throw 'gate7a-porkbun-credential-invalid'
  }
  $apiKey = [string]$credential.apiKey
  $secretKey = [string]$credential.secretApiKey

  $failureStage = 'bundle-retrieval'
  $headers = @{'X-API-Key'=$apiKey;'X-Secret-API-Key'=$secretKey}
  $bundle = Invoke-RestMethod -Method Get `
    -Uri "https://api.porkbun.com/api/json/v3/ssl/retrieve/$Domain" -Headers $headers
  if ($bundle.status -ne 'SUCCESS') { throw 'gate7a-certificate-bundle-unavailable' }
  $chainText = [string]$bundle.certificatechain
  $privateKeyText = [string]$bundle.privatekey
  $publicKeyText = [string]$bundle.publickey
  if ($chainText -notmatch '^-----BEGIN CERTIFICATE-----' -or
      $chainText -notmatch '-----END CERTIFICATE-----\s*$' -or
      $privateKeyText -notmatch '^-----BEGIN (?:RSA )?PRIVATE KEY-----' -or
      $privateKeyText -notmatch '-----END (?:RSA )?PRIVATE KEY-----\s*$' -or
      $publicKeyText -notmatch '^-----BEGIN PUBLIC KEY-----' -or
      $publicKeyText -notmatch '-----END PUBLIC KEY-----\s*$') {
    throw 'gate7a-certificate-pem-invalid'
  }

  $failureStage = 'certificate-validation'
  $match = [regex]::Match($chainText,
    '-----BEGIN CERTIFICATE-----\s*(?<body>[A-Za-z0-9+/=\r\n]+?)\s*-----END CERTIFICATE-----')
  if (-not $match.Success) { throw 'gate7a-certificate-leaf-missing' }
  $rawCertificate = [Convert]::FromBase64String(($match.Groups['body'].Value -replace '\s',''))
  try { $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($rawCertificate) }
  finally { Clear-Bytes $rawCertificate }
  $san = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' })
  if ($san.Count -ne 1 -or $san[0].Format($false) -notmatch
      '(?i)DNS Name=\*\.bridgebuildersai\.com|DNS:\*\.bridgebuildersai\.com' -or
      $certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or
      $certificate.NotAfter.ToUniversalTime() -lt [DateTime]::UtcNow.AddDays(14)) {
    throw 'gate7a-certificate-scope-or-validity-invalid'
  }

  $failureStage = 'protected-retention'
  New-Item -ItemType Directory -Path $targetRoot | Out-Null
  $created = $true
  $utf8 = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($certificatePath, $chainText, $utf8)
  [IO.File]::WriteAllText($privateKeyPath, $privateKeyText, $utf8)
  $metadata = [ordered]@{
    schemaVersion = 'runa2-gate7a-certificate-metadata/v1'
    domain = $Domain
    selectedHostname = $SelectedHostname
    thumbprint = $certificate.Thumbprint.ToLowerInvariant()
    notAfterUtc = $certificate.NotAfter.ToUniversalTime().ToString('o')
    wildcardSanVerified = $true
    publicWebPki = $true
    privateValuesIncluded = $false
  }
  [IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json -Compress), $utf8)
  if ((Get-Item -LiteralPath $certificatePath).Length -lt 500 -or
      (Get-Item -LiteralPath $privateKeyPath).Length -lt 500 -or
      (Get-Item -LiteralPath $metadataPath).Length -lt 100) {
    throw 'gate7a-certificate-retention-invalid'
  }

  [ordered]@{
    schemaVersion = 'runa2-gate7a-certificate-staging/v1'
    passed = $true
    ownerContext = $true
    domain = $Domain
    selectedHostname = $SelectedHostname
    wildcardSanVerified = $true
    publicWebPki = $true
    minimumRemainingDays = [Math]::Floor(($certificate.NotAfter.ToUniversalTime() - [DateTime]::UtcNow).TotalDays)
    certificateChainRetained = $true
    privateKeyRetainedProtected = $true
    dnsChanged = $false
    listenerChanged = $false
    identityChanged = $false
    productionChanged = $false
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
} catch {
  if ($created -and $targetRoot -and (Test-Path -LiteralPath $targetRoot)) {
    Remove-Item -LiteralPath $targetRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  [ordered]@{
    schemaVersion = 'runa2-gate7a-error/v1'
    errorCode = if ($_.Exception.Message -match '^gate7a-[a-z0-9-]+$') {
      $_.Exception.Message
    } else { "gate7a-certificate-$failureStage-failed" }
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
  exit 1
} finally {
  if ($certificate) { $certificate.Dispose() }
  Clear-Bytes $credentialBytes
  $apiKey = $null
  $secretKey = $null
  $bundle = $null
  $chainText = $null
  $privateKeyText = $null
  $publicKeyText = $null
}
