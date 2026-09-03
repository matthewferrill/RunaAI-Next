param(
    [Parameter(Mandatory = $true)][string]$ExpectedScriptSha256,
    [Parameter(Mandatory = $true)][string]$NativeSourcePath,
    [Parameter(Mandatory = $true)][string]$ExpectedNativeSourceSha256,
    [Parameter(Mandatory = $true)][string]$ContainedProcessSourcePath,
    [Parameter(Mandatory = $true)][string]$ExpectedContainedProcessSourceSha256,
    [Parameter(Mandatory = $true)][string]$HostPrepPath,
    [Parameter(Mandatory = $true)][string]$ExpectedHostPrepSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedPreparedDescriptorSha256,
    [string]$Target = 'C:\'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-RunaSha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
    } finally { $stream.Dispose() }
}

function Write-RunaError(
    [string]$Stage,
    [string]$Code,
    [Nullable[uint32]]$ChildExitCode = $null,
    [Nullable[int]]$ChildOutputBytes = $null
) {
    [pscustomobject][ordered]@{
        schemaVersion = 'runa-omen-host-prerequisites/v1'
        outcome = 'error'
        stage = $Stage
        code = $Code
        childExitCode = if ($ChildExitCode.HasValue) { $ChildExitCode.Value } else { $null }
        childOutputBytes = if ($ChildOutputBytes.HasValue) { $ChildOutputBytes.Value } else { $null }
        privateValuesIncluded = $false
    } | ConvertTo-Json -Compress
}

try {
    $scriptPath = $MyInvocation.MyCommand.Path
    foreach ($pin in @(
        @($scriptPath, $ExpectedScriptSha256),
        @($NativeSourcePath, $ExpectedNativeSourceSha256),
        @($ContainedProcessSourcePath, $ExpectedContainedProcessSourceSha256),
        @($HostPrepPath, $ExpectedHostPrepSha256)
    )) {
        if (-not [IO.File]::Exists($pin[0]) -or $pin[1] -notmatch '^[a-f0-9]{64}$') {
            Write-RunaError 'pins' 'pin-invalid'; exit 1
        }
        if ((Get-RunaSha256 $pin[0]) -cne $pin[1]) { Write-RunaError 'pins' 'pin-drift'; exit 1 }
    }

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-RunaError 'token' 'token-not-elevated'; exit 1
    }

    try {
        Add-Type -Path $NativeSourcePath
        Add-Type -Path $ContainedProcessSourcePath
    } catch {
        Write-RunaError 'pins' 'pin-invalid'; exit 1
    }

    try {
        if ($Target -cne 'C:\') { throw 'target-invalid' }
        $snapshot = [RunaOmenAclNative]::Read($Target)
        $systemDrivePrepared = [RunaOmenAclNative]::HasPreparedSystemDrive($Target) -and
            $ExpectedPreparedDescriptorSha256 -cmatch '^[a-f0-9]{64}$' -and
            $snapshot.CanonicalSha256 -ceq $ExpectedPreparedDescriptorSha256
    } catch {
        Write-RunaError 'system-drive' 'acl-read-failed'; exit 1
    }

    try {
        $child = [RunaContainedProcess]::Run($HostPrepPath, [string[]]@('verify-null-device'), 30000, 8192)
    } catch {
        Write-RunaError 'null-device' 'child-start-failed'; exit 1
    }
    if (-not $child.Terminal -or -not $child.NoSurvivors) {
        Write-RunaError 'null-device' 'child-terminal-unresolved' $null ([Math]::Min(8192, [int]$child.OutputBytes)); exit 1
    }
    if ($child.OutputOverflow) {
        Write-RunaError 'null-device' 'child-output-unexpected' ([uint32]$child.ExitCode) ([Math]::Min(8192, [int]$child.OutputBytes)); exit 1
    }
    if ($child.TimedOut) {
        Write-RunaError 'null-device' 'child-timeout' ([uint32]$child.ExitCode) ([Math]::Min(8192, [int]$child.OutputBytes)); exit 1
    }
    if ($child.ExitCode -ne 0 -and $child.ExitCode -ne 1) {
        Write-RunaError 'null-device' 'child-exit-invalid' ([uint32]$child.ExitCode) ([int]$child.OutputBytes); exit 1
    }
    $nullDevicePrepared = $child.ExitCode -eq 0
    [pscustomobject][ordered]@{
        schemaVersion = 'runa-omen-host-prerequisites/v1'
        outcome = 'completed'
        systemDrivePrepared = [bool]$systemDrivePrepared
        nullDevicePrepared = [bool]$nullDevicePrepared
        ready = [bool]($systemDrivePrepared -and $nullDevicePrepared)
        privateValuesIncluded = $false
    } | ConvertTo-Json -Compress
} catch {
    Write-RunaError 'result' 'result-invalid'
    exit 1
}
