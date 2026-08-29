# R5 runtime-seal builder

The builder prepares one prospective common seal for the complete R5 campaign.
It does not choose a model, infer a winner, invoke a provider or authorize
production routing.

## Input and command

Create a strict `runaai-m1-r5-runtime-seal-input/v1` manifest matching
`r5-runtime-seal.test.mjs`. Use absolute paths to the final source archive,
its exact `package-lock.json`, and the reviewed readiness, effective-reasoning
and campaign-hardware evidence. Every path carries an independently obtained
SHA256. The declaration must still say zero R5 attempts and no imported,
selective, tuned, partial or inherited campaign state.

Run only after the final source/archive and current prerequisite evidence exist:

```text
node gate7f/function-first/acceptance/build-r5-runtime-seal.mjs ABSOLUTE_INPUT.json ABSOLUTE_NEW_DIRECTORY/runtime-seal.json
```

The destination directory must already exist and be an ordinary resolved
directory. `runtime-seal.json` must not exist. Success returns a compact
publication receipt containing only the source, case and output hashes.

## Fixed derivation

The builder verifies the frozen R5 criteria and exact R4b template bytes, but
replaces the historical source/archive and three prerequisite evidence pins.
Candidates, artifacts, installed model IDs, request controls, roles, budgets,
endpoints, runtime pins and evaluator policy cannot be supplied by the input.
They remain exact immutable-template values and are cross-checked against the
prospective hardware plan. Fixed suites are recomputed from `cases.mjs`.

The output is stable-key canonical JSON with one trailing newline. Publication
uses a create-only sibling pending file, fsync, an atomic create-only hard-link,
pending-link retirement and byte-for-byte reread. Failure before the link does
not create a seal; failure after the link leaves a non-single-link result that
fails closed. An existing destination is never reused or overwritten.

This builder has intentionally not been run with a final R5 manifest. Test
fixtures use disposable synthetic source files and retained non-private
prerequisite evidence only. Creating the actual seal remains the prospective
campaign operator step after final source and evidence freeze.
