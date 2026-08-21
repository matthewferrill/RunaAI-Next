param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('protect', 'unprotect')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$inputBase64 = [Console]::In.ReadToEnd().Trim()
if ([string]::IsNullOrWhiteSpace($inputBase64)) {
    throw 'Gate 4A DPAPI input is required.'
}

[byte[]]$inputBytes = [Convert]::FromBase64String($inputBase64)
[byte[]]$entropy = [Text.Encoding]::UTF8.GetBytes('RunaAI Gate 4A disposable protected rehearsal v1')
[byte[]]$outputBytes = $null

try {
    if ($Mode -eq 'protect') {
        $outputBytes = [Security.Cryptography.ProtectedData]::Protect(
            $inputBytes,
            $entropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
    }
    else {
        $outputBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $inputBytes,
            $entropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
    }

    [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
}
finally {
    if ($inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
    if ($outputBytes) { [Array]::Clear($outputBytes, 0, $outputBytes.Length) }
    if ($entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
}
