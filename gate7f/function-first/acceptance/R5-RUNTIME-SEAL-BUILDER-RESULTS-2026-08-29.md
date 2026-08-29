# R5 common runtime-seal builder results

Status: implementation qualified with synthetic publication fixtures. No actual
R5 runtime seal was created.

The builder was implemented after the separately committed prospective
criteria. It consumes one exact manifest, verifies the immutable R4b template,
the frozen R5 criteria, final source/archive/lock hashes and the three specified
prerequisite-evidence records. Candidate, artifact, model, role, budget,
endpoint and runtime values remain template-owned. Fixed suites are recomputed
from `cases.mjs`.

Publication is create-only and canonical. An owned sibling pending file is
written and synced before an atomic hard-link creates the final name. Existing
or foreign pending/final files are not overwritten or removed. Actual inputs
are read under byte caps from opened file handles, and file identity, size,
link count and modification time must remain stable through each read.

## Verification

- `node --check gate7f/function-first/acceptance/r5-runtime-seal.mjs`
  passed.
- `node --check gate7f/function-first/acceptance/build-r5-runtime-seal.mjs`
  passed.
- `node --test gate7f/function-first/acceptance/r5-runtime-seal.test.mjs`
  passed 6/6 with zero skips.
- `node --test 'gate7f/function-first/acceptance/*.test.mjs'` passed
  188/189 with zero failures. The one skip is the pre-existing optional actual
  PostgreSQL/LangGraph checkpoint test; it is outside the seal builder. All six
  seal-builder tests ran and passed in that suite.
- `npm run verify:roadmap` passed 15/15 and retained all 17 capability families.
- `git diff --check` passed before publication of these results.

The negative cases cover template, criteria, case-bundle, archive, lock,
readiness, effective-reasoning and telemetry drift; changed hardware policy or
candidate roster; retrospective, tuned, selective, partial and inherited
inputs; existing outputs; and a foreign pending publication. Deterministic
tests produce identical canonical seal bytes from independent directories.

## Boundary

Only disposable local files and retained non-private repository evidence were
read. The builder did not call a provider, load a model, contact Home or
Control, start a service, change production routing or read protected values.
The final source commit/archive and current pre-inference evidence must be
provided later by the campaign operator. Running the builder then is a new,
prospective create-only operation; this result does not authorize retrospective
seal construction and is not model or product qualification.
