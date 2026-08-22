[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Preflight','Activate','Verify','Release')][string]$Mode,
  [string]$LegacyRoot = 'C:\AI\Projects\RunaAI',
  [string]$CandidateRoot = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [string]$LeaseId,
  [int]$DurationMinutes = 120,
  [ValidateSet('verified-rollback','gate6-closed')][string]$ReleaseReason
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($LegacyRoot) -ne 'C:\AI\Projects\RunaAI') { throw 'legacy-root-invalid' }
if ([IO.Path]::GetFullPath($CandidateRoot) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($ExpectedCommit -notmatch '^[a-f0-9]{40}$') { throw 'legacy-commit-invalid' }
$stateRoot = Join-Path $LegacyRoot '.runaai-local\state'
$controlRoot = Join-Path $CandidateRoot 'gate6c'
$markerPath = Join-Path $controlRoot 'freeze-lease.json'
$protectedPath = Join-Path $controlRoot 'freeze-lease-authority.dpapi'
if (-not (Test-Path -LiteralPath $stateRoot -PathType Container)) { throw 'legacy-state-root-missing' }
$resolvedState = [IO.Path]::GetFullPath($stateRoot).TrimEnd('\') + '\'
if (-not $resolvedState.StartsWith('C:\AI\Projects\RunaAI\.runaai-local\state\', [StringComparison]::OrdinalIgnoreCase)) { throw 'legacy-state-root-invalid' }

function Invoke-Git([string[]]$Arguments) {
  $output = @(& git -c 'safe.directory=C:/AI/Projects/RunaAI' -C $LegacyRoot @Arguments)
  if ($LASTEXITCODE -ne 0) { throw 'legacy-git-authority-failed' }
  return ($output -join "`n").Trim()
}
function Verify-GitAuthority {
  $head = Invoke-Git @('rev-parse','HEAD')
  $branch = Invoke-Git @('branch','--show-current')
  $status = Invoke-Git @('status','--porcelain','--untracked-files=no')
  if ($head -ne $ExpectedCommit -or $branch -ne 'main' -or $status -ne '') {
    throw 'legacy-git-authority-mismatch'
  }
}
function Assert-Inheritance {
  foreach ($item in @(Get-Item -LiteralPath $stateRoot) + @(Get-ChildItem -LiteralPath $stateRoot -Force -Recurse)) {
    if ((Get-Acl -LiteralPath $item.FullName).AreAccessRulesProtected) { throw 'legacy-state-acl-inheritance-blocked' }
  }
}
function Hash-State([byte[]]$Key) {
  $hmac = New-Object Security.Cryptography.HMACSHA256 -ArgumentList (,$Key)
  try {
    $files = @(Get-ChildItem -LiteralPath $stateRoot -Force -Recurse -File | Sort-Object FullName)
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($resolvedState.Length).Replace('\','/')
      $nameBytes = [Text.Encoding]::UTF8.GetBytes($relative)
      $hmac.TransformBlock($nameBytes, 0, $nameBytes.Length, $null, 0) | Out-Null
      $bytes = [IO.File]::ReadAllBytes($file.FullName)
      $hmac.TransformBlock($bytes, 0, $bytes.Length, $null, 0) | Out-Null
    }
    $hmac.TransformFinalBlock(@(), 0, 0) | Out-Null
    return ([BitConverter]::ToString($hmac.Hash) -replace '-', '').ToLowerInvariant()
  } finally { $hmac.Dispose() }
}
function Unprotect-Authority {
  Add-Type -AssemblyName System.Security
  $entropy = [Text.Encoding]::UTF8.GetBytes('runa2-gate6c-legacy-freeze/v1')
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedPath), $entropy,
    [Security.Cryptography.DataProtectionScope]::LocalMachine)
  try { return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json) }
  finally { [Array]::Clear($bytes, 0, $bytes.Length) }
}

Verify-GitAuthority
if ($Mode -eq 'Preflight') {
  if (Test-Path -LiteralPath $markerPath) { throw 'legacy-freeze-marker-already-exists' }
  Assert-Inheritance
  [ordered]@{ schemaVersion='runa2-gate6c-freeze-preflight/v1'; passed=$true;
    sourceCommit=$ExpectedCommit; sourceBranch='main'; trackedClean=$true; stateRootPresent=$true;
    inheritanceVerified=$true; protectedStoresOpened=$false; sourceModified=$false;
    privateValuesIncluded=$false } | ConvertTo-Json -Compress
  return
}

if ($Mode -eq 'Activate') {
  if ($LeaseId -notmatch '^[A-Za-z0-9._:-]{1,160}$' -or $DurationMinutes -lt 15 -or $DurationMinutes -gt 180) { throw 'legacy-freeze-lease-invalid' }
  if (Test-Path -LiteralPath $markerPath) { throw 'legacy-freeze-marker-already-exists' }
  Assert-Inheritance
  New-Item -ItemType Directory -Path $controlRoot -Force | Out-Null
  $key = New-Object byte[] 32
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($key) } finally { $random.Dispose() }
  $original = (Get-Acl -LiteralPath $stateRoot).Sddl
  $digest = Hash-State $key
  $payload = @{ sddl=$original; hmacKey=[Convert]::ToBase64String($key) } | ConvertTo-Json -Compress
  Add-Type -AssemblyName System.Security
  $entropy = [Text.Encoding]::UTF8.GetBytes('runa2-gate6c-legacy-freeze/v1')
  $protected = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($payload), $entropy,
    [Security.Cryptography.DataProtectionScope]::LocalMachine)
  [IO.File]::WriteAllBytes($protectedPath, $protected)
  $acl = Get-Acl -LiteralPath $stateRoot
  $rights = [Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::AppendData -bor
    [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [Security.AccessControl.FileSystemRights]::WriteAttributes -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes
  $rule = New-Object Security.AccessControl.FileSystemAccessRule('RUNA-CONTROL\Matthew', $rights,
    [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
    [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Deny)
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $stateRoot -AclObject $acl
  $issued = [DateTime]::UtcNow
  [ordered]@{ schemaVersion='runa2-gate6c-control-freeze-lease/v1'; leaseId=$LeaseId;
    sourceGeneration=$ExpectedCommit; scope='conservative-entire-legacy-state-root-write-deny';
    selectedWritesFrozen=$true; legacyReadsAvailable=$true; issuedAt=$issued.ToString('o');
    expiresAt=$issued.AddMinutes($DurationMinutes).ToString('o'); stateDigest=$digest;
    status='active'; privateValuesIncluded=$false } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
  [Array]::Clear($key, 0, $key.Length)
}

if (-not (Test-Path -LiteralPath $markerPath) -or -not (Test-Path -LiteralPath $protectedPath)) { throw 'legacy-freeze-marker-missing' }
$marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
$authority = Unprotect-Authority
$key = [Convert]::FromBase64String($authority.hmacKey)
try {
  $currentDigest = Hash-State $key
  if ($currentDigest -ne $marker.stateDigest) { throw 'legacy-state-changed-during-freeze' }
} finally { [Array]::Clear($key, 0, $key.Length) }

if ($Mode -eq 'Verify' -or $Mode -eq 'Activate') {
  $expires = [DateTime]::Parse($marker.expiresAt).ToUniversalTime()
  if ($marker.status -ne 'active' -or $marker.sourceGeneration -ne $ExpectedCommit -or $expires -le [DateTime]::UtcNow) { throw 'legacy-freeze-lease-expired' }
  [ordered]@{ schemaVersion='runa2-gate6c-freeze-verification/v1'; passed=$true;
    leaseId=$marker.leaseId; sourceGeneration=$ExpectedCommit; selectedWritesFrozen=$true;
    legacyReadsAvailable=$true; sourceModified=$false; privateValuesIncluded=$false } | ConvertTo-Json -Compress
  return
}

if ($Mode -eq 'Release') {
  if ($marker.status -ne 'active' -or $ReleaseReason -notin @('verified-rollback','gate6-closed')) { throw 'legacy-freeze-release-denied' }
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetSecurityDescriptorSddlForm([string]$authority.sddl)
  Set-Acl -LiteralPath $stateRoot -AclObject $acl
  $marker.status = 'released'
  $marker.selectedWritesFrozen = $false
  $marker.releaseReason = $ReleaseReason
  $marker.releasedAt = [DateTime]::UtcNow.ToString('o')
  $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
  [ordered]@{ schemaVersion='runa2-gate6c-freeze-release/v1'; released=$true;
    releaseReason=$ReleaseReason; sourceGeneration=$ExpectedCommit; sourceModified=$false;
    privateValuesIncluded=$false } | ConvertTo-Json -Compress
}
