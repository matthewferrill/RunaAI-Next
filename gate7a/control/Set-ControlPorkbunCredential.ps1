[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [string]$Domain = 'bridgebuildersai.com'
)

$ErrorActionPreference = 'Stop'
$target = $null
$temporary = $null
$clearBytes = $null
$protectedBytes = $null
$verifyBytes = $null
$apiKey = $null
$secretKey = $null
$apiPointer = [IntPtr]::Zero
$secretPointer = [IntPtr]::Zero

function Clear-Bytes([byte[]]$Value) {
  if ($null -ne $Value) { [Array]::Clear($Value, 0, $Value.Length) }
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or $identity -ne 'RUNA-CONTROL\Matthew') {
    throw 'gate7a-porkbun-owner-context-required'
  }
  if ($Domain -ne 'bridgebuildersai.com') { throw 'gate7a-porkbun-domain-invalid' }

  $secrets = Join-Path $Root 'secrets'
  if (-not (Test-Path -LiteralPath $secrets -PathType Container)) {
    throw 'gate7a-porkbun-secrets-root-missing'
  }
  $target = Join-Path $secrets 'porkbun-api.dpapi'
  if (Test-Path -LiteralPath $target) { throw 'gate7a-porkbun-credential-already-enrolled' }

  $apiSecure = Read-Host 'Porkbun API key' -AsSecureString
  $secretSecure = Read-Host 'Porkbun secret API key' -AsSecureString
  $apiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiSecure)
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiPointer)
  $secretKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if ($apiKey -notmatch '^pk1_[A-Za-z0-9_-]{16,}$' -or $secretKey -notmatch '^sk1_[A-Za-z0-9_-]{16,}$') {
    throw 'gate7a-porkbun-credential-format-invalid'
  }

  $payload = [ordered]@{
    schemaVersion = 'runa2-gate7a-porkbun-credential/v1'
    domain = $Domain
    apiKey = $apiKey
    secretApiKey = $secretKey
  } | ConvertTo-Json -Compress
  $clearBytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $entropy = [Text.Encoding]::UTF8.GetBytes('runa2-gate7a-porkbun-credential/v1')
  $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
    $clearBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)

  $temporary = "$target.new-$([Guid]::NewGuid().ToString('N'))"
  [IO.File]::WriteAllBytes($temporary, $protectedBytes)
  if (Test-Path -LiteralPath $target) { throw 'gate7a-porkbun-credential-race' }
  Move-Item -LiteralPath $temporary -Destination $target
  $temporary = $null

  $verifyBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($target), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $verified = [Text.Encoding]::UTF8.GetString($verifyBytes) | ConvertFrom-Json
  if ($verified.schemaVersion -ne 'runa2-gate7a-porkbun-credential/v1' -or
      $verified.domain -ne $Domain -or $verified.apiKey -ne $apiKey -or
      $verified.secretApiKey -ne $secretKey) {
    throw 'gate7a-porkbun-credential-roundtrip-failed'
  }

  [ordered]@{
    schemaVersion = 'runa2-gate7a-porkbun-credential-enrollment/v1'
    passed = $true
    ownerContext = $true
    domain = $Domain
    dpapiScope = 'CurrentUser'
    credentialRetained = $true
    networkCalled = $false
    dnsChanged = $false
    certificateRetrieved = $false
    productionChanged = $false
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
} catch {
  if ($target -and (Test-Path -LiteralPath $target) -and
      $_.Exception.Message -ne 'gate7a-porkbun-credential-already-enrolled') {
    Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
  }
  [ordered]@{
    schemaVersion = 'runa2-gate7a-error/v1'
    errorCode = if ($_.Exception.Message -match '^gate7a-[a-z0-9-]+$') {
      $_.Exception.Message
    } else { 'gate7a-porkbun-credential-enrollment-failed' }
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
  exit 1
} finally {
  if ($temporary -and (Test-Path -LiteralPath $temporary)) {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
  if ($apiPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiPointer)
  }
  if ($secretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }
  Clear-Bytes $clearBytes
  Clear-Bytes $protectedBytes
  Clear-Bytes $verifyBytes
  $apiKey = $null
  $secretKey = $null
}
