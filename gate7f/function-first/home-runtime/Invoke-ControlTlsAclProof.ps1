param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedPackageSha256)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-cne'RUNA-CONTROL'-or$PSScriptRoot-notmatch'^C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-home-tls-acl-proof-[a-f0-9]{32}$'){throw 'tls-proof-scope'}
if(-not([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'tls-proof-admin'}
for($current=$PSScriptRoot;$current;$current=[IO.Path]::GetDirectoryName($current)){
 if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'tls-proof-link'}
}
$manifestFile=Join-Path $PSScriptRoot 'package.json'
if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedPackageSha256){throw 'tls-proof-package-pin'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
$names=@('Runtime-Windows.ps1','Tls-Windows.ps1','Invoke-ControlTlsAclProof.ps1')
if($manifest.schemaVersion-cne'runaai-tls-acl-proof-package/v1'-or$manifest.root-cne$PSScriptRoot-or
 (($manifest.files.PSObject.Properties.Name|Sort-Object)-join',')-cne(($names|Sort-Object)-join',')){throw 'tls-proof-package-shape'}
foreach($name in $names){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$manifest.files.$name){throw 'tls-proof-source-pin'}}
. (Join-Path $PSScriptRoot 'Tls-Windows.ps1')
$parent=[IO.Path]::GetDirectoryName($PSScriptRoot);$parentBefore=(Get-Acl -LiteralPath $parent).Sddl
$script:RuntimeRoot=Join-Path $PSScriptRoot 'fixture'
if(Test-Path -LiteralPath $script:RuntimeRoot){throw 'tls-proof-existing-fixture'}
$checks=[ordered]@{};$failure=$null
try{
 New-TlsPrivateDirectory $script:RuntimeRoot
 $leaf=Join-Path $script:RuntimeRoot 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
 [void](New-Item -ItemType Directory -Path $leaf);Secure-TlsNewEnrollment $leaf
 $key=Join-Path $leaf 'client-key.pem';[IO.File]::WriteAllText($key,'synthetic-not-a-private-key')
 Verify-TlsEnrollment $leaf;$checks.privateAclPassed=$true
 $original=Get-Acl -LiteralPath $key;$changed=Get-Acl -LiteralPath $key
 $changed.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('Everyone','Read','Allow')))
 Set-Acl -LiteralPath $key -AclObject $changed
 $checks.publicReadDenied=$false;try{Verify-TlsEnrollment $leaf}catch{$checks.publicReadDenied=$true}
 Set-Acl -LiteralPath $key -AclObject $original
 if(-not$checks.publicReadDenied){throw 'tls-proof-public-read-not-denied'}
 $alias=Join-Path $PSScriptRoot 'synthetic-hardlink';[void](New-Item -ItemType HardLink -Path $alias -Target $key)
 $checks.hardlinkDenied=$false;try{Verify-TlsEnrollment $leaf}catch{$checks.hardlinkDenied=$true}
 # Remove this exact synthetic alias only; the original synthetic record remains recoverable.
 Remove-Item -LiteralPath $alias
 if(-not$checks.hardlinkDenied){throw 'tls-proof-hardlink-not-denied'}
 Verify-TlsEnrollment $leaf;$checks.privateAclRestored=$true
 $checks.existingRefused=$false;try{New-TlsPrivateDirectory $script:RuntimeRoot}catch{$checks.existingRefused=$true}
 if(-not$checks.existingRefused){throw 'tls-proof-existing-not-denied'}
}catch{$failure=if($_.Exception.Message-match'^(tls|runtime)-[a-z0-9-]+$'){$_.Exception.Message}else{'tls-proof-native-failure'}}
$checks.parentUnchanged=((Get-Acl -LiteralPath $parent).Sddl-ceq$parentBefore)
$result=@{schemaVersion='runaai-tls-native-acl-proof/v1';passed=($null-eq$failure-and@($checks.Values|Where-Object{$_-ne$true}).Count-eq0);
 time=[DateTime]::UtcNow.ToString('o');root=$PSScriptRoot;identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;
 packageSha256=$ExpectedPackageSha256;checks=$checks;failure=$failure;privateValuesIncluded=$false;filesRetained=$true;
 tasksCreated=$false;networkCalled=$false;modelsLoaded=$false;productionChanged=$false}
$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($result|ConvertTo-Json -Depth 10 -Compress)+"`n")
$stream=[IO.File]::Open((Join-Path $PSScriptRoot 'result.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$result|ConvertTo-Json -Depth 10 -Compress
if(-not$result.passed){exit 1}
