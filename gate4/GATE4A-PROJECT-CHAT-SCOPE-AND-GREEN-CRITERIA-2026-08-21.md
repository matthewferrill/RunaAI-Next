# Gate 4A scope and green criteria — project/chat domain

Status: Gate 4A-1 approved by the steward on 2026-08-21. Synthetic implementation, rehearsal, and the
approved owner-context inventory execution on RUNA-CONTROL are green. Gate 4A-2 was approved and
completed green on 2026-08-21 under `GATE4A-2-PROTECTED-REHEARSAL-PLAN-2026-08-21.md`.

## Layman summary

Gate 4A is the first point where migration planning approaches Matthew's real Runa data. It covers
only managed projects, encrypted durable chats, their branch/grouping metadata, and steward-directed
project memory. It does not include learning, approved knowledge, settings, credentials, identity,
actions, providers, or search indexes.

The safe first step has two parts: build and test the new PostgreSQL mapping entirely with fabricated
records, and run one tightly bounded owner-context inventory that reports only counts and hashes. Real
chat or project content is not exported or copied in this approval step.

## Entry status

1. Gates 0–3 are accepted in `runa2/integration`; Gate 3 merge commit is
   `0680cfbd179b27052cfb6be652609609185ca5c2`.
2. RUNA-CONTROL's legacy production checkout is verified clean on `main` at
   `b4db04090d8f0df87234fab573b396e7824c5354`, with its locally recorded `origin/main` at the same
   commit. Live GitHub `main` was observed at `71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2`, which is absent
   from the Control checkout after an upstream history rewrite. All ten legacy sources selected by
   Gate 4A are content-equivalent to the reviewed `71ce985` pins under `utf8-lf` canonicalization.
3. RunaLab is verified clean at `ec5e3466f6f937c8c610bdecf62a09c2491c7137`, tracking
   `origin/main`.
4. The one approved aggregate-only inventory opened only the three named legacy roots and decrypted
   chat records in memory. It emitted no protected value and performed no export, copy, conversion,
   import, repair, or migration.
5. The target authority, encryption, mapping, legacy disposition, and inventory output are frozen in
   the adjacent Gate 4A contracts.

Gate 4A protected export/import remains blocked until the inventory and synthetic evidence are
reviewed and a second approval is granted.

## Authorized work after approval

### A. Synthetic implementation and rehearsal

- Implement production-oriented `runa_core` and `runa_migration` repositories in a disposable local
  PostgreSQL database, keeping Gate 2 adapters available for regression and rollback comparison.
- Implement version-gated import of fabricated `runa-chat-store/v1`, `runa-project-store/v1`, and
  project-memory fixtures.
- Implement application-level authenticated envelopes with disposable test keys, keyed canonical
  content HMACs,
  idempotent import, manifest reconciliation, content-free deletion tombstones, and visible adapter
  selection.
- Implement read parity for list/read/search/branch projection, project context, archive/unread state,
  project assignment, project memory enablement, and deletion propagation using synthetic data only.
- Add the Gate 4A verifier profile and machine-readable evidence. Disposable PostgreSQL processes must
  stop and their Gate-4A-only schemas must be removable without changing Gate 1–3 evidence.

### B. One owner-context inventory

- Implement the reviewed inventory script so it is structurally limited to the three named domain
  roots and aggregate allowlist.
- Before execution, verify its source pins and canary tests with synthetic encrypted fixtures.
- After explicit approval of this contract, run it once from Matthew's owner context on RUNA-CONTROL,
  repeat the read-only digest pass for determinism, canary-scan the output, and retain only the safe
  aggregate evidence.

## Out of scope

- exporting, copying, packaging, converting, re-encrypting, or importing any real record;
- real PostgreSQL schema installation, persistent services, non-loopback networking, or production
  adapter changes;
- DPAPI/Windows Hello/identity/session migration or copying legacy `store-key.dpapi`;
- learning events, candidates, approved lessons, E3/E4/E5 stores, settings, provider metadata or
  credentials, action proposals/receipts, workspace roots, diagnostics, or backups;
- Qdrant indexing, embedding, reranking, model calls, model downloads, or provider changes;
- telemetry containing private data; and
- deletion, repair, catalog rebuild, cutover, or retirement of the legacy adapter.

## Hard green criteria

Every applicable case in `PARITY-CORPUS.json` must pass; no privacy, scope, integrity, deletion, or
rollback result may be averaged.

1. Synthetic source counts and four keyed canonical domain digests equal target counts/digests after
   import.
2. Re-import is idempotent: no duplicate projects, chats, turns, memory, ledger items, or tombstones.
3. A source key reused with different content stops as a conflict and changes no target records.
4. Chat order, timestamps, route, assignment, archive/unread state, branch provenance, titles, and text
   survive exact round-trip comparison after decryption in the test process.
5. Unassigned chats remain unassigned; branches remain self-contained when the parent is absent.
6. Cross-participant and cross-project reads fail before any private envelope is decrypted for return.
7. Project source references grant no read authority; archived projects cannot enable memory.
8. Project-memory records remain project memory, never approved knowledge, and are excluded from
   context while memory is disabled.
9. Every sensitive target field is encrypted at application level; ciphertext swapping, field
   substitution, wrong participant, wrong key, modified tag, and unknown envelope version fail closed.
10. No private content, identifier, path, key material, nonce, tag, or ciphertext appears in allowed
    logs, OTel attributes, inventory output, or migration evidence.
11. A missing source record in a later approved synthetic snapshot removes target content and leaves
    only a content-free tombstone; deleted content does not return on replay or restart.
12. Dependency loss, crash before commit, crash after commit/response loss, restart, and concurrent
    duplicate import yield either no commit or one complete commit—never a partial domain.
13. Unknown source schema, unreadable envelope, invalid relation, turn-count mismatch, unsafe id, or
    prohibited field stops the run and preserves the prior target snapshot.
14. The legacy adapter remains selectable without mutation; rollback requires no reverse conversion.
15. Gate 1–3 deterministic and disposable integration profiles, the full Node owner-context profile,
    seals, and pinned legacy focused suites remain green.
16. Owner inventory, if approved and executed, produces two identical domain manifest digests and zero
    disallowed-output findings. Counts are evidence of shape only and never imply migration approval.

## Rollback

Before Gate 6, rollback means selecting the legacy adapter, retaining the immutable evidence ledger,
and discarding only the isolated Gate 4A target schema and disposable key. No legacy record is changed.
A protected rehearsal, if separately approved later, must use a pre-run backup and an isolated target;
it still cannot become the live authority.

## Approval gates

### Gate 4A-1 — plan, synthetic work, and read-only inventory authorization

Approval authorizes the synthetic implementation/rehearsal and one bounded owner-context aggregate
inventory described here. It does not authorize a real export/import.

Status: approved 2026-08-21; synthetic work and owner-context inventory complete and green.

### Gate 4A-2 — protected export/import rehearsal

After 4A-1 evidence is reviewed, a separate approval must name the target host/schema, key-wrapping
ceremony, encrypted transfer boundary (if any), backup, deletion handling, rollback window, and exact
aggregate inventory snapshot. It authorizes an isolated rehearsal only, not cutover.

Status: approved and completed green 2026-08-21 under the adjacent protected-rehearsal plan.

### Gate 4A-3 — evidence acceptance and protected merge

The steward reviews reconciliation, privacy scans, failures, restart, rollback, source drift, and the
remaining legacy authority. Merge into `runa2/integration` requires a separate explicit approval.

Status: evidence accepted and protected merge approved by the steward on 2026-08-21. This approval is
limited to integration of the reviewed development baseline; it is not production migration or cutover.
The protected merge completed as `90572a0`.
