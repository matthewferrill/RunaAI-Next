# Gate 4B learning-event scope and green criteria

Status: synthetic contract implemented; protected inventory and rehearsal not authorized

## Boundary

Gate 4B preserves the E6 encrypted journal's exact ordered plaintext records after an already
authorized legacy adapter has authenticated and integrity-checked them in memory. The domain includes
`learning-event`, `outcome-feedback`, `lifecycle`, `approval`, and `approval-batch` entries. It does
not decide whether a lesson is useful, activate a lesson, build a prompt, or create a derived index.

The legacy journal remains authoritative until cutover. Gate 4B writes only to a disposable target in
a later approved rehearsal. Rollback is selection of the unchanged legacy adapter plus destruction of
the disposable target; there is no reverse conversion.

## Frozen green criteria

The synthetic contract must pass all 20 cases in `PARITY-CORPUS.json` and prove:

- exact sequence, entry kind, source digest, prior link, payload, and approval lineage survive;
- private payload is present only in authenticated application envelopes;
- public indexes contain keyed references and low-risk routing metadata, not lesson, evidence, task,
  source locator, rationale, or outcome text;
- accepted history can only be extended, never shrunk or rewritten;
- retry, same-run replay, response loss, and pre-commit failure produce one atomic result;
- approval records are history only and no projection or retrieval interface exists;
- inventory output is allowlisted, aggregate-only, deterministic on a second pass, and distinguishes
  empty from unreadable, corrupt, or unresolved lineage; and
- E3, E4, E5, and device-vault disposition remains explicitly unresolved until measured.

Before any protected rehearsal, a separately approved owner-context inventory must additionally show:

- exact clean Control checkout and selected source pins;
- zero unreadable journal entries, chain findings, integrity findings, or unresolved E6 lineage;
- deterministic aggregate results from two in-memory passes; and
- no protected value, ciphertext, credential, passphrase, path, record identifier, or record digest in
  retained output.

## Explicit approval gates

- **Gate 4B-I:** approve one read-only Control inventory after reviewing this synthetic evidence.
- **Gate 4B-R:** after reviewing aggregate counts and E3-E5 findings, approve a bounded protected
  rehearsal or require redesign.
- **Gate 4B-A:** after rehearsal evidence, accept or reject Gate 4B for integration.

No approval carries forward automatically.
