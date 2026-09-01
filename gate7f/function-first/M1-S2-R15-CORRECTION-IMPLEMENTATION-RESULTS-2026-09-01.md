# M1-S2 R15 Agent and Review correction implementation results

Status: implementation and deterministic verification complete. No candidate model was invoked. The
next gate is a committed source archive and fresh runtime seal, followed by fresh model-free controls and
real-browser proof before any R15 campaign attempt. R14 remains immutable and is not replayed or regraded.

## Implemented Review corrections

- The evidence checker now has one unconditional closed object shape: `verdict`, `reason`, `finalAnswer`
  and a non-empty selected-citation array. Legacy conditional fields, unknown keys and malformed values
  fail closed.
- Acceptance requires a byte-for-byte answer echo and exact ordered citation echo. A correction receives
  one unchanged recheck; a second correction, changed echo, unselected evidence, whitespace normalization
  or output-limit violation fails instead of becoming a delivered answer.
- The answerer and checker receive candidate-neutral instructions to enumerate material universal,
  absolute and comparative claims; test population, range, baseline and comparison limits; and trace code
  examples from call-site argument order through parameters and branches without inventing execution.
- The strict schema reaches the actual Mastra/HTTP request path for all three candidates. The shared
  Research path remains fail-closed and retains its existing ceiling.

## Implemented Agent corrections

- Read-only Agent planning and grounding review now derive formulas from declared types and current source,
  preserve numeric scalar arithmetic and operand order, verify coefficients or inverse relationships and
  reject collection/string substitutions for scalar parameters.
- Repair planning receives only the exact current failed-check projection: test ID, expected value, actual
  value or evaluation error, and the existing suite/workspace bindings. It adds no host path, source answer,
  authority or retry loop.
- Failed-check values are capped at 4,000 UTF-8 JSON bytes each, check objects are closed, duplicate IDs and
  contradictory flags/statuses are rejected, and returned projections are recursively immutable clones.
- Test execution status is mapped exactly to the service contract. Ran receipts may be passed or failed;
  not-run/unavailable receipts remain unavailable; failed/timed-out/output-limited receipts remain failed.
  Non-model executor failures stay non-repair observations and cannot be charged to a candidate.

## Independent review and defect disposition

Two independent no-edit reviews were delegated before inference. Review returned GO after its exact-echo
finding was fixed. Agent returned GO after duplicate/malformed check admission, unbounded nested values,
shallow freezing, the PostgreSQL fixture shape and exact executor-status mapping were fixed and covered by
adversarial tests. Neither reviewer found a remaining P0 or P1.

The first repository-wide run after the intended schema change had one deterministic failure:
`wire-source-drift:evidence-output.mjs`. The cause was the governed wire fixture retaining the pre-R15
source digest. The source pin was updated to the new exact schema bytes and the fixture passed. This was a
test-publication binding failure, not a model failure; no campaign identity was consumed and no retry was
performed against a model.

## Deterministic verification

- Changed-path focused suite: 152 tests, 113 passed, zero failed and 39 intentionally skipped PostgreSQL
  branches.
- Complete repository suite: 1,993 tests, 1,915 passed, zero failed and 78 intentional
  environment-dependent skips across 195 tracked test files.
- M1 harness: 160/160 passed. Gate 7F: 28/28 passed. Roadmap: 15/15 passed with digest
  `1830f4798bd14464638261213f162bc2ac7eb1678dc31c4ef683ecdfe4384ac8`.
- Both independent focused reviews passed, and `git diff --check` reported no whitespace errors (only the
  repository's existing Windows line-ending notices).

## Authority and next gate

Candidates, 40 cases, the 360-attempt plus 12-control denominator, thresholds, deadlines, approval policy,
repair budget and candidate-blind evaluator are unchanged. This result proves application behavior only;
it does not qualify a model or product route. Commit and push these exact bytes, build and verify a fresh
source archive/runtime seal, then run fresh controls and real-browser proof. Any method failure pauses the
campaign and is corrected before inference resumes from the first unconsumed identity.
