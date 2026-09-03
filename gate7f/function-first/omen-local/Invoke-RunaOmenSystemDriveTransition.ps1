param(
    [Parameter(Mandatory = $true)][ValidateSet('Prepare', 'Deprovision')][string]$Operation,
    [Parameter(Mandatory = $true)][string]$ExpectedScriptSha256,
    [Parameter(Mandatory = $true)][string]$NativeSourcePath,
    [Parameter(Mandatory = $true)][string]$ExpectedNativeSourceSha256,
    [Parameter(Mandatory = $true)][string]$ContainedProcessSourcePath,
    [Parameter(Mandatory = $true)][string]$ExpectedContainedProcessSourceSha256,
    [Parameter(Mandatory = $true)][string]$PrerequisiteReaderPath,
    [Parameter(Mandatory = $true)][string]$ExpectedPrerequisiteReaderSha256,
    [Parameter(Mandatory = $true)][string]$HostPrepPath,
    [Parameter(Mandatory = $true)][string]$ExpectedHostPrepSha256,
    [Parameter(Mandatory = $true)][string]$PowerShellPath,
    [Parameter(Mandatory = $true)][string]$ExpectedPowerShellSha256,
    [string]$Target = 'C:\'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:JournalSchema = 'runa-omen-system-drive-journal/v2'
$script:BindingContract = 'Advapi32:SetFileSecurityW:DACL_SECURITY_INFORMATION:0x00000004;SetEntriesInAclW'
$script:ProgramDataDirectory = 'C:\ProgramData'
$script:RunaStateParent = 'C:\ProgramData\RunaAI'
$script:StateDirectory = 'C:\ProgramData\RunaAI\host-state'
$script:JournalPath = 'C:\ProgramData\RunaAI\host-state\system-drive-preparation-v1.json'
$script:Utf8 = New-Object Text.UTF8Encoding($false, $true)
$script:Mutex = $null
$script:MutexHeld = $false
$script:TransitionScriptPath = $MyInvocation.MyCommand.Path
$script:ProbePassed = $false
$script:RootWriteStarted = $false
$script:RollbackStarted = $false
$script:Coordinator = $null

function Get-RunaSha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
    } finally { $stream.Dispose() }
}

function Test-RunaPins {
    foreach ($pin in @(
        @($script:TransitionScriptPath, $ExpectedScriptSha256),
        @($NativeSourcePath, $ExpectedNativeSourceSha256),
        @($ContainedProcessSourcePath, $ExpectedContainedProcessSourceSha256),
        @($PrerequisiteReaderPath, $ExpectedPrerequisiteReaderSha256),
        @($HostPrepPath, $ExpectedHostPrepSha256),
        @($PowerShellPath, $ExpectedPowerShellSha256)
    )) {
        if (-not [IO.File]::Exists($pin[0]) -or $pin[1] -cnotmatch '^[a-f0-9]{64}$') { return $false }
        if ((Get-RunaSha256 $pin[0]) -cne $pin[1]) { return $false }
    }
    return $true
}

function Write-RunaTransition(
    [string]$Outcome, [string]$Stage, [string]$Code, [string]$SystemDriveState,
    [bool]$RollbackAttempted, [bool]$RollbackVerified, [string]$JournalState, [bool]$ProbePassed
) {
    $operationValue = $Operation.ToLowerInvariant()
    $key = @($operationValue,$Outcome,$Stage,$Code,$SystemDriveState,$RollbackAttempted,$RollbackVerified,
        $JournalState,$ProbePassed) -join '|'
    $allowed = @(
        'prepare|error|preflight|probe-failed|unknown|False|False|absent|False',
        'prepare|error|preflight|probe-cleanup-failed|unknown|False|False|absent|False',
        'prepare|error|preflight|pin-drift|unknown|False|False|absent|False',
        'prepare|error|preflight|pin-drift|unknown|False|False|absent|True',
        'prepare|error|preflight|precondition-failed|unknown|False|False|absent|False',
        'prepare|error|preflight|precondition-failed|unknown|False|False|absent|True',
        'prepare|error|preflight|journal-failed|unprepared|False|False|unknown|True',
        'prepare|error|prepare|prepare-failed-no-change|unprepared|False|False|retained|True',
        'prepare|prepared|complete|prepared|prepared|False|False|retained|True',
        'prepare|restored|complete|prepare-failed-restored|unprepared|True|True|removed|True',
        'prepare|restored|complete|post-state-mismatch-restored|unprepared|True|True|removed|True',
        'prepare|error|rollback|journal-removal-failed|unprepared|True|True|retained|True',
        'prepare|error|rollback|rollback-failed|unknown|True|False|retained|True',
        'prepare|error|complete|reconciliation-required|unknown|False|False|retained|True',
        'prepare|error|complete|reconciliation-required|unknown|False|False|unknown|True',
        'prepare|error|complete|reconciliation-required|unknown|False|False|unknown|False',
        'prepare|error|complete|reconciliation-required|unknown|True|False|retained|True',
        'prepare|error|complete|result-invalid|unknown|False|False|unknown|False',
        'deprovision|error|preflight|pin-drift|unknown|False|False|unknown|False',
        'deprovision|error|preflight|pin-drift|prepared|False|False|retained|True',
        'deprovision|error|preflight|precondition-failed|unknown|False|False|retained|False',
        'deprovision|error|preflight|precondition-failed|unknown|False|False|unknown|False',
        'deprovision|error|preflight|probe-failed|prepared|False|False|retained|False',
        'deprovision|error|preflight|probe-cleanup-failed|prepared|False|False|retained|False',
        'deprovision|error|preflight|journal-failed|prepared|False|False|unknown|True',
        'deprovision|deprovisioned|complete|deprovisioned|unprepared|False|False|removed|True',
        'deprovision|error|deprovision|deprovision-failed-unprepared|unprepared|False|False|retained|True',
        'deprovision|error|deprovision|deprovision-failed-prepared|prepared|False|False|retained|True',
        'deprovision|error|deprovision|journal-removal-failed|unprepared|False|False|retained|True',
        'deprovision|error|complete|reconciliation-required|unknown|False|False|retained|True',
        'deprovision|error|complete|reconciliation-required|unknown|False|False|retained|False',
        'deprovision|error|complete|reconciliation-required|unknown|False|False|unknown|False',
        'deprovision|error|complete|result-invalid|unknown|False|False|unknown|False'
    )
    if ($allowed -cnotcontains $key) {
        $Outcome = 'error'; $Stage = 'complete'; $Code = 'result-invalid'; $SystemDriveState = 'unknown'
        $RollbackAttempted = $false; $RollbackVerified = $false; $JournalState = 'unknown'; $ProbePassed = $false
    }
    if ($null -ne $script:Coordinator -and -not $script:Coordinator.ValidateCompletion(
        $Outcome, $Stage, $Code, $SystemDriveState, $RollbackAttempted, $RollbackVerified,
        $JournalState, $ProbePassed)) {
        $Outcome = 'error'; $Stage = 'complete'; $Code = 'result-invalid'; $SystemDriveState = 'unknown'
        $RollbackAttempted = $false; $RollbackVerified = $false; $JournalState = 'unknown'; $ProbePassed = $false
    }
    [pscustomobject][ordered]@{
        schemaVersion = 'runa-omen-system-drive-transition/v2'
        operation = $operationValue
        outcome = $Outcome
        stage = $Stage
        code = $Code
        systemDriveState = $SystemDriveState
        rollbackAttempted = $RollbackAttempted
        rollbackVerified = $RollbackVerified
        journalState = $JournalState
        targetOnlyProbePassed = $ProbePassed
        privateValuesIncluded = $false
    } | ConvertTo-Json -Compress
}

function Write-RunaMutexPreconditionFailure {
    $journalState = if ($Operation -ceq 'Prepare') { 'absent' } else { 'unknown' }
    Write-RunaTransition 'error' 'preflight' 'precondition-failed' 'unknown' $false $false $journalState $false
}

function New-RunaAttempt {
    [pscustomobject][ordered]@{ started = $false; terminal = $false; win32Success = $null; win32Error = $null }
}

function Test-ExactKeys($Value, [string[]]$Keys) {
    if ($null -eq $Value) { return $false }
    $actual = @($Value.PSObject.Properties.Name)
    if ($actual.Count -ne $Keys.Count) { return $false }
    for ($index = 0; $index -lt $Keys.Count; $index++) {
        if ($actual[$index] -cne $Keys[$index]) { return $false }
    }
    return $true
}

function Test-RunaAttempt($Attempt) {
    if (-not (Test-ExactKeys $Attempt @('started','terminal','win32Success','win32Error'))) { return $false }
    if ($Attempt.started -isnot [bool] -or $Attempt.terminal -isnot [bool] -or ($Attempt.terminal -and -not $Attempt.started)) { return $false }
    if (-not $Attempt.started) { return $null -eq $Attempt.win32Success -and $null -eq $Attempt.win32Error }
    if (-not $Attempt.terminal) { return $null -eq $Attempt.win32Success -and $null -eq $Attempt.win32Error }
    if ($Attempt.win32Success -isnot [bool]) { return $false }
    if ($Attempt.win32Success) { return $null -eq $Attempt.win32Error }
    if ($Attempt.win32Error -isnot [int] -and $Attempt.win32Error -isnot [long] -and
        $Attempt.win32Error -isnot [uint32]) { return $false }
    return [decimal]$Attempt.win32Error -ge 0 -and [decimal]$Attempt.win32Error -le [uint32]::MaxValue
}

function Test-RunaJournal($Value) {
    $keys = @('schemaVersion','transactionId','operation','phase','transitionScriptSha256','writeApi','target',
        'preDescriptorBase64','preDescriptorSha256','expectedPostDescriptorBase64','expectedPostDescriptorSha256',
        'prepareAttempt','rollbackAttempt','deprovisionAttempt','systemDriveState','rollbackVerified')
    if (-not (Test-ExactKeys $Value $keys)) { return $false }
    if ($Value.schemaVersion -cne $script:JournalSchema -or $Value.transactionId -cnotmatch '^[a-f0-9]{32}$' -or
        $Value.operation -cnotin @('prepare','deprovision') -or
        $Value.transitionScriptSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $Value.writeApi -cne 'SetFileSecurityW:DACL_SECURITY_INFORMATION' -or $Value.target -cne 'C:\' -or
        $Value.preDescriptorSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $Value.expectedPostDescriptorSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $Value.systemDriveState -cnotin @('prepared','unprepared','unknown') -or
        $Value.rollbackVerified -isnot [bool] -or -not (Test-RunaAttempt $Value.prepareAttempt) -or
        -not (Test-RunaAttempt $Value.rollbackAttempt) -or -not (Test-RunaAttempt $Value.deprovisionAttempt)) { return $false }
    try {
        $pre = [Convert]::FromBase64String($Value.preDescriptorBase64)
        $post = [Convert]::FromBase64String($Value.expectedPostDescriptorBase64)
    } catch { return $false }
    if ([Convert]::ToBase64String($pre) -cne $Value.preDescriptorBase64 -or
        [Convert]::ToBase64String($post) -cne $Value.expectedPostDescriptorBase64 -or
        -not [RunaOmenAclNative]::ValidateCanonicalDescriptor($pre) -or
        -not [RunaOmenAclNative]::ValidateCanonicalDescriptor($post) -or
        [RunaOmenAclNative]::Sha256($pre) -cne $Value.preDescriptorSha256 -or
        [RunaOmenAclNative]::Sha256($post) -cne $Value.expectedPostDescriptorSha256 -or
        $Value.preDescriptorSha256 -ceq $Value.expectedPostDescriptorSha256) { return $false }
    $actualAuthority = $Value.systemDriveState -ceq 'prepared' -or
        $Value.phase -cin @('prepared','deprovision-started','deprovision-terminal')
    if ($actualAuthority) {
        if (-not [RunaOmenAclNative]::ValidatePreparedDelta($pre, $post)) { return $false }
    } elseif (-not [RunaOmenAclNative]::ValidatePlannedDelta($pre, $post)) { return $false }
    $p = $Value.prepareAttempt; $r = $Value.rollbackAttempt; $d = $Value.deprovisionAttempt
    $idleP = -not $p.started -and -not $p.terminal
    $idleR = -not $r.started -and -not $r.terminal
    $idleD = -not $d.started -and -not $d.terminal
    switch ($Value.phase) {
        'authorized' { return $Value.operation -ceq 'prepare' -and $idleP -and $idleR -and $idleD -and $Value.systemDriveState -ceq 'unprepared' -and -not $Value.rollbackVerified }
        'prepare-started' { return $Value.operation -ceq 'prepare' -and $p.started -and -not $p.terminal -and $idleR -and $idleD -and $Value.systemDriveState -ceq 'unknown' -and -not $Value.rollbackVerified }
        'prepare-terminal' { return $Value.operation -ceq 'prepare' -and $p.started -and $p.terminal -and $idleR -and $idleD -and -not $Value.rollbackVerified }
        'rollback-started' { return $Value.operation -ceq 'prepare' -and $p.terminal -and $r.started -and -not $r.terminal -and $idleD -and $Value.systemDriveState -ceq 'unknown' -and -not $Value.rollbackVerified }
        'rollback-terminal' { return $Value.operation -ceq 'prepare' -and $p.terminal -and $r.started -and $r.terminal -and $idleD -and ($Value.rollbackVerified -eq ($Value.systemDriveState -ceq 'unprepared')) }
        'prepared' { return $Value.operation -ceq 'prepare' -and $p.terminal -and $p.win32Success -eq $true -and $idleR -and $idleD -and $Value.systemDriveState -ceq 'prepared' -and -not $Value.rollbackVerified }
        'deprovision-started' { return $Value.operation -ceq 'deprovision' -and $p.terminal -and $p.win32Success -eq $true -and $idleR -and $d.started -and -not $d.terminal -and $Value.systemDriveState -ceq 'unknown' -and -not $Value.rollbackVerified }
        'deprovision-terminal' { return $Value.operation -ceq 'deprovision' -and $p.terminal -and $p.win32Success -eq $true -and $idleR -and $d.started -and $d.terminal -and -not $Value.rollbackVerified }
        default { return $false }
    }
}

function New-PrivateSecurity([bool]$Directory) {
    $security = if ($Directory) { New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
    foreach ($sid in @(
        (New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::LocalSystemSid, $null)),
        (New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null))
    )) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        $security.AddAccessRule($rule)
    }
    return $security
}

function Test-PrivateAcl([string]$Path, [bool]$Directory) {
    try {
        $expected = New-PrivateSecurity $Directory
        $actual = if ($Directory) { [IO.Directory]::GetAccessControl($Path, [Security.AccessControl.AccessControlSections]::Access) } else { [IO.File]::GetAccessControl($Path, [Security.AccessControl.AccessControlSections]::Access) }
        return $actual.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) -ceq
            $expected.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
    } catch { return $false }
}

function Assert-RunaStateIdentities($Identities) {
    if ($null -eq $Identities -or
        -not $Identities.ProgramData.PathStillMatches($script:ProgramDataDirectory, '\\?\C:\ProgramData') -or
        -not $Identities.Runa.PathStillMatches($script:RunaStateParent, '\\?\C:\ProgramData\RunaAI') -or
        -not $Identities.State.PathStillMatches($script:StateDirectory, '\\?\C:\ProgramData\RunaAI\host-state')) {
        throw 'state-directory-identity-invalid'
    }
}

function Initialize-RunaStateDirectory {
    $programDataIdentity = [RunaDirectoryIdentity]::Open($script:ProgramDataDirectory)
    if (-not $programDataIdentity.PathStillMatches($script:ProgramDataDirectory, '\\?\C:\ProgramData')) {
        $programDataIdentity.Dispose(); throw 'state-directory-identity-invalid'
    }
    if (-not [IO.Directory]::Exists($script:RunaStateParent)) {
        [IO.Directory]::CreateDirectory($script:RunaStateParent) | Out-Null
        [IO.Directory]::SetAccessControl($script:RunaStateParent, (New-PrivateSecurity $true))
    }
    if (-not (Test-PrivateAcl $script:RunaStateParent $true)) { $programDataIdentity.Dispose(); throw 'state-directory-acl-invalid' }
    $runaIdentity = [RunaDirectoryIdentity]::Open($script:RunaStateParent)
    if (-not $runaIdentity.PathStillMatches($script:RunaStateParent, '\\?\C:\ProgramData\RunaAI')) {
        $runaIdentity.Dispose(); $programDataIdentity.Dispose(); throw 'state-directory-identity-invalid'
    }
    if (-not [IO.Directory]::Exists($script:StateDirectory)) {
        [IO.Directory]::CreateDirectory($script:StateDirectory) | Out-Null
        [IO.Directory]::SetAccessControl($script:StateDirectory, (New-PrivateSecurity $true))
    }
    if (-not (Test-PrivateAcl $script:StateDirectory $true)) {
        $runaIdentity.Dispose(); $programDataIdentity.Dispose(); throw 'state-directory-acl-invalid'
    }
    $stateIdentity = [RunaDirectoryIdentity]::Open($script:StateDirectory)
    $result = [pscustomobject]@{ ProgramData = $programDataIdentity; Runa = $runaIdentity; State = $stateIdentity }
    try { Assert-RunaStateIdentities $result } catch { $stateIdentity.Dispose(); $runaIdentity.Dispose(); $programDataIdentity.Dispose(); throw }
    return $result
}

function ConvertTo-RunaJournalBytes($Journal) {
    if (-not (Test-RunaJournal $Journal)) { throw 'journal-invalid' }
    $bytes = $script:Utf8.GetBytes(($Journal | ConvertTo-Json -Compress -Depth 5))
    if ($bytes.Length -eq 0 -or $bytes.Length -gt 524288) { throw 'journal-invalid' }
    return $bytes
}

function Write-RunaJournal($Journal, $StateIdentities, [bool]$Replace) {
    Assert-RunaStateIdentities $StateIdentities
    $bytes = ConvertTo-RunaJournalBytes $Journal
    $temporary = Join-Path $script:StateDirectory ('.journal-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $temporaryIdentity = $null
    try {
        $stream = New-Object IO.FileStream($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write,
            [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough)
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        [IO.File]::SetAccessControl($temporary, (New-PrivateSecurity $false))
        if (-not (Test-PrivateAcl $temporary $false)) { throw 'journal-acl-invalid' }
        $temporaryIdentity = [RunaDirectoryIdentity]::Open($temporary)
        if (-not $temporaryIdentity.PathStillMatches($temporary, ('\\?\' + $temporary)) -or
            $temporaryIdentity.VolumeSerial -ne $StateIdentities.State.VolumeSerial) { throw 'journal-identity-invalid' }
        Assert-RunaStateIdentities $StateIdentities
        [RunaOmenAclNative]::AtomicMove($temporary, $script:JournalPath, $Replace)
        $temporary = $null
        $identity = [RunaDirectoryIdentity]::Open($script:JournalPath)
        try {
            if (-not $identity.PathStillMatches($script:JournalPath, '\\?\C:\ProgramData\RunaAI\host-state\system-drive-preparation-v1.json') -or
                $identity.VolumeSerial -ne $StateIdentities.State.VolumeSerial -or
                $identity.FileId -ne $temporaryIdentity.FileId -or
                -not (Test-PrivateAcl $script:JournalPath $false) -or
                -not ([Linq.Enumerable]::SequenceEqual([byte[]][IO.File]::ReadAllBytes($script:JournalPath), [byte[]]$bytes))) { throw 'journal-verify-failed' }
            Assert-RunaStateIdentities $StateIdentities
            if ($null -ne $script:Coordinator) { $script:Coordinator.JournalPhase([string]$Journal.phase) }
        } finally { $identity.Dispose() }
    } finally {
        if ($null -ne $temporaryIdentity) { $temporaryIdentity.Dispose() }
        if ($null -ne $temporary -and [IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

function Read-RunaJournal($StateIdentities) {
    Assert-RunaStateIdentities $StateIdentities
    if (-not [IO.File]::Exists($script:JournalPath) -or
        -not (Test-PrivateAcl $script:JournalPath $false)) { throw 'journal-invalid' }
    $identity = [RunaDirectoryIdentity]::Open($script:JournalPath)
    try {
        if (-not $identity.PathStillMatches($script:JournalPath, '\\?\C:\ProgramData\RunaAI\host-state\system-drive-preparation-v1.json')) { throw 'journal-invalid' }
        $bytes = [IO.File]::ReadAllBytes($script:JournalPath)
        Assert-RunaStateIdentities $StateIdentities
    } finally { $identity.Dispose() }
    if ($bytes.Length -eq 0 -or $bytes.Length -gt 524288 -or
        ($bytes.Length -ge 3 -and $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf)) { throw 'journal-invalid' }
    try { $value = ($script:Utf8.GetString($bytes) | ConvertFrom-Json) } catch { throw 'journal-invalid' }
    $canonical = ConvertTo-RunaJournalBytes $value
    if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$bytes, [byte[]]$canonical)) { throw 'journal-invalid' }
    return $value
}

function Remove-RunaJournal($StateIdentities) {
    Assert-RunaStateIdentities $StateIdentities
    if (-not [IO.File]::Exists($script:JournalPath) -or
        -not (Test-PrivateAcl $script:JournalPath $false)) { throw 'journal-remove-invalid' }
    $identity = [RunaDirectoryIdentity]::Open($script:JournalPath)
    try { if (-not $identity.PathStillMatches($script:JournalPath, '\\?\C:\ProgramData\RunaAI\host-state\system-drive-preparation-v1.json')) { throw 'journal-remove-invalid' } }
    finally { $identity.Dispose() }
    Assert-RunaStateIdentities $StateIdentities
    [IO.File]::Delete($script:JournalPath)
    Assert-RunaStateIdentities $StateIdentities
    if ([IO.File]::Exists($script:JournalPath)) { throw 'journal-remove-failed' }
    if ($null -ne $script:Coordinator) { $script:Coordinator.JournalRemoved() }
}

function Invoke-RunaTargetOnlyProbe($StateIdentities) {
    $probeRoot = Join-Path $script:StateDirectory ('probe-' + [Guid]::NewGuid().ToString('N'))
    $probeChild = Join-Path $probeRoot 'child'
    $probeIdentity = $null
    $passed = $false
    try {
        Assert-RunaStateIdentities $StateIdentities
        if ([IO.Directory]::Exists($probeRoot)) { throw 'probe-precondition' }
        [IO.Directory]::CreateDirectory($probeRoot) | Out-Null
        $probeIdentity = [RunaDirectoryIdentity]::Open($probeRoot)
        if (-not $probeIdentity.PathStillMatches($probeRoot, ('\\?\' + $probeRoot))) { throw 'probe-identity' }
        [RunaOmenAclNative]::ConfigureProbeParent($probeRoot)
        [IO.Directory]::CreateDirectory($probeChild) | Out-Null
        if (-not $probeIdentity.PathStillMatches($probeRoot, ('\\?\' + $probeRoot))) { throw 'probe-identity' }
        $parentBefore = [RunaOmenAclNative]::Read($probeRoot)
        $childBefore = [RunaOmenAclNative]::Read($probeChild)
        $setup = [RunaOmenAclNative]::BuildProbeSetupExpected($parentBefore)
        Assert-RunaStateIdentities $StateIdentities
        if (-not $probeIdentity.PathStillMatches($probeRoot, ('\\?\' + $probeRoot))) { throw 'probe-identity' }
        $write = [RunaOmenAclNative]::ApplyDacl($probeRoot, $setup.SecurityDescriptor)
        $setupActual = [RunaOmenAclNative]::Read($probeRoot)
        if (-not $write.Success -or -not [RunaOmenAclNative]::ValidateProbeSetupResult(
                $setup.CanonicalDescriptor, $setupActual.CanonicalDescriptor) -or
            -not [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($probeChild), $childBefore)) { throw 'probe-setup' }
        $expected = [RunaOmenAclNative]::BuildExpected($setupActual)
        Assert-RunaStateIdentities $StateIdentities
        if (-not $probeIdentity.PathStillMatches($probeRoot, ('\\?\' + $probeRoot))) { throw 'probe-identity' }
        $write = [RunaOmenAclNative]::ApplyDacl($probeRoot, $expected.SecurityDescriptor)
        $targetActual = [RunaOmenAclNative]::Read($probeRoot)
        if (-not $write.Success -or -not [RunaOmenAclNative]::ValidatePreparedDelta(
                $setupActual.CanonicalDescriptor, $targetActual.CanonicalDescriptor) -or
            -not [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($probeChild), $childBefore)) { throw 'probe-target' }
        Assert-RunaStateIdentities $StateIdentities
        if (-not $probeIdentity.PathStillMatches($probeRoot, ('\\?\' + $probeRoot))) { throw 'probe-identity' }
        $write = [RunaOmenAclNative]::ApplyDacl($probeRoot, $setupActual.SecurityDescriptor)
        if (-not $write.Success -or -not [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($probeRoot), $setupActual) -or
            -not [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($probeChild), $childBefore)) { throw 'probe-restore' }
        $passed = $true
    } finally {
        $cleanupValid = $true
        try {
            Assert-RunaStateIdentities $StateIdentities
            if ($null -ne $probeIdentity -and -not $probeIdentity.PathStillMatches($probeRoot, ('\\?\' + $probeRoot))) {
                $cleanupValid = $false
            }
        } catch { $cleanupValid = $false }
        if ([IO.Directory]::Exists($probeRoot)) {
            if ($null -eq $probeIdentity -or -not $cleanupValid -or
                -not [RunaOmenAclNative]::TryRemoveOwnedTree($probeIdentity, $probeRoot, ('\\?\' + $probeRoot))) {
                $cleanupValid = $false
            }
        }
        if ($null -ne $probeIdentity) { $probeIdentity.Dispose() }
        if (-not $cleanupValid) { throw 'probe-cleanup-failed' }
    }
    return $passed
}

function Assert-RunaRootIdentity([RunaDirectoryIdentity]$Identity) {
    if ($Target -cne 'C:\' -or -not $Identity.PathStillMatches($Target, '\\?\C:\')) {
        throw 'root-identity-invalid'
    }
}

function Invoke-RunaPrerequisiteReader {
    $arguments = [string[]]@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$PrerequisiteReaderPath,
        '-ExpectedScriptSha256',$ExpectedPrerequisiteReaderSha256,'-NativeSourcePath',$NativeSourcePath,
        '-ExpectedNativeSourceSha256',$ExpectedNativeSourceSha256,'-ContainedProcessSourcePath',$ContainedProcessSourcePath,
        '-ExpectedContainedProcessSourceSha256',$ExpectedContainedProcessSourceSha256,'-HostPrepPath',$HostPrepPath,
        '-ExpectedHostPrepSha256',$ExpectedHostPrepSha256,
        '-ExpectedPreparedDescriptorSha256',$script:PreparedDescriptorSha256,'-Target','C:\')
    $child = [RunaContainedProcess]::Run($PowerShellPath, $arguments, 30000, 8192)
    if (-not $child.Started -or -not $child.Terminal -or -not $child.NoSurvivors -or $child.TimedOut -or
        $child.OutputOverflow) { return $null }
    $text = $child.StandardOutput.Trim()
    try { $value = $text | ConvertFrom-Json } catch { return $null }
    if ((Test-ExactKeys $value @('schemaVersion','outcome','systemDrivePrepared','nullDevicePrepared','ready','privateValuesIncluded')) -and
        $value.schemaVersion -ceq 'runa-omen-host-prerequisites/v1' -and $value.outcome -ceq 'completed' -and
        $value.systemDrivePrepared -is [bool] -and $value.nullDevicePrepared -is [bool] -and $value.ready -is [bool] -and
        $value.ready -eq ($value.systemDrivePrepared -and $value.nullDevicePrepared) -and $value.privateValuesIncluded -eq $false) {
        return [pscustomobject][ordered]@{ Json = ($value | ConvertTo-Json -Compress); Ready = [bool]$value.ready; ExitCode = [int]$child.ExitCode }
    }
    return $null
}

try {
    if ($env:RUNA_ACTUAL_HOST_TRANSITION -cne '1' -or -not (Test-RunaPins)) {
        Write-RunaTransition 'error' 'preflight' 'pin-drift' 'unknown' $false $false 'absent' $false; exit 1
    }
    Add-Type -Path $NativeSourcePath
    Add-Type -Path $ContainedProcessSourcePath
    if ([RunaOmenAclNative]::BindingContract -cne $script:BindingContract) {
        Write-RunaTransition 'error' 'preflight' 'pin-drift' 'unknown' $false $false 'absent' $false; exit 1
    }
    $script:Coordinator = New-Object RunaSystemDriveCoordinator($Operation.ToLowerInvariant())

    $mutexSecurity = New-Object Security.AccessControl.MutexSecurity
    $mutexSecurity.SetAccessRuleProtection($true, $false)
    foreach ($sid in @(
        (New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::LocalSystemSid, $null)),
        (New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null))
    )) { $mutexSecurity.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule($sid, [Security.AccessControl.MutexRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow))) }
    $created = $false
    $script:Mutex = New-Object Threading.Mutex($false, 'Global\RunaAI-SystemDrivePreparation-v1', [ref]$created, $mutexSecurity)
    $expectedMutexSddl = 'D:P(A;;0x1f0001;;;SY)(A;;0x1f0001;;;BA)'
    if ($mutexSecurity.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) -cne $expectedMutexSddl) {
        Write-RunaMutexPreconditionFailure; exit 1
    }
    $actualMutexSddl = $script:Mutex.GetAccessControl().GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
    if ($actualMutexSddl -cne $expectedMutexSddl) {
        Write-RunaMutexPreconditionFailure; exit 1
    }
    $mutexOutcome = [RunaMutexWait]::Enter($script:Mutex)
    if ($mutexOutcome -ceq 'abandoned') {
        Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $false $false 'unknown' $false; exit 1
    }
    if ($mutexOutcome -ceq 'busy') { Write-RunaMutexPreconditionFailure; exit 1 }
    if ($mutexOutcome -cne 'acquired') { throw 'mutex-outcome-invalid' }
    $script:MutexHeld = $true

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-RunaMutexPreconditionFailure; exit 1
    }

    if ($Operation -ceq 'Deprovision' -and -not [IO.File]::Exists($script:JournalPath)) {
        Write-RunaTransition 'error' 'preflight' 'precondition-failed' 'unknown' $false $false 'unknown' $false; exit 1
    }
    $stateIdentity = Initialize-RunaStateDirectory
    try {
        try { $probePassed = Invoke-RunaTargetOnlyProbe $stateIdentity } catch {
            $code = if ($_.Exception.Message -ceq 'probe-cleanup-failed') { 'probe-cleanup-failed' } else { 'probe-failed' }
            $journalState = if ([IO.File]::Exists($script:JournalPath)) { 'retained' } else { 'absent' }
            $state = if ($Operation -ceq 'Deprovision') { 'prepared' } else { 'unknown' }
            Write-RunaTransition 'error' 'preflight' $code $state $false $false $journalState $false; exit 1
        }
        $script:ProbePassed = [bool]$probePassed
        if ($probePassed) { $script:Coordinator.ProbePassed() }
        if (-not $probePassed -or -not (Test-RunaPins) -or [RunaOmenAclNative]::BindingContract -cne $script:BindingContract) {
            if ($Operation -ceq 'Deprovision') {
                Write-RunaTransition 'error' 'preflight' 'pin-drift' 'prepared' $false $false 'retained' $true
            } else {
                Write-RunaTransition 'error' 'preflight' 'pin-drift' 'unknown' $false $false 'absent' $true
            }
            exit 1
        }
        if ($Operation -ceq 'Prepare' -and [IO.File]::Exists($script:JournalPath)) {
            Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $false $false 'retained' $true; exit 1
        }

        $rootIdentity = [RunaDirectoryIdentity]::Open($Target)
        try {
            Assert-RunaRootIdentity $rootIdentity
            if ($Operation -ceq 'Prepare') {
                if ([IO.File]::Exists($script:JournalPath) -or -not [RunaOmenAclNative]::HasNoExplicitTargetAce($Target)) {
                    Write-RunaTransition 'error' 'preflight' 'precondition-failed' 'unknown' $false $false 'absent' $true; exit 1
                }
                $pre = [RunaOmenAclNative]::Read($Target)
                $expected = [RunaOmenAclNative]::BuildExpected($pre)
                if (-not [RunaOmenAclNative]::ValidatePlannedDelta($pre.CanonicalDescriptor, $expected.CanonicalDescriptor)) {
                    Write-RunaTransition 'error' 'preflight' 'precondition-failed' 'unknown' $false $false 'absent' $true; exit 1
                }
                $journal = [pscustomobject][ordered]@{
                    schemaVersion = $script:JournalSchema; transactionId = [Guid]::NewGuid().ToString('N')
                    operation = 'prepare'; phase = 'authorized'; transitionScriptSha256 = $ExpectedScriptSha256
                    writeApi = 'SetFileSecurityW:DACL_SECURITY_INFORMATION'; target = 'C:\'
                    preDescriptorBase64 = [Convert]::ToBase64String($pre.CanonicalDescriptor); preDescriptorSha256 = $pre.CanonicalSha256
                    expectedPostDescriptorBase64 = [Convert]::ToBase64String($expected.CanonicalDescriptor); expectedPostDescriptorSha256 = $expected.CanonicalSha256
                    prepareAttempt = New-RunaAttempt; rollbackAttempt = New-RunaAttempt; deprovisionAttempt = New-RunaAttempt
                    systemDriveState = 'unprepared'; rollbackVerified = $false
                }
                try { Write-RunaJournal $journal $stateIdentity $false } catch {
                    Write-RunaTransition 'error' 'preflight' 'journal-failed' 'unprepared' $false $false 'unknown' $true; exit 1
                }
                $journal.phase = 'prepare-started'; $journal.prepareAttempt.started = $true; $journal.systemDriveState = 'unknown'
                Write-RunaJournal $journal $stateIdentity $true
                if (-not (Test-RunaPins)) { throw 'reconciliation-required' }
                Assert-RunaRootIdentity $rootIdentity
                if (-not [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($Target), $pre)) { throw 'reconciliation-required' }
                $script:Coordinator.RootWrite('prepare')
                $script:RootWriteStarted = $true
                $write = [RunaOmenAclNative]::ApplyDacl($Target, $expected.SecurityDescriptor)
                Assert-RunaRootIdentity $rootIdentity
                $actual = [RunaOmenAclNative]::Read($Target)
                $preparedDelta = $write.Success -and [RunaOmenAclNative]::ValidatePreparedDelta(
                    $pre.CanonicalDescriptor, $actual.CanonicalDescriptor)
                if ($preparedDelta) {
                    $journal.expectedPostDescriptorBase64 = [Convert]::ToBase64String($actual.CanonicalDescriptor)
                    $journal.expectedPostDescriptorSha256 = $actual.CanonicalSha256
                }
                $journal.phase = 'prepare-terminal'; $journal.prepareAttempt.terminal = $true
                $journal.prepareAttempt.win32Success = [bool]$write.Success
                $journal.prepareAttempt.win32Error = if ($write.Success) { $null } else { [uint32]$write.Win32Error }
                $journal.systemDriveState = if ($preparedDelta) { 'prepared' } elseif ([RunaOmenAclNative]::Equal($actual, $pre)) { 'unprepared' } else { 'unknown' }
                Write-RunaJournal $journal $stateIdentity $true
                if ($write.Success -and $journal.systemDriveState -ceq 'prepared') {
                    $journal.phase = 'prepared'; Write-RunaJournal $journal $stateIdentity $true
                    $script:PreparedDescriptorSha256 = $journal.expectedPostDescriptorSha256
                    Write-RunaTransition 'prepared' 'complete' 'prepared' 'prepared' $false $false 'retained' $true
                    $reader = Invoke-RunaPrerequisiteReader
                    if ($null -ne $reader) { $reader.Json }
                    if ($null -ne $reader -and $reader.Ready -and $reader.ExitCode -eq 0) { exit 0 }
                    exit 1
                }
                if ($journal.systemDriveState -ceq 'unprepared') {
                    Write-RunaTransition 'error' 'prepare' 'prepare-failed-no-change' 'unprepared' $false $false 'retained' $true; exit 1
                }
                $journal.phase = 'rollback-started'; $journal.rollbackAttempt.started = $true; $journal.systemDriveState = 'unknown'
                Write-RunaJournal $journal $stateIdentity $true
                $rollbackRaw = [RunaOmenAclNative]::SecurityDescriptorFromCanonical([Convert]::FromBase64String($journal.preDescriptorBase64))
                if (-not (Test-RunaPins)) { throw 'reconciliation-required' }
                Assert-RunaRootIdentity $rootIdentity
                if (-not [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($Target), $actual)) { throw 'reconciliation-required' }
                $script:Coordinator.RootWrite('rollback')
                $script:RollbackStarted = $true
                $rollback = [RunaOmenAclNative]::ApplyDacl($Target, $rollbackRaw)
                Assert-RunaRootIdentity $rootIdentity
                $restored = [RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($Target), $pre)
                $journal.phase = 'rollback-terminal'; $journal.rollbackAttempt.terminal = $true
                $journal.rollbackAttempt.win32Success = [bool]$rollback.Success
                $journal.rollbackAttempt.win32Error = if ($rollback.Success) { $null } else { [uint32]$rollback.Win32Error }
                $journal.systemDriveState = if ($restored) { 'unprepared' } else { 'unknown' }; $journal.rollbackVerified = [bool]$restored
                Write-RunaJournal $journal $stateIdentity $true
                if (-not $restored) { Write-RunaTransition 'error' 'rollback' 'rollback-failed' 'unknown' $true $false 'retained' $true; exit 1 }
                try { Remove-RunaJournal $stateIdentity } catch {
                    Write-RunaTransition 'error' 'rollback' 'journal-removal-failed' 'unprepared' $true $true 'retained' $true; exit 1
                }
                $code = if ($write.Success) { 'post-state-mismatch-restored' } else { 'prepare-failed-restored' }
                Write-RunaTransition 'restored' 'complete' $code 'unprepared' $true $true 'removed' $true; exit 1
            }

            try { $journal = Read-RunaJournal $stateIdentity } catch {
                Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $false $false 'retained' $true; exit 1
            }
            if ($journal.phase -cne 'prepared' -or $journal.transitionScriptSha256 -cne $ExpectedScriptSha256) {
                Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $false $false 'retained' $true; exit 1
            }
            $preparedBytes = [Convert]::FromBase64String($journal.expectedPostDescriptorBase64)
            $preBytes = [Convert]::FromBase64String($journal.preDescriptorBase64)
            $actual = [RunaOmenAclNative]::Read($Target)
            if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$actual.CanonicalDescriptor, [byte[]]$preparedBytes)) {
                Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $false $false 'retained' $true; exit 1
            }
            $journal.operation = 'deprovision'; $journal.phase = 'deprovision-started'; $journal.deprovisionAttempt.started = $true
            $journal.systemDriveState = 'unknown'; Write-RunaJournal $journal $stateIdentity $true
            if (-not (Test-RunaPins)) { throw 'reconciliation-required' }
            Assert-RunaRootIdentity $rootIdentity
            if (-not [Linq.Enumerable]::SequenceEqual([byte[]]([RunaOmenAclNative]::Read($Target).CanonicalDescriptor), [byte[]]$preparedBytes)) { throw 'reconciliation-required' }
            $raw = [RunaOmenAclNative]::SecurityDescriptorFromCanonical($preBytes)
            $script:Coordinator.RootWrite('deprovision')
            $script:RootWriteStarted = $true
            $write = [RunaOmenAclNative]::ApplyDacl($Target, $raw)
            Assert-RunaRootIdentity $rootIdentity
            $after = [RunaOmenAclNative]::Read($Target)
            $isPre = [Linq.Enumerable]::SequenceEqual([byte[]]$after.CanonicalDescriptor, [byte[]]$preBytes)
            $isPrepared = [Linq.Enumerable]::SequenceEqual([byte[]]$after.CanonicalDescriptor, [byte[]]$preparedBytes)
            $journal.phase = 'deprovision-terminal'; $journal.deprovisionAttempt.terminal = $true
            $journal.deprovisionAttempt.win32Success = [bool]$write.Success
            $journal.deprovisionAttempt.win32Error = if ($write.Success) { $null } else { [uint32]$write.Win32Error }
            $journal.systemDriveState = if ($isPre) { 'unprepared' } elseif ($isPrepared) { 'prepared' } else { 'unknown' }
            Write-RunaJournal $journal $stateIdentity $true
            if ($isPre -and $write.Success) {
                try { Remove-RunaJournal $stateIdentity } catch {
                    Write-RunaTransition 'error' 'deprovision' 'journal-removal-failed' 'unprepared' $false $false 'retained' $true; exit 1
                }
                Write-RunaTransition 'deprovisioned' 'complete' 'deprovisioned' 'unprepared' $false $false 'removed' $true; exit 0
            }
            if ($isPre) { Write-RunaTransition 'error' 'deprovision' 'deprovision-failed-unprepared' 'unprepared' $false $false 'retained' $true; exit 1 }
            if ($isPrepared) { Write-RunaTransition 'error' 'deprovision' 'deprovision-failed-prepared' 'prepared' $false $false 'retained' $true; exit 1 }
            Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $false $false 'retained' $true; exit 1
        } finally { $rootIdentity.Dispose() }
    } finally {
        $stateIdentity.State.Dispose(); $stateIdentity.Runa.Dispose(); $stateIdentity.ProgramData.Dispose()
    }
} catch {
    $journalState = if ([IO.File]::Exists($script:JournalPath)) { 'retained' } else { 'unknown' }
    Write-RunaTransition 'error' 'complete' 'reconciliation-required' 'unknown' $script:RollbackStarted $false $journalState $script:ProbePassed
    exit 1
} finally {
    if ($script:MutexHeld -and $null -ne $script:Mutex) { $script:Mutex.ReleaseMutex() }
    if ($null -ne $script:Mutex) { $script:Mutex.Dispose() }
}
