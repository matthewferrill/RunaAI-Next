# M1-S2B1 Control worker composition correction

Date: 2026-09-03  
State: accepted prospective correction; independent review GO at P0=0/P1=0  
Source checkpoint: `0710f03`  
Roadmap revision/digest: `2026-08-28.1` / `ddfbde1fe75989d5adf9f07054cfba23f40ba2c66d783abb06c2ed0411267add`  
Milestone/capabilities: M1-S2B1; bounded C03/C06/C07/C08/C12/C15/C16

## Why this correction is required

The actual-host inventory found that the uncommitted abstract watchdog's fixed `3/5/5` child-handle counts do not
match the sealed materialization topology. The same inventory initially suggested `9/5/5`, but independent review
found that this also omitted the materializer's two required filesystem handles. Native implementation must stop
until the endpoint topology is exact; a handle-count guess would create either missing authority or unintended
inheritance.

This record corrects only the child bootstrap/control/stream/filesystem handle topology and the first actual Control
proof. It does not change source scope, grant authority, network policy, publication rules, database authority,
timeouts, model selection or customer acceptance.

## Exact one-use bootstrap rule

Each control relationship has two directional message pipes. Each receiving child also gets its own one-use bootstrap
pipe from Control. Public Git therefore has five bootstrap pipes: Control-to-coordinator for the Control/coordinator
key; separate Control-to-coordinator and Control-to-materializer pipes for the coordinator/materializer key; and
separate Control-to-coordinator and Control-to-broker pipes for the coordinator/broker key. Snapshot has the first
three pipes. Every read and write endpoint, including parent duplicates, enters the recovery inventory before
validation. Control is the sole bootstrap writer and closes every unintended duplicate before resume.

The bootstrap read endpoint is a Windows handle; a 256-bit key is bytes carried through it, never itself a handle.
The unique Control-owned writer and exact inherited read endpoint establish bootstrap-source authority; an HMAC made
with a just-delivered key is not proof of that key's origin. Each bootstrap has an exact mandatory
mode/relationship/recipient schema and payload length. Coordinator copies contain exactly their named 32-byte
control key. A materializer copy contains that 32-byte control key plus the 32-byte Git-stream key in Git mode, and
exactly the control key in snapshot mode. The broker copy contains its 32-byte control key plus the same Git key.
Extra, missing or differently shaped payload bytes are fatal, and exact EOF is required before any channel frame.

Control deliberately copies each worker control key into distinct coordinator and worker bootstrap pipes. The
coordinator never receives the Git-stream key and no Git-key handle exists. Every control-key copy is zeroized at its
own authenticated channel terminal/EOF, every Git-key copy at Git terminal/EOF, and every copy on any bootstrap,
channel, child, deadline or recovery failure.

An accepted operation keeps its existing control request/response pipes open across the publication barrier. Request
sequence 1 is the operation. After the child response sequence 1 proposal, request sequence 2 is exactly `finalize`
or `cancel`, followed by EOF. The child then sends response sequence 2 terminal and EOF. A standalone pre-operation
cancel is request sequence 1 followed by EOF and receives one terminal response. Failure before a proposal receives
one terminal response and EOF. No third frame, post-EOF frame or unrecognized transition is admitted. Each frame
remains HMAC-bound and at most 1 MiB. This two-phase exchange uses the same directional handles and changes no count.

## Exact inherited-handle tables

Public Git operation:

| Child | Exact inherited handles | Count |
|---|---|---:|
| coordinator | Control request-read, Control response-write, Control bootstrap-read; materializer request-write, materializer response-read, materializer bootstrap-read; broker request-write, broker response-read, broker bootstrap-read | 9 |
| materializer | coordinator request-read, coordinator response-write, coordinator bootstrap-read; Git request-write, Git response-read; held ingress-root handle, held staging-root handle | 7 |
| ingress broker | coordinator request-read, coordinator response-write, coordinator bootstrap-read; Git request-read, Git response-write | 5 |

One-time folder snapshot operation:

| Child | Exact inherited handles | Count |
|---|---|---:|
| coordinator | Control request-read, Control response-write, Control bootstrap-read; materializer request-write, materializer response-read, materializer bootstrap-read | 6 |
| materializer | coordinator request-read, coordinator response-write, coordinator bootstrap-read; held ingress-root handle, held staging-root handle | 5 |

Every descriptor binds each handle to its role, direction, child and operation mode. Counts alone are insufficient.
Every numeric handle value is unique across the complete child inheritance set, every opposite endpoint remains with
its named owner, and every non-inherited duplicate is closed before any child resumes. An unexpected, duplicated,
aliased, missing or wrong-direction handle stops the operation before resume.

## External watchdog and native-host contract

The external Control watchdog remains outside the operation Job. Its recovery inventory explicitly owns the Job
handle; every child process and primary-thread handle; both endpoints and every parent duplicate for all control,
bootstrap and Git pipes; protected-parent, ingress-root and staging-root handles; every AppContainer profile/SID,
temporary root and DACL mutation; the OS authority-deadline timer, wait-registration and cancellation handles/tokens;
every per-recovery-call timeout/wait registration; and every accessible raw handle returned by a malformed or partial
native result.
Ownership is recorded atomically before identity/schema validation. Every terminal path attempts every required close
or removal. Authority/recovery timer registrations are cancelled and confirmed closed after intent failure, setup
failure, normal settlement, timeout or crash/restart ownership handoff; a late callback is denied by the retained
operation identity. A failed or uncertain close remains recovery-owned and prevents a terminal result. The watchdog receives
no source body and records no success until the Job has zero active processes and the exact final state is reconciled.

The corrected watchdog request is operation-mode aware and admits only the exact role table above. The native host
must create the Job and every required pipe/root/profile, launch all required children suspended with exact
`PROC_THREAD_ATTRIBUTE_HANDLE_LIST`, Job list, security capabilities and mitigations, capture all returned handles,
assign every child, close unintended endpoints, then resume. Any partial creation, assignment, bootstrap, resume,
cancel, deadline or child-loss failure terminates/fences all known children and begins recovery.

Before the initial PostgreSQL intent/outbox transaction, the watchdog arms one OS-backed authority deadline at exactly
`requestedAt + 120000`. The intent transaction is the first effect. Every later forward create, bootstrap write,
assignment, resume, materialization, publication and database transition is admitted only while that same deadline is
live; no layer resets it. When the deadline fires, all forward effects stop and recovery authority begins. Terminate,
wait, close, removal and reconciliation are mandatory compensating/recovery actions and therefore do not pretend to
fit inside the expired operation deadline. Each recovery call has its separately fixed bounded method timeout and
retained ownership, but it grants no new forward mutation. A hung or indeterminate host operation remains
recovery-owned. Each recovery host call is externally cut off after 10 seconds, only one call per retained operation
may run at once, and an unresolved operation is observed again no sooner than five seconds later from its durable
recovery record. The watchdog may repeat bounded idempotent observation and reconciliation after restart, but never
repeats an unverified mutation. It does not record stopped or release recovery ownership until exact child stops and
Job active-process count zero are proved. If that cannot be proved, state remains `unknown` or `cleanup-pending` and
no terminal receipt is emitted.

The current uncommitted abstract watchdog draft is rejected as acceptance evidence. It may be replaced only after
this topology receives independent GO and must be tested through the real Windows host. Deterministic contract tests
can prevent schema regressions but cannot satisfy native or customer acceptance.

Successful ordering is exact: the materializer completes and flushes staging, both Git peers authenticate Git
terminal/EOF and zeroize the Git key, and all broker sockets are closed. The coordinator forwards the immutable
materialization proposal while the coordinator and broker remain alive but quiescent on their authenticated control
channels. Control verifies staging, performs the one non-replacing publication and records the confirmed final only as
non-servable `published-pending-db`. This retained phase allows the frozen external broker-loss-after-publication test
to terminate the still-live exact Job. On the ordinary path, Control sends authenticated request-sequence-2
`finalize` to the coordinator; the coordinator sends the same bounded finalize decision to both workers. They return
terminal sequence 2, require EOF, zeroize control keys and exit; the coordinator does the same. The watchdog then
proves Job active-process count zero, re-observes the
published relationship and closes/removes every non-final profile, pipe, handle and temporary object. Only then does
one PostgreSQL transaction CAS to `ready` and write the immutable workspace receipt, external-operation
terminal-success receipt and digest-only outbox. Reads require both `ready` and that terminal operation receipt.
Failure/cancel follows the same zero-process, reconcile and cleanup ordering before a terminal failure receipt. No
customer-visible success state or receipt exists before exact zero, reconciliation and cleanup.

## Smallest first actual Control proof

Use a candidate-only disposable PostgreSQL schema and protected disposable NTFS parent. Run one production public-Git
materialization of the sealed synthetic repository through the real TLS broker and three actual AppContainers. The
proof must independently observe:

- participant/project/effect authorization and atomic PostgreSQL intent/outbox before any directory or child exists;
- exact release/module/trust-store hashes, SIDs, DACLs, five-name environments, mitigations and Job limits;
- all child handles captured and assigned before resume, exact role/direction tables, bootstrap EOF, key delivery and
  zeroization, with no unexpected inherited handle or duplicate;
- held ingress/staging handle rights plus denial of parent/sibling/path reopen and duplicate-handle widening;
- deny-all sockets for coordinator/materializer and broker-only exact DNS/IP/SNI/Host/path/method observations;
- exact commit, manifest, files, hashes and exclusions, including no `.git`, symlink, gitlink or LFS materialization;
- Git terminal/EOF and closed broker sockets before Control-only flush and non-replacing publication, final
  reopen/identity proof, and non-servable `published-pending-db` recovery state while control-channel children remain
  quiescent for the frozen broker-loss fault window;
- authenticated control terminal/EOF and zero active Job processes before the final success transition;
- exact closure/removal of every enumerated handle, pipe duplicate, profile, DACL, temporary root and secret copy,
  including authority and recovery timer/wait registrations,
  followed by one atomic `published-pending-db -> ready` CAS with workspace receipt, operation terminal receipt and
  digest-only outbox.

Any mismatch stops without a success receipt. This first success proof does not establish browser acceptance,
cancellation, timeout, broker-loss, cleanup-failure or crash reconciliation. Those remain separately frozen actual
scenarios. No model or Home operation participates.

## Rollback and remaining work

Until the actual proof passes, the current selected application and predecessor remain unchanged and the workspace
surface stays unavailable. A failed candidate operation retains its durable intent/evidence, blocks the same
idempotency key until reconciliation, removes only exact owned disposable objects after identity verification, and
never deletes or overwrites a user source. All 17 roadmap families remain tracked; this correction completes none of
them by itself.

## Superseded criteria text

When this correction is independently accepted and committed, it supersedes the control/bootstrap/Git handle text in
`M1-S2B1-SERVER-WORKSPACE-MATERIALIZATION-CRITERIA-2026-09-03.md` under “Coordinator control IPC and Git streaming
IPC are separate,” including its secret-as-handle wording and five-handle materializer statement. The original text
remains historical review evidence, but this successor is the sole topology authority for implementation.

Independent review stopped successive drafts at P1=5, P1=3 and P1=1 before returning GO at P0=0/P1=0 on the exact
corrected topology. The first implementation prerequisite is to update and adversarially test the executable control
frame schema/validator for this two-phase role/direction state machine. This criteria GO is not implementation credit.
