# Gate 4C: approved-knowledge projection

Gate 4C-1 implements only the synthetic, read-only projection contract approved by the steward on
2026-08-21 and merged into `runa2/integration` as `d203cc7`. It reconstructs current approved lessons
from an accepted Gate 4B journal, applies an explicit request scope before deterministic selection,
and returns an inert advisory-context preview.

## Implemented

- authenticated Gate 4B source/head revalidation;
- deterministic approval and lifecycle reconstruction;
- strict participant, project, and capability pre-selection scope;
- six-lesson/1,200-token bounded selection with weak-match and must-not-apply controls;
- keyed provenance and aggregate-only status;
- stale-head and lifecycle-boundary invalidation;
- fail-closed safe retrieval; and
- inactive curriculum-catalog validation.

Gate 4C-2's aggregate-only protected comparison was accepted and merged as `4ed6a52`. The new and
legacy projections agreed exactly on 53 active lessons and every scope category without retaining
private content.

## Gate 4C-3A synthetic answer delivery

The accelerated synthetic closeout adds an optional, hard-branded synthetic adapter that delivers
selected lessons through a separate advisory provider field on general, guarded, research, and
workspace lanes. Deterministic denials run first; participant/project/capability scope filters before
relevance; provenance never reaches the model; citations remain project evidence only; and aggregate
receipts distinguish selection from actual delivery. Removing the adapter restores prior behavior.

## Still not implemented or authorized

- protected data migration;
- retained projection or production PostgreSQL adapter;
- protected or production answer-lane activation;
- live-model semantic validation;
- Qdrant, embeddings, BGE, or another reranker;
- learning import, approval, correction, or activation; or
- production routing, networking, authentication/authorization, or cutover.

Run `npm run test:gate4c`.
