# Owner command and managed-maintenance assembly criteria

2026-08-28, prospective criteria before implementation. This continues M1-S2 operational reliability;
it does not change the frozen model campaign or retire any roadmap family. Roadmap retrieval digest:
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`. Relevant capabilities C07, C12,
C15 and C16; broader environments, autonomy and remote access remain on the full roadmap.

## Fixed execution boundary

The real owner-status R3 proof succeeds. Replace only the native server controller's direct CLI child
with a bounded real-Matthew Interactive task executor. The executor accepts fixed `ps --json` for its
non-mutating identity proof, or exactly `server stop`, `server start --port 1234 --bind 127.0.0.1`, and
the retained original `server start --port 1234 --bind 0.0.0.0` for deliberate rollback. No shell text,
arbitrary CLI arguments, daemon command, model command, credential extraction or profile override.

Each command has a new GUID, immutable bounded code/intent in a dedicated protected ProgramData leaf,
source/runtime/engine/descriptor pins, a create-only dispatch marker, a finite hidden task, an exact
worker PID/start/executable record and a bounded child. Only administrator/SYSTEM can change code or
intent; Matthew can read them and write bounded results. All ancestor/link and single-link file checks
remain. The installed CLI consumes its ordinary owner credential privately. Neither proof nor executor
reads, copies, hashes, logs or transports it. Preserve every package and result after exact task retirement.

Retain intent before dispatch. Every instance calls the same private `NativeMutationJournal` under
exclusive lifecycle ownership. Task/CLI exit is not native RPC completion: retain a returned event,
then require fresh exact native postconditions before the existing confirmed event. Timeout, malformed
receipt, source/identity drift, missing task/worker, uncertain child stop or unconfirmed native outcome
blocks every subsequent mutation across process restart. No fresh empty journal, blind replay or
opposite-command compensation. No shared-parent ACL changes or broad task/process cleanup.

## Managed caller and rollback requirements

Before actual stop/swap/start, close and drain Next's known Caddy callers and account for the live legacy
direct Home1234 primary/embedding callers. Preserve equivalent legacy access; never quietly turn its
configured endpoint into a failed route. Keep8412 unchanged unless its separately identified consumers
and rollback are handled. A current queue/active-state snapshot, exact known connections, owned CLI/task
activity and the fresh managed closure are required together. Unowned active work blocks mutation.
Matthew's privileged desktop/CLI is a trusted non-concurrent administrator, not an adversary this
operator claims to atomically lock out. Successful unload is not drain: the installed runtime clears
queues during unload. Stale snapshots, TCP zero alone or Next-only closure are insufficient.

The selected owner helper does not yet provide unattended boot: it requires the actual Matthew logon
session and existing pinned engine. Do not claim otherwise. Source/runtime identity drift fails closed.
The complete assembly retains exact old settings, existing caller access, certificate/key separation,
fresh health-only candidate checks and explicit recovery; no production routing activation occurs from
these criteria or unit tests alone.

## Acceptance before activation

1. Actual PS5 parsing, strict mode/argument/schema validation, finite task/child limits and transport
   bounds. No raw private child output in public receipts.
2. Exact immutable staging, protected ACLs, single dispatch, task/worker identity, bounded collection
   and exact retirement. Test missing/late/malformed/foreign results and restart without replay.
3. Controller integration: durable intent precedes the owner command; returned and independently
   confirmed events remain distinct. Status-only observers cannot acquire lifecycle authority.
4. Actual same-executor status proof under Matthew before a lifecycle attempt; zero models and no
   settings changes. This is not scored inference or an admission/drain proof.
5. Actual managed closure plus positive busy/queued observation with an explicitly owned synthetic
   request, then an exact settings/native transition and rollback. Never run this while a candidate
   model lease or unowned work is active. Preserve legacy availability and retain every failure.

These are finite operator mechanics and integration checks. They do not alter model quality thresholds,
upgrade the runtime, add model co-residency, bypass product approvals or expand ordinary-user authority.

## Status-only implementation checkpoint

Implementation commit `169f3a8` routes the real controller through a mandatory owner executor and removes
its direct lifecycle CLI child. Fixed-command package, worker and operator tests passed34/34 with the
parent-owned durable journal tests. A later cleanup hardening binds exact collected-result bytes before
task retirement. The worker's terminal receipt always reports `nativeOutcomeConfirmed:false`; only the
controller's subsequent fresh listener/descriptor postcondition can append the journal confirmation.

The same new executor ran only `ps --json` on Home at00:08:56–57Z on2026-08-29. It used the real Matthew
identity, returned the exact empty status hash, changed no settings/models/listeners/routes and copied no
credential. The worker stopped, task result was0 and the exact task was unregistered after its raw result
hash was rechecked. See `evidence/20260829-owner-command-status-r1`. This satisfies acceptance item4's
identity path only; lifecycle, positive-busy, caller-drain, legacy preservation and rollback remain open.
