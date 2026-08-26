[CmdletBinding()]
param([switch]$RequirePrivilegedControlTests)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = $null

function Assert-Equal([object]$Actual, [object]$Expected, [string]$Code) {
  if ($Actual -ne $Expected) { throw $Code }
}

function Assert-Bytes([byte[]]$Actual, [byte[]]$Expected, [string]$Code) {
  if ($Actual.Length -ne $Expected.Length) { throw $Code }
  for ($index = 0; $index -lt $Actual.Length; $index++) {
    if ($Actual[$index] -ne $Expected[$index]) { throw $Code }
  }
}

try {
  if ($env:OS -ne 'Windows_NT') { throw 'target-only-test-windows-required' }
  $source = Join-Path $PSScriptRoot 'TargetOnlyAcl.cs'
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'target-only-test-source-missing' }
  Add-Type -Path $source

  $root = Join-Path ([IO.Path]::GetTempPath()) ('runa2-gate7e-acl-' + [Guid]::NewGuid().ToString('N'))
  $parent = Join-Path $root 'parent'
  $child = Join-Path $parent 'existing-child'
  $conflictParent = Join-Path $root 'conflict-parent'
  $conflictChild = Join-Path $conflictParent 'existing-child'
  $duplicateParent = Join-Path $root 'duplicate-parent'
  $duplicateChild = Join-Path $duplicateParent 'existing-child'
  $protectedParent = Join-Path $root 'protected-parent'
  $protectedChild = Join-Path $protectedParent 'existing-child'
  New-Item -ItemType Directory -Path $child -Force | Out-Null
  New-Item -ItemType Directory -Path $conflictChild -Force | Out-Null
  New-Item -ItemType Directory -Path $duplicateChild -Force | Out-Null
  New-Item -ItemType Directory -Path $protectedChild -Force | Out-Null

  $parentBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($parent)
  $parentBaselineHash = [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($parent)
  $childBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($child)

  [RunaAI.Next.Gate7E.TargetOnlyAcl]::ApplyExactAceForTestOnly(
    $parent,
    'S-1-1-0',
    1179785,
    [Security.AccessControl.AceFlags]([int][Security.AccessControl.AceFlags]::ContainerInherit -bor
      [int][Security.AccessControl.AceFlags]::ObjectInherit)
  ) | Out-Null
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($child)) $childBaseline `
    'target-only-test-inheritance-setup-propagated'

  $beforeEnsureHash = [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($parent)
  $applied = [RunaAI.Next.Gate7E.TargetOnlyAcl]::EnsureHostPreparation($parent, $beforeEnsureHash)
  Assert-Equal $applied.Changed $true 'target-only-test-apply-no-change'
  Assert-Equal $applied.AddedCount 2 'target-only-test-apply-count-invalid'
  Assert-Equal $applied.After.AllApplicationPackagesExactCount 1 'target-only-test-first-ace-missing'
  Assert-Equal $applied.After.AllRestrictedApplicationPackagesExactCount 1 'target-only-test-second-ace-missing'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($child)) $childBaseline `
    'target-only-test-apply-propagated'

  $idempotent = [RunaAI.Next.Gate7E.TargetOnlyAcl]::EnsureHostPreparation(
    $parent,
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($parent)
  )
  Assert-Equal $idempotent.Changed $false 'target-only-test-idempotency-failed'
  Assert-Equal $idempotent.After.AllApplicationPackagesExactCount 1 'target-only-test-first-ace-duplicated'
  Assert-Equal $idempotent.After.AllRestrictedApplicationPackagesExactCount 1 'target-only-test-second-ace-duplicated'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($child)) $childBaseline `
    'target-only-test-idempotent-propagated'

  $removed = [RunaAI.Next.Gate7E.TargetOnlyAcl]::RemoveExactHostPreparation(
    $parent,
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($parent)
  )
  Assert-Equal $removed.RemovedCount 2 'target-only-test-remove-count-invalid'
  Assert-Equal $removed.After.AllApplicationPackagesExactCount 0 'target-only-test-first-ace-retained'
  Assert-Equal $removed.After.AllRestrictedApplicationPackagesExactCount 0 'target-only-test-second-ace-retained'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($child)) $childBaseline `
    'target-only-test-remove-propagated'

  $restored = [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDacl(
    $parent,
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($parent),
    $parentBaseline
  )
  Assert-Equal $restored.After.DaclSha256 $parentBaselineHash 'target-only-test-restore-hash-invalid'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($parent)) $parentBaseline `
    'target-only-test-parent-not-restored'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($child)) $childBaseline `
    'target-only-test-restore-propagated'

  $conflictBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($conflictParent)
  $conflictChildBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($conflictChild)
  [RunaAI.Next.Gate7E.TargetOnlyAcl]::ApplyExactAceForTestOnly(
    $conflictParent,
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::AllApplicationPackagesSid,
    131072,
    [Security.AccessControl.AceFlags]::None
  ) | Out-Null
  $conflictParentBefore = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($conflictParent)
  $conflictRejected = $false
  try {
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::EnsureHostPreparation(
      $conflictParent,
      [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($conflictParent)
    ) | Out-Null
  } catch {
    $conflictRejected = $_.Exception.ToString().Contains('target-sid-conflict')
  }
  Assert-Equal $conflictRejected $true 'target-only-test-conflict-not-rejected'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($conflictParent)) $conflictParentBefore `
    'target-only-test-conflict-parent-changed'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($conflictChild)) $conflictChildBaseline `
    'target-only-test-conflict-child-changed'
  [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDacl(
    $conflictParent,
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($conflictParent),
    $conflictBaseline
  ) | Out-Null

  $duplicateBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($duplicateParent)
  $duplicateChildBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($duplicateChild)
  $baselineAcl = [Security.AccessControl.RawAcl]::new([byte[]]$duplicateBaseline, 0)
  $duplicateAcl = [Security.AccessControl.RawAcl]::new(
    $baselineAcl.Revision,
    [int]($baselineAcl.Count + 2)
  )
  for ($index = 0; $index -lt $baselineAcl.Count; $index++) {
    $duplicateAcl.InsertAce($duplicateAcl.Count, $baselineAcl[$index])
  }
  foreach ($iteration in 1..2) {
    $duplicateAce = [Security.AccessControl.CommonAce]::new(
      [Security.AccessControl.AceFlags]::None,
      [Security.AccessControl.AceQualifier]::AccessAllowed,
      [RunaAI.Next.Gate7E.TargetOnlyAcl]::HostPreparationMask,
      [Security.Principal.SecurityIdentifier]::new(
        [RunaAI.Next.Gate7E.TargetOnlyAcl]::AllApplicationPackagesSid),
      $false,
      $null
    )
    $duplicateAcl.InsertAce($duplicateAcl.Count, $duplicateAce)
  }
  $duplicateBytes = New-Object byte[] $duplicateAcl.BinaryLength
  $duplicateAcl.GetBinaryForm($duplicateBytes, 0)
  $duplicateRejected = $false
  try {
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::ValidateDaclBytesForTestOnly($duplicateBytes) | Out-Null
  } catch {
    $duplicateRejected = $_.Exception.ToString().Contains('target-sid-duplicate')
  }
  Assert-Equal $duplicateRejected $true 'target-only-test-duplicate-not-rejected'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($duplicateParent)) $duplicateBaseline `
    'target-only-test-duplicate-parent-changed'
  Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($duplicateChild)) $duplicateChildBaseline `
    'target-only-test-duplicate-child-changed'

  $protectedDaclPreserved = $null
  $metadataRecoveryPassed = $null
  if ($RequirePrivilegedControlTests) {
    $protectedChildBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($protectedChild)
    $unprotectedState = [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($protectedParent)
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::ApplyControlFlagsForTestOnly(
    $protectedParent,
    ($unprotectedState.ControlFlagsValue -bor 4096)
    ) | Out-Null
    $protectedBaseline = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($protectedParent)
    $protectedBefore = [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($protectedParent)
    Assert-Equal $protectedBefore.DaclProtected $true 'target-only-test-protection-setup-failed'
    $protectedApply = [RunaAI.Next.Gate7E.TargetOnlyAcl]::EnsureHostPreparation(
    $protectedParent,
    $protectedBefore.DaclSha256
    )
    Assert-Equal $protectedApply.After.DaclProtected $true 'target-only-test-protection-cleared'
    Assert-Equal $protectedApply.After.DaclDefaulted $protectedBefore.DaclDefaulted `
    'target-only-test-defaulted-flag-changed'
    Assert-Equal $protectedApply.After.OwnershipSha256 $protectedBefore.OwnershipSha256 `
    'target-only-test-protected-ownership-changed'
    Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($protectedChild)) $protectedChildBaseline `
    'target-only-test-protected-apply-propagated'
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDacl(
    $protectedParent,
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($protectedParent),
    $protectedBaseline
    ) | Out-Null
    Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($protectedChild)) $protectedChildBaseline `
    'target-only-test-protected-restore-propagated'

    $protectedRestored = [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($protectedParent)
    $driftFlags = $protectedRestored.ControlFlagsValue -band (-bnot (4096 -bor 1024))
    $drifted = [RunaAI.Next.Gate7E.TargetOnlyAcl]::ApplyControlFlagsForTestOnly(
    $protectedParent,
    $driftFlags
    )
    Assert-Equal $drifted.DaclSha256 $protectedRestored.DaclSha256 `
    'target-only-test-recovery-dacl-setup-changed'
    $recovered = [RunaAI.Next.Gate7E.TargetOnlyAcl]::RecoverAndEnsureHostPreparation(
    $protectedParent,
    $drifted.DaclSha256,
    $drifted.NonDaclSha256,
    $protectedRestored.ControlFlagsValue,
    $protectedRestored.NonDaclSha256
    )
    Assert-Equal $recovered.After.ControlFlagsValue $protectedRestored.ControlFlagsValue `
    'target-only-test-control-flags-not-recovered'
    Assert-Equal $recovered.After.NonDaclSha256 $protectedRestored.NonDaclSha256 `
    'target-only-test-metadata-not-recovered'
    Assert-Equal $recovered.After.AllRestrictedApplicationPackagesExactCount 1 `
    'target-only-test-recovery-tuple-missing'
    Assert-Bytes ([RunaAI.Next.Gate7E.TargetOnlyAcl]::ReadDaclBytes($protectedChild)) $protectedChildBaseline `
    'target-only-test-recovery-propagated'
    [RunaAI.Next.Gate7E.TargetOnlyAcl]::RestoreDaclAndControlFlags(
    $protectedParent,
    $recovered.After.DaclSha256,
    $recovered.After.NonDaclSha256,
    $protectedBaseline,
    $protectedRestored.ControlFlagsValue,
    $protectedRestored.NonDaclSha256
    ) | Out-Null
    $protectedDaclPreserved = $true
    $metadataRecoveryPassed = $true
  }

  [ordered]@{
    schemaVersion = 'runa2-gate7e-target-only-acl-test/v1'
    passed = $true
    applyCount = 2
    idempotent = $true
    exactRemoval = $true
    exactRestore = $true
    conflictRejected = $true
    duplicateRejected = $true
    privilegedControlTestsRun = [bool]$RequirePrivilegedControlTests
    protectedDaclPreserved = $protectedDaclPreserved
    metadataRecoveryPassed = $metadataRecoveryPassed
    descendantDaclStable = $true
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress
} catch {
  $safeFailure = [regex]::Match($_.Exception.ToString(), 'target-[a-z0-9-]{1,100}')
  [ordered]@{
    schemaVersion = 'runa2-gate7e-target-only-acl-test-error/v1'
    errorCode = if ($safeFailure.Success) {
      $safeFailure.Value
    } else {
      'target-only-acl-test-failed'
    }
    exceptionType = $_.Exception.GetType().Name
    failureLine = $_.InvocationInfo.ScriptLineNumber
    privateValuesIncluded = $false
  } | ConvertTo-Json -Compress | Write-Error
  exit 1
} finally {
  if ($root -and (Test-Path -LiteralPath $root)) {
    $fullRoot = [IO.Path]::GetFullPath($root)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($fullRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $fullRoot) -like 'runa2-gate7e-acl-*') {
      Remove-Item -LiteralPath $fullRoot -Recurse -Force
    }
  }
}
