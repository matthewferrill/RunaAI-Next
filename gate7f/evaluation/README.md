# Gate 7F-1 offline evaluation package

This package freezes and grades the Gemma/incumbent Agent Mode burn-in without containing a provider
client. It cannot download or call a model.

- `corpus.json` is the 35-case, three-attempt sealed workload.
- `contracts.mjs` validates cases, exact Agent Mode output, and retained observations.
- `prompt.mjs` renders the model-neutral text and exact JSON instruction boundary.
- `grader.mjs` produces deterministic content-free grades and aggregate eligibility.
- `gate7f1.test.mjs` adversarially tests the corpus and grader.
- `run-stub.mjs` proves the complete 105-observation denominator with no model or network.
- `SEAL.json` binds the exact evaluation files after preregistration.

Live capture is intentionally absent. After separate model/download authorization, an operator must
produce append-only `runa2-gate7f1-observation/v1` JSONL with exact artifact and runtime fingerprints.
The retained aggregate omits raw responses; raw observations remain separate evaluation evidence and
must contain only synthetic corpus content.

Verification:

```text
npm run test:gate7f1
npm run verify:gate7f1:stub
npm run verify:gate7f1:seal
```
