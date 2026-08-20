# Reranker hard-corpus preregistration

Frozen 2026-08-20 before the run. The existing BGE reranker is reused; no reranker model is
downloaded. This test decides whether a reranker earns a stack role, not whether its service responds.

## Corpus

Twelve cases each contain one authoritative answer document, eight competitive high-overlap
distractors, and eleven unrelated documents. The relevant fact appears after more than the BGE
service's reported 512-token window but within the Nomic embedding model's supported context. Case
text, labels, construction, and grading are fixed in the sealed runner.

## Arms

1. Nomic embedding cosine ranking, top five.
2. Existing BGE service scoring each whole document, top five.
3. Existing BGE service scoring labelled 400-word windows with 80-word overlap; a document receives
   its best window score and the winning window identity remains in evidence.

The candidate pool is identical in all arms. A result counts only when the authoritative document ID
is in the top five. Every response, document rank, winning window, service identity, and latency is
retained.

## Decision gate

Whole-document BGE remains prohibited because silent 512-token truncation is already measured. The
windowed arm earns a stack role only if it improves top-five recall over embeddings by at least 3 of
12 cases, never reduces recall, reports a window for every score, and has median request latency no
greater than 2 seconds. Otherwise the stack omits a reranker until a real workload shows a new gap.
Failure cannot be repaired by downloading a second reranker after seeing this grading set.

