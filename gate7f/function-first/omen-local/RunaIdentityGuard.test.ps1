$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -Path (Join-Path $PSScriptRoot 'RunaOmenAclNative.cs')

$root = Join-Path ([IO.Path]::GetTempPath()) ('runa-identity-' + [Guid]::NewGuid().ToString('N'))
$heldPath = Join-Path $root 'held'
$movedPath = Join-Path $root 'moved'
$file = Join-Path $root 'journal.json'
$link = Join-Path $root 'journal-link.json'
$junction = Join-Path $root 'junction'
$replacementMarker = Join-Path $heldPath 'replacement.marker'
$atomicSource = Join-Path $root 'atomic-source.json'
$atomicDestination = Join-Path $root 'atomic-destination.json'
$held = $null
try {
    [IO.Directory]::CreateDirectory($heldPath) | Out-Null
    [IO.File]::WriteAllText($file, '{}')
    New-Item -ItemType HardLink -Path $link -Target $file | Out-Null
    New-Item -ItemType Junction -Path $junction -Target $heldPath | Out-Null
    $held = [RunaDirectoryIdentity]::Open($heldPath)
    $expected = '\\?\' + $heldPath
    $exactPath = $held.PathStillMatches($heldPath, $expected)
    $renameBlocked = $false
    try { [IO.Directory]::Move($heldPath, $movedPath) } catch { $renameBlocked = $true }
    $renameDetected = if ($renameBlocked) {
        $held.PathStillMatches($heldPath, $expected)
    } else {
        [IO.Directory]::Exists($movedPath) -and -not $held.PathStillMatches($heldPath, $expected)
    }
    if ($renameBlocked) {
        $replacementPreserved = $true
    } else {
        [IO.Directory]::CreateDirectory($heldPath) | Out-Null
        [IO.File]::WriteAllText($replacementMarker, 'replacement')
        $replacementPreserved = -not [RunaOmenAclNative]::TryRemoveOwnedTree($held, $heldPath, $expected) -and
            [IO.Directory]::Exists($movedPath) -and [IO.File]::Exists($replacementMarker)
    }
    $hardlink = [RunaDirectoryIdentity]::Open($file)
    try { $hardlinkRejected = $hardlink.LinkCount -ne 1 } finally { $hardlink.Dispose() }
    $reparseRejected = $false
    try { $bad = [RunaDirectoryIdentity]::Open($junction); $bad.Dispose() } catch { $reparseRejected = $true }
    [IO.File]::WriteAllText($atomicSource, '{"state":"prepared"}')
    $atomicBefore = [RunaDirectoryIdentity]::Open($atomicSource)
    try {
        $atomicSourceValid = $atomicBefore.PathStillMatches($atomicSource, ('\\?\' + $atomicSource))
        [RunaOmenAclNative]::AtomicMove($atomicSource, $atomicDestination, $false)
        $atomicAfter = [RunaDirectoryIdentity]::Open($atomicDestination)
        try {
            $atomicIdentityPreserved = $atomicAfter.PathStillMatches($atomicDestination, ('\\?\' + $atomicDestination)) -and
                $atomicAfter.VolumeSerial -eq $atomicBefore.VolumeSerial -and $atomicAfter.FileId -eq $atomicBefore.FileId
        } finally { $atomicAfter.Dispose() }
    } finally { $atomicBefore.Dispose() }
    $passed = $exactPath -and $renameDetected -and
        $hardlinkRejected -and $reparseRejected -and $replacementPreserved -and
        $atomicSourceValid -and $atomicIdentityPreserved
} finally {
    if ($null -ne $held) { $held.Dispose() }
    if ([IO.Directory]::Exists($junction)) { [IO.Directory]::Delete($junction) }
    if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
[pscustomobject][ordered]@{
    schemaVersion = 'runa-omen-identity-guard-smoke/v1'; passed = [bool]$passed
    exactPath = [bool]$exactPath; renameBlocked = [bool]$renameBlocked
    renameDetected = [bool]$renameDetected; hardlinkRejected = [bool]$hardlinkRejected; reparseRejected = [bool]$reparseRejected
    replacementPreserved = [bool]$replacementPreserved
    atomicSourceValid = [bool]$atomicSourceValid; atomicIdentityPreserved = [bool]$atomicIdentityPreserved
    fixtureRemoved = [bool](-not [IO.Directory]::Exists($root)); privateValuesIncluded = $false
} | ConvertTo-Json -Compress
if (-not $passed -or [IO.Directory]::Exists($root)) { throw 'identity-guard-smoke-failed' }
