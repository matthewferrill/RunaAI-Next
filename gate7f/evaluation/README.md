# Gate 7F-1 offline evaluation package

The sealed core of this package freezes and grades the Gemma/incumbent Agent Mode burn-in without a
provider client. The separately authorized `home/` operator contains the bounded live capture path.

- `corpus.json` is the 35-case, three-attempt sealed workload.
- `contracts.mjs` validates cases, exact Agent Mode output, and retained observations.
- `prompt.mjs` renders the model-neutral text and exact JSON instruction boundary.
- `grader.mjs` produces deterministic content-free grades and aggregate eligibility.
- `gate7f1.test.mjs` adversarially tests the corpus and grader.
- `run-stub.mjs` proves the complete 105-observation denominator with no model or network.
- `SEAL.json` binds the exact evaluation files after preregistration.

After explicit model/download authorization on 2026-08-27, the `home/` operator produced append-only
`runa2-gate7f1-observation/v1` JSONL with exact artifact and runtime fingerprints. Both arms stopped at
66 complete observations and unloaded under the sealed cutoff rule; neither is a decidable comparison.
See `../GATE7F1-HOME-BURNIN-RESULTS-2026-08-27.md` for the results and identified evaluation defects.
The retained aggregate omits raw responses; raw observations remain separate evaluation evidence and
must contain only synthetic corpus content.

Verification:

```text
npm run test:gate7f1
npm run verify:gate7f1:stub
npm run verify:gate7f1:seal
```
