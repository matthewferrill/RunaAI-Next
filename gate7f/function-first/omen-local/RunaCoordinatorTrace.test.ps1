$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -Path (Join-Path $PSScriptRoot 'RunaOmenAclNative.cs')

function New-TraceCase(
    [string]$Operation, [string[]]$Events, [string]$Outcome, [string]$Stage, [string]$Code,
    [string]$State, [bool]$RollbackAttempted, [bool]$RollbackVerified, [string]$Journal, [bool]$Probe
) {
    [pscustomobject]@{ Operation=$Operation; Events=$Events; Outcome=$Outcome; Stage=$Stage; Code=$Code
        State=$State; RollbackAttempted=$RollbackAttempted; RollbackVerified=$RollbackVerified
        Journal=$Journal; Probe=$Probe }
}

$p = 'probe'; $a = 'phase:authorized'; $ps = 'phase:prepare-started'; $pt = 'phase:prepare-terminal'
$pp = 'phase:prepared'; $rs = 'phase:rollback-started'; $rt = 'phase:rollback-terminal'
$ds = 'phase:deprovision-started'; $dt = 'phase:deprovision-terminal'
$wp = 'write:prepare'; $wr = 'write:rollback'; $wd = 'write:deprovision'; $rm = 'removed'
$cases = @(
    (New-TraceCase prepare @() error preflight pin-drift unknown $false $false absent $false),
    (New-TraceCase prepare @() error preflight precondition-failed unknown $false $false absent $false),
    (New-TraceCase prepare @() error complete reconciliation-required unknown $false $false unknown $false),
    (New-TraceCase prepare @() error preflight probe-failed unknown $false $false absent $false),
    (New-TraceCase prepare @() error preflight probe-cleanup-failed unknown $false $false absent $false),
    (New-TraceCase prepare @($p) error preflight pin-drift unknown $false $false absent $true),
    (New-TraceCase prepare @($p) error preflight precondition-failed unknown $false $false absent $true),
    (New-TraceCase prepare @($p) error preflight journal-failed unprepared $false $false unknown $true),
    (New-TraceCase prepare @($p,$a,$ps) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt) error prepare prepare-failed-no-change unprepared $false $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$pp) prepared complete prepared prepared $false $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$rs) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$rs,$wr) error complete reconciliation-required unknown $true $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$rs,$wr,$rt) error rollback rollback-failed unknown $true $false retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$rs,$wr,$rt) error rollback journal-removal-failed unprepared $true $true retained $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$rs,$wr,$rt,$rm) restored complete prepare-failed-restored unprepared $true $true removed $true),
    (New-TraceCase prepare @($p,$a,$ps,$wp,$pt,$rs,$wr,$rt,$rm) restored complete post-state-mismatch-restored unprepared $true $true removed $true),
    (New-TraceCase deprovision @() error preflight pin-drift unknown $false $false unknown $false),
    (New-TraceCase deprovision @() error preflight precondition-failed unknown $false $false unknown $false),
    (New-TraceCase deprovision @() error complete reconciliation-required unknown $false $false unknown $false),
    (New-TraceCase deprovision @() error preflight probe-failed prepared $false $false retained $false),
    (New-TraceCase deprovision @() error preflight probe-cleanup-failed prepared $false $false retained $false),
    (New-TraceCase deprovision @($p) error preflight pin-drift prepared $false $false retained $true),
    (New-TraceCase deprovision @($p) error preflight journal-failed prepared $false $false unknown $true),
    (New-TraceCase deprovision @($p) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds,$wd) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds,$wd,$dt) error deprovision deprovision-failed-unprepared unprepared $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds,$wd,$dt) error deprovision deprovision-failed-prepared prepared $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds,$wd,$dt) error complete reconciliation-required unknown $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds,$wd,$dt) error deprovision journal-removal-failed unprepared $false $false retained $true),
    (New-TraceCase deprovision @($p,$ds,$wd,$dt,$rm) deprovisioned complete deprovisioned unprepared $false $false removed $true)
)

foreach ($case in $cases) {
    $trace = New-Object RunaSystemDriveCoordinator($case.Operation)
    foreach ($event in $case.Events) {
        if ($event -ceq 'probe') { $trace.ProbePassed() }
        elseif ($event -ceq 'removed') { $trace.JournalRemoved() }
        elseif ($event.StartsWith('phase:')) { $trace.JournalPhase($event.Substring(6)) }
        elseif ($event.StartsWith('write:')) { $trace.RootWrite($event.Substring(6)) }
        else { throw 'coordinator-test-event-invalid' }
    }
    if (-not $trace.ValidateCompletion($case.Outcome, $case.Stage, $case.Code, $case.State,
        $case.RollbackAttempted, $case.RollbackVerified, $case.Journal, $case.Probe)) {
        throw 'coordinator-test-case-failed'
    }
    if ($trace.RootWrites -gt 1 -or $trace.RollbackWrites -gt 1) { throw 'coordinator-test-write-bound-failed' }
}

$probeOrderRejected = $false
try { (New-Object RunaSystemDriveCoordinator('prepare')).RootWrite('prepare') } catch { $probeOrderRejected = $true }
$terminalWithoutWriteRejected = $false
try {
    $invalid = New-Object RunaSystemDriveCoordinator('prepare'); $invalid.ProbePassed()
    $invalid.JournalPhase('authorized'); $invalid.JournalPhase('prepare-started'); $invalid.JournalPhase('prepare-terminal')
} catch { $terminalWithoutWriteRejected = $true }
$wrongCompletionRejected = -not (New-Object RunaSystemDriveCoordinator('prepare')).ValidateCompletion(
    'prepared', 'complete', 'prepared', 'prepared', $false, $false, 'retained', $false)
$passed = $probeOrderRejected -and $terminalWithoutWriteRejected -and $wrongCompletionRejected
[pscustomobject][ordered]@{
    schemaVersion='runa-omen-coordinator-trace-smoke/v1'; passed=[bool]$passed; caseCount=[int]$cases.Count
    probeOrderRejected=[bool]$probeOrderRejected; terminalWithoutWriteRejected=[bool]$terminalWithoutWriteRejected
    wrongCompletionRejected=[bool]$wrongCompletionRejected; privateValuesIncluded=$false
} | ConvertTo-Json -Compress
if (-not $passed) { throw 'coordinator-trace-smoke-failed' }
