# Scoped Control admission and drain coordinator

Prospective criteria: `../QUIESCENCE-CRITERIA-2026-08-28.md` (committed before
implementation), plus the independently reproduced corrections in
`../QUIESCENCE-PRECEDENCE-AND-PENDING-RESTORE-CRITERIA-2026-08-28.md`.
This operator module is not wired to production, the application
HTTP API, models, or Home. It does not replace the existing successor deployer.

`CaddyQuiescenceCoordinator` accepts trusted `admin`, `file` and `journal`
adapters. `prepare({transitionId,expectedFileSha256,expectedConfigSha256,scopes,
upstreams})` is read-only apart from an operator-journal record. Each scope is an
exact single Caddyfile site address with `mode: 'api' | 'all'`; the former closes
`/api/*` and `/health/*`, the latter closes every request to that site. Every
original proxy handler and all unrelated original bytes remain present.
Maintenance is the first handler in a single literal outer `route`. The original
HTTP handlers remain together in an inner normally sorted `handle`; a specific
old path cannot sort ahead of maintenance. Only the allowlisted site directives
and HTTP handlers are supported. Non-HTTP site settings/named matchers must precede
the original HTTP handlers; external imports and unsupported/interleaved grammar
fail before changes. This deliberately targets the generated Runa configuration,
not arbitrary third-party Caddyfiles.

The subsequent API is `closeAdmission(state)`, `drain(state)`,
`reconcile(state)`, and `rollback(state)`. Methods return an updated state. The
journal must durably retain each exact state before the caller advances. It is a
private operator journal, not a new product-record authority. A restart loads the
last owned state and calls `reconcile`; it must not inherit a previous quiescent
label or resend an uncertain mutation. Foreign file/config drift fails closed.
State schema v2 rejects old v1 snapshots. Every public authority operation checks
the exact latest journal state; every record advances an expected revision via
CAS. `QuiescenceJournal({directory,assertOwnerPrivate})` implements append-only
create-only revisions in one private directory permanently bound to one transition.
Partial writes, missing revisions and a competing transition fail closed rather
than being skipped. Synthetic tests explicitly opt out of the ACL callback.
The future outer operator must retain its single-writer ownership across this
transition; creating an unrelated journal is not permission to bypass unresolved
state. No production outer coordinator is activated by this module.

Each admin mutation is persisted before dispatch with its ID, direction,
source/target digests and ETag. `CaddyAdmin.replace({config,etag,mutation})` returns
an exact terminal receipt; `mutationOutcome(id)` exposes only that same request's
retained terminal result, never a snapshot-based guess. Both unresolved admission
and unresolved restoration block drain, further mutation and rollback. A late
successful restore reconciles only to `restored`, not `admission-closed`. A
definitive HTTP 412 is a terminal rejection; transport/read/other errors remain
unknown. If a process loses the unpersisted terminal result, even a matching
configuration snapshot remains insufficient: the transition stays uncertain for
separate owner recovery, with no automatic replay or restart-based reset.

`CaddyAdmin` accepts only a loopback IPv4 HTTP admin origin with an explicit port.
It uses bounded, nonredirecting requests, exact Origin and ETag/If-Match headers,
limited response bodies, and only the four fixed read/adapt/replace routes.
Default per-operation timeout is 5s, maximum 10s. Drain requests are further
capped by the remaining drain deadline. The stable-zero sampling budget is at
most 70s; no observation arriving at or after the deadline can declare quiescence.
Rollback has its own bounded I/O budget; 70s is not a promise that the whole
prepare/close/drain/restore ceremony lasts at most 70s.
The optional trusted `mutationWaitMs` may bound caller observation below the HTTP
deadline; the actual operation remains bounded by `operationMs`. A result arriving
after that shorter observation deadline is retained under its original ID. The
default observation and HTTP deadlines are equal; no timeout retry is introduced.

`WindowsCaddyFile({directory,assertOwnerPrivate})` requires the future owning
composition to verify the private directory/target ACLs. It accepts only that
directory's `Caddyfile`, rejects reparse targets, and invokes a fixed hidden
PowerShell helper without stdin. The helper takes an exclusive writer/deleter
lease through exact-byte comparison, write and durable flush. This is not an
atomic-rename claim: process failure during a write is an unknown outcome and
must be reconciled. Timeout/output overflow kills and waits for this exact child;
if its stop is not confirmed within the bounded grace period, the request file
and child PID are retained and no successful cleanup is claimed. Synthetic
fixtures must explicitly set `allowSyntheticFixture: true`.

If a normal drain times out, a known overlay is restored using byte/config CAS.
An invalid/missing counter, an I/O failure, or concurrent drift leaves the
transition failed/uncertain for owner reconciliation; it must not claim restored
unless both original file and active config were actually read back.

The receipt scope is always `selected-caddy-proxied-requests-only`, with
`homeQuiescenceProved: false`. Native LAN1234, desktop/CLI and internal41343
callers require the separately owned Home admission/drain proof. Zero model
residency, no current connections, or a new guard's empty registry cannot replace
that proof. No coordinator method stops Caddy or Home, changes a model, applies
firewall rules, changes TLS, or deploys a successor.

## Verification

`node --test gate7f/function-first/control/quiescence/*.test.mjs`

The explicit Windows-only proof runs an owned Caddy 2.11.4 binary with its exact
SHA256, three synthetic upstreams, and five unique explicit loopback listeners:

`node gate7f/function-first/control/quiescence/run-caddy-proof.mjs PINNED_CADDY_PATH NEW_OUTPUT_DIRECTORY`

The output directory must be new. The proof retains raw diagnostics and checks
real counter survival across reload, rejected new requests (including existing
specific-path handlers and explicit routes), an in-flight normal
completion, unrelated/auth/static routes, stale ETag and file-CAS denial, stable
drain, exact rollback, and cleanup. A ninth owned loopback HTTP listener delays a
real restore before forwarding it to Caddy; the proof verifies unknown/stale-state
denial and exact same-request terminal reconciliation. It never uses an installed production Caddy.
This proof establishes the isolated mechanics, not deployment readiness or native
Home quiescence.
