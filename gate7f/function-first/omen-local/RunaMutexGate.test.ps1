$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$nativeSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'RunaOmenAclNative.cs'))

function New-ExpectedSecurity {
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
    return $security
}

$name = 'Local\RunaAI-Mutex-Test-' + [Guid]::NewGuid().ToString('N')
$security = New-ExpectedSecurity
$created = $false
$mutex = New-Object Threading.Mutex($false, $name, [ref]$created, $security)
try {
    $literal = 'D:P(A;;0x1f0001;;;SY)(A;;0x1f0001;;;BA)'
    $aclExact = $created -and
        $security.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) -ceq $literal -and
        $mutex.GetAccessControl().GetSecurityDescriptorSddlForm(
            [Security.AccessControl.AccessControlSections]::Access) -ceq $literal
} finally { $mutex.Dispose() }

$testSource = @'
public static class RunaMutexTestNative {
    public static bool BusyRejected() {
        System.Threading.ManualResetEventSlim ready = new System.Threading.ManualResetEventSlim(false),
            release = new System.Threading.ManualResetEventSlim(false);
        using (System.Threading.Mutex owned = new System.Threading.Mutex(false)) {
            System.Threading.Thread thread = new System.Threading.Thread(() => {
                owned.WaitOne(); ready.Set(); release.Wait(); owned.ReleaseMutex(); });
            thread.Start(); if (!ready.Wait(5000)) return false;
            bool rejected = RunaMutexWait.Enter(owned) == "busy";
            release.Set(); thread.Join(5000); return rejected && !thread.IsAlive;
        }
    }
    public static bool AbandonedRejected() {
        System.Threading.ManualResetEventSlim ready = new System.Threading.ManualResetEventSlim(false);
        using (System.Threading.Mutex anchor = new System.Threading.Mutex(false)) {
            System.Threading.Thread thread = new System.Threading.Thread(() => { anchor.WaitOne(); ready.Set(); });
            thread.Start(); if (!ready.Wait(5000) || !thread.Join(5000)) return false;
            if (RunaMutexWait.Enter(anchor) != "abandoned") return false;
            if (RunaMutexWait.Enter(anchor) != "acquired") return false;
            anchor.ReleaseMutex(); return true;
        }
    }
}
'@
Add-Type -TypeDefinition ($nativeSource + [Environment]::NewLine + $testSource)
$busyRejected = [RunaMutexTestNative]::BusyRejected()
$abandonedRejected = [RunaMutexTestNative]::AbandonedRejected()

$wrong = New-Object Security.AccessControl.MutexSecurity
$wrong.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule(
    [Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.AccessControl.MutexRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow)))
$wrongSecurityRejected = $wrong.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) -cne
    $security.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)

$passed = $aclExact -and $busyRejected -and $abandonedRejected -and $wrongSecurityRejected
[pscustomobject][ordered]@{
    schemaVersion = 'runa-omen-mutex-gate-smoke/v1'; passed = [bool]$passed; aclExact = [bool]$aclExact
    busyRejected = [bool]$busyRejected; abandonedRejected = [bool]$abandonedRejected
    wrongSecurityRejected = [bool]$wrongSecurityRejected; privateValuesIncluded = $false
} | ConvertTo-Json -Compress
if (-not $passed) { throw 'mutex-gate-smoke-failed' }
