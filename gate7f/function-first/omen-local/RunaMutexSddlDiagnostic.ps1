$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$security = New-Object Security.AccessControl.MutexSecurity
$security.SetAccessRuleProtection($true, $false)
foreach ($sid in @(
    (New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::LocalSystemSid, $null)),
    (New-Object Security.Principal.SecurityIdentifier([Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null))
)) {
    $security.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule($sid,
        [Security.AccessControl.MutexRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow)))
}
$created = $false
$mutex = New-Object Threading.Mutex($false, ('Local\RunaAI-Mutex-SDDL-' + [Guid]::NewGuid().ToString('N')),
    [ref]$created, $security)
try {
    [pscustomobject][ordered]@{
        schemaVersion = 'runa-omen-mutex-sddl-diagnostic/v1'
        template = $security.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
        readback = $mutex.GetAccessControl().GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
        created = [bool]$created
        privateValuesIncluded = $false
    } | ConvertTo-Json -Compress
} finally { $mutex.Dispose() }
