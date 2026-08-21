# Gate 6A executable cutover contract results

Status: Gate 6A implementation and disposable rehearsal green; production promotion blocked by the
observed Control prerequisite state

## Plain-language result

Gate 6 now has an enforceable brake between “the migration code passed tests” and “Runa's live
authority changed.” The brake will not permit promotion unless the exact release, services, backup,
final protected delta, identity ceremony, and zero-difference reconciliation are all independently
green. A checkout update, a service restart, or a passing unit suite is not enough by itself.

The complete cutover path was rehearsed twice against disposable PostgreSQL: once through successful
promotion/restart/verification/observation/close, and once through promotion and rollback to the
unchanged legacy generation. Nothing on Control was promoted or migrated.

## Implemented controls

- A canonical release manifest binds the exact 40-character commit, artifact and configuration
  digests, application entry point, model identity, selected-scope version, and PostgreSQL, Keycloak,
  OpenFGA, and Caddy identities. Secret-like fields are rejected.
- Candidate and promotion preflights require exact fact sets. Promotion adds owner credential,
  fresh-step-up, protected-delta authority, source-freeze, and zero-delta requirements.
- A durable cutover state machine permits only this order: candidate readiness, selected-write freeze,
  verified backup/restore, final delta, exact reconciliation, promotion readiness, compare-and-swap
  promotion, live identity/behavior verification, one-hour frozen observation, and close.
- Operation ids are input-bound and idempotent. Concurrent duplicates create one transition, changed
  retries are refused, and a response-lost-after-commit retry returns the committed receipt.
- Final reconciliation requires exactly project/chat, the complete E6 journal, the selected setting,
  and selected action receipts. Counts and keyed logical digests must match. Approved-knowledge active
  counts and scope counts must also match, one-deed/one-receipt must hold, and deferred stores must be
  unchanged.
- Live verification compares the running commit, artifact, cutover revision/phase, model, every
  service identity, representative transcripts, effect receipt, restart health, dependency-loss
  behavior, reconciliation, and telemetry privacy.
- Rollback cannot reverse-migrate into or delete legacy data. After promotion it also requires target
  session/capability revocation and a verified legacy runtime.
- The durable ledger stores aggregate state, keyed digests, and receipts only. A private input canary
  did not appear in PostgreSQL or retained evidence.

## Validation evidence

- Focused Gate 6 suite: **25/25 passed**.
- Full deterministic repository run: **232/232 passed**. The first sandbox-only attempt had one
  inherited temporary-directory permission failure; the exact repository-owner rerun passed.
- Gate 0: **10/10 seals** and **12/12 pinned legacy suites** passed under Node 22.22.0.
- Disposable selected-stack integrations passed with every component stopped:
  - Gate 1: **25/25**;
  - Gate 2: **21/21**;
  - Gate 3: **16/16**;
  - Gate 4A: **16/16**;
  - Gate 5: **11/11**; and
  - Gate 6: **9/9**.
- The Gate 6 PostgreSQL rehearsal recorded 10 successful-close operations and 8 rollback operations.
  It survived a PostgreSQL restart, recovered an intentionally lost promotion response without a
  duplicate transition, refused a mismatched running artifact without advancing state, closed only
  after the full observation window, returned rollback authority to legacy, removed only the Gate 6
  schema, and stopped PostgreSQL.
- RunaLab remained clean at `ec5e346`. The Omen legacy RunaAI source remained at `71ce985` with only
  its pre-existing untracked `.claude/settings.local.json`.

## Read-only Control finding

Control was inspected without opening protected stores or changing a checkout, service, listener, or
route. The live legacy checkout is clean on `main` at `b4db040`; `/api/runtime/status` reports the same
running commit; and its observed application listeners remain loopback-only.

An existing clean `C:\AI\Projects\RunaAI-Next` checkout is present on `runa2/integration` at
`4ed6a52`, but it is a prior verification checkout, not a production candidate. It has no Gate 6
code, installed dependency tree, or release application entry point. Control has no detected
persistent PostgreSQL, Keycloak, OpenFGA, or Caddy service and no selected-core candidate listener.

This is a useful fail-closed result: the live cutover did not begin because there is currently nothing
complete and recoverable to promote. The legacy application remains production authority.

## Exact blockers before Gate 6B/6C/6D

1. Build the release application composition and steward-facing selected-core route. The accepted
   Gate 1-5 modules are libraries and harnesses; they are not yet one production process. In
   particular, migrated `runa_core`/`runa_learning` authority is not yet wired to the Gate 2 answer
   continuity and Gate 3 governed-setting path.
2. Produce a reviewed release artifact and post-build manifest whose commit, artifact, configuration,
   model, and service digests can be reported by the running process.
3. Provision the parallel persistent PostgreSQL, Keycloak, OpenFGA, and private Caddy target with
   service isolation, secret references, backup jobs, distinct-target restore proof, restart proof,
   and no public listener.
4. Run the owner-interactive target WebAuthn enrollment/fresh-step-up/recovery ceremony.
5. Only then run the protected final backup, selected-write freeze, final project/chat + E6 + setting
   + receipt delta, zero-difference reconciliation, promotion, live checks, one-hour observation, and
   close or rollback.

No blocker requires weakening the design or migrating a deferred subsystem. E3 remains deferred, E4
and device-vault ciphertext remain untouched, E5 remains absent, and the separate approved-knowledge
vector index remains deferred.
