# Nomic input-bound review — 2026-08-28

Read-only inspection; no new model load, tokenize, embedding or inference request. The earlier short
actual-adapter smokes are not rerun or regraded by this finding.

`evidence/20260828-nomic-static-inspection.json` verifies the installed pinned GGUF's `nomic-bert`
architecture, `bert` tokenizer,2,048 context,768 dimensions, BOS101/EOS102 and30,522 vocabulary entries.
There are no empty tokens, bare continuation-only `##` tokens or standalone U+2581 word-boundary
tokens. The LMStudio index.js hash matches the existing runtime pin. Only749,820 metadata bytes were
parsed; model tensors were not mapped. The first inline transport exceeded Windows' argument limit;
the corrected stdin transport performed this read without creating Home files.

The proposed M1-only derived NFKC input windows of1,600 UTF8 bytes, including required prefix, are
conservative for this WordPiece vocabulary. Standard WordPiece pieces consume nonempty normalized
text; the upstream [WordPiece implementation](https://github.com/ggml-org/llama.cpp/blob/master/src/llama-vocab.cpp)
preprocesses case/accents and represents failed words with an unknown token. The vocabulary check
rules out a standalone phantom-prefix output. A local exhaustive1,112,064-Unicode-scalar check found
no case where NFKC→NFD/strip-mark/lowercase codepoint count exceeded post-NFKC UTF8 bytes (maximum
ratio1). These support the conservative bound plus special-token margin; they are not an actual
oversized-request test of the installed binary, nor proof that upstream master equals its exact build.

The window implementation preserves full canonical source text and full BGE source revisions, splits
only the derived embedding input, retains coverage/overlap, and rejects budget overflow rather than
dropping later source text. Coverage-weighted normalized aggregation is a deliberate long-input
representation change requiring campaign coverage. Short ASCII vectors remain unchanged; a short
Unicode string changed by NFKC intentionally has different derived input. Raw long-query/source
embedding must not bypass this boundary.

[LMStudio's primary tokenization documentation](https://lmstudio.ai/docs/typescript/tokenization)
provides `tokenize` and `countTokens` for loaded embedding handles. The pinned installed index exposes
these RPC operations behind `ensureModelLoaded`; calling them could load a model and was not done
outside a lease. No public REST token-count route was established by this inspection. Whether this
exact REST embedding backend truncates or rejects an oversized input remains unmeasured; do not
assert either behavior as an observed result. A separately sealed bounded auxiliary check may test
boundary strings/token counts before the larger campaign if required, without reopening model choice.
