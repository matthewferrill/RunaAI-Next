# Evidence registry

`EVIDENCE-REGISTRY.json` is the tracked index for the preserved evidence associated with commit
`2dfa5a1633898150c5659ca3b806383f572e1f2d`. The large payloads remain outside Git at
`artifacts/runs/.handoff/2dfa5a1`; the registry records their exact names, sizes, hashes, scope,
verification result and known limits.

The registry is an index, not the payload. The original four-archive package, corrected Wave 7 v3,
the stack bake-off bundle, and the synthetic PostgreSQL/Qdrant service state are preserved in three
private GitHub draft releases. GitHub-reported digests were compared with every local asset. The
local ignored copies remain under `artifacts/runs/.handoff/`; do not delete or regenerate them while
the draft releases are the active preservation record.

The supplemental releases are working-tree snapshots anchored to commit `2dfa5a1`; the draft tags do
not imply the snapshot files are committed. Exact release IDs, URLs, asset counts, archive hashes,
and fresh-extraction results are in `EVIDENCE-REGISTRY.json`.

The current four-archive set is authoritative. Three older hashes are explicitly listed under
`supersededHashesNeverUse`; they identify an earlier, replaced package and must not be accepted.

## Decision boundaries

- Raw run records, databases, ledgers and sandbox remnants remain unchanged.
- Write-success semantics from the retired lexical detector are `NOT_DECIDABLE`; historical counts
  may be retained only when clearly labelled as withdrawn detector output.
- Existing Wave 7 claims that require the missing 97 wire logs are `NOT_DECIDABLE` from the preserved
  package. Future runners must retain their wire logs.
- The preserved 1,200-character answer prefix may support a bounded human label, but cannot recover
  text that the original harness discarded.
