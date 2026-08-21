# Gate 4B-R protected E6 rehearsal results

Status: green on 2026-08-21 under the exact approved Control-local boundary. The steward accepted this evidence and approved the protected development merge on 2026-08-21. The merge completed as `61d364b`. It does not authorize a retained migration, learning activation, Gate 4C, or production cutover.

## Layman result

All 90 entries in the existing E6 learning journal were unlocked under Matthew's owner-bound Control identity, re-encrypted with a new disposable key, written once into temporary PostgreSQL tables, read back in their original order, and compared exactly in memory. The complete journal matched. The source did not change, no learning behavior was turned on, and the temporary database, key, backup, runtime, listener, and package were removed.

The one E3 record was not migrated or opened by this runner. E4 and the device vault were not migrated. E5 remained absent. Byte manifests for all of those protected boundaries matched before and after the rehearsal.

## Authority and preflight

- Legacy RunaAI was clean on `main` at `b4db04090d8f0df87234fab573b396e7824c5354` before and after the run.
- RunaAI-Next was clean on `runa2/gate-4b-learning-events-plan` at `4ee5e93558634da768d715cc3a8424da23eb9e21` during the run and was returned clean to `runa2/integration` afterward.
- Twelve reviewed legacy source pins and twelve packaged runner files matched their authorities before DPAPI access.
- PostgreSQL 18.6 and the exact `pg` 8.23.0 / `zod` 4.4.3 offline dependency closure came from the retained RunaLab runtime. No package, model, or service was downloaded.
- The first attempt stopped before protected access because four text files had Git CRLF/LF transport differences. The verifier was narrowed to permit only that transport normalization, committed, pushed, and revalidated with 25/25 focused tests and the full 118/118 suite.
- Two later preparation attempts stopped at PostgreSQL initialization because the temporary transfer was missing first the runtime `share` directory and then part of `lib`. Visible `initdb` output identified each missing local-runtime directory. No PostgreSQL target started. Each attempt's disposable E6 backup copy and wrapped target key were deleted before retry. The source remained read-only and the successful run reverified it byte-exact.

## Protected checks

- The scoped encrypted backup contained exactly 91 files: one E6 manifest plus all 90 encrypted entries, totaling 410,544 bytes. It excluded the Learning Center DPAPI credential and device vault and matched the source byte-for-byte.
- The preserved history contains 63 learning events, 10 lifecycle entries, 17 approval batches, and zero outcome or individual approval entries. The 17 batches retain all 63 approval decisions reported by inventory.
- A simulated failure before commit left zero target entries, indexes, runs, or ledger items.
- Concurrent duplicate delivery produced one completed run. Reusing that run id for changed source was refused. PostgreSQL restart plus retry replayed the existing result instead of importing again.
- Target counts were 90 encrypted journal entries, 90 typed indexes, one run, and 90 migration items. No approved-knowledge projection or model-facing read path exists.
- Source and target ordered-history digests both equal `76a3f47bc26a71ce8cf0f6b55060e1fc49bfe36261975b9feda29c45711a043c`.
- Typed-schema checks found no plaintext lesson, statement, evidence, rationale, or generic private/public JSON columns. Private source values were absent from safe indexes and the PostgreSQL log.
- Only aggregate JSON was retained; `disallowedFieldsEmitted` is false.

## Rollback and cleanup

The `runa_learning` and `runa_learning_migration` schemas were dropped and verified absent. PostgreSQL stopped; its data, log, DPAPI-wrapped target key, and scoped E6 backup were deleted. Port 9694 has no remaining connection or listener. The entire Control rehearsal root and Omen staging root were then deleted and verified absent. Both Control repositories remain clean.

The temporary backup and target cannot be recovered, by design. The unchanged legacy protected stores remain intact and authoritative.

## Runtime note

The one-time protected runner used Control's installed Node 24.19.0. Repository regressions remain pinned to Node 22.22.0 and passed 118/118. The runner invoked no model, provider, projection, retrieval, or production route.

## Next approval boundary

A green Gate 4B-R proves the selected append-only mapping can preserve the current protected E6 journal and be removed without changing production. The accepted development merge preserves that evidence and tooling in `runa2/integration`; it does not decide the E3 record, design E4/device-vault security, create E5, activate approved knowledge, retain PostgreSQL, authorize Gate 4C, or authorize cutover.
