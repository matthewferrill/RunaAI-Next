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

## V6 protected-tree watcher correction

Fresh source stage `ce8871e1ad9d48d48d4508a39761af6f` completed all 12 model-free controls with zero
failed drivers and `modelsInvoked:false`. The outer validator then failed only after cleanup and a passing
post-run exact-set check with `r15-stage-validation-execution-mutation`. The single recursive
`FileSystemWatcher` covered high-churn disposable PostgreSQL, Qdrant and transient roots, retained events
for the whole run, and collapsed any buffer error to `watcher-error`. The clean exact-set result and
independent review identify legitimate mutable-root event pressure as the leading cause, not an application
or candidate failure. The stage is retained and is not retried.

The corrected validator watches the stage root nonrecursively and each immutable source/runtime top-level
tree recursively. It deliberately does not recurse into only the already-bounded mutable roots or the
`node_modules` junction. All existing source/runtime read locks and pre/post exact-set checks remain. Each
watcher is disabled before its queue is drained to exhaustion, every protected-tree error still fails
closed, and a failure writes a bounded create-only diagnostic with normalized samples plus exception type
and HResult. A static regression rejects restoration of the whole-stage recursive watcher and requires the
disable-before-drain ordering. No Gemma or other model inference may resume until this corrected operator
passes a fresh 12-control run and the separate live-browser publication proof.

## V7 late-event quiescence correction

Source `188048537e4770e3ac7719bff55417bb0994c293` was rebuilt and sealed. Fresh stage
`3cb0e98c307a4bc5b4aafeccfb2da347` reached model-free browser control 10 before final independent
review found one remaining P1 in the method. The validator disabled the protected-tree watchers, slept
for 100 ms and stopped draining on the first empty event snapshot. `FileSystemWatcher` callbacks enter
PowerShell's event queue asynchronously, so a callback could arrive after that snapshot and be removed
unread during `finally`. The static ordering test did not reproduce delayed delivery. The operator
published a fail-closed negative browser acknowledgement and confirmed that the stage's exact Node,
PostgreSQL and Qdrant processes were absent. The stage is retained, has no qualification credit, and
invoked no model.

The new tracked `acceptance/Wait-R15WatcherQuiescence.ps1` helper drains events until a bounded quiet
interval rather than a single empty poll, and fails closed if the maximum drain window expires. The
validator invokes it while watchers remain enabled, disables and disposes every watcher, invokes it again
with a longer quiet interval, classifies every ordinary or Error event from both drains, then repeats
`Assert-ExactStageSet` while all byte locks remain held. The regression uses an out-of-band ready/go
handshake to write after an initially empty poll, then separately queues an event, disposes its watcher and
proves that the same shared helper captures it afterward. Both behavioral paths are deterministic and use
the exact helper imported by the validator. Three sequential host runs passed, and independent final
re-review returned GO with no P0/P1 finding. Commit/reseal, fresh 12/12 controls and the separate real-browser
publication proof remain required before any Gemma request. The focused host file passes 26/26, the complete
tracked suite passes 1,936/2,014 with 78 intentional environment-dependent skips and zero failures, and
roadmap verification passes 15/15.

## V8 runtime-security witness correction

Commit `bf1ec7fdc1aacd1239e6513c29943fb93f4d6342` was rebuilt into the v8 exact source/runtime seal.
Fresh stage `635e8cecd7b64b6296d9b23043b52015` completed all 12 inner controls with zero failed drivers and
`modelsInvoked:false`, but the outer validator retained a fail-closed
`r15-stage-validation-execution-mutation` diagnostic containing 1,910 `Changed` events beneath the sealed
runtime. Post-run hashes and the exact runtime file/directory set were unchanged, the stage's processes were
confirmed absent, and no candidate identity was consumed.

Two bounded no-model diagnostics separated the event sources. Re-running the idempotent
`Stage-OwnedNativeAccess.ps1` step emitted zero runtime events. One successful native QuickJS preflight
emitted 314 events: 312 beneath `sandbox-runtime` and two beneath `runtime`. Parallel watchers with one
`NotifyFilter` apiece proved every event was `Security`; file name, directory name, size, last write and
attributes each remained at zero. MXC's declared process-container fallback temporarily applies and clears
runtime access rules, so the original combined watcher conflated an expected reversible ACL transition with
a durable application mutation.

The correction is narrow and fail-closed. Only the `runtime` and `sandbox-runtime` watcher specs omit the
`Security` filter; the stage root and every immutable source/tool watcher retain it. Runtime watchers still
observe file/directory names, last writes, sizes and attributes, and every manifested runtime file remains
open under a `FileShare.Read` byte lock. After both bounded watcher drains and disposal, the validator
rehashes every runtime file, verifies the exact file and directory sets, and compares a digest of canonical
owner/group/DACL state for every runtime file and directory against its pre-execution snapshot. Any lasting
security change throws `r15-stage-runtime-security-drift` before the event verdict is accepted.

The behavioral regression makes a real ACL change in a disposable runtime, proves the digest changes, then
restores the exact descriptor and proves equality. All 27 focused checks pass. The complete tracked suite
passes 1,937/2,015 with 78 intentional environment-dependent skips and zero failures. Independent P0/P1
review returned GO: the omission is restricted to the two runtime watchers, all other protected security
events remain observed, and complete durable runtime state is verified before locks are released. A new
commit/seal, fresh 12-control run and separate browser-publication proof remain required before the
steward-directed Gemma 120-attempt arm. The already-implemented R15 unconditional Review checker shape is
the simplified contract selected for that arm; it does not use the failed nullable accepted/correction form.

## V9 Windows ACL normalization RCA

Fresh v9 stage `e4678a024f624ebab6340cd989c59556` completed all 12 model-free controls with zero
failed drivers and `modelsInvoked:false`. The separate real-browser checkpoint also visibly proved the
unknown execution receipt and mandatory reconciliation state. The outer validator then stopped with
`r15-stage-runtime-security-drift`. It correctly prevented inference; the stage is retained and is not
reused.

A fresh diagnostic stage and two model-free QuickJS preflights isolated the cause. The first Windows MXC
process-container launch caused one-time automatic ACL inheritance normalization across all 159 sealed
runtime files and directories. The security digest changed once; the second identical preflight produced
the same digest. Runtime bytes, paths, execution results and effect counts were unchanged. The defect was
therefore the timing of the security baseline, not a model response and not a reason to weaken the
post-run drift check.

Finalization now grants the stage-owned access, performs one model-free native preflight, records the
normalized owner/group/DACL digest, performs a second preflight and requires byte-for-byte digest
idempotence before sealing. Every later phase requires the preflight to leave that baseline unchanged,
then retains the existing read locks, exact byte/set validation and post-run durable security comparison.
Any non-idempotence or later ACL drift remains a hard stop before candidate use.

## Steward-selected Gemma-only eligibility arm

The compute-conserving prospective arm fixes Gemma as the only scored and generative candidate. Nomic is
allowed only as the already-sealed retrieval embedding model; it is explicitly neither scored nor
generative. The immutable manifest contains the exact 120-row order, 24 attempts for each of Chat,
Research, Code, Agent and Review, fresh controls, live-browser proof, source/runtime/hardware/criteria
hashes and the exact Home lease. It is created after Home readiness but before any scored attempt, and the
launch validator rejects any pre-existing Gemma campaign directory.

The R15 Campaign phase has no operator-selectable candidate. It hardcodes `gemma4-26b-a4b`, locks the
controls, browser proof, Home-ready receipt and eligibility manifest, and validates the complete 120-row
result before the Home completion publisher may report `completed`. Duplicate, missing, reordered,
wrong-candidate, wrong-role, wrong-repetition, stopped, cleanup-failed or supplemental results fail closed.

Independent semantic review is candidate-local rather than routed through the old 360-row comparative
summarizer. A random 256-bit HMAC key blinds all 120 attempt identities. The reviewer receives only the
identity-free worksheet; any candidate/model identity in its schema or retained provider output stops
preparation. Finalization requires 24 determinate rows per role, at least 22 passes, no more than two
failures, zero critical model failures and zero critical product failures. Even a five-role pass is only
`candidateEligibleAllFiveRoles:true`: comparative evaluation, full R15 completion, product qualification,
customer-trial readiness, recommendation and production routing all remain false, and a human trial is
still required.

This is sufficient to answer the narrower operational question: if Gemma passes all five roles under this
fresh arm, one candidate can cover all five functions. It does not rewrite R14, pool historical rows, or
claim that the originally planned three-model R15 comparison was completed.

### Pre-launch independent-review stop and correction

Two independent pre-launch reviews stopped the first implementation before commit, reseal or inference.
The candidate contract itself was accepted, but the reviewers found publication-chain defects: durable
result bytes were hashed separately from the object being validated; the Home completion wrapper did not
bind the canonical arm, source tree or runtime prefix; reviewer-private identity mappings were initially
placed beside the worksheet; the worksheet omitted the delivered application answer and other evidence
needed to distinguish a primary response from a corrected response; and the final eligibility record did
not revalidate controls, browser proof, Home readiness, completion and final cleanup from pinned bytes.
These were harness defects. They are not Gemma failures and no model was called while they were open.

The corrected implementation uses contained, non-reparse, retained read handles and verifies their bytes
again before publication. Launch binds the current source archive and source-tree manifest. Home completion
binds the arm file digest, canonical arm digest, durable batch digest, completion-validation digest, runtime
seal and prefix, source tree and exact lease before it can publish `completed`. It then waits for the
supervisor's terminal zero-residency/power-restoration result, records state before cleanup, retires the
owned task and records the final Home state. Candidate identity/HMAC mapping is retained only under
`operator-review-binding`; the evaluator receives only `candidate-blind-review/review-worksheet.json`.
That worksheet now carries every provider response, the answer actually delivered by the application,
completion/citation metadata, plan summaries and selected source bytes. The evaluator identity is fixed by
contract rather than operator-selected.

Final grading now reopens and pins the complete arm, result, completion, runtime, controls, browser, Home
and review chain. It computes the post-arm provenance object and digest in memory, validates the complete
grade, and then performs one create-only durable publication of the candidate eligibility grade containing
both. Invalid decisions therefore cannot leave an orphan provenance artifact that appears usable later.

Two final independent reviews returned GO with no remaining P0/P1 blocker. They reproduced 200 exact-path
replacement attacks across ten fresh processes with zero accepted substitutions, rejected a deterministic
same-inode/same-size overwrite after `fsync`, verified linked-root and linked-output-ancestor rejection,
confirmed that hidden worksheet pointers cannot influence a decision, and checked that Completion,
ReviewPrepare and ReviewFinalize retain source, runtime, validator, Node and evidence locks throughout
execution. The complete model-free campaign harness passes 195/195; the complete tracked repository suite
passes 1,965/2,043 with 78 intentional environment-dependent skips and zero failures. Fresh source packaging, reseal, 12
controls and the separate real-browser proof remain mandatory before the first Gemma request; Gemma has
incurred zero new scored attempts under this arm.

## V10 startup-observation contract RCA

Fresh stage `288236b61f1e4944a0a77d360f704a51` stopped during its first model-free ACL-normalization
preflight, before controls or inference. The retained stage has zero matching processes. The normalizer
unit fixture had modeled a successful MXC launch with a populated `startupObservation`, and the normalizer
therefore required that shape. The actual `MxcJavascriptExecutor` contract returns
`startupObservation:null` after a successful typed execution; it creates an observation only when the
sandbox process starts but fails before producing its typed result. The production preflight succeeded far
enough to return its real contract, then the incorrect outer assertion rejected it.

The corrected predicate requires the exact ready/executed receipt, null error, zero exit, system stamp,
expected `runa2-sandbox-ready` stdout, empty stderr, zero effects and a null startup-failure observation.
Any populated startup observation is rejected. The fixture now mirrors the real executor contract and
includes the inverse failure regression. Focused checks pass 34/34, the complete model-free harness passes
196/196, and the full repository suite passes 1,966/2,044 with 78 intentional environment-dependent skips
and zero failures. Two independent reviewers returned GO with no P0/P1 findings. The failed stage remains
evidence and is not reused; the next permitted action is a new exact archive, seal and stage followed by
the model-free controls and browser witness.

## V11 finalization-key-order RCA

Fresh stage `4b57aec1ddca418dbf20c2df7ddac6da` successfully finalized the exact 2,464-file source
package, then stopped before its first control with `r15-stage-validation-finalization-schema`. The retained
receipt is complete and matches every typed value and digest. The defect was the validator's manually
written sorted property-name literal: it placed `runtimeSealSha256` after `runtimeSecurityEntries`,
`runtimeSecurityNormalized` and `runtimeSecuritySha256`, while `Sort-Object` correctly places
`runtimeSealSha256` before the `runtimeSecurity*` fields. The correct receipt was therefore rejected solely
by the outer key-order assertion. No control result and no model attempt were recorded.

The expected literal now uses the actual sorted order. A new model-free regression extracts the fields from
the finalizer's real ordered receipt literal, sorts those fields, extracts the validator expectation and
requires exact equality. This closes the gap left by source-presence tests that did not execute or derive
the two sides of the contract. Focused checks pass 8/8, the campaign harness passes 197/197, and the full
suite passes 1,967/2,045 with 78 intentional environment-dependent skips and zero failures when its
disposable payload directory is writable. The first restricted local run produced five filesystem-denial
failures in `probes/results/_payloads`; the unchanged suite passed with the required worktree write access,
so those five are environment-attributed and not campaign or model failures. Two independent reviewers
returned GO with no P0/P1 findings. The failed stage remains evidence and is not reused; commit/reseal and
a fresh stage are required before any inference.
