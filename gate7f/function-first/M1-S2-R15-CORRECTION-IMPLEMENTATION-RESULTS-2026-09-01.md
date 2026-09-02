# M1-S2 R15 Agent and Review correction implementation results

Status: implementation, deterministic verification, source publication, fresh runtime seal, 12/12
model-free controls and the real-browser publication preflight are complete. No candidate model was
invoked. The next gate is the full fresh R15 campaign. R14 remains immutable and is not replayed or
regraded.

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
- Complete repository suite after adding the R15 browser-control wrapper: 1,997 tests, 1,919 passed,
  zero failed and 78 intentional
  environment-dependent skips across 195 tracked test files.
- M1 harness: 160/160 passed. Gate 7F: 28/28 passed. Roadmap: 15/15 passed with digest
  `1830f4798bd14464638261213f162bc2ac7eb1678dc31c4ef683ecdfe4384ac8`.
- Both independent focused reviews passed, and `git diff --check` reported no whitespace errors (only the
  repository's existing Windows line-ending notices).

## Source, seal and model-free campaign gates

- The exact corrected source was committed and pushed as
  `2e81d94b3f362c6d8d2d04bbf6a486a091228af7`. Its source archive SHA-256 is
  `b843a2bb088287c703ad777a4572f3577a8026ac567106f4f4984cbcd4959368`; the fresh runtime-seal SHA-256
  is `89adf8bdcfa2dc4db0c07dd96b4b2c80953d2a5188c18f9cd14f77602493e93d`.
- The fresh control stage `8055460afc064b4d8dc3c28f7f66bf0b` completed all 12 drivers with zero
  failed drivers, no candidate inference and no production change. The retained result is
  `acceptance-evidence/controls-1788304975116.json`, SHA-256
  `2bc6386d09ae9c6ccabafe60037b3e267c56e69d1d8339ba50756c6332dca865`.
- The final corrected live-browser stage `df4cfda48eed4061927d1475e770ca16` used Brave on the neutral application
  origin. The application visibly rendered the exact cancelled task and bounded-drain notice; the browser
  published the witness first and the operator published only the matching acknowledgement. The proof
  passed actual-browser exercise, witness timing, acknowledgement timing, witness-before-acknowledgement,
  acknowledgement consumption and native release. The retained result is
  `acceptance-evidence/r15-browser-publication-control-1788308274030.json`, SHA-256
  `fe900660ef707d193dce3a50f6a860f3c0a31468e0a550f0175bddf84fc69f14`. This final proof ran after
  independent review removed the last legacy token-in-query compatibility path; checkpoint capabilities
  remained server-side and the visible URL stayed exactly on the neutral application root.
- Five earlier R15 browser preflights failed closed before model use. They are method-failure evidence,
  not candidate failures: blocked capability/separate-port navigation, a same-origin swap started too
  late, compressed HTML rewriting, post-cancellation proxy startup, and a reload that reset the task UI.
  The final method prestarts one same-origin pass-through proxy, forces identity encoding, injects an inert
  witness control, activates it from a sealed capability file without reload, records the live browser
  witness, and publishes the matching acknowledgement without republishing the witness.

## Authority and next gate

Candidates, 40 cases, the 360-attempt plus 12-control denominator, thresholds, deadlines, approval policy,
repair budget and candidate-blind evaluator are unchanged. This result proves application and campaign
method readiness only; it does not qualify a model or product route. Run the full fresh campaign and then
the candidate-blind review. Any method failure pauses the campaign, preserves the completed prefix, and is
corrected before inference resumes from the first unconsumed identity.
