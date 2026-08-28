Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
function Assert-TlsPrivateAcl([string]$Path,[bool]$Directory=$true){
  Assert-RuntimePath $Path
  $item=Get-Item -LiteralPath $Path -Force
  if([bool]$item.PSIsContainer-ne$Directory){throw 'tls-private-kind'}
  $acl=Get-Acl -LiteralPath $Path
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if($owner-cne'S-1-5-32-544'-and$owner-cne'S-1-5-18'){throw 'tls-private-owner'}
  if($Directory-and-not$acl.AreAccessRulesProtected){throw 'tls-private-inheritance'}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if($rules.Count-ne2){throw 'tls-private-rule-count'}
  $seen=@{}
  foreach($rule in $rules){
    $sid=$rule.IdentityReference.Value
    if($sid-notin@('S-1-5-18','S-1-5-32-544')-or$seen.ContainsKey($sid)-or
      $rule.AccessControlType-ne[Security.AccessControl.AccessControlType]::Allow-or
      $rule.FileSystemRights-ne[Security.AccessControl.FileSystemRights]::FullControl-or
      $rule.PropagationFlags-ne[Security.AccessControl.PropagationFlags]::None){throw 'tls-private-rule'}
    if($Directory-and($rule.IsInherited-or$rule.InheritanceFlags-ne([Security.AccessControl.InheritanceFlags]::ContainerInherit-bor[Security.AccessControl.InheritanceFlags]::ObjectInherit))){throw 'tls-private-directory-rule'}
    if(-not$Directory-and$rule.InheritanceFlags-ne[Security.AccessControl.InheritanceFlags]::None){throw 'tls-private-file-rule'}
    $seen[$sid]=$true
  }
  if(-not$Directory){[void](Read-RuntimeBytes $Path 32768)}
}
function New-TlsPrivateDirectory([string]$Path){
  Assert-RuntimePath $Path
  if(Test-Path -LiteralPath $Path){throw 'tls-private-existing-directory'}
  [void](New-Item -ItemType Directory -Path $Path -ErrorAction Stop)
  Set-RuntimeDirectoryAcl $Path
  Assert-TlsPrivateAcl $Path
}
function Secure-TlsNewEnrollment([string]$Path){
  Assert-RuntimePath $Path
  if([IO.Path]::GetDirectoryName($Path)-cne$script:RuntimeRoot-or[IO.Path]::GetFileName($Path)-notmatch'^[a-f0-9]{32}$'){throw 'tls-enrollment-directory'}
  Assert-TlsPrivateAcl $script:RuntimeRoot
  if(@(Get-ChildItem -LiteralPath $Path -Force).Count-ne0){throw 'tls-enrollment-nonempty'}
  Set-RuntimeDirectoryAcl $Path
  Assert-TlsPrivateAcl $Path
}
function Verify-TlsEnrollment([string]$Path){
  Assert-RuntimePath $Path
  if([IO.Path]::GetDirectoryName($Path)-cne$script:RuntimeRoot-or[IO.Path]::GetFileName($Path)-notmatch'^[a-f0-9]{32}$'){throw 'tls-enrollment-directory'}
  Assert-TlsPrivateAcl $script:RuntimeRoot;Assert-TlsPrivateAcl $Path
  $items=@(Get-ChildItem -LiteralPath $Path -Force)
  if($items.Count-gt16){throw 'tls-enrollment-file-count'}
  foreach($item in $items){
    if($item.Name-notin@('issuer-key.pem','server-key.pem','client-key.pem','issuer.pem','server.pem','client.pem','ca.pem',
      'server.csr','client.csr','control-request.csr','server.ext','client.ext','public-offer.json','public-request.json','public-certificate.json','enrollment.json')){throw 'tls-enrollment-unowned-file'}
    Assert-TlsPrivateAcl $item.FullName $false
  }
}
