# M1-S2 R15 Agent and Review correction implementation results

Status: campaign paused before inference while the corrected method is resealed. No candidate model was
invoked by the retained R15 method failures. R14 remains immutable and is not replayed or regraded.

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

The create-before-load Home lease builder is an additional hard gate. Its first R15 package build rejected
the sealed hardware plan with `lease-v2-campaign-source-drift`: eight of ten historical
`sourceFiles`/`operatorFiles` hashes differed. No pinned file changed between the prior seal and R15. The
plan was produced from CRLF-normalized Windows checkout bytes, while the lease package consumed the LF
entries in the sealed Git archive; three source files and all five operator files therefore differed. This
happened before a Home upload, model load, provider call or consumed identity. The correction makes the R15
common builder extract the supplied archive, execute the archived canonical builder inside that extraction,
verify every plan pin against extracted bytes, and bind the plan hash into the runtime seal. Direct checkout
building rejects staged, unstaged and line-ending byte drift. The pre-correction campaign launch wrappers
remain absent until fresh source, seal, controls and browser pins exist. A new commit/archive/seal, successful
model-free package builds for all three candidates, repeat 12-control gate and real-browser gate are required
before the campaign can start.

The corrective full-suite gate also found an intermittent Windows watchdog timestamp-verification defect.
The observer had treated `Process.StartTime` as causal ordering evidence even though its precision can place
it about one millisecond before or after the fsynced UTC records. It now uses that timestamp only as exact,
parseable process identity metadata and proves sequence from the durable supervisor, helper-start, started,
finished and terminal records. Exact PID/hash binding, suspended creation, atomic job assignment, deadline,
output and stopped-state checks remain enforced. A terminal-present adversarial regression covers both
timestamp directions and record reversal. The watchdog suite passed 12/12 three consecutive times; the
complete tracked suite passed 2,007 tests with 1,929 passes, 78 intentional skips and zero failures.
Independent review reported GO with no P0/P1 finding. No model/provider activity occurred.

## Compact-runtime containment correction before inference

The next source-stage review stopped launch before inference with two P1 method findings. The staged
application did not yet contain the compact Node/QuickJS runtime required by the native-access preflight,
and the attempted fallback would have granted the sandbox executor read access to the whole extracted
application stage. Neither finding is attributable to a candidate, and no campaign identity or model
credit was consumed.

The correction now builds the compact runtime once during create-only finalization, records every runtime
file's path, size and SHA-256 in an archive/source/node-bound manifest, validates the exact file set before
each control run, and holds every manifested runtime file open with read-only sharing before application
Node starts. Runtime and manifest remain immutable evidence; only disposable PostgreSQL, Qdrant, transient
and synthetic-data directories are removed during cleanup. Changed, missing, additional or reparse-point
runtime entries fail closed before application execution.

Model-free verification is green: the focused contract/runtime suite passed 49/49; the complete repository
suite passed 1,933 of 2,011 tests with 78 intentional skips and zero failures; the campaign harness passed
164/164; Gate 7F passed 28/28; roadmap verification passed 15/15; and `git diff --check` reported no
whitespace defects. Independent re-review returned GO with no P0/P1 finding after verifying deterministic
source bindings, create-only outputs, exact-set validation and prelaunch read locks. The campaign remains
paused before inference until the corrected source is committed/resealed and fresh controls plus
real-browser proof pass under the new seal.

## Post-publication R15 source-stage RCA

Three create-only source stages are retained as model-free method failures; none is retried and none is
charged to a candidate:

- `aabeaf4e4c164eb294cee4fa11b97897` stopped in finalization because the validator retained the previous
  2,439-file archive count after the sealed source grew to 2,440 files. The validator/finalizer count was
  corrected and a static cross-check was added.
- `a71e1af4eebc4fc3bb2b71e5eee43386` stopped before controls because create-only validation created the
  required `transient` root and then classified that same root as an extra directory. The exact-set rule
  now recognizes only that named dynamic root and the regression asserts the binding.
- `b2decffb8a0b46fc95e590bbe318e9f0` completed controls 01-09, then retained
  `m1-browser-checkpoint-unobserved`; controls 11-12 consequently saw the disposable PostgreSQL endpoint
  closed. The exact cause was an equal 900,000-ms resource watchdog and browser-witness ceiling: a valid
  witness wait could consume the entire resource lifetime. Cleanup then encountered the already-stopped
  database before removing `disposable-postgres`, `q`, and `data`, which the final exact-set check correctly
  rejected. The owned-resource lifetime is now 1,800,000 ms while the witness ceiling remains 900,000 ms;
  a deterministic test requires the resource lifetime to be strictly greater. The retained run reports
  nine completed controls, three failed controls, `modelsInvoked:false`, and `productionChanged:false`.

Independent re-review then found the same equal-deadline defect in the separate publication proof, which
can perform two sequential 900,000-ms human checkpoints. That shared executor now gives its owned testbed
2,700,000 ms and has an R15-specific strict-greater-than-two-windows regression. The next admissible
operation is a new commit/archive/seal followed by one fresh 12-control run and one fresh live-browser
publication proof. Gemma inference remains prohibited until both pass.

The complete deterministic suite passed 2,020 tests with 1,942 passes, 78 intentional skips and zero
failures after the functional-control correction. The exact final timing/browser suites then passed
32/32 and 47/47 after the publication-path correction. Independent final re-review returned GO with no
P0/P1; its unelevated shell could not terminate three synthetic Windows process-tree fixtures, while the
same focused file passed 29/29 in the required host process-control context.
