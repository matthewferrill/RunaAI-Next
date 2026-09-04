# M1-S2B1 native Control composition finite correction design — 2026-09-04

Status: design-only correction of the native `STOP P0=0/P1=4`, the subsequent independent design
`STOP P0=0/P1=3`, and the retained-locator follow-up `STOP P0=0/P1=1`.

This document authorizes no implementation or execution. The three existing uncommitted native composition source,
test and RCA files remain frozen at their reviewed bytes. No native process, PostgreSQL operation, network, TLS,
browser, model, Control or production action is part of this design pass.

## Retained stop and chosen correction

The latest review retained four P1 defects:

1. Control and PostgreSQL do not share one watchdog-issued operation/task identity and clock authority, and a lost
   committed `beginMaterialization` response has no authoritative recovery lookup.
2. The staging authority manifest and exact parent/staging/final identities are not durable PostgreSQL authority
   before publication, so restart decisions can depend on transient process memory.
3. Existing/replayed lifecycle records do not have a complete idempotent dispatch matrix that proves no second Git
   fetch or publication.
4. JavaScript receives pre-resume raw handles before the watchdog owns them atomically; scanning a returned object is
   too late and cannot establish whole-batch ownership.

The correction uses one design only:

- the external watchdog issues and arms one immutable operation authority before the first database effect;
- `beginMaterialization` persists that exact authority with the intent/outbox in one transaction;
- PostgreSQL owns immutable effect claims and the publication authority outside the content root;
- restart enters a lifecycle/effect-claim reconciler, never the ordinary forward path blindly; and
- the real native host transfers a whole raw-handle batch to the external watchdog before it returns any setup or
  pre-resume result to JavaScript. JavaScript receives opaque resource references and a watchdog-signed ownership
  receipt, not unowned raw handle values.

The design review retained three further P1s, closed below without widening implementation scope: ordinary duplicate
requests now have scoped non-enumerating admission and race convergence; operation authority now carries a
watchdog-authenticated attestation rather than only recomputable hashes; and the candidate runtime now has exact
trusted top-level construction/injection that no request or source definition can steer.

The follow-up design review retained one P1: `reconciliation-required` lacked the verified authority locator needed
for exact lookup and watchdog opening. The strict result, recovery path, matrix and gates below now require that
locator and deny cross-project/source return or opening.

## Exact authority and store contracts

All objects below are strict: missing, extra, wrong-type or non-canonical fields fail. `id` is
`^[a-z0-9][a-z0-9_-]{7,127}$`, `digest` is lowercase SHA-256 hex, and every timestamp is canonical UTC with
millisecond precision.

### Watchdog-issued operation authority

`lease.issueAndArmOperationAuthority` takes only the fixed public-Git mode, the 120000 ms duration, topology digest,
capability-set version/digest and sealed worker-release digest. Its one successful result is:

```json
{
  "schemaVersion": "runa-public-git-operation-authority/v1",
  "operationId": "operation-...",
  "taskId": "operation-...",
  "operationMode": "public-git",
  "requestedAt": "2026-09-04T00:00:00.000Z",
  "deadlineAt": "2026-09-04T00:02:00.000Z",
  "topologyDigest": "<digest>",
  "capabilitySetVersion": "<accepted version>",
  "capabilitySetDigest": "<digest>",
  "workerReleaseSha256": "<digest>",
  "authorityDigest": "<digest>",
  "attestation": {
    "schemaVersion": "runa-public-git-operation-authority-attestation/v1",
    "algorithm": "ecdsa-p256-sha256",
    "signingKeyId": "control-watchdog-authority-...",
    "signingKeyVersion": 1,
    "watchdogIdentitySha256": "<digest>",
    "authorityDigest": "<same digest>",
    "signatureBase64": "<canonical base64>"
  }
}
```

`operationId === taskId`; `deadlineAt - requestedAt === 120000`; and `authorityDigest` is the canonical SHA-256 of
the authority fields preceding `attestation`. The signature covers the domain separator
`runa-public-git-operation-authority-attestation/v1`, the authority digest, signing-key ID/version and watchdog
identity digest. Runtime signatures are canonical base64 of fixed 64-byte IEEE-P1363 `r || s` over SHA-256 and must
use the low-S representation; malformed, zero, out-of-range or high-S components are rejected. The watchdog generates
both IDs and both instants from its own OS-backed authority clock, durably
records the authority and attestation in its ledger, creates the timer plus wait registration, and returns only after
both are armed. It also returns an opaque in-memory lease token separately; the token is never persisted, logged, sent
to a child or placed in an environment variable.

The watchdog never accepts caller-selected replacements for the ID or clock fields. `operationId`, `taskId`,
`requestedAt`, `deadlineAt`, `authorityDigest` and the full attestation remain byte-identical through Control,
PostgreSQL, every worker frame, receipts and recovery.

The runtime watchdog authority key is distinct from the offline Native release-manifest signing key. The runtime
private key remains only in an external-watchdog protected signing backend; it is never a release member, JavaScript
file, argument, environment value or ordinary configuration field. Trusted candidate configuration pins the accepted
algorithm, public key, key ID, key version and watchdog executable/identity digest. Only the current key version may
issue new authority; retained versions may verify still-live operations until those operations are terminal and fully
cleaned. A key cannot be removed or reused while its ledger contains a nonterminal operation. Microsoft's current KSP
documentation lists persisted ECDSA P-256 but not Ed25519 for the Microsoft Software Key Storage Provider. The
candidate backend is therefore machine-persisted ECDSA P-256 under that provider, not an assumed Ed25519 container. A
separately reviewed disposable probe on the actual Control build must still prove exact provider/algorithm
availability, sign-only use, denied private export, public export, service/SYSTEM ACL, reopen/sign behavior and Node
public verification before key-dependent transport is implemented. Any missing property is a design stop, not
permission to reuse the manifest signer or silently substitute DPAPI-wrapped/exportable key bytes or another provider.
The frozen Windows service name is `RunaAI-Next-Control-Watchdog`; its principal is
`NT SERVICE\RunaAI-Next-Control-Watchdog` and expected service SID is
`S-1-5-80-2359966601-960405813-89951059-4049279541-459939502`. Windows SCM/account readback must independently
match that derivation before the SID is used. Runtime key access is limited to this service SID plus SYSTEM;
Administrators participate only in the separately gated offline provisioning ceremony, not listener access.

`PostgresServerWorkspaceStore` receives a frozen synchronous `verifyWatchdogAuthority` function from trusted top-level
composition. Inside the same transaction that inserts intent, it canonicalizes the strict authority, recomputes its
digest, verifies the canonical ECDSA P-256/SHA-256 signature against the pinned key/version and watchdog identity, and
only then persists the authority plus attestation unchanged. Verification failure writes no workspace, authority or outbox row. The
database never calls the watchdog over IPC from inside its transaction and never trusts a caller-supplied public key.

### Ordinary scoped admission and concurrent convergence

The ordinary authenticated `workspace.materialize` input remains exactly `{ sourceId }`. Before creating a watchdog
lease, the materializer calls
`admitMaterializationRequest(context, { sourceId, operationMode:"public-git" })`. The store locks/reads only the exact
participant/project/source selected by authenticated context, validates its current active revision, and derives
`requestScopeDigest` server-side from participant, project, source ID/revision, public-Git mode, capability set and
limits profile. Neither the caller nor the source record supplies an idempotency key, operation ID, path, executable,
module or release hash. The exact indexed predicate is `(principal_id, project_id, source_id, idempotency_key)`; the
method never enumerates workspaces, authorities, watchdog ledgers or sibling sources.

Its strict result is one of:

- `{ disposition:"existing", requestScopeDigest, operationId, authorityDigest, attestation }` for the exact current
  request scope;
- `{ disposition:"absent", requestScopeDigest, sourceRevision }`; or
- `{ disposition:"reconciliation-required", requestScopeDigest, operationId, authorityDigest, attestation }` only
  when a verified retained same-source nonterminal record blocks new work.

For `existing|reconciliation-required`, `requestScopeDigest` is the retained operation row's immutable scope digest.
The same locked admission query must prove that row belongs to the exact authenticated principal/project/source,
validate its immutable authority envelope/digest and watchdog attestation, and return those fields byte-for-byte. An
unverified, unknown, differently scoped or incomplete blocker throws `workspace-operation-authority-invalid|unknown`;
it is never returned as `reconciliation-required` and cannot be discovered by enumeration.

Neither retained disposition creates a lease. Control treats the returned locator as untrusted until it calls
`lookupMaterializationByOperation(context, { operationId, authorityDigest })`, requires `disposition:"exact"`, and
compares the returned operation ID, request-scope digest, authority digest and complete attestation byte-for-byte with
the admission locator. Only then may Control call
`watchdog.openRetainedOperation({ operationId, authorityDigest, attestation })`, which verifies the exact durable
watchdog ledger and returns the closed, no-additional-properties union
`{ disposition:"active-observe", operationId, authorityDigest, ledgerRevision, authorityTimerOpen:true,
authorityWaitClosed:false } | { disposition:"recovery-resumable", operationId, authorityDigest, ledgerRevision,
recoveryCas } | { disposition:"terminal", operationId, authorityDigest, ledgerRevision, terminalReceipt }`.
`active-observe` observes the retained owner without starting children or effects; `recovery-resumable` enters the
watchdog's already serialized recovery; and `terminal` returns the exact retained outcome. Missing ledger,
attestation mismatch, timer/wait ambiguity or a second recovery owner yields `unknown` and no forward action. A
restart never creates a replacement watchdog lease for an existing PostgreSQL operation. For
`reconciliation-required`, observation or serialized recovery is allowed only after this PostgreSQL/watchdog
byte-for-byte cross-check; no ordinary forward dispatch is allowed.

Only `absent` permits creation of a new lease and watchdog authority. The later `beginMaterialization` transaction
relocks the same source row and recomputes the same request scope. This makes an absent/create race converge without a
retry: the first transaction inserts; every waiter observes that committed row after acquiring the row lock. A loser
whose newly issued authority was never persisted receives
`{ created:false, disposition:"converged-existing", existingOperationAuthority, unusedAuthorityDigest }`, calls
`newLease.closeUnused({ expectedAuthorityDigest:unusedAuthorityDigest, reason:"idempotency-converged" })`, and requires
the closed, watchdog-authenticated result `{ schemaVersion:"runa-watchdog-unused-lease-closure/v1",
authorityDigest:unusedAuthorityDigest, databaseBound:false, ownedResourceCount:0, authorityTimerClosed:true,
authorityWaitClosed:true, ledgerState:"unused-closed", ledgerRevision, closedAt, receiptHmac }`. The watchdog commits
that ledger state before returning, and Control verifies its MAC and every exact field. It then opens/observes the
winner through `openRetainedOperation`. Failure to prove unused-lease closure retains that lease for watchdog cleanup
and stops; it never attaches two leases to one operation.

If source revision or request-scope digest changes while an absent caller is acquiring authority,
`beginMaterialization` rejects the stale scope; Control closes the unused lease with the same proof and returns the
scoped conflict. A unique-constraint/serialization error is not exposed as ordinary behavior: the locked-source
transaction rechecks the exact scope and returns `converged-existing`, or the operation stops as an indeterminate
store failure. There is no blind transaction loop.

### Atomic begin and committed-response-loss lookup

`PostgresServerWorkspaceStore.beginMaterialization(context, input)` changes to strict input:

```json
{
  "sourceId": "source-...",
  "requestScopeDigest": "<server-derived digest>",
  "operationAuthority": { "schemaVersion": "runa-public-git-operation-authority/v1" }
}
```

In one transaction serialized by the exact scoped source-row lock it recomputes the request scope, validates the full
watchdog attestation and authority,
creates the server request/workspace IDs, binds `request.taskId` and `binding.taskId` to the authority task ID, inserts
the workspace, inserts the immutable operation-authority row, and inserts the digest-only intent outbox event. No
child, directory, fetch or publication may exist before commit. The returned discriminated result is either:

- `{ created:true, disposition:"created", operationAuthority, workspace }`; or
- `{ created:false, disposition:"exact-replay", operationAuthority, workspace, terminalEvidence }`; or
- `{ created:false, disposition:"converged-existing", existingOperationAuthority, unusedAuthorityDigest }`.

An exact replay of an already persisted operation requires equal principal/project/source/source revision/idempotency
key, every operation-authority field and digest, request, binding and persisted transition digest. A different
operation ID for the same idempotency
key is admitted only as `converged-existing` when the ordinary request-scope digest is exact and the new authority is
proved unused. Reuse of an operation ID in another scope, or any persisted-authority field mismatch, is a conflict,
never a replay.

`lookupMaterializationByOperation(context, { operationId, authorityDigest })` is the only committed-response-loss
lookup. It uses one read-only repeatable-read transaction and returns a strict union:

- `{ found:false, disposition:"absent" }` only after an authoritative healthy snapshot;
- `{ found:true, disposition:"exact", requestScopeDigest, operationAuthority, workspace, effectClaims,
  publicationAuthority, workspaceReceipt, operationReceipt }`; or
- throws `workspace-operation-authority-invalid|unknown` on envelope, digest, row, source or receipt uncertainty.

After a lost/ambiguous begin response, Control must stop forward work and call this lookup. `exact` continues only
through the restart matrix below. If the new authority lookup is `absent`, Control performs one exact
`admitMaterializationRequest` reread for the already derived request scope: `existing` proves that a concurrent winner
committed, so Control closes the unused losing lease and performs the exact database-lookup/watchdog-open cross-check
on the winner; `reconciliation-required` proves a retained same-source blocker, so Control first closes its unused
losing lease and then performs that same cross-check before scoped recovery; `absent` proves neither authority
committed, so the affected actual gate stops after unused-lease closure; and `unknown` retains ownership and stops.
None causes a second `beginMaterialization` call or a second actual-run attempt. `invalid|unknown` retains watchdog
ownership and emits no terminal receipt. There is no lookup by enumeration, source alone or unscoped operation ID.

For every `exact` lookup, Control must also call `openRetainedOperation` and compare the PostgreSQL authority,
attestation digest, signing-key ID/version, watchdog identity digest, operation/task IDs, clock fields, release digest
and lifecycle binding with the watchdog ledger. Both independently verified records must match byte-for-byte before
observation or recovery. A PostgreSQL row with no watchdog ledger, a watchdog ledger with no PostgreSQL binding, or
any cross-record mismatch is `unknown`; neither side is allowed to repair the other by copying fields.

### PostgreSQL schema and migration

Add `operation_authorities` in the existing server-workspace schema:

- primary key `(operation_id)`, unique `(workspace_id)` and unique
  `(principal_id,project_id,source_id,request_scope_digest)` for exact non-enumerating admission;
- scoped columns `principal_id`, `project_id`, `source_id`, `workspace_id`, `task_id`;
- `request_scope_digest`, `requested_at`, `deadline_at`, `authority_digest`, `worker_release_sha256`, topology and
  capability digests;
- signing-key ID/version, watchdog identity digest, signature, encrypted canonical authority/attestation envelope plus
  envelope and attestation digests; and
- SQL checks for `operation_id=task_id`, exact 120-second interval, canonical digest lengths and immutable-row trigger.

Add `workspace_effect_claims`:

- primary key `(operation_id,effect)` where effect is exactly `git-fetch|publication`;
- `claim_id`, `claim_revision=1`, `state=claimed|observed|failed-unknown`, `claim_digest`, timestamps; and
- immutable claim identity with CAS-only state transition and append-only digest outbox.

Add `workspace_publication_authorities`:

- primary key `(workspace_id)` and unique `(operation_id)`;
- exact workspace revision, request/binding/operation-authority digests;
- encrypted canonical publication-authority manifest and manifest digest;
- duplicated, cross-checked parent volume/file identity, staging opaque name plus volume/file identity, final opaque
  name plus expected volume/file identity;
- publication-claim ID/revision, observed final identity/digest and state
  `staging-authorized|publication-claimed|published-observed|unknown`; and
- immutable authority fields, CAS-only state fields and append-only digest outbox.

The authority manifest, effect claims, migration evidence and CAS rows live only in PostgreSQL under the protected
server schema. They are never written inside ingress, staging or final content roots. A source-controlled manifest,
path string, directory name or worker memory is never authority.

The additive migration runs in one transaction. It creates tables, indexes, foreign keys, checks and immutable
triggers before changing any row. Each pre-correction candidate workspace is locked and decoded. A row without a
genuine watchdog-issued v1 authority cannot be invented during migration: nonterminal rows become `unknown` with
`cleanupState=indeterminate`; exact ready rows may remain historical read authority only when their immutable
workspace and operation receipts validate, but they are ineligible for native resume. Migration writes a digest-only
event for every fail-closed conversion. Any decode, constraint, insert, event or commit failure rolls the complete
migration back. No constraint is marked validated until the migrated population is proven.

### Durable staging and publication CAS

Before a Git request, `claimEffect(..., effect:"git-fetch")` inserts the immutable first-fetch claim in the same
transaction as its digest outbox. A pre-existing exact claim is reported but never re-executed by the ordinary path.

After the workers have produced and flushed staging, `recordStaging` accepts the transition identity, exact operation
authority digest, exact Git-fetch claim, canonical workspace manifest and canonical publication-authority manifest.
One transaction verifies every file and identity binding, changes `intent-recorded -> staging`, inserts the immutable
publication authority, marks the fetch claim observed and writes one digest event. Its response returns the durable
publication authority projection; the publication helper accepts only that projection.

Immediately before `MoveFileExW`, `claimEffect(..., effect:"publication")` atomically records the one allowed
publication call and binds its claim ID into `workspace_publication_authorities`. The native helper uses the held
parent plus exact durable staging/final identities, `MOVEFILE_WRITE_THROUGH`, and never
`MOVEFILE_REPLACE_EXISTING`. It reopens final no-follow, proves the same volume/file identity, proves staging absent,
and rechecks the complete manifest. `recordPublishedPendingDb` then CASes the workspace and publication authority to
`published-pending-db/published-observed` with that observation. `recordReady` remains one atomic workspace receipt,
external-operation terminal receipt and digest-outbox transaction.

No code may invoke Git fetch without winning a new `git-fetch` claim, or invoke the move helper without winning a new
`publication` claim. Because each operation admits one immutable claim per effect, a response loss or restart cannot
cause a second fetch or publication call.

## Restart and idempotency state matrix

Every entry begins with `lookupMaterializationByOperation` and exact watchdog recovery observation. A replayed store
transition is accepted only when its persisted transition digest and returned full projection match the intended
transition byte-for-byte.

| Durable state | Effect/publication evidence | Only allowed action | Prohibited action |
|---|---|---|---|
| scoped admission `existing` | exact store attestation and watchdog ledger | open retained operation; observe active, resume serialized recovery, or return terminal | create new lease, enumerate, start duplicate effect |
| scoped admission `reconciliation-required` | verified same-principal/project/source locator; exact DB projection and watchdog ledger match byte-for-byte | after exact DB lookup, open retained operation and enter scoped observation/serialized recovery only | return/open cross-scope locator, create lease or new intent |
| scoped admission `absent` before lease | current source/request-scope digest | issue one new watchdog authority and call begin once | caller-selected identity/hash or unscoped lookup |
| begin `converged-existing` | race winner exact; new lease unbound | prove unused new lease fully closed, then open winner's retained watchdog | attach loser lease, issue effect before closure |
| operation lookup `absent` after ambiguous begin | healthy read plus one exact request-scope reread | converge to scoped winner and close loser, or stop after proven unused closure when still absent | invent intent, start child, retry begin/actual command |
| new `intent-recorded` | no fetch claim; exact empty Job and no candidate root | win first fetch claim, then start the one forward fetch | second begin, unclaimed fetch |
| existing `intent-recorded` | no fetch claim; exact empty Job and no candidate root | recovery may win the still-first fetch claim for the same authority | new operation ID or blind ordinary dispatch |
| `intent-recorded` | fetch claim exists | reconcile Job/roots; settle terminal or unknown | another fetch, publication |
| `staging` | exact durable authority; no publication claim; exact stopped workers and verified staging/no final | win first publication claim, then call helper once | fetch again, publish without claim |
| `staging` | publication claim exists; exact final/no staging | record/replay `published-pending-db` from reopened identity | call move again |
| `staging` | publication claim exists; exact staging/no final | record `unknown`, retain for review | call move again or delete by path |
| `staging` | mismatch, both names, or indeterminate observation | record/retain `unknown` | fetch, move, delete, terminal-success receipt |
| `published-pending-db` | exact durable authority and exact final/no staging | replay/complete ready CAS and immutable receipts | fetch or move |
| `published-pending-db` | absent/mismatched final, staging present, both, or indeterminate | record/retain `unknown` | recreate, fetch, move or delete |
| `ready` | exact receipts, authority and final identity | return exact retained success; serve governed reads | any fetch, move or receipt rewrite |
| `ready` | missing/tampered receipt or final observation | revoke read authority and record/retain `unknown` | recreate or claim success |
| `failed|cancelled|removed` | exact terminal receipt/cleanup evidence | return terminal result or exact cleanup reconciliation | fetch or move |
| `unknown|cleanup-pending` | any | serialized recovery/observation only | forward effect, retry, success receipt |
| exact `changed:false` transition replay | full input/projection/transition digest equal | accept current durable state and use this matrix | repeat external effect |
| conflicting replay | any mismatch | conflict/unknown with retained ownership | coerce to idempotent success |

An existing record never jumps directly into the ordinary create/bootstrap/fetch/publication sequence. Database CAS
replay is permitted only for the exact same digest after authoritative lookup; network and filesystem effects are not
replayed. A newly created but unused losing lease is not an existing-operation lease and must reach `unused-closed`
before the winner is observed.

## Atomic native ownership-before-return

The real Windows native host, not JavaScript object scanning, establishes ownership:

1. Every created/opened Job, process, primary thread, pipe endpoint, token, timer/event and parent/ingress/staging/
   inspection directory handle receives a host-generated unique internal resource ID at creation. AppContainer
   profiles, SIDs, DACL changes and temporary roots are separate non-handle recovery resources in the same operation
   inventory; they are never represented as fake handles.
2. Before a setup or pre-resume method returns, the host forms one strict batch containing every new handle and sends
   it over the authenticated watchdog ownership channel.
3. `lease.ownRawHandleBatchAtomic` verifies operation authority, batch ID/revision, internal-ID uniqueness, raw-handle
   uniqueness, expected type/role/direction and source process; duplicates each handle into the external watchdog;
   persists the entire ownership ledger plus digest; and commits or rejects the whole batch.
4. The host closes its temporary transfer duplicates only after the watchdog-signed receipt is verified. On any item,
   IPC, commit or acknowledgement failure, the host terminates the operation Job, closes every locally known handle,
   and returns only an error. It never returns a partial batch or any raw handle.
5. JavaScript receives opaque internal resource IDs, topology metadata and this strict receipt only. The lease verifies
   the receipt against its durable ledger before schema/topology decisions or resume.

The batch schema is:

```json
{
  "schemaVersion": "runa-public-git-raw-handle-batch/v1",
  "operationId": "operation-...",
  "batchId": "handle-batch-...",
  "batchRevision": 1,
  "phase": "setup|pre-resume|publication-inspection",
  "resources": [{
    "internalResourceId": "native-resource-...",
    "nativeObjectType": "job|process|thread|pipe|directory|token|timer|event",
    "role": "<closed role enum>",
    "child": "control|coordinator|materializer|ingress-broker",
    "direction": "<closed direction enum or none>",
    "sourceProcessId": 123,
    "rawHandleHex": "00000000000001c8"
  }],
  "batchDigest": "<digest>"
}
```

`rawHandleHex` is exactly 16 lowercase hex digits so a 64-bit Windows `HANDLE` never crosses JavaScript through an
unsafe JSON number. The watchdog receipt repeats operation/batch ID, revision, resource count and digest, and adds
`ownershipCommitted:true`, its ledger revision, watchdog process identity digest and HMAC. Raw handles are neither
JSON-serialized beyond the authenticated local transfer nor exposed to the composition. Repeated batch ID is
idempotent only for an equal batch digest; any alias, missing/extra entry, reuse across operation/phase, malformed
value or partial durable write fails the entire batch and starts teardown.

Resume additionally requires one ownership receipt covering the exact 9/7/5 inherited topology, five bootstrap
pipes, every parent duplicate and all setup/pre-resume handles, plus proof that unintended parent endpoints are closed.

## Error, rollback and restart rules

- Failure to issue/arm authority occurs before PostgreSQL and closes or durably retains the lease with no intent.
- Scoped admission `existing|reconciliation-required` must not create a lease and must complete the exact DB lookup,
  locator comparison and watchdog-ledger cross-check before observation/recovery. A cross-project/source or incomplete
  locator is invalid and must cause zero watchdog-open calls. An absent/create loser proves its unused
  timer/wait/resource ledger closed before it observes the winner; closure uncertainty retains the loser and stops.
- Ambiguous `beginMaterialization` outcome permits only the scoped operation lookup. Absent, invalid or unknown lookup
  stops the actual run; no blind retry occurs.
- An attestation signature, pinned key/version, watchdog identity or restart-ledger mismatch writes no new authority
  and permits no forward action. Neither a recomputed unkeyed digest nor a valid attestation from another scope is
  accepted.
- A failed authority/effect/publication transaction rolls back its row and outbox together. A lost committed response
  is resolved by lookup and exact transition digest, never by repeating an external effect.
- Any child/bootstrap/deadline/EOF/key-zeroization/native-host/ownership failure begins whole-operation teardown
  immediately. A terminal failure/cancel receipt requires stopped children, active Job count zero, exact filesystem
  reconciliation, complete cleanup, closed authority timer and wait, zero reconciliation mismatches, and a terminal
  CAS token.
- If zero, identity, cleanup, timer/wait closure, store projection or mutation outcome is not proven, lifecycle remains
  `unknown|cleanup-pending`, watchdog ownership is retained, and no terminal success/determinate-failure receipt is
  written.
- Publication response loss never calls the move helper again. Observation plus durable claim selects
  `published-pending-db` or `unknown`.
- Cleanup deletes only the exact durable volume/file identities after no-follow reopen and complete manifest proof.
  Path/name match alone never authorizes removal.
- Migration is additive and transactional. Rollback disables new v1 authority admission, drains or retains all v1
  operations under the new reconciler, preserves rows/receipts/evidence and restores the predecessor route only after
  exact zero. It never drops authority tables or downgrades rows while an operation is nonterminal.

## Trusted candidate-only construction and injection

`gate7f/function-first/composition.mjs` is the only top-level construction point. It statically imports the candidate
runtime factory; neither `import()`, a request field, a source definition nor a database payload may select a module.
The default remains off. Enabling requires an application-owner-created opaque configuration returned by new
`server-workspace/native-candidate-config.mjs`; a structurally similar JSON object is rejected because the module keeps
the construction brand private.

The configuration factory accepts only the candidate enable bit plus the administrator-pinned workspace-parent
identity from the owner-only application bootstrap, and returns a deeply frozen object with exact keys:

```json
{
  "schemaVersion": "runa-public-git-native-candidate-config/v1",
  "enabled": true,
  "releaseManifestPath": "<fixed absolute application release path>",
  "releaseRoot": "<fixed absolute application release root>",
  "protectedWorkspaceParent": "<fixed absolute administrator-owned NTFS path>",
  "watchdogEndpoint": "<fixed local authenticated endpoint>",
  "watchdogSigningKeyId": "control-watchdog-authority-...",
  "watchdogSigningKeyVersion": 1,
  "watchdogPublicKey": "<canonical base64 SEC1 uncompressed P-256 public key>",
  "watchdogIdentitySha256": "<digest>",
  "workerReleaseSha256": "<canonical release-manifest digest>"
}
```

The factory is called only by the candidate bootstrap with operator-owned, ACL-protected configuration. It derives
`releaseManifestPath` and `releaseRoot` from its own installed module URL, derives the local watchdog endpoint from a
closed candidate constant, reads the key/version/watchdog identity and member hashes only from the signed sealed
manifest, and computes `workerReleaseSha256` itself. None of those values is a factory argument. It rejects
relative/reparse/user-writable roots, unknown keys, alternate endpoints, key/version drift, a manifest path outside the
installed release root, an invalid release-manifest signature, or any member/hash mismatch. It opens/rechecks the
release root and protected workspace parent by native identity before returning. The trusted configuration is never
serialized into an HTTP response, source row, task, model input or child environment.

The offline release-manifest verification key/algorithm and candidate manifest basename are compile-time constants in
`native-candidate-config.mjs` and part of independent source/hash review. They cannot be overridden by environment,
configuration JSON, source definition or request. Key rotation requires a new reviewed source release and manifest;
it is not a runtime selection. The matching offline private signer is never installed in the Control release and may
not be the runtime watchdog authority key.

`composition.mjs` uses that one object to construct, in order: the pinned authority verifier; the initialized
`PostgresServerWorkspaceStore`; the authenticated real watchdog client; the Windows native host; the native
publication helper; and `createPublicGitControlWorkerComposition`. It injects the completed materializer port into
`ServerWorkspaceService({ store, materializer, sourceDefinition, authorizeContext })`. Construction is all-or-nothing:
missing/disabled configuration leaves the current `server-workspace-materializer-unavailable` behavior; any enabled
component, identity, manifest or hash failure closes already constructed candidate resources and fails startup. There
is no fake/fallback host and no partial native service.

`ServerWorkspaceService.materialize` continues to parse exactly `{ sourceId }` and authorize
`workspace.materialize`, then passes only authenticated context and source ID to the injected materializer. The port
closes over the frozen native configuration and obtains source/request scope from PostgreSQL. Public-Git source
definitions remain limited to environment/display/repository HTTPS URL/requested ref/expected commit OID; schemas
reject executable paths, module specifiers, arguments, release roots, manifests, watchdog endpoints, signing keys,
hashes, operation IDs, task IDs and clock authority. A repository URL/ref, browser payload, model output or database
source record therefore cannot choose what native code runs or which hash is trusted.

Before every child launch, the native host resolves each executable/module only from the already opened release-root
identity and the sealed manifest, verifies its bytes, and requires the aggregate manifest digest to equal the
composition's closed-over `workerReleaseSha256` and the watchdog authority field. Operation children receive only
opaque operation/resource identifiers in argv. The main application Node is the sole exception: its one non-opaque
argv member is the absolute application entrypoint derived by the Native host from the verified fixed release root
and exact manifest role/path. It is never accepted from a caller, request, source, database row, model, environment or
administrator path field; Native code rechecks its stable identity and rejects any additional or nonmatching argv
member. `NODE_OPTIONS` and all environment/bootstrap entrypoint selectors remain forbidden. Executable/module paths
and hashes are never copied from source/request data.

Native path trust is segment-aware. Every traversed segment is opened/held without following reparses and must match
its canonical volume/file identity. The exact protected root and all descendants must satisfy the strict
owner/service/SYSTEM DACL policy. Drive roots and other ancestors are not incorrectly forced into that descendant
allowlist; they instead satisfy a separately reviewed system-root/non-redirection policy. A broader inherited ACE on a
standard DOS drive root therefore cannot be confused with a writable protected subtree, while an ancestor alias,
reparse or identity change still fails closed. All callers use the same verified-path API contract and build review
checks its complete call family for signature drift.

## Finite production change set

Only these production interfaces/files are in the correction implementation:

- `server-workspace/materialization-contracts.mjs`: operation-authority, scoped-admission retained-locator, lookup,
  effect-claim, publication-authority, ownership-batch/receipt and restart-disposition schemas.
- `composition.mjs`: static, default-off candidate construction and exact materializer injection; no dynamic or
  request-selected native import.
- new `server-workspace/native-candidate-config.mjs`: privately branded, owner-configured paths, watchdog verifier and
  sealed release-manifest authority.
- `server-workspace/postgres.mjs`: additive schema migration; locked scoped admission with verified retained locator;
  atomic begin/lookup; effect-claim, staging-authority, published-pending and ready/terminal CAS methods.
- `server-workspace/control-worker-composition.mjs`: consume watchdog authority, verify retained admission locators
  through exact store lookup/watchdog cross-check, apply the state matrix, effect claims, durable publication
  projection and opaque ownership receipts.
- `server-workspace/publication-primitive.mjs`: accept only durable PostgreSQL authority plus opaque already-owned
  native resource IDs; retain the reviewed no-replace/write-through/reopen/identity algorithm.
- new `server-workspace/control-watchdog-host.mjs`: real external watchdog lease, authenticated retained-operation
  opening, OS timer/wait, serialized recovery, atomic ownership ledger, exact-zero and CAS-token implementation.
- new `server-workspace/windows-native-host.mjs` and `server-workspace/WindowsNativeWorkspaceHost.cs`: real Windows
  Job/AppContainer creation, handle-list/bootstrap/EOF operations, ownership-channel transfer and teardown.
- new `server-workspace/control-coordinator-child.mjs` and
  `server-workspace/public-git-materializer-child.mjs`; existing `git-broker-child.mjs`, `git-broker-transport.mjs`
  and `git-tls-connector.mjs`: exact worker/control/TLS path and release binding.
- `server-workspace/service.mjs`: exact `{ sourceId }` public input and injection of the already constructed candidate
  materializer after all lower gates pass.
- new `server-workspace/m1-s2b1-native-control-release-manifest.json`: canonical release membership and hashes;
  its canonical SHA-256 is the only accepted `workerReleaseSha256`.

Tests are limited to matching `.test.mjs`, the existing two disposable PostgreSQL integration files, native helper
source/build verification, and one new candidate-only actual-Control acceptance runner/evidence directory. Artifact,
Agent, browser fixture, model, Home and production-route files are excluded.

## Verification gates and stop rules

The implementation proceeds only in this order:

1. **Deterministic source tests:** strict-schema negatives; forged scope/authority/digest/deadline; all state-matrix
   branches; source-scoped admission without enumeration; existing and reconciliation-required retained-operation
   lookup/observation/recovery without a new lease; a blocker locator from another project/source must be neither
   returned nor passed to `openRetainedOperation`, with zero watchdog-open calls under an injected/spliced locator;
   two absent callers converging on one intent/watchdog while the unused loser proves timer/wait/resource closure;
   begin/staging/publish/ready response-loss interleavings; concurrent CAS; at-most-one fetch/move counters; a forged
   authority whose attacker changes every field and recomputes every unkeyed digest but cannot produce the pinned
   watchdog signature; valid-attestation cross-scope/key-version/watchdog-identity replays; early terminal/cancel EOF
   chronology; atomic-batch alias/malformed/partial-ack faults; timer/wait closure; exact-zero and terminal-receipt
   ordering. Construction tests prove default-off behavior, reject an unbranded configuration, and prove request/source
   path, module, endpoint and hash fields cannot select native code. First failure stops; correct and obtain fresh
   review before one affected rerun.
2. **Disposable PostgreSQL:** one lifecycle run validates fresh and migrated schemas, begin+authority+outbox atomicity,
   in-transaction signature/key/version/watchdog-identity verification, ordinary-scope absent/create convergence,
   locked reconciliation locator scope enforcement, cross-project/source denial, committed-response-loss lookup,
   restart ledger cross-check, effect/publication CAS concurrency, tamper/rollback,
   ready receipt/outbox atomicity and every restart branch. The fully recomputed-but-unsigned adversary must leave
   authority/workspace/outbox row counts and content digests unchanged. Then one compatibility run validates unchanged
   accepted store behavior. No real shared or production database. Each command runs once with test concurrency one;
   first failure stops and is not retried.
3. **Native source/build/hash:** on Control, compile only the reviewed native helper/host and workers; run source/static
   denial scans, exact topology/handle-list tests and deterministic local native tests without public Git. Seal every
   input/output hash into the release manifest and prove the manifest digest equals `workerReleaseSha256`. Any source,
   toolchain or hash drift stops and requires new review; no execution follows stale hashes.
4. **One actual candidate run:** only after independent GO on all exact source and build hashes, run one disposable
   public-Git journey through the real watchdog, Job/AppContainers, TLS broker, PostgreSQL and protected NTFS parent.
   The command runs once. Any implementation, harness, host or environment failure stops with retained evidence and
   RCA; there is no same-byte retry. Resume requires correction, fresh review and explicit authorization of only the
   affected fresh scenario.

No gate may be skipped, combined with a browser/model/production action, or converted into acceptance by a mocked
host. Deterministic green proves contracts only. Disposable PostgreSQL green proves store behavior only. Native
source/hash green proves reviewed bytes only. Only the final one-run evidence can establish the bounded native path,
and it still does not establish ordinary-browser acceptance or production readiness.

## Mandatory pre-native source/hash review checklist

Before any native execution, a different independent reviewer must inspect exact source bytes and built hashes for
all five groups and return GO P0=0/P1=0:

1. The real watchdog and every lease method, including OS timer/wait closure, attempt-to-task binding, atomic raw-
   handle ownership, serialized recovery, exact-zero proof and CAS fencing.
2. The real native-host implementation of all required methods, Windows Job/AppContainer topology, handle lists, EOF
   behavior and teardown.
3. The corrected PostgreSQL methods, migration, locked scoped-admission retained locator, durable authority
   projection, receipt/outbox atomicity and restart/idempotency behavior.
4. The native publication helper and its no-replace, reopen and identity guarantees.
5. The coordinator, materializer, ingress-broker and TLS paths, with built release hashes matched to sealed manifests
   and `workerReleaseSha256`.

The reviewer must also verify that the canonical release manifest names every loaded production source/native binary,
Node runtime and policy/contract digest; that no unreviewed fallback module can load; that source bytes equal build
inputs; and that the actual-run command refuses any hash mismatch. The same review includes `composition.mjs`,
`server-workspace/native-candidate-config.mjs` and `server-workspace/service.mjs`: candidate wiring must be default-off,
statically imported, privately configured and unable to consume native paths, modules, endpoints, keys or hashes from
source/request/model/database input. Only independent GO on those exact bytes and hashes may precede the one native
Control execution.

## Design exit

This design is complete only as a finite correction proposal. It does not revise the retained STOP, authorize edits to
the frozen three files, or authorize tests. The next action is independent review of this document. Implementation may
begin only after that review returns GO on the design and the steward assigns the bounded correction lane.
