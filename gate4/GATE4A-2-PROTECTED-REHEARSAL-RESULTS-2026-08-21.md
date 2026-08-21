# Gate 4A-2 protected rehearsal results

Status: green on 2026-08-21 under the exact approved Control-local boundary. The steward accepted this
evidence and approved the protected development merge on 2026-08-21. The merge completed as
`90572a0`.

## Layman result

All 25 existing durable chats and all 75 turns were read under Matthew's owner-bound Control identity,
re-encrypted with a new disposable key, written once into temporary PostgreSQL tables, read back, and
compared exactly in memory. Titles, ordering, timestamps, routes, and user/assistant strings matched.
The source did not change. The temporary target, key, backup, runtime, and listener were then removed.
Legacy RunaAI remains the only live authority.

## Authority and preflight

- Legacy production was clean on `main` at `b4db04090d8f0df87234fab573b396e7824c5354` before and
  after the run.
- RunaAI-Next was clean on `runa2/gate-4a-project-chat-plan` at
  `04bfb7d5a47e06e0bdbe094bbc0ded04de29006b`.
- Ten legacy source pins and twelve deployed runner files matched their reviewed authorities.
- The retained PostgreSQL 18.6 runtime and exact `pg` 8.23.0 / `zod` 4.4.3 dependency closure were
  transferred by authenticated SSH into a Matthew/System-only temporary root. No package or model was
  downloaded.
- The first runner attempt stopped before backup or protected access because the Omen-built source
  package had Git line-ending transport differences from the Control checkout. Only the temporary
  runner copy was replaced with exact bytes packaged from the verified Control checkout. The second
  preflight passed. This was a package-authority guard working as designed, not a data failure.

## Protected checks

- The scoped pre-run backup contained exactly 26 encrypted files and 110,355 bytes. It excluded
  legacy `store-key.dpapi` and matched the source byte-for-byte before and after import.
- The approved inventory manifest remained
  `40d395b8b70641df4d862b73b1e20832b63fd71b684d99f5a2a3e032417cbdc2`.
- A simulated pre-commit failure left zero target product or ledger rows.
- Concurrent duplicate delivery produced one completed run; changed content under the same run id was
  refused; restart plus DPAPI key recovery replayed rather than importing again.
- Target counts were 25 chats, 75 turns, one run, 100 ledger items, zero projects, zero project memory,
  and zero tombstones.
- Source and target whole-domain logical digests both equal
  `ab157f24062d97b589c249d96f19660fb5b00fd291a713f9acb440ddc2002049`.
- Wrong participant and wrong project reads were denied before decryption. Typed-schema checks found no
  plaintext private columns. Private strings of eight or more characters were absent from database
  envelope/ledger text and the PostgreSQL log; shorter fields are protected by the typed-envelope-only
  schema and exact authenticated round trip.
- Only aggregate JSON was retained; `disallowedFieldsEmitted` is false.

## Rollback and cleanup

The `runa_core` and `runa_migration` schemas were dropped, PostgreSQL stopped, its data/log files and
DPAPI-wrapped disposable key were deleted, and port 9693 was closed. After source revalidation, the
temporary encrypted backup and transferred runtime/package were permanently deleted with the exact
temporary root. Omen staging was also deleted. Both Control checkouts remain clean.

The temporary backup and target cannot be recovered, by design. The unchanged legacy encrypted chat
store remains intact and authoritative.

## Runtime note

The protected one-time runner used Control's installed Node 24.19.0; repository regressions use the
pinned Node 22.22.0. The runner invoked no model/provider path, and its exact protected checks passed
with locked `pg`/`zod` dependencies. This runtime difference is disclosed for Gate 4A-3 review rather
than silently credited as production-runtime validation.

## Gate 4A-3 boundary

A green Gate 4A-2 proves the selected mapping can preserve the current protected chat population and
roll back without changing production. It does not make PostgreSQL live, persist a target key, merge
the branch, authorize project/learning/knowledge/settings migration, or approve cutover. Gate 4A-3
was satisfied when the steward accepted this evidence and separately approved the protected branch
merge into `runa2/integration` on 2026-08-21. Production migration and cutover remain unauthorized.
