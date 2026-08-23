[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$HostName,
  [Parameter(Mandatory)][ValidateRange(1,65535)][int]$Port,
  [Parameter(Mandatory)][string]$From,
  [Parameter(Mandatory)][string]$Username,
  [ValidateSet('true','false')][string]$StartTls='true',
  [ValidateSet('true','false')][string]$Ssl='false',
  [string]$FromDisplayName='RunaAI',
  [string]$Root='C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){
  throw 'gate7a-smtp-enrollment-context-invalid'
}
if([IO.Path]::GetFullPath($Root)-ne'C:\AI\RunaAI-Next-Candidate'-or$HostName-notmatch'^[A-Za-z0-9.-]{1,253}$'-or
  $FromDisplayName.Length-lt 1-or$FromDisplayName.Length-gt 80-or$Username.Length-lt 1-or$Username.Length-gt 254){throw 'gate7a-smtp-enrollment-input-invalid'}
try{$fromAddress=[Net.Mail.MailAddress]::new($From)}catch{throw 'gate7a-smtp-enrollment-input-invalid'}
if($fromAddress.Address-ne$From){throw 'gate7a-smtp-enrollment-input-invalid'}
try{Add-Type -AssemblyName System.Security}catch{throw 'gate7a-smtp-enrollment-assembly-load-failed'}
$target=Join-Path $Root 'secrets\keycloak-smtp.dpapi'
if(Test-Path -LiteralPath $target){throw 'gate7a-smtp-enrollment-already-exists'}
$secure=Read-Host 'SMTP password or application password' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);$clear=$null;$bytes=$null;$protected=$null
try{
  $clear=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if([string]::IsNullOrWhiteSpace($clear)-or$clear.Length-gt 4096){throw 'gate7a-smtp-enrollment-password-invalid'}
  $payload=[ordered]@{host=$HostName.ToLowerInvariant();port=[string]$Port;from=$fromAddress.Address;
    fromDisplayName=$FromDisplayName;replyTo=$fromAddress.Address;replyToDisplayName=$FromDisplayName;
    auth='true';user=$Username;password=$clear;starttls=$StartTls;ssl=$Ssl}
  $bytes=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Compress))
  $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($target,$protected)
  Set-Acl -LiteralPath $target -AclObject (Get-Acl -LiteralPath (Join-Path $Root 'secrets\keycloak-client'))
  [ordered]@{schemaVersion='runa2-gate7a-smtp-enrollment/v1';passed=$true;dpapiScope='CurrentUser';
    credentialRetained=$true;networkCalled=$false;identityChanged=$false;productionChanged=$false;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue}
  throw "gate7a-smtp-enrollment-failed:$($_.Exception.Message)"
}finally{
  if($pointer-ne[IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  if($bytes){[Array]::Clear($bytes,0,$bytes.Length)};if($protected){[Array]::Clear($protected,0,$protected.Length)}
  $clear=$null;Remove-Variable secure,payload,bytes,protected -ErrorAction SilentlyContinue
}
