# Gate 6 selected-core cutover scope and green criteria

Status: frozen before Gate 6 implementation

Gate 6 promotes only the selected Runa core. It is not a parity declaration for every legacy page,
provider, experiment, or protected store. The legacy application remains available and authoritative
until every production prerequisite below is green and the selected adapters are deliberately
promoted. No failed or partial rehearsal may change that authority.

## Accepted entry state

- Gates 0 through 5 are accepted on `runa2/integration` at `a986419`.
- Legacy RunaAI remains the running production and protected-data authority. Control's clean runtime
  checkout currently reports `b4db040`; Gate 4 established source equivalence to rewritten GitHub
  `main` at `71ce985`, but Gate 6 binds the final delta to the live source generation actually frozen.
- RunaLab remains the frozen stack-evidence source at `ec5e346`.
- Project/chat and the complete E6 journal have passed owner-context disposable rehearsals. Those
  rehearsals retained no migrated target and did not authorize production cutover.
- Gate 5 proved the security contracts and disposable integrations. It did not deploy persistent
  PostgreSQL, Keycloak, OpenFGA, private TLS, a release application, or production credentials.
- The current repository contains selected-core libraries and verification harnesses, not yet a
  production application entry point or steward UI. Gate 6 must fail closed until an exact release
  artifact and live route exist; test libraries alone cannot be promoted.

## Exact selected-core scope

### Included

1. The three accepted read-only answer lanes: general chat, research, and explicit workspace chat.
2. Durable selected-core continuity for the verified owner's projects, chat metadata, ordered turns,
   project memory, and `defaultIntelligenceLevel` setting.
3. The complete append-only E6 learning journal, with active approved knowledge reconstructed from
   that chain and supplied only as scoped advisory context.
4. The one accepted reversible governed action: changing `defaultIntelligenceLevel` through the
   propose, preview, approve, execute, receipt, and rollback pathway.
5. Keycloak authentication, product-owned principal binding, OpenFGA relationship enforcement,
   fresh step-up, one-time capabilities, private Caddy transport, allowlisted telemetry, and
   authoritative PostgreSQL backup/recovery.
6. Accurate runtime status containing the exact release commit, artifact digest, service identities,
   model identity, active adapter generation, and migration/reconciliation state.

### Explicitly deferred or retired

- The unresolved E3 inbox record remains untouched and deferred.
- The two legacy E4 authority records, sessions, tokens, private keys, DPAPI material, Windows Hello
  material, and device-vault ciphertext are not migrated. The target owner credential is newly
  enrolled and the legacy authority is retained through the rollback window.
- E5 is retired as absent.
- A separate Qdrant approved-knowledge index remains deferred; the accepted bounded direct selector
  is the selected-core path. Qdrant remains derived and rebuildable where used for project evidence.
- Additional providers, advanced research, workers, voice/media, household expansion, succession,
  broad tool classes, UI redesign, and historical/developer-only pages belong to Gate 7 decisions.
- Legacy provider roster metadata, DPAPI key wrappers, local session files, and machine-bound
  configuration are not target records.

## Authority and loss-window decisions

- Before promotion, legacy adapters are authoritative and target adapters are comparison-only.
- Promotion changes authority only for the included domains. Deferred domains remain legacy-owned or
  deliberately unavailable; no merged or silent fallback truth is allowed.
- Project/chat requires a bounded read freeze for the final snapshot. E6 is append-only and may use a
  final head/delta capture, but its source head must not advance between reconciliation and promotion.
- Gate 6 targets zero accepted-record loss. The maximum tolerated source-to-target delta at promotion
  is zero for project/chat, E6, the selected setting, and the accepted action receipts.
- The rollback decision point is one hour after successful promotion. During that window, the
  selected-core write/action path remains frozen except for the witnessed validation action. This
  avoids a reverse migration and keeps rollback loss at zero.
- The pre-cutover backup and immutable reconciliation evidence are retained until the steward closes
  Gate 6. Legacy source data and credentials are not deleted by Gate 6.

## Gate 6A - executable release and cutover contract

### Work

- Define a signed/hashed release manifest and exact service/configuration identities.
- Add a fail-closed readiness preflight covering release artifact, production runtime entry point,
  PostgreSQL, Keycloak, OpenFGA, private TLS, provider model, secret references, backup/restore proof,
  capacity, time synchronization, source authority, target emptiness or accepted predecessor, and
  rollback ownership.
- Add a durable cutover state machine with explicit freeze, backup, delta, reconciliation, promotion,
  verification, observation, close, and rollback transitions.
- Rehearse final-delta, response-loss retry, restart, failed verification, and rollback against
  disposable stores. Retained evidence must be aggregate-only.

### Green criteria

- No state can promote before every required readiness fact and reconciliation digest is green.
- Promotion is compare-and-swap against the expected legacy and target generations.
- Duplicate commands are idempotent; changed input under the same operation id is refused.
- A failed delta, restart, identity check, representative transcript, receipt check, or reconciliation
  never marks the new adapter authoritative.
- Rollback returns the accepted authority generation without reverse-converting or deleting legacy
  data and records an immutable aggregate receipt.

## Gate 6B - parallel production candidate

### Work

- Install an exact reviewed release in a new Control path and distinct service identity. Never copy it
  over `C:\AI\Projects\RunaAI` and never develop in either production path.
- Provision persistent PostgreSQL, Keycloak, OpenFGA, and private TLS with production storage,
  service accounts, secret references, backup jobs, restore proof, and loopback/private bindings.
- Start the target in shadow/read-only mode. Confirm its reported commit/artifact/service/model
  identities and run the selected verifier without routing steward traffic to it.

### Green criteria

- The candidate survives service and host restart, retains exact authority records, denies on each
  authoritative dependency loss, restores into a distinct target, and exposes no public listener.
- The legacy application remains unchanged and usable throughout the parallel run.
- No protected content, token, credential, key, relationship tuple, or private identifier appears in
  logs, traces, retained evidence, or repository files.

## Gate 6C - owner ceremony and final protected delta

### Work

- Witness a new target owner WebAuthn/passkey enrollment and fresh-step-up action. Do not copy any
  legacy credential, session, recovery secret, or ciphertext.
- Verify a final encrypted backup, freeze selected legacy writes, capture project/chat, E6, selected
  setting, and selected receipts in owner context, then decrypt/re-encrypt in memory into the target.
- Reconcile exact counts, order, logical keyed digests, lifecycle state, active approved-knowledge
  scope counts, setting revision, and action receipt uniqueness.

### Green criteria

- Owner sign-in, fresh step-up, revocation behavior, and recovery are witnessed before promotion.
- Final reconciliation has zero unexpected additions, omissions, rewrites, ordering changes,
  lifecycle conflicts, scope drift, or duplicate effects.
- E3, E4, E5, the device vault, source bytes, and legacy credentials remain unchanged.

## Gate 6D - promotion, validation, observation, and close

### Work

- Promote only the selected adapters, restart the target, and prove the running commit and all service
  identities rather than merely the files on disk.
- Run the selected verifier, representative read-only transcripts in all three lanes, the one
  governed setting action plus its governed rollback, data reconciliation, dependency-loss probes,
  and post-restart health.
- Observe for one hour with selected writes/actions frozen except for the witnessed validation. Close
  Gate 6 only after the window is green.

### Green criteria

- Live results preserve participant/project scope, citations, uncertainty, approved-knowledge
  boundaries, one-deed/one-receipt behavior, exact model identity, private transport, and redacted
  telemetry.
- Production status reports the reviewed commit, artifact digest, selected adapter generation, and
  reconciled source/target authority.
- Any failed hard criterion invokes rollback before the selected write/action freeze can be lifted.

## Rollback

Rollback switches the selected adapter generation back to the unchanged legacy path, restarts and
verifies the legacy application, revokes target sessions/capabilities as necessary, and restores a
distinct pre-cutover target database only if the failed target itself needs diagnosis. It never
reverse-migrates into legacy storage, deletes a source record, overwrites the production checkout, or
claims that a checkout fast-forward proves the running service changed.

## Hard blockers

Stop before production mutation if any of the following is true: no complete release application;
no persistent production storage or private TLS; no exact backup/restore proof; source drift or dirty
checkout; unresolved migration/reconciliation difference; identity/authz fail-open; missing owner
credential ceremony; model or running-commit mismatch; protected value in output; listener exposure;
unclean restart; duplicate effect; rollback failure; or inability to keep the legacy application
available throughout the rollback window.

The standing Gate 6 approval permits non-destructive implementation, disposable rehearsal, Control
readiness inspection, and preparation of the parallel candidate. Owner-interactive credential work,
protected-data opening, and traffic promotion proceed only when their prerequisite state is exact and
their evidence can be retained without private values. Any hard blocker leaves legacy authority
unchanged and is reported instead of bypassed.
