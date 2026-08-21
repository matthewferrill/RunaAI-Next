# Gate 4E — approved-knowledge index build-or-skip result

Status: skip the current approved-knowledge index

The selected Qdrant/Nomic/windowed-BGE stack remains approved for project documents and larger
research corpora. It is not automatically justified for the current approved-knowledge library.
Gate 4C has only 53 active lessons, filters exact scope before relevance, and already returns at most
six lessons/1,200 estimated tokens without a service dependency.

The synthetic direct-selector measurement uses a 53-lesson library with the exact protected aggregate
shape (1 personal, 5 project, 16 capability, 31 global) but no protected text or identifier. Its sealed
corpus covers lexical positives, zero-token-overlap paraphrases, honest misses, cross-scope attacks,
and literal `mustNotApply` attacks. Three repetitions must have identical ordering, exact bounds, zero
safety false selections, and p95 below 250 ms.

No vector or reranker endpoint was authorized in this synthetic train. Therefore no legitimate
15-point vector improvement or further five-point BGE improvement can be demonstrated. The build
decision is **skip**, with remeasurement triggers at 530 and 5,300 approved lessons or when a sealed
semantic-recall need is established sooner.

Any future approved-knowledge Qdrant arm must be purpose-built. The Gate 1 project adapter cannot be
reused unchanged because it filters only project scope, retains raw project/source payload fields,
has no honest-miss threshold, and rebuilds destructively. A future adapter requires keyed-reference
payloads, pre-ranking scope allowlists, a frozen relevance threshold, versioned collections, atomic
alias swap, authoritative manifest/lifecycle denial, exact count/digest proof, fallback only to the
already-scoped direct selector, and interruption/restart/rollback/cleanup evidence.

Run `npm run test:gate4e`.
