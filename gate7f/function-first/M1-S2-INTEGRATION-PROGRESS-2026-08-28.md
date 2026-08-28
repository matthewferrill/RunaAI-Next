# M1-S2 integration progress — not milestone completion

The 2026-08-28 standing authorization and full roadmap remain in force. Continue until the complete
bounded customer journey is ready for the human trial; an internal test/commit is not a stopping gate.

## Implemented and verified so far

- Server-authoritative owned conversation context, per-thread revision concurrency, same-request retry,
  and harmless writing/code routing. Foreign scope is checked before provider/retrieval/cache use.
- Encrypted PostgreSQL source sections, exact project/source/content revision filtering in Qdrant,
  Nomic-compatible embedding and explicit-window BGE adapter wiring. Index repair reloads the retained
  immutable source and does not need the user to re-enter private text. HTTP success alone cannot mark
  an unsuccessful Qdrant operation ready.
- PostgreSQL-owned encrypted tasks, grants, proposals, plans, receipts and uncertain-effect recovery;
  LangGraph checkpoints; real immutable Windows files and the unchanged MXC/QuickJS executor.
- A disabled-by-default versioned M1 release feature and five explicit model-role bindings. Its request
  controls are release-digest-bound and applied at the transport layer, not by a textual prompt. No
  legacy release configuration silently enables tools, review, another model, or another permission.
- Authenticated ordinary-user HTTP surface with origin/marker/session/owned-project checks. Runtime
  dispatch and publication recheck the actual session and ownership; logout or restart cannot preserve
  an old in-memory permission. Grants remain scoped to the exact session and capability-set digest.

Focused source/surface checks passed 29/29. Planner/provider compatibility and request-control checks
passed 42/42. Actual HTTP authority checks passed 6/6. The source/PostgreSQL integration initially
passed 11 checks; its additional index-repair revision checks are included in the continuing rerun.

Task component verification is in `tasks/RESULTS-2026-08-28.md`; actual Control proof is retained in
`tasks/CONTROL-NATIVE-RESULTS-2026-08-28.json`. The latter passed 6/6: actual inspect/fail/edit/pass/restore,
hard process crash and single reconciliation, cancellation with retained execution evidence, absent
host/network interfaces and escape rejection, infinite-loop timeout, and excessive-output rejection.
The owned runtime, PostgreSQL and staging were removed; production Node/ACL/PostgreSQL and source
checkout were unchanged. This is execution evidence, not a model-generated prediction.

## Integration failure retained and corrected

The first two local real-Qdrant runs failed during collection creation with HTTP 500:
`Gridstore IO error: The system cannot find the path specified. (os error 3)`.
They used the deeply nested Codex worktree for native storage. Repeating the same code and dependencies
with a short owned temporary storage parent passed all 7 checks. This supports a Windows/native storage
path-depth cause; it does not establish a universal maximum path length for Qdrant.

The passing run used real PostgreSQL 18 and Qdrant 1.19.0, but embedding/reranking HTTP test doubles.
It verifies exact scope/revision filtering, acknowledgement, idempotency, canonical store isolation and
transport composition. It is explicitly **not** Nomic/BGE model proof. Both failed runs and the passing
run stopped and removed their own disposable services/data. Existing collections were never deleted.

## Still in progress

Customer panel recovery and persisted citation evidence; independent composition review; the full
integrated suite; real Nomic/BGE composition; freshly frozen matched three-model functional attempts;
and the exact rollback-protected candidate/customer trial. The long-document budget and actual model
request controls must be selected from the separate readiness evidence, not inferred from HTTP 200.

Production remains `runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc` at the start-of-turn verified
baseline. This development increment does not change Control production routing, protected records,
owner credentials or the remaining 17-family roadmap. M1 remains in progress.
