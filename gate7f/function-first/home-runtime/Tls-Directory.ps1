param([Parameter(Mandatory=$true)][ValidateSet('PrepareParent','SecureNew','Verify')][string]$Mode,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$EnrollmentId)
. (Join-Path $PSScriptRoot 'Tls-Windows.ps1')
if(-not([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'tls-host-authority'}
switch -CaseSensitive ($env:COMPUTERNAME){
 'RUNA-HOME' {$script:RuntimeRoot='C:\AI\RunaAI-Next-HomeRuntime-Enrollment'}
 'RUNA-CONTROL' {$script:RuntimeRoot='C:\AI\RunaAI-Next-Candidate\m1-home-runtime-tls'}
 default {throw 'tls-host'}
}
$directory=$script:RuntimeRoot+'\'+$EnrollmentId
if($Mode-ceq'PrepareParent'){
  if(Test-Path -LiteralPath $script:RuntimeRoot){Assert-TlsPrivateAcl $script:RuntimeRoot}
  else{New-TlsPrivateDirectory $script:RuntimeRoot}
}elseif($Mode-ceq'SecureNew'){Secure-TlsNewEnrollment $directory}
else{Verify-TlsEnrollment $directory}
@{schemaVersion='runaai-tls-private-directory/v1';mode=$Mode;enrollmentId=$EnrollmentId;passed=$true;privateValuesIncluded=$false}|ConvertTo-Json -Compress
