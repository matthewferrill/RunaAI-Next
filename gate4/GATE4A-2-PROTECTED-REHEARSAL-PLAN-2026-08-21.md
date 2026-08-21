# Gate 4A-2 protected chat rehearsal plan

Status: approved by the steward on 2026-08-21. This authorizes one Control-local protected rehearsal
under the exact boundary below. It does not authorize production installation, cutover, adapter
selection, source mutation, protected merge, or any later Gate 4 domain.

## Exact source snapshot

- Legacy authority: clean `RUNA-CONTROL` `C:\AI\Projects\RunaAI` `main` at
  `b4db04090d8f0df87234fab573b396e7824c5354` with its local upstream at the same commit.
- Gate authority: clean `C:\AI\Projects\RunaAI-Next` branch
  `runa2/gate-4a-project-chat-plan` at the reviewed rehearsal-tool commit.
- Approved inventory manifest: `40d395b8b70641df4d862b73b1e20832b63fd71b684d99f5a2a3e032417cbdc2`.
- Expected population: 25 unassigned chats, 75 turns, zero projects, zero project-memory records,
  zero unreadable records, and zero relationship findings.
- Any source commit, tracked-state, source-pin, count, schema, relationship, or manifest drift stops
  before target import.

## Target and transfer boundary

- Host: `RUNA-CONTROL` only, under Matthew's owner-bound Windows context.
- Temporary root: `C:\AI\RunaAI-Gate4A-Protected-Rehearsal`; it must not pre-exist and is removed
  after green evidence and cleanup verification.
- Target: disposable PostgreSQL on `127.0.0.1:9693`, database `postgres`, with only `runa_core` and
  `runa_migration` product schemas. PostgreSQL is stopped after restart/replay testing and its data
  directory is deleted.
- Omen transfers only reviewed code dependencies and the retained RunaLab PostgreSQL `bin`, `lib`,
  and `share` runtime. Transfer hashes are checked before execution. No model, package, or service is
  downloaded and no protected value leaves Control.
- The only network use is the established authenticated SSH/SCP administration path and the target's
  loopback PostgreSQL listener. There is no LAN or internet listener.

## Backup and source protection

- Before decryption/import, copy only the encrypted `catalog.json.enc` and the 25 approved
  `<chat-id>.json.enc` files into the temporary root. Verify source and backup raw hashes in memory.
- Do not copy `store-key.dpapi`, any identity/session material, or any directory outside the three
  approved Gate 4A roots.
- Because the approved project and project-memory counts are zero, the appearance of any such source
  record stops the rehearsal rather than widening the backup.
- Legacy files remain read-only and authoritative. After import and again before cleanup, reproduce
  the approved aggregate manifest and backup digest. Any drift stops and preserves the temporary
  backup for owner review.

## Key ceremony

- Generate fresh 32-byte AES-256-GCM and HMAC-SHA-256 keys on Control.
- Wrap the combined disposable key material immediately with Windows DPAPI CurrentUser under
  `RUNA-CONTROL\Matthew`; only the DPAPI ciphertext may touch disk.
- Unseal the keys after the PostgreSQL restart to prove owner-bound recovery, then zero the in-memory
  key buffers where practical.
- Delete the wrapped key after exact reconciliation and target rollback. Legacy `store-key.dpapi` is
  never copied or used as target key material.

## Required rehearsal checks

1. The protected runner and every imported module match the clean reviewed Gate commit.
2. The legacy authority and all ten canonical source pins pass before any protected root opens.
3. The scoped encrypted backup contains exactly 26 files, matches the source byte-for-byte, and
   excludes the legacy key.
4. A simulated failure before commit leaves zero target product, ledger, or domain-state records.
5. Concurrent duplicate delivery commits one complete run; reusing a run id with changed content
   remains a conflict.
6. PostgreSQL restart plus DPAPI key re-unseal replays the completed run without a second deed.
7. Target counts are exactly 25 chats, 75 turns, zero projects and project memory, one run, 100
   upsert ledger items, and zero tombstones.
8. Decrypted target records reproduce exact chat metadata, titles, order, timestamps, routes, and
   user/assistant strings under a canonical whole-domain comparison performed only in memory.
9. The database has only typed public columns plus authenticated private envelopes; scans find no
   source private string in database text, logs, or retained evidence.
10. Source inventory and encrypted backup digests remain unchanged after the rehearsal.
11. `runa_core` and `runa_migration` are dropped, PostgreSQL stops, and the data directory, wrapped
    key, backup, dependency package, and temporary root are deleted. Legacy RunaAI remains selected.
12. Retained evidence contains only commits, schema/runtime versions, aggregate counts, hashes,
    booleans, typed error codes, and cleanup status—never identifiers, paths, ciphertext, keys, or
    protected content.

Every check is mandatory. A failure is not averaged; it stops the rehearsal and emits only a safe
error code. If source drift or cleanup uncertainty occurs, preserve the temporary root and request
owner review rather than deleting potential recovery evidence.

## Rollback window and approval boundary

The rollback window lasts from backup completion through final source revalidation. Rollback means
leaving legacy untouched and authoritative, dropping only the isolated target schemas, stopping the
disposable server, deleting its data/key material, and verifying the legacy snapshot again. Green
Gate 4A-2 evidence permits a Gate 4A-3 acceptance decision; it does not authorize that acceptance or
merge.
