[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'owner-authority-context-invalid' }
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
$path = Join-Path $Root 'secrets\owner-bootstrap-password.dpapi'
if (-not (Test-Path -LiteralPath $path)) { throw 'owner-bootstrap-unavailable' }
$protected = [Convert]::FromBase64String([IO.File]::ReadAllText($path).Trim())
$clear = [Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
  $password = [Text.Encoding]::UTF8.GetString($clear)
  Set-Clipboard -Value $password
  [ordered]@{ schemaVersion='runa2-gate6c-owner-bootstrap-clipboard/v1'; copied=$true;
    privateValuesIncluded=$false } | ConvertTo-Json -Compress
} finally {
  [Array]::Clear($protected,0,$protected.Length)
  [Array]::Clear($clear,0,$clear.Length)
  Remove-Variable password -ErrorAction SilentlyContinue
}
