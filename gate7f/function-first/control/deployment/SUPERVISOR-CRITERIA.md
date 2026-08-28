# Finite closed-companion execution: prospective criteria

Selection 2026-08-28, integrated source c9621d1. M1-S2 operational subsets of
C12/C15/C16; roadmap revision 2026-08-28.1, digest
613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521.
All 17 families remain. Standing authorization covers implementation and isolated
testing; this record does not authorize an unqualified production candidate.

## Baseline and exact addition

The existing closed companion has bounded individual commands and durable child
intents, but no enclosing deadline. Its pure descriptor/transaction is not an
executor. The completed 36-case loopback Caddy/mTLS proof does not fill that gap.
Add an independent Windows watchdog and a concrete, constructor-only closed
companion adapter. Keep the exact frozen app/source/seal and all historical
results unchanged. The 9556 candidate is diagnostic, not promoted or requalified.

The watchdog receives only an owner-authenticated private request with exact
executable, argument, operator package and descriptor hashes. Before launch it
creates durable request/intent records. A Windows kill-on-close job is assigned
atomically at process creation with PROC_THREAD_ATTRIBUTE_JOB_LIST; start the
companion suspended and retain its actual PID/start time before resuming it.
Only explicit standard handles are inherited; the job handle is not. Unsupported
OS/job nesting fails closed. Never use a create-then-assign running-process gap.

Maximum companion lifetime is 600000 ms, plus at most 5000 ms cleanup. Existing
20/60/120-second child limits remain unchanged. Bound stdout/stderr to 262144
bytes each; retain only the bounded stdout needed for the typed result, never
stderr contents. A finite independent safety timer closes/kills the owned job
even if the launching controller disappears or a synchronous observer stalls.
Kill only this owned process tree, never a process name, global service or task.
External Task Scheduler/service effects are explicitly outside job containment.

## Journal, authority and recovery

Each outer operation has a create-only ID, exact descriptor/package/argv pins,
absolute deadline, durable supervisor and companion identities, and terminal
record. Single writer is a native exclusive file handle; files must be regular,
single-link and inside an owner/SYSTEM/Administrators-only directory. Refuse any
existing operation, malformed/foreign record, drift, stale phase or unresolved
prior record. A missing, truncated, foreign or failed terminal never permits
automatic rollback, replay or admission reopening. A fresh process may observe
an existing exact operation only; observed process exit alone does not prove
application/task restoration. Retain unknown after watchdog death or output loss.

The concrete adapter derives exact argv from the existing descriptor, validates
the four companion file pins, and runs only the fixed Windows PowerShell entry.
No browser/model config grants execution. Mandatory trusted effect-time hooks
must establish actual exclusive transaction ownership, current candidate-closed
Caddy identity with no pending mutation, qualified candidate and fresh Home
native-wide/readiness authority. They remain explicit unavailable adapters until
their real implementations exist. No invented Home receipt/boolean substitutes.
The adapter verifies the complete typed closed-companion result plus child
receipts and current closed phase before reporting closed deployment complete;
it never publishes Caddy or silently performs rollback.

## Required isolated evidence

Actual Windows fixtures, no Home/Control network or production secrets/services:

1. Success: durable intent precedes suspended start, exact PID/start binding,
   child sees stdin EOF, complete bounded output, zero job processes afterward.
2. Timeout and excessive stdout/stderr stop exact companion plus grandchild;
   unrelated sentinel remains alive. Retain uncertain outcome, not success.
3. Launching controller exits while watchdog continues to its finite deadline.
4. Watchdog is killed after dispatch; kill-on-close terminates owned descendants.
5. Start-record failure prevents resume; terminal-record loss after a real write
   remains unknown and a new observer cannot retry. Foreign record rejected.
6. Package/executable/argv/descriptor drift, stale/deferred authority, unsafe path,
   link and concurrent/repeated operation reject before any companion effect.
7. Exact result schema and nested child bindings; nonzero/partial/misbound result
   cannot report success even if a model-like string says it worked.
8. Generate/parse the real companion unchanged and prove its concrete adapter
   refuses missing actual boundary authority. Synthetic watchdog success is not
   an executed production deployment or completed two-host transition.

Retain full bounded TAP, source/runtime hashes and cleanup. No human test needed
for these isolated mechanics; actual customer acceptance and qualified-source
two-host rehearsal remain required. Follow-on: complete real Home closure and
fresh observer, wire the closed adapter into the finite transaction, then qualify
and rehearse the whole transition before production admission is opened.

Windows basis: [job objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
and [process attributes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)
describe kill-on-close, inherited child membership and Windows 10 atomic job-list
assignment. This is a trusted deployment supervisor, not an untrusted-code sandbox.

## Observed Windows executable exception (before correction)

The first actual eight-test run stopped seven fixtures before dispatch: the
installed fixed `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
has two NTFS links (fresh `statSync().nlink === 2`; Get-Item reports HardLink).
It is Windows' existing system binary, not an operator journal/package file.
Permit exactly that fixed executable with its externally supplied exact SHA and
exact observed two-link count. Keep ordinary files, package sources and journals
strictly single-link; do not permit arbitrary hardlinks or alternative paths.
The original 1/8 result is development failure, not an execution qualification.

## Observed detached-host correction (before implementation)

The next actual suite reached 9/11; its controller-loss case exposed that a
normal Node child belongs to the caller's kill-on-close job. Directly detaching
Windows PowerShell then returned exit 0 without entering the script, including
an owner-context reproduction. Neither outcome is successful supervision.

Use a separately pinned, detached Node host with ignored inherited standard
handles. It starts the fixed PowerShell wrapper normally, so Node's own Windows
job contains the wrapper. Host death closes that job; wrapper death closes the
companion's non-inherited atomic job. A host absolute-deadline timer covers
compilation and journal writes as well as execution. Both executable identities
and the host source are bound; retain the host PID and the actual OS start time
before companion dispatch. The package gains this seventh fixed source file,
not a general shell entry point. Test actual controller loss and actual host
loss, including owned descendant cleanup, before claiming this correction.

A closed result must belong to the newly created request/operation and all child
records must fall inside that actual companion lifetime. Old completed records
cannot authorize a fresh transition. Failure of the second fresh Home/held-phase
check after durable outer intent leaves that intent unresolved without launch.
Child argv digests bind the retained records to each other; the exact pinned
companion defines the four allowed command implementations. The verifier does
not independently reconstruct all private child arguments.
