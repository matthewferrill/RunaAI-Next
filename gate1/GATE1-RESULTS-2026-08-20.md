# Gate 1 results — 2026-08-20

Status: **accepted by the steward under the approved Gate 1 scope amendment.** This is not merge
approval, production readiness, migration completion, or permission to start Gate 2.

## What is green

- Focused deterministic suite: **21/21 passed**. It maps all 18 frozen parity cases, repeats every
  model-influenced hard behavior three times, and adds explicit provider-output-limit and telemetry
  canary checks plus a stale-content-digest veto.
- Disposable selected-stack integration: **22/22 checks passed** using Mastra/AI SDK, Caddy,
  LangGraph/PostgreSQL checkpointing, authoritative PostgreSQL records, Qdrant derived vectors, a
  windowed BGE-compatible reranker adapter, and OpenTelemetry.
- Restart/duplicate: a fresh process returned the committed response without replay; one request
  produced exactly one request row and one turn. The retained run had 14 requests, 14 turns, and 42
  checkpoints.
- Derived state: PostgreSQL and Qdrant active source/section counts and digests aligned before and
  after a revoked stale vector was introduced and rebuilt.
- Failure states: honest empty, dependency unavailable, timeout, unknown citation, revoked source,
  unknown command, protected path, and cross-project denial were explicit.
- Retrieved instruction boundary: hostile authority/tool text was replaced with a non-content
  placeholder before embedding, withheld before reranking and answer generation, and recorded as
  `retrieved-instruction-denied`. The provider wire contained neither hostile text nor its canary.
- Telemetry: allowlisted spans were retained, synthetic identifiers were pseudonymized, and prohibited
  trace canaries were absent.
- Cleanup: Caddy, PostgreSQL, Qdrant, collector, provider, slow-provider, and reranker child processes
  all reported stopped after the passing run.
- Repository regression: the combined inherited plus Gate 1 Node suite passed **35/35** in repository-
  owner context. The full frozen Gate 0 verifier also passed: 10/10 seals, all 12 pinned legacy focused
  suites at legacy commit `71ce985`, exact Node 22.22.0, and the 18-case corpus checks.
- Dependency audit: npm still reports two low entries for the one accepted
  `GHSA-866g-f22w-33x8` dependency path. The installed aliased provider utility is 3.0.30; a registry
  check still found 3.0.32 as the newest published 3.x, while the advisory now marks versions through
  3.0.97 affected. No audit fix or dependency substitution was applied.

Reviewable machine evidence:

- `evidence/STUB-INTEGRATION-RESULTS.json`
- `evidence/MODEL-VALIDATION-RESULTS.json`
- `evidence/MODEL-VALIDATION-DEFERRED-REVIEW-2026-08-20.json`

## Amended model acceptance result

The amended Gate 1 denominator exercised the ordinary read-only chat/research role against the
already-running private RUNA-HOME endpoint using only synthetic data. No model was downloaded,
explicitly loaded, reconfigured, or left behind as a new service.

| Role | Model | Result at the frozen 30-second request ceiling |
|---|---|---|
| Ordinary chat/research | Qwen3 Coder 30B-A3B | **12/12 hard and 12/12 quality passed** across four cases repeated three times. |

The retained report is 12/12 hard, 12/12 quality (100%), satisfying the unchanged 100% hard and at
least 90% quality thresholds. The report records Qwen3.6 and the live BGE endpoint as deferred and does
not invoke either one.

## Retained deferred-role evidence

Before the amendment, Qwen3.6 MTP completed 0/3 clean-source deliberate-review cases within the frozen
30-second ceiling through the approved OpenAI-compatible path. That failed 12/15 combined report is
preserved unchanged apart from its historical schema label in
`MODEL-VALIDATION-DEFERRED-REVIEW-2026-08-20.json`.

The steward approved deferring—not passing or replacing—the deliberate-review role. Qwen3 Coder is
not credited for review because its sealed matrix passed only 3/8 review cases. Reintroducing Qwen3.6
requires a separately approved provider contract and fresh acceptance evidence.

The windowed BGE-compatible adapter passed the disposable real-stack test, while the existing private
BGE endpoint timed out on a bounded synthetic request. The live endpoint is likewise deferred; Gate 1
claims only adapter behavior and explicit degradation, not live-reranker readiness.

The exact amendment and unchanged boundaries are recorded in
`gate0/GATE1-SCOPE-AMENDMENT-2026-08-20.md`.

## Acceptance record

The steward explicitly accepted the regenerated Gate 1 evidence on 2026-08-20. The branch remains
unmerged. Branch protection and normal code review still apply, and Gate 2 remains unstarted pending a
separate approval.

## Rollback evidence

No legacy or protected store was opened and no production route was enabled. All passing integration
processes stopped. Rejecting the slice requires only discarding this branch and its ignored disposable
artifacts; the three source repositories and their authoritative data remain unchanged.
