# Gate 6C protected staging scope and green criteria

Status: frozen before Gate 6C implementation

Gate 6C prepares and executes the owner ceremony and final protected staging for the selected RunaAI
core. It does not promote traffic. Legacy RunaAI remains authoritative, readable, and unchanged unless
a separately witnessed maintenance window reaches Gate 6D promotion. Every preparatory component is
implemented and proven with synthetic or disposable data before any protected store is opened.

## Exact authority and release binding

- Legacy authority is the clean Control checkout at commit
  `b4db04090d8f0df87234fab573b396e7824c5354`. A final protected run must bind the live checkout,
  branch, tracked cleanliness, source pins, host, and owner identity again; this recorded commit is not
  permission to ignore drift.
- The target is release `runaai-next-selected-core-2026-08-21-77f3017`, commit
  `77f3017d10f4e4670ad551b3d000cc2569c1dfdb`, artifact digest
  `a7fcc146b40c4522f10b1f11c81aafc320800482bd70efc81f6d02ce880599e2`.
- The candidate remains shadow authority at Gate 6C entry. It has no protected record, owner
  credential, selected write authority, or production traffic.
- The frozen cutover domains are exactly `project-chat`, `learning-events`, `setting`, and
  `action-receipts`. The cutover coordinator must refuse any missing or additional domain.

## Protected source boundary

Only the following selected data may be opened during the final owner-context run:

1. Project/chat: the already reviewed project registry, chat catalog and encrypted chat records, and
   project-memory roots selected by Gate 4A.
2. Learning: the complete E6 append-only journal selected by Gate 4B.
3. Setting: only `settings/values.json`, schema `runa-settings-store/v1`, and only
   `defaultIntelligenceLevel` with allowed values `Low`, `Medium`, or `High`.
4. Receipts: only legacy action records that can be proven to represent the selected
   `defaultIntelligenceLevel` effect. Other legacy actions are excluded.

Prior aggregate evidence is orientation and an expected-baseline check, not a substitute for the
final frozen capture:

- 25 unassigned chats, 75 turns, zero projects, and zero project-memory records;
- 90 E6 entries: 63 learning events, 10 lifecycle entries, and 17 approval batches containing 63
  decisions; 53 lessons active and 10 corrected;
- active approved-knowledge scopes: personal 1, project 5, capability 16, global 31;
- the selected setting value and selected action-receipt count remain unknown until an authorized
  aggregate-only owner preflight. A zero receipt count is plausible but is not assumed.

## Explicit exclusions

- The one E3 inbox record remains untouched and deferred.
- E4 authority records, legacy credentials, sessions, tokens, private keys, DPAPI wrappers, Windows
  Hello material, recovery secrets, and device-vault ciphertext are not copied.
- E5 remains absent and is not synthesized.
- Legacy provider credentials and provider-roster metadata are not migrated.
- Source files and stores are never rewritten, repaired, normalized, or deleted by migration tooling.
- The separate approved-knowledge vector index remains skipped. Active knowledge is reconstructed
  from the complete accepted E6 chain.
- Gate 6C does not promote traffic, change adapter authority, run the validation setting action, or
  retire any legacy component.

## Accelerated preparation train

All non-protected preparation is completed on one branch and reviewed as one package.

### C0 - frozen contracts and pins

Implement strict schemas for owner ceremony evidence, backup status, freeze evidence, aggregate
inventory, four-domain import receipts, reconciliation, rollback, and coordinator inputs. Reject
secret-like fields and unbounded identifiers. Bind every receipt to the exact release, source and
target generations, cutover id, participant keyed reference, and operation id.

### C1 - target owner ceremony

Provide a browser-accessible Keycloak ceremony that creates a new target owner credential rather than
copying legacy authority. The witnessed sequence is:

1. verify recovery authority and the product principal binding;
2. enroll a new user-verified WebAuthn/passkey credential;
3. sign out and sign in with that credential;
4. perform a fresh WebAuthn step-up for a harmless approval preview;
5. prove session/capability revocation;
6. prove the governed recovery path with a second newly enrolled credential; and
7. record aggregate receipts with keyed references only.

Synthetic/disposable tests may emulate this state machine. The live ceremony requires Matthew's
interactive presence and must not print credential material.

### C2 - recurring encrypted backup

Install candidate-only scheduled backup tooling before protected import. It must encrypt PostgreSQL
logical backups, produce an aggregate manifest, remove plaintext promptly, enforce bounded retention,
and regularly prove restore into distinct temporary databases. A failed, stale, plaintext-bearing, or
unrestorable backup blocks the maintenance window. No backup is deleted by the first Gate 6C
implementation; retention deletion requires a separately reviewed bounded task.

### C3 - selected-write freeze lease

Implement an exact allowlist freeze for the four selected domains. The freeze is a renewable bounded
lease with an independently readable status, source-generation binding, and a fail-closed gate on
selected writes while keeping legacy reads available. It must not freeze deferred stores or general
machine access. Loss, expiry, drift, or ambiguity aborts before import. Unfreeze is allowed only after
verified rollback to unchanged legacy or successful Gate 6 close.

The freeze is never activated during preparation. A maintenance window may not leave it active while
waiting for a later review: Gate 6C reconciliation must flow directly into Gate 6D, or the target run
is rolled back and legacy selected writes are restored before the window ends.

### C4 - aggregate owner preflight

Add an owner-context preflight that opens only the allowlisted setting and selected action-record
roots, emits no values or identifiers, and reports counts, keyed logical digests, allowed-value status,
receipt classification counts, source pins, and two-pass determinism. It must reject any unclassified
action record rather than silently migrating it.

### C5 - memory-only final delta

Use the accepted Gate 4 project/chat and E6 parsers and mappings. Decrypt legacy protected records in
the owner process, validate them, and immediately re-encrypt them with target application keys in
memory. No plaintext snapshot, key, payload, identifier, or transcript may be written to disk, logs,
repository evidence, command output, or process arguments.

Commit all four domains to retained candidate PostgreSQL with one durable run identity and idempotent
retry. A failed domain must not make the candidate authoritative. Retry with changed input under the
same operation id is refused. Rollback removes or restores only rows attributable to that target run;
it never reverse-writes legacy.

### C6 - exact reconciliation and promotion-ready handoff

While the selected-write freeze remains verified, compare source and target using external keyed
logical digests and exact aggregates:

- project, chat, ordered turn, and project-memory counts and logical content;
- complete E6 order, head, lineage, lifecycle, and per-kind counts;
- active approved-knowledge count, lifecycle state, provenance, and scope counts;
- selected setting value and revision semantics; and
- selected receipt count, effect identity, and one-deed/one-receipt uniqueness.

Only zero difference advances the Gate 6 cutover state through `candidate-ready`, `frozen`,
`backup-verified`, `delta-committed`, `reconciled`, and `promotion-ready` without a skip. Promotion is
Gate 6D and remains a distinct witnessed operation.

## Green criteria

Preparation is green only when:

- focused tests prove every contract, replay, mismatch, failure, restart, lease-expiry, rollback, and
  redaction case;
- the full repository and every applicable disposable integration regression remain green;
- the Control candidate still reports the reviewed release and shadow authority;
- the backup schedule and most recent distinct-target restore are current before protected import;
- the live owner ceremony proves sign-in, fresh step-up, revocation, and recovery with new target
  credentials;
- the final source generation is clean, exact, frozen, and readable;
- all four domain reconciliations are exact with no unexpected additions, omissions, rewrites,
  ordering changes, lifecycle conflicts, scope drift, or duplicate effect; and
- protected/private values are absent from retained evidence, logs, repository files, and output.

## Abort and rollback

Any failed prerequisite or difference stops before promotion. The target import transaction/run is
rolled back or quarantined by run identity, target sessions and capabilities are revoked when
applicable, legacy is verified at the exact frozen source generation, and only then are selected
legacy writes restored. Legacy data is never reconstructed from the target, and no legacy source file
or credential is deleted.

## Approval and interaction boundary

The standing approval authorizes non-protected implementation, disposable rehearsal, candidate-only
backup setup, and read-only service/readiness inspection. It does not authorize opening protected
stores, enrolling the steward's real credential, activating a legacy write freeze, importing retained
protected data, or promoting traffic. Those steps begin only when tooling is green and the steward is
present for the one coordinated owner/maintenance window.
