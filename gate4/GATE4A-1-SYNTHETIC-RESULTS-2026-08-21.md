# Gate 4A-1 synthetic results

Status: synthetic implementation, rehearsal, and the approved aggregate-only owner inventory are
green on 2026-08-21. Gate 4A-1 evidence is complete. Gate 4A-2 remains separately decision-gated.

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

RUNA-CONTROL's clean production checkout is now at
`b4db04090d8f0df87234fab573b396e7824c5354`, while the live GitHub `main` observed during this review
remains `71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2`. The latter commit is no longer present in the
Control checkout, so the two histories cannot be compared there as commits. All ten legacy files
selected by Gate 4A were compared directly instead: four raw hashes matched and six raw hashes
differed only because of LF/CRLF transport. All ten match the reviewed pins after `utf8-lf`
canonicalization. The inventory now verifies those ten pins, bound to the Control production commit,
before it opens any protected root.

The owner CLI is also executed from a temporary clean package containing only its four reviewed code
files plus the source-pin manifest. This proves the inventory entry point needs no `npm install`,
`node_modules`, or external JavaScript package on RUNA-CONTROL.

Gate 1 and Gate 2 integration harnesses share the collector's default metrics port and therefore must
run sequentially. A concurrent verification attempt produced that expected harness port collision;
the sequential Gate 2 rerun passed and every disposable child service stopped. This did not affect
product state or Gate 4 evidence.

## Owner-context inventory result

The established `runa-control` SSH profile was verified as `RUNA-CONTROL\Matthew` and used with
forwarding disabled. Before each owner-bound attempt, both checkouts were verified clean on their
expected branches and commits.

The first attempt at RunaAI-Next `fe09e00` failed closed with `inventory-source-pin-mismatch` before
opening a protected root. RCA found that four manifest entries retained raw CRLF hashes when the
verifier changed to `utf8-lf`; direct source comparison showed no content difference. Commit
`6612d60` corrected only those canonical pins and recorded the Control access workflow.

The rerun at RunaAI-Next `6612d60` against clean legacy production commit `b4db040` passed:

- 25 readable chats and 75 turns;
- all 25 chats are unassigned; 56 turns are `general-chat` and 19 are `guarded-chat`;
- zero projects, project-memory records, unreadable records, or relationship/integrity findings;
- ten verified source pins, successful owner-key unseal, and identical second-pass manifest; and
- `disallowedFieldsEmitted: false`.

Only the allowlisted one-line aggregate JSON was retained in
`evidence/OWNER-CONTEXT-INVENTORY-2026-08-21.json`. No protected value, export, copy, conversion,
re-encryption, import, repair, or production change occurred.

## Review gate

The inventory satisfies the frozen green criteria. Its empty project and project-memory populations
mean the next protected rehearsal can be narrowed to chat records rather than pretending there is
project data to migrate. This evidence permits discussion of Gate 4A-2; it does not approve it.
