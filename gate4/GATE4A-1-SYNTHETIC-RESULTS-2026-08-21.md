# Gate 4A-1 synthetic results

Status: synthetic implementation and rehearsal green on 2026-08-21. The approved aggregate-only
owner inventory has not yet run on RUNA-CONTROL, so Gate 4A-1 evidence is not complete and Gate 4A-2
is not requested.

## What was built

- Typed PostgreSQL tables for projects, chats, turns, project memory, migration runs/items, and
  content-free deletion tombstones.
- Application-level AES-256-GCM envelopes with associated data binding the participant, record, type,
  and field. Reconciliation uses keyed HMACs; disposable keys remain outside PostgreSQL.
- Strict source-schema and relationship validation, deterministic mapping, participant/project scope
  checks before decryption, idempotent imports, predecessor manifests, replay after response loss, and
  atomic failure handling.
- Read parity for projects, chat list/read/search, branch provenance, archive/unread state, project
  assignment, and gated project memory.
- A fail-closed owner inventory entry point structurally limited to the three approved legacy roots.
  It emits only aggregate counts, byte totals, allowlisted route counts, relationship counts, hashes,
  booleans, and source/script authority. It performs two independent reads and requires identical
  domain manifests.

## Evidence

| Verification | Result |
|---|---:|
| Frozen Gate 4A corpus | 19/19 passed |
| Disposable Gate 4A PostgreSQL integration | 16/16 passed |
| Full repository Node profile | 93/93 passed |
| Gate 1 disposable regression | 25/25 passed |
| Gate 2 disposable regression | 21/21 passed |
| Gate 3 disposable regression | 16/16 passed |
| Seals | 10/10 passed |
| Pinned legacy focused suites | 12/12 passed |

The Gate 4A integration proved concurrent duplicate handling, exact encrypted round trips, typed
schema presence, deletion propagation, content-free tombstones, keyed digest shape, restart replay,
atomic failure before commit, response loss after commit, privacy-canary exclusion from database text,
exact ledger counts, and rollback that removed only Gate 4A schemas. PostgreSQL stopped cleanly.

A deliberately wrong legacy commit was supplied to the inventory CLI. It returned only the safe
`inventory-authority-mismatch` result and stopped before opening any protected store. The real
owner-context path was not used.

Gate 1 and Gate 2 integration harnesses share the collector's default metrics port and therefore must
run sequentially. A concurrent verification attempt produced that expected harness port collision;
the sequential Gate 2 rerun passed and every disposable child service stopped. This did not affect
product state or Gate 4 evidence.

## Remaining owner action

From a reviewed checkout of this branch in Matthew's interactive Windows owner session on
RUNA-CONTROL, first discover and verify the actual legacy production checkout path. Then run:

```powershell
node gate4/run-owner-inventory.mjs --legacy-repo <verified-legacy-checkout> --expected-commit 71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2
```

Do not substitute a different commit or run from Omen. DPAPI owner binding is part of the safety
boundary. Retain only the one-line aggregate JSON after checking that it contains no protected value.
No export, copy, conversion, re-encryption, import, repair, or production change is authorized.

## Review gate

The steward reviews the inventory's authority fields, zero unreadable/invalid counts, relationship
counts, deterministic second pass, manifest digest, and `disallowedFieldsEmitted: false`. Any failure
stops Gate 4A. A green inventory permits discussion of Gate 4A-2; it does not approve it.
