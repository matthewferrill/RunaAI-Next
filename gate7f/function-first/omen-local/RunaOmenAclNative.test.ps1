$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'RunaOmenAclNative.cs'
Add-Type -Path $source

$root = Join-Path ([IO.Path]::GetTempPath()) ('runa-acl-native-' + [Guid]::NewGuid().ToString('N'))
$child = Join-Path $root 'child'
$cleanupRoot = Join-Path ([IO.Path]::GetTempPath()) ('runa-acl-cleanup-' + [Guid]::NewGuid().ToString('N'))
$passed = $false
$before = $null
$checks = [ordered]@{
    setupWrite = $false
    setupReadback = $false
    setupDaclReadback = $false
    setupNormalizationValid = $false
    targetWrite = $false
    targetReadback = $false
    targetDaclReadback = $false
    targetControlFlagsEqual = $false
    targetAceSequenceEqual = $false
    restoreWrite = $false
    parentRestored = $false
    parentDaclRestored = $false
    childUnchanged = $false
    applicableDenyPresent = $false
    preparedDeltaValid = $false
    plannedDeltaValid = $false
    allowBeforeDenyRejected = $false
    cleanupFailureDetected = $false
    cleanupRecovery = $false
}
function Set-OwnerCleanupAcl([string]$Path, [bool]$Inherit) {
    $security = New-Object Security.AccessControl.DirectorySecurity
    $security.SetAccessRuleProtection($true, $false)
    $flags = if ($Inherit) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        [Security.Principal.WindowsIdentity]::GetCurrent().User,
        [Security.AccessControl.FileSystemRights]::FullControl,
        $flags,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow)
    $security.AddAccessRule($rule)
    [IO.Directory]::SetAccessControl($Path, $security)
}
try {
    [IO.Directory]::CreateDirectory($root) | Out-Null
    [RunaOmenAclNative]::ConfigureProbeParent($root)
    [IO.Directory]::CreateDirectory($child) | Out-Null
    $before = [RunaOmenAclNative]::Read($root)
    $childBefore = [RunaOmenAclNative]::Read($child)
    $setup = [RunaOmenAclNative]::BuildProbeSetupExpected($before)
    $setupWrite = [RunaOmenAclNative]::ApplyDacl($root, $setup.SecurityDescriptor)
    $setupActual = [RunaOmenAclNative]::Read($root)
    $setupDescriptor = New-Object Security.AccessControl.RawSecurityDescriptor($setupActual.SecurityDescriptor, 0)
    $world = New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::WorldSid, $null)
    $first = $setupDescriptor.DiscretionaryAcl[0] -as [Security.AccessControl.CommonAce]
    $checks.applicableDenyPresent = $null -ne $first -and $first.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessDenied -and $first.SecurityIdentifier -eq $world
    $expected = [RunaOmenAclNative]::BuildExpected($setupActual)
    $write = [RunaOmenAclNative]::ApplyDacl($root, $expected.SecurityDescriptor)
    $targetActual = [RunaOmenAclNative]::Read($root)
    $roundTripRaw = [RunaOmenAclNative]::SecurityDescriptorFromCanonical($setupActual.CanonicalDescriptor)
    $restore = [RunaOmenAclNative]::ApplyDacl($root, $roundTripRaw)
    $restoredActual = [RunaOmenAclNative]::Read($root)
    $checks.setupWrite = [bool]$setupWrite.Success
    $checks.setupReadback = [RunaOmenAclNative]::Equal($setupActual, $setup)
    $checks.setupDaclReadback = [Linq.Enumerable]::SequenceEqual([byte[]]$setupActual.DaclBytes, [byte[]]$setup.DaclBytes)
    $checks.setupNormalizationValid = [RunaOmenAclNative]::ValidateProbeSetupResult(
        $setup.CanonicalDescriptor, $setupActual.CanonicalDescriptor)
    $checks.targetWrite = [bool]$write.Success
    $checks.targetReadback = [RunaOmenAclNative]::Equal($targetActual, $expected)
    $checks.targetDaclReadback = [Linq.Enumerable]::SequenceEqual([byte[]]$targetActual.DaclBytes, [byte[]]$expected.DaclBytes)
    $expectedDescriptor = New-Object Security.AccessControl.RawSecurityDescriptor($expected.SecurityDescriptor, 0)
    $actualDescriptor = New-Object Security.AccessControl.RawSecurityDescriptor($targetActual.SecurityDescriptor, 0)
    $checks.targetControlFlagsEqual = $expectedDescriptor.ControlFlags -eq $actualDescriptor.ControlFlags
    $aceSequenceEqual = $expectedDescriptor.DiscretionaryAcl.Count -eq $actualDescriptor.DiscretionaryAcl.Count
    if ($aceSequenceEqual) {
        for ($index = 0; $index -lt $expectedDescriptor.DiscretionaryAcl.Count; $index++) {
            $left = New-Object byte[] $expectedDescriptor.DiscretionaryAcl[$index].BinaryLength
            $right = New-Object byte[] $actualDescriptor.DiscretionaryAcl[$index].BinaryLength
            $expectedDescriptor.DiscretionaryAcl[$index].GetBinaryForm($left, 0)
            $actualDescriptor.DiscretionaryAcl[$index].GetBinaryForm($right, 0)
            if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$left, [byte[]]$right)) { $aceSequenceEqual = $false; break }
        }
    }
    $checks.targetAceSequenceEqual = [bool]$aceSequenceEqual
    $checks.preparedDeltaValid = [RunaOmenAclNative]::ValidatePreparedDelta($setupActual.CanonicalDescriptor, $targetActual.CanonicalDescriptor)
    $checks.plannedDeltaValid = [RunaOmenAclNative]::ValidatePlannedDelta($setupActual.CanonicalDescriptor, $expected.CanonicalDescriptor)
    $unsafeAcl = New-Object Security.AccessControl.RawAcl($setupDescriptor.DiscretionaryAcl.Revision,
        ($setupDescriptor.DiscretionaryAcl.Count + 2))
    foreach ($sidText in @('S-1-15-2-1','S-1-15-2-2')) {
        $sid = New-Object Security.Principal.SecurityIdentifier($sidText)
        $unsafeAcl.InsertAce($unsafeAcl.Count, (New-Object Security.AccessControl.CommonAce(
            [Security.AccessControl.AceFlags]::None, [Security.AccessControl.AceQualifier]::AccessAllowed,
            0x00120088, $sid, $false, $null)))
    }
    foreach ($oldAce in $setupDescriptor.DiscretionaryAcl) { $unsafeAcl.InsertAce($unsafeAcl.Count, $oldAce.Copy()) }
    $unsafeDescriptor = New-Object Security.AccessControl.RawSecurityDescriptor($setupDescriptor.ControlFlags,
        $setupDescriptor.Owner, $setupDescriptor.Group, $setupDescriptor.SystemAcl, $unsafeAcl)
    $unsafeRaw = New-Object byte[] $unsafeDescriptor.BinaryLength
    $unsafeDescriptor.GetBinaryForm($unsafeRaw, 0)
    $unsafeCanonical = [RunaOmenAclNative]::CanonicalizeSecurityDescriptor($unsafeRaw)
    $checks.allowBeforeDenyRejected = -not [RunaOmenAclNative]::ValidatePreparedDelta(
        $setupActual.CanonicalDescriptor, $unsafeCanonical)
    $checks.restoreWrite = [bool]$restore.Success
    $checks.parentRestored = [RunaOmenAclNative]::Equal($restoredActual, $setupActual)
    $checks.parentDaclRestored = [Linq.Enumerable]::SequenceEqual([byte[]]$restoredActual.DaclBytes, [byte[]]$setupActual.DaclBytes)
    $checks.childUnchanged = [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($child), $childBefore)
    [IO.Directory]::CreateDirectory($cleanupRoot) | Out-Null
    $lockedPath = Join-Path $cleanupRoot 'locked.bin'
    $lock = New-Object IO.FileStream($lockedPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $checks.cleanupFailureDetected = -not [RunaOmenAclNative]::TryRemoveTree($cleanupRoot) -and
            [IO.Directory]::Exists($cleanupRoot)
    } finally { $lock.Dispose() }
    $checks.cleanupRecovery = [RunaOmenAclNative]::TryRemoveTree($cleanupRoot) -and -not [IO.Directory]::Exists($cleanupRoot)
    $passed = $checks.setupWrite -and $checks.setupDaclReadback -and $checks.setupNormalizationValid -and $checks.targetWrite -and
        $checks.targetControlFlagsEqual -and $checks.preparedDeltaValid -and $checks.plannedDeltaValid -and
        $checks.allowBeforeDenyRejected -and $checks.restoreWrite -and
        $checks.parentRestored -and $checks.parentDaclRestored -and $checks.childUnchanged -and
        $checks.applicableDenyPresent -and $checks.cleanupFailureDetected -and $checks.cleanupRecovery
} finally {
    if ([IO.Directory]::Exists($cleanupRoot)) { [IO.Directory]::Delete($cleanupRoot, $true) }
    if ([IO.Directory]::Exists($child)) { Set-OwnerCleanupAcl $child $false }
    if ([IO.Directory]::Exists($root)) { Set-OwnerCleanupAcl $root $true }
    if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}

[pscustomobject][ordered]@{
    schemaVersion = 'runa-omen-acl-native-smoke/v1'
    passed = [bool]$passed
    checks = [pscustomobject]$checks
    fixtureRemoved = [bool](-not [IO.Directory]::Exists($root))
    productionChanged = $false
    privateValuesIncluded = $false
} | ConvertTo-Json -Compress
if (-not $passed -or [IO.Directory]::Exists($root)) { throw 'acl-native-smoke-failed' }
