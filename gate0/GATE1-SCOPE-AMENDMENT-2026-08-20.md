# Gate 1 scope amendment — 2026-08-20

Status: approved by the steward after review of the first Gate 1 implementation evidence.

## Decision

Gate 1 accepts only the minimum ordinary read-only chat/research slice through Qwen3 Coder
30B-A3B and the approved Mastra/AI SDK OpenAI-compatible provider boundary.

The Qwen3.6 27B MTP deliberate-review role is deferred. It is not replaced by Qwen3 Coder and is not
part of the Gate 1 model-quality denominator. Its clean-source acceptance case timed out 3/3 at the
unchanged 30-second ceiling on the selected provider path. Reintroducing it requires a separately
approved provider contract and fresh acceptance evidence; the failed diagnostic remains retained at
`gate1/evidence/MODEL-VALIDATION-DEFERRED-REVIEW-2026-08-20.json`.

The existing live BGE endpoint is also deferred after a bounded synthetic request timed out. Gate 1
still proves the windowed reranker adapter with a disposable compatible service and proves explicit
degradation when a reranker is unavailable. It makes no live-reranker readiness claim.

## What does not change

- The 18-case parity corpus, request/response contract, 30-second maximum deadline, hard invariants,
  effects-empty boundary, project/participant/thread authority, citation rules, restart/duplicate
  rules, PostgreSQL/Qdrant reconciliation, trace redaction, and rollback remain frozen.
- Cross-project, protected, revoked, stale-digest, and retrieved-instruction content remains blocked
  before any answer model. Authority/tool instructions are replaced with a non-content placeholder
  before embedding and withheld before reranking or generation.
- No protected data, legacy store, production route, persistent service, model download, provider
  reconfiguration, or governed effect is authorized.

## Amended model acceptance denominator

The representative model-influenced Gate 1 set is four ordinary chat/research cases, each run three
times through Qwen3 Coder 30B-A3B:

1. grounded general answer with recognized citation;
2. metaphysical/non-record question without a repository fact claim;
3. complete research denominator with grounded synthesis; and
4. partial research denominator with the uncovered budget term named.

All 12 runs must pass every hard expectation. At least 90% must pass the frozen answer-quality checks,
and any hard failure blocks acceptance. Deterministic hostile-content, protected-path, cross-project,
revocation, timeout, output-limit, duplicate, restart, and telemetry cases remain required separately.

## Approval boundary

This amendment authorizes evidence regeneration for the narrowed Gate 1 denominator. It does not
approve Gate 1 for merge or start Gate 2. The steward must review and explicitly accept the regenerated
Gate 1 evidence after all applicable verification is green.

## Evidence acceptance

After the amended evidence passed 12/12 live synthetic model runs, 21/21 focused checks, 22/22
disposable integration checks, 35/35 combined tests, 10/10 seals, and all 12 pinned legacy suites, the
steward explicitly accepted the Gate 1 evidence on 2026-08-20. This acceptance does not merge the
branch or authorize Gate 2.
