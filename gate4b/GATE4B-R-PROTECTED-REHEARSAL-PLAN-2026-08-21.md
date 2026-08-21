# Gate 4B-R protected E6 rehearsal plan — 2026-08-21

## Approved scope

Matthew approved one owner-context rehearsal of the complete 90-entry E6 learning-event journal into disposable PostgreSQL storage.

- E6: rehearse all 90 append-only journal entries in exact order.
- E3: do not migrate or alter the single retained record.
- E4: do not migrate or alter it; defer its authority and device-bound security design to Gate 5.
- E5: do not migrate it because the owner inventory found no E5 store.
- Device vault and Learning Center credential: use only through their existing owner-bound unlock boundary; do not copy them into the backup or target.
- Activation: do not expose an approved-knowledge read path, activate learning, cut over, or retain the target.

## Entry criteria

The runner must fail before protected access unless both repositories are clean, at the approved commits and branches, under `RUNA-CONTROL\\Matthew`; all reviewed source pins and packaged runner files must match; the fixed loopback port and fixed rehearsal root must be available; and the observed E6/E3/E4/E5/vault boundaries must match the approved inventory.

## Rehearsal and validation

1. Take an exact encrypted backup of only the E6 manifest and 90 encrypted entry files. Never copy the DPAPI credential or device vault.
2. Unlock E6 in the owner context, validate its cryptographic chain and lineage, and keep private content in process memory only.
3. Create a disposable 64-byte target key, protect it with current-user DPAPI, and initialize PostgreSQL on loopback only.
4. Verify transaction rollback before commit, concurrent duplicate handling, changed-run refusal, PostgreSQL restart, and idempotent retry.
5. Decrypt the target records only for exact ordered source-to-target comparison. Verify all 90 records, authenticated envelopes, typed safe indexes, aggregate counts, and equal logical digests.
6. Scan indexes, migration metadata, schema, and PostgreSQL logs for source private values; verify that no projection or model-facing read path exists.
7. Re-read E6 and byte-verify every protected learning boundary and the scoped backup.

## Rollback and cleanup

Drop only `runa_learning` and `runa_learning_migration`, verify both schemas are absent, stop PostgreSQL, and delete the disposable database, log, wrapped target key, and E6 backup. After capturing the aggregate result, delete the fixed rehearsal package root and verify it is absent. The legacy repositories and all protected stores remain authoritative and unchanged throughout.

## Approval gate

This document records Matthew's approval for this single rehearsal only. Any retained migration, E3/E4/vault work, E5 creation, learning activation, production cutover, or Gate 5 implementation requires a separate explicit gate.
