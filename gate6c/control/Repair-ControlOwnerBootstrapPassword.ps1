[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'owner-authority-context-invalid' }
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base = 'http://localhost:9762'
$bootstrapPath = Join-Path $Root 'secrets\owner-bootstrap-password.dpapi'
if (-not (Test-Path -LiteralPath $bootstrapPath)) { throw 'owner-bootstrap-unavailable' }

$protected = $null
$clear = $null
$password = $null
$token = $null
try {
  $adminPassword = [IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token = (Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$adminPassword
    }).access_token
  Remove-Variable adminPassword -ErrorAction SilentlyContinue
  $headers = @{ Authorization = "Bearer $token" }
  $users = @(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users?username=matthew-owner&exact=true" -Headers $headers)
  if ($users.Count -ne 1 -or $users[0].username -ne 'matthew-owner' -or $users[0].enabled -ne $true) { throw 'owner-target-user-invalid' }
  $credentials = @(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users/$($users[0].id)/credentials" -Headers $headers)
  if (@($credentials | Where-Object { $_.type -eq 'password' }).Count -ne 1 -or
      @($credentials | Where-Object { $_.type -eq 'webauthn-passwordless' }).Count -ne 0) { throw 'owner-bootstrap-repair-state-invalid' }

  $protected = [Convert]::FromBase64String([IO.File]::ReadAllText($bootstrapPath).Trim())
  $clear = [Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $password = [Text.Encoding]::UTF8.GetString($clear)
  if ($password -notmatch '^Aa1![A-Za-z0-9_-]{60,}$') { throw 'owner-bootstrap-format-invalid' }
  Invoke-RestMethod -Method Put -Uri "$base/admin/realms/runaai-next/users/$($users[0].id)/reset-password" `
    -Headers $headers -ContentType 'application/json' `
    -Body (@{ type='password'; value=$password; temporary=$false } | ConvertTo-Json -Compress) | Out-Null

  $credentials = @(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users/$($users[0].id)/credentials" -Headers $headers)
  if (@($credentials | Where-Object { $_.type -eq 'password' }).Count -ne 1 -or
      @($credentials | Where-Object { $_.type -eq 'webauthn-passwordless' }).Count -ne 0) { throw 'owner-bootstrap-repair-verification-failed' }
  [ordered]@{ schemaVersion='runa2-gate6c-owner-bootstrap-repair/v1'; repaired=$true;
    targetUser='matthew-owner'; passwordCredentials=1; passkeyCredentials=0;
    legacyModified=$false; protectedDataImported=$false; productionTrafficChanged=$false;
    privateValuesIncluded=$false } | ConvertTo-Json -Compress
} finally {
  if ($protected) { [Array]::Clear($protected,0,$protected.Length) }
  if ($clear) { [Array]::Clear($clear,0,$clear.Length) }
  Remove-Variable password,token -ErrorAction SilentlyContinue
}
