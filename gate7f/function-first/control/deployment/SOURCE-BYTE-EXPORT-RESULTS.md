# Immutable source-byte export result

Prospective criteria: `SOURCE-BYTE-EXPORT-CRITERIA.md`. Canonical commit:
`3cb9b1a9e3aaeca7cd20e69d86b1f06c09a75d09`.

A fresh `git archive --format=tar HEAD` produced SHA256
`26f0ef5cc0f3377f2668c52f6a9bb20605740c0c4778f7208f8b514e50cec2dd`.
For each of the24 deployment source paths recorded by the canonical supervisor
proof and the eight Home/runtime/evidence paths recorded by the R4 wire proof,
the expected proof hash, canonical `git show HEAD:<path>` bytes, working-tree
bytes and extracted-archive bytes were exactly equal. Result: **32/32 paths,
zero drift**.

The archive was generated into the untracked local operator directory
`source-export-final-3cb9b1a`; its bytes are reproducible from the commit and
are not checked into the product. The prior untracked `source-export-check`
archive predates the final wire-pin correction and is retained as setup history,
not cited as passing evidence. Verification did not normalize line endings,
accept an alternate hash or alter any historical proof.

The executable results bound to these bytes are:

- supervisor/deployment: 95/95, proof SHA256
  `a1a7ae82a57b76c055b0add63d3777b589b37d95610afe8f7401c11feae111e7`;
- actual Caddy to mTLS wire: 40/40, proof SHA256
  `d1effdf2aaba7055017aa9105c61e9badb45cf96e14c0e99e64a87797b1ae767`.

These are local isolated operator proofs. They do not prove a live Home
installation, native-wide caller quiescence, real-model structured output,
application promotion or customer readiness.
