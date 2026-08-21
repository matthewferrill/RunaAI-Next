# Gate 1 code-review remediation — 2026-08-21

Status: implemented and green; refreshed evidence awaits steward acceptance and protected review.
This does not authorize merge, Gate 2, protected data, production routing, persistent services, model
downloads, or either deferred model endpoint.

## Review findings and root causes

1. **The request deadline covered only model generation.** Retrieval, active-record validation, and
   reranking each had their own adapter timeout and could cumulatively exceed the application budget.
   The earlier dependency-loss fixture failed immediately, so it did not exercise a hanging retrieval
   dependency.
2. **Concurrent duplicates could perform duplicate model work.** Idempotency was enforced when the
   result was committed, after provider execution. Two simultaneous processes could therefore both
   generate an answer even though PostgreSQL retained only one row and one turn. The remediation's
   cross-process test also caught and corrected a missing `await` that briefly released the execution
   lock before the commit transaction finished.
3. **The reranker silently sent only the first 32 windows.** The value served as an undocumented
   per-call size bound, but the adapter treated it as a total-coverage cap. Short synthetic fixtures
   never placed relevant evidence after window 32, so the omission was not visible.

## Remediation

- One deadline now begins when the typed request enters the slice. Retrieval passes, authoritative
  record validation, reranking, provider execution, and duplicate-lock waiting consume the same
  remaining budget. Exhaustion returns an explicit typed timeout and never an honest-empty result.
- PostgreSQL now holds a request-keyed advisory execution lock through the completed answer
  transaction. The memory adapter uses the same single-flight behavior for deterministic tests.
  Identical duplicates share the committed response; conflicting envelopes retain the existing
  request-ID conflict rule.
- The reranker keeps 32 as a validated bounded batch size, processes every overlapping window in
  successive batches, and aggregates the best window score per source with deterministic ordering.
  A partial-batch failure is returned as degraded and explicitly truncated rather than silently
  claiming full coverage.

## Refreshed evidence

- Focused Gate 1 suite: **24/24 passed**, including the three new regression cases.
- Disposable selected-stack integration: **25/25 passed**. Two fresh worker processes sharing one
  request produced one provider call, one request row, one thread turn, and the same response. The
  retained run recorded 16 requests, 16 turns, and 51 LangGraph checkpoints.
- Total deadline: a deliberately slow retrieval dependency produced a typed timeout within the
  100 ms request budget plus the frozen 250 ms harness tolerance.
- Reranker coverage: relevant content after window 32 won the selected-stack rerank after multiple
  bounded batches.
- Cleanup: Caddy, PostgreSQL, Qdrant, collector, provider, slow provider, slow dependency, and
  reranker all reported stopped.
- Repository suite: **38/38 passed** in repository-owner context.
- Gate 0: **10/10 seals** and **12/12 pinned legacy suites** passed against the preserved legacy
  checkout at commit `71ce985`.
- Approved model denominator: Qwen3 Coder 30B-A3B passed **12/12 hard** and **12/12 quality** synthetic
  runs through the existing private RUNA-HOME endpoint.

Reviewable machine evidence remains in:

- `evidence/STUB-INTEGRATION-RESULTS.json`
- `evidence/MODEL-VALIDATION-RESULTS.json`
- `evidence/MODEL-VALIDATION-DEFERRED-REVIEW-2026-08-20.json` (historical and unchanged)

## Rollback and approval boundary

No production route or protected store depends on this branch. Rejection requires discarding only the
Gate 1 branch or reverting the remediation commit; the legacy runtime and all source repositories
remain unchanged. The prior evidence acceptance remains historical, but the code change requires the
steward to accept this refreshed evidence before protected integration review can approve a merge.
