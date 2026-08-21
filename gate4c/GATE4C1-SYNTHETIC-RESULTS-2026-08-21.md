# Gate 4C-1 synthetic projection results

Status: synthetic implementation green; awaiting Gate 4C-1A steward acceptance

## Result

The projection-first contract is implemented without opening protected data or activating an answer
path. It authenticates and revalidates accepted Gate 4B records, reconstructs current approval and
lifecycle state, filters by explicit participant/project/capability scope before relevance, and
produces only an inert typed advisory preview with keyed provenance.

The port deliberately corrects one legacy weakness: project and capability lessons no longer remain
eligible merely because a lane failed to declare its scope. Every dimension must be explicit, and an
undeclared applicable dimension denies the lesson.

## Verification

| Check | Result |
|---|---:|
| Frozen Gate 4C-1 parity corpus | 28/28 passed |
| Full Node suite | 146/146 passed |
| Gate 0 seals and current corpus | passed; 10/10 seals |
| Gate 1 disposable integration | 25/25 checks; all services stopped |
| Gate 2 disposable integration | 21/21 checks; all services stopped |
| Gate 3 disposable integration | 16/16 checks; PostgreSQL stopped |
| Gate 4A disposable integration | 16/16 checks; PostgreSQL stopped |

The optional Gate 0 legacy-source phase was not rerun because Gate 4C-1 neither changes nor imports
legacy code. The previously accepted legacy pins remain unchanged.

## Non-effects

No protected store, Control host, production route, real lesson, model, provider, Qdrant collection,
embedding, reranker, persistent service, network listener, learning action, or production database was
used or changed. The projection is memory-only and `modelContextAuthorized` remains false.

## Next decision

Gate 4C-1A asks the steward to accept or reject the synthetic projection contract. Acceptance does
not authorize protected-data access or answer-lane activation. If accepted, the next recommended step
is one separately designed aggregate-only comparison of the reconstructed active-state counts and
scope categories against the already accepted 90-entry Gate 4B journal rehearsal boundary.
