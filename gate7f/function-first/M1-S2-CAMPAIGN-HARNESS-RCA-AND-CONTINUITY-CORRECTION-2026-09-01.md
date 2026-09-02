# M1-S2 campaign harness RCA and continuity correction

Date: 2026-09-01
Status: corrected r53 continuation completed all 51 remaining Qwen identities from the unconsumed Agent-06 cursor; the canonical composer verified a complete 68 + 1 + 51, 120-row record with no gap or duplicate; the expanded 160/160 model-free harness passes; Home cleanup, power restoration, task retirement, zero owned residency, and unchanged production routing are verified; candidate-blind semantic review is complete and product qualification remains false because no Review candidate reached 22/24

## Executive result

The historical campaign method repeatedly treated test-system failures as candidate failures, consumed the attempt, and often restarted the whole arm. That was wrong. Across the retained history there are now **30 countable fault-invalid snapshots containing 1,579 recorded attempts**. Of those attempts, 139 were later salvaged, 71 are in the paused Qwen execution windows, and 1,369 were permanently discarded or made qualification-ineligible. Exact retained result/raw evidence proves at least 1,768 provider calls, plus 138 early retained provider/model outputs whose exact call totals were not published. The two new snapshots are r50, which stopped before an attempt with zero inference, and r51, whose single provider output is hash-bound but ungraded and unconsumed. One additional Coder abort is excluded because its marker has no attempt count.

None of the 30 arm or prelaunch dispositions is a valid candidate or model rejection caused primarily by model quality. Individual attempts may still contain legitimate model-quality evidence, including the 139 attempts retained by later salvage, the one completed r49 Agent-05 row, and the retained but ungraded r51 provider output. The exact machine-readable ledger is `acceptance/evidence/20260901-non-model-failure-ledger.json`.

## Root causes and permanent corrections

| Area | Root cause | Why it repeated | Correction now enforced | Release gate |
|---|---|---|---|---|
| Application | Stale pending authority, inert scope transitions, and incorrect evaluator preconditions were first discovered inside scored model runs. | The campaign did not require all application invariants to pass without a model before leasing hardware. | Pending authority is invalidated durably; UI labels are derived only from current server receipts; scope and function-panel invariants are in the model-free gate. Application-attributed failures now produce a pause receipt and never grade the model. | Pending-authority and function-panel tests must pass before a model lease. |
| Harness | The runner collapsed infrastructure, capture, operator-stop, and browser failures into ordinary failed attempt rows. Create-only output then made the whole arm appear unrecoverable. In r49, Node's numeric DOM `AbortError` code `20` erased the distinction between a downstream cancellation and a frozen planner deadline; the old pause receipt also failed to retain the full ungraded observation. | Failure attribution was implicit, transport errors were not source-normalized, paused observations were summarized rather than exported, and there was no exact recovery/continuation contract. | A typed taxonomy separates model faults from non-model faults. Capture aborts now have stable source-aware string codes. A downstream disconnect is model-attributed only when phase-matched durable application state proves `m1-planning-deadline`; otherwise it pauses fail-closed. Every post-attempt pause hash-binds the full ungraded observation. The recovery contract now requires exactly two prior windows (`original` 68, `continuation` 1), hash-binds both results, both source plans, both seals, and the canonical 120-row base plan, and composes only an exact final 51-row suffix into three disclosed execution windows. | Any unproved non-model fault pauses the campaign and cannot consume or grade an attempt. A proved frozen model deadline consumes exactly one model result. Any gap, overlap, altered identity tuple, wrong `notExecuted` suffix, seal drift, junction escape, or attempt to retain r49 Agent-06 fails closed before provider use. |
| Operator publication | Separate/manual witness and ACK helpers, stale preparation receipts, allowlist/seal predicates, file-sharing races, and a crash gap between live acceptance and audit-file publication lost valid events. | Publication was not one idempotent transaction and the watcher was not bound to an exact checkpoint before dispatch. | The watcher writes an atomic exact-scope arm receipt before preparation can succeed. The canonical helper publishes live first, writes the audit file second, and safely retries the exact same ACK. Conflicting retries fail closed. Publication is checked against its own later deadline. | Exact watcher arm, live acceptance, audit receipt, and exact ACK status must all agree. |
| Timeout | Observation, publication, native release, lease, telemetry, and batch deadlines were combined or left with about one second of scheduling margin. Some checkpoints advertised times beyond the campaign hard stop. In r51 the crash/reconcile child had a separate 10-minute watchdog even though its browser checkpoint was allowed 15 minutes; the child died while the browser was still legitimately observing it. | Timers described different operations but were treated as one deadline; dispatch did not reserve finalization time; the worker watchdog was capped independently of both the browser and campaign windows. | Discovery, 45-second observation, 55-second native hold, 60-second publication grace, dispatch stop, and application hard stop are separate. The browser checkpoint cannot advertise a deadline beyond the campaign hard stop. Observation has ten seconds of native-hold margin. The crash worker now inherits the remaining campaign window, bounded by its 60-minute construction ceiling, rather than an unrelated 10-minute cap. | Boundary tests cover 10, 30, 44, and greater-than-45-second evidence plus hard-stop reservation. A real child restart test proves a fresh watchdog window, and the runner contract proves the worker survives the full browser window. |
| Browser witness | The proxy constructed the expected cancellation statement rather than reading it from the application DOM. The watcher sampled a global accepted counter, so it could miss an event before its baseline or accept an unrelated checkpoint. | Browser truth and transport completion were conflated; identity was global instead of checkpoint-specific. | The witness control is injected into the actual application page, not an iframe. It reads exact DOM attributes emitted with the visible task and hashes task, project, experience, objective, cancellation time, and browser-visible URL together with the bounded-drain witness. The watcher polls that exact checkpoint and stays alive for all repetitions. | Unit/static coverage and the fresh real-browser model-free DOM/publication preflight are green. |
| Review publication | The first multi-window preparer did not bind complete-candidate labels or exact Qwen slices. A later decision author normalized evidence excerpts and the hardened finalizer incorrectly required all zero-fact checks to pass. | Review topology, evidence binding and semantic verdict consistency had been duplicated in one-off publication scripts instead of checked against the canonical contracts. | The v2 preparer binds exact candidates, canonical rosters, three Qwen slices, results and seals. The accepted v3 decisions use literal bound excerpts. The finalizer applies fact/verdict consistency only when expected facts exist, while still requiring evidence bindings for direct zero-fact pass/fail judgments. | Five topology attacks pass, the canonical zero-fact direct-failure regression passes, and the create-only v3 bundle validates 360 rows, 963 checks and 612 provider outputs before grading. |

## Post-repair execution findings

Four additional method defects were found after the r51 pause. Each failed closed without consuming or grading a candidate attempt:

- The model-free browser preflight initially targeted a task button while the right task panel was collapsed. The stable procedure now opens that panel first, binds the exact `#m1-task-list > button`, verifies the selected task's visible text and dataset, and only then publishes the witness. Two preflight attempts failed before model use; the corrected preflight passed with actual browser execution, on-time witness and ACK, native release inside its ceiling, zero model calls, and no production change.
- One stage rehearsal confused the package revision name `common-v11` with the runtime seal's supported schema label `/v10`. The stage stopped before inference. Package revision and seal schema are now checked as separate fields; the genuine Git archive and runtime seal remain byte-bound to source `cf2065daa7c4e47cc24a63582bea80e36065a4ca`.
- The bounded r53 launcher ran under PowerShell StrictMode and treated absent optional successful-receipt fields (`errorCode` and `cleanupError`) as property-access errors. The launcher now reads those optional properties through `PSObject.Properties`, accepts only absent or explicit null values, and rejects any non-null value. Two independent negative-case reviews reported GO before launch.
- The first Agent-06 browser ACK invocation included non-allowlisted diagnostic detail keys. The helper rejected it before writing an ACK. The exact observation-only retry was accepted and consumed; no attempt was restarted and no provider output was duplicated.

The post-campaign blind-review preparer also assumed exactly two Qwen evidence directories. R14's disclosed history has three execution windows, so that preparer could not truthfully bind the final 360-row worksheet. Its first multi-window revision still allowed complete Gemma/Coder inputs to be label-swapped and checked the Qwen windows only by counts plus their combined identity set. Independent negative testing rejected that package before semantic grading. The v2 post-run review tool binds Gemma and Coder to their exact candidate IDs and canonical 120-row order, binds Qwen to exact canonical ordinal slices 1-68, 69, and 70-120, and deeply matches audit/result schema, candidate, case bundle, execution windows, result hashes, and runtime seals. This change analyzes preserved evidence only and cannot alter model-facing inputs or campaign outputs.

## R15 model-free browser preflight RCA

### V10-V13 post-repair continuity (2026-09-02)

Three later fresh stages failed closed before Gemma inference and are retained rather than reused.
Stage `288236b61f1e4944a0a77d360f704a51` stopped during its first ACL-normalization preflight because the
test fixture inverted the executor's successful `startupObservation:null` contract. Stage
`4b57aec1ddca418dbf20c2df7ddac6da` finalized all 2,464 source files and then stopped before its first
control because a hand-written expected key order disagreed with PowerShell's actual sorted order. Stage
`08fdd8ae4cce45dd9cb2ee3e0fb17e91` completed 11 model-free controls and failed the browser-dependent
control after its 04:17-04:32 EDT URL was displayed to the steward more than three hours after expiry;
its watcher also treated 26 directory-only content notifications as mutation despite identical final
hashes, exact sets and runtime security state. These were fixture, operator-publication and watcher
classification faults, not model results; all three stages have zero Gemma attempts.

The permanent repair requires explicit live browser presence, couples the same-port relay to the exact
checkpoint lifetime, polls relay and remote-process liveness, independently cleans up both owned process
trees, inlines the mutation classifier in the externally pinned validator, and permits only exact sealed
directory `content-changed` noise when byte hashes, exact sets and security state remain unchanged.
Focused checks passed 76/76, the full tracked suite passed 1,971/2,049 with 78 intentional skips and zero
failures, and two independent re-reviews returned GO with no P0/P1 findings. The repair is committed as
`c760419885e5ba5729335f272f177ef74931b83a`. Package `20260902-campaign-r15-common-v13` was built from
that exact source, verified against 2,465 manifest entries, and has archive SHA-256
`171d3dccac2dc6ef56d81738c669de4309f6435287817c88b443b9b857953ae9`. Its propagated operator seal,
fresh 12-control stage and separate live-browser proof remain required before any Gemma request.

The first post-pin full-suite invocation reported 1,970 passes, 78 intentional skips and one failure,
but its high-volume console transport truncated the failing identity while two independent verifier
processes were also active. The campaign remained paused. After those processes completed, an isolated
failure-filtered invocation of the same tracked-only runner passed 1,971/2,049 with the same 78 skips and
zero failures. Because the first snapshot cannot support exact attribution, it is invalid release evidence,
not a model or campaign result. Release verification now runs without overlapping verifier processes and
retains failure-filtered output before seal publication; a nonzero isolated rerun would stop the campaign.

Fresh V13 stage `9fa6b29e728f4d41ae15580f4f57b421` then finalized all 2,465 verified files and reached
its first live browser checkpoint. The local relay wrapper rejected the valid announcement because
PowerShell 7 `ConvertFrom-Json` automatically converted its ISO-8601 `Z` expiry string into a UTC
`System.DateTime`; the wrapper's string-only type check therefore failed before relay publication. The
stage stopped before any model lease or Gemma request. The correction accepts only UTC `DateTime`,
zero-offset `DateTimeOffset`, or a parseable `Z`-terminated string, normalizes the value to one UTC
`DateTimeOffset`, and regression-tests both PowerShell 5 and 7 conversions. The focused suite passes
31/31, the campaign harness passes 198/198, and the isolated tracked suite passes 1,972/2,050 with 78
intentional skips and zero failures. Two independent re-reviews returned GO with no P0/P1 findings.
The repair is committed as `4369bcdbf03200cb6334261a5f2820eede1e0602`; package
`20260902-campaign-r15-common-v14` was built from that exact commit and independently verified against all
2,465 source entries, with archive SHA-256
`1f3af4d849ffd17f0ff67a8f62c71239cb8978e38a9da04647a274b7822afa6a`. V13 remains retained; its
replacement operator seal and fresh stage remain required before inference.

R15 correctly kept candidate inference disabled until both shared controls and a real-browser publication
preflight passed. Five preflight rounds failed closed and were retained while the method was corrected;
all five have `modelsInvoked:false` and none consumed a campaign identity. They are not added to the 30
historical fault-invalid campaign snapshots above because they are preflight-only runs with zero model
attempts.

Fresh V14 stage `4109cda2788e4311a6f5832d41446dc5` exposed a further relay-lifecycle fault at control
10 before any Gemma request. Its neutral root loaded once, then the ordinary-session navigation and every
later request received an empty response. The local command relay caps browser connections at eight but
previously decremented that count only when the connection's SSH child exited. A browser closing or
abandoning a connection only ended the child's stdin; a stalled SSH child therefore retained its slot,
and eight such children made the relay destroy all successors. The existing relay coverage tested only
argument mapping and zero-client cleanup, so it could not reproduce actual browser connection turnover.
The checkpoint expired fail-closed; the stage is retained, no campaign result was created, and a read-only
audit confirmed zero remaining stage-owned processes.

The fix separates client-slot release from child-process settlement. A client close or error immediately
releases its one bounded slot and requests termination of the abandoned SSH child, while the child remains
in the owned set until an actual exit/error so final cleanup cannot lose it. One independent reviewer
found that the first revision could still accumulate unbounded children if kill failed or a child never
exited. The corrected relay now has a separate 16-owned-child hard cap; an unconfirmed kill or a missed
10-second exit deadline is fatal, closes the relay, requests cleanup of every owned child, and exits the
CLI nonzero for supervisor attribution. A second review found that signal shutdown could report before all
owned children settled and that a later fatal condition could be downgraded. The first shutdown correction
closed admission, made fatal state sticky, and waited for both listener closure and zero owned children. A
third review then reproduced synchronous failed-kill reentry before the shared promise assignment, which
could create two shutdown promises and timers. The final state machine publishes one deferred before any
cleanup side effect, so graceful, fatal and later callers share the same bounded terminal. Regressions fill
all eight client slots, prove immediate turnover, repeat abandonment to the child cap, force failed kill and
exit timeout, require child settlement, preserve fatal-over-signal ordering, and replay the exact real-relay
reentry. The focused relay/proxy suite passes 16/16 and the complete campaign harness passes 206/206. Both
independent re-reviews report GO with no P0/P1 findings. The restricted tracked run passed 1,975 checks,
skipped 78 and reported five permission-only failures in Windows ACL/process/probe checks; the exact two
source files pass 32/32 in their required host context, accounting for all 2,058 checks with no unresolved
failure. The repair is committed and pushed as `2431ad3ca52d8ec3a87d042c298d2c1de61339da`.
Fresh package `20260902-campaign-r15-common-v15` binds that exact source, archive
`85445369814694a15ba42bab2c5d70ea3688c02e5ec4ee14c97b74a353258911`, runtime seal
`45e2d5bd0086b0da5170596395959fd543ebbff31edee151b41e22986ea2e7da` and independently verified
2,465-entry manifest `078d41257e39a87d47bf0ac026e7f4065f76abb0a55047456b8d2a6982dc06f9`.
The propagated operator harness passes 206/206. This seal commit and a new stage remain mandatory; V14
cannot be reused or scored.

Fresh V15 stage `b230075b107b439480bfbecd64189e62` then completed 11 of 12 model-free controls and
failed only control 10 at browser preparation. The repaired relay stayed live and served the application,
but the relay-ready record published the neutral application root instead of the dedicated
`/__acceptance/session` bootstrap page. The root truthfully offered ordinary account sign-in, so the
operator followed that visible path; it cannot consume the synthetic session created for the checkpoint
and returned `candidate-request-failed`. The checkpoint expired fail-closed. Its terminal control record
contains 12 attempts, 11 completed drivers, one failed driver, `modelsInvoked:false`,
`productionChanged:false`, and `protectedDataRead:false`. This is an operator-handoff defect, not a model
attempt, and V15 remains unscored.

The rejected operator-correction draft resolves the checkpoint's sealed `requestPath`, validates that it is the exact
stage-owned `browser-<checkpoint>/request.json`, retrieves only the bound bootstrap fields over the owner
SSH profile, and never prints the one-time nonce. For a new synthetic session it publishes the dedicated
bootstrap URL, places the nonce on the local clipboard for immediate entry, marks ordinary sign-in
forbidden, and requires the clipboard to be cleared after paste. An Agent05 in-flight checkpoint instead
reuses the already prepared browser and never requests a new nonce. Executable regression coverage proves
the returned handoff contains the dedicated URL but not the secret. The first independent review rejected
an earlier version for incomplete request-hash, path, expiry and in-flight binding. The revised draft
passed its five selected browser tests, including the new negative probes, but the next independent review
found that every cleanup path called `Clear-Clipboard`, a command absent from the actual operator host in
both Windows PowerShell 5.1.26100.9168 and PowerShell 7.6.4. The full file reported 30/34 passing; its four
failures were the already-accounted restricted-host ACL/process-tree probes, not model failures. The
steward imposed and the campaign honored a hard stop on this review NO-GO. The draft must be retained only
as rejected audit history and reverted from the branch tip. A fresh stage, not a reuse of
`b230075b107b439480bfbecd64189e62`, must pass all 12 controls and the separate browser-publication proof
before any Gemma request, but no further correction, test, stage or model call is authorized in this
stopped campaign state.

| Failed preflight | Root cause | Permanent correction |
|---|---|---|
| 1 | The first capability-bearing/separate-port URL was blocked by Brave. Browser setup itself was already enabled. | Use the browser that is live-registered for the task and keep the visible URL neutral on the application origin. |
| 2 | A separate visible proxy origin was also blocked. | Use one same-origin loopback proxy on the application port and a distinct hidden SSH-forward port. |
| 3 | Swapping to that proxy after cancellation consumed the short witness window. | Start the pass-through proxy and loopback tunnel before preparation is acknowledged. |
| 4 | The proxy rewrote compressed HTML and was started after cancellation, producing invalid content and another missed window. | Force upstream `Accept-Encoding: identity`, strip stale content-encoding headers, and prestart before the timed checkpoint. |
| 5 | The prestarted proxy worked, but reloading the application reset the code-task UI to Chat; reopening the task consumed the window. | Inject an inert witness control before the capability exists, load the sealed capability lazily, and activate it without reload or origin change. |

The first corrected fresh proof then exposed a final operator-publication hazard before execution: the old
combined helper would have published the browser witness a second time. The browser now publishes the
only witness. The operator wrapper validates the browser-derived observation and publishes only the
matching acknowledgement. Independent review then found and removed one unused legacy token-in-query
compatibility path; query capabilities now fail closed and only a server-side sealed capability can
activate the neutral root page. The final fresh stage `df4cfda48eed4061927d1475e770ca16` passed all six live assertions;
the witness arrived before its 45-second observation deadline, the acknowledgement arrived before its
separate publication deadline, native release occurred inside its ceiling, no protected data was read,
and production was unchanged. This is the required green method gate before any R15 model call.

## Corrected campaign behavior

1. Run the complete model-free harness gate.
2. Run a real-browser model-free witness/publication preflight on the freshly sealed source.
3. If either fails, do not acquire or use a model lease. Fix the method, reseal it, and repeat only the failed model-free gate.
4. During a scored campaign, classify every stop before recording it.
5. A provider/model/semantic result, including a phase-matched durable frozen model deadline, consumes its exact attempt and remains immutable.
6. An application, harness, browser, campaign/system timeout, publication, capture, telemetry, or operator-stop result writes a create-only pause receipt plus a hash-bound full ungraded observation, does not grade the model, and does not consume the attempt.
7. Recover the immutable completed prefix from create-only artifacts, bind every input by SHA-256, and build a continuation beginning at the first unconsumed attempt.
8. When source or runtime seals differ, compose windows only after a machine comparison proves the model-facing view, cases, prompts, provider settings, and evaluator contract are identical. Never claim one uninterrupted arm.
9. Resume at the exact cursor. Never restart a valid prefix merely because the harness stopped later.

R15 added one more prelaunch enforcement point to this sequence. The first Home lease-package build failed
with `lease-v2-campaign-source-drift` before upload or inference because the plan hashed CRLF-normalized
Windows checkout bytes while the lease package used LF entries from the sealed Git archive. None of the ten
pinned files had changed between the prior seal and R15, but line-ending transport made three source hashes
and all five operator hashes differ. The lease builder correctly failed closed. The permanent correction is
to extract the supplied archive, execute its canonical R15-aware builder inside that extraction, verify every
generated pin against the extracted files, bind the plan hash into the runtime seal, and reject any direct
checkout whose staged, unstaged or line-ending bytes differ from the named commit. Pre-correction launch
wrappers stay disabled until fresh gates provide replacement pins. This event contains zero attempts,
zero provider calls and zero model loads; it is a method-publication failure and does not alter the 30
historical fault-invalid campaign snapshot count.

The corrective repository gate then exposed a separate intermittent watchdog-verification defect before
reseal. Windows `Process.StartTime` and the fsynced UTC journal records have different precision and can
legitimately appear about one millisecond on either side of each other. The observer incorrectly used that
OS identity timestamp as causal ordering evidence, so a valid stopped process could fail
`m1-watchdog-started-binding` or later `m1-watchdog-result-binding`. The correction keeps the process start
timestamp parseable and exact across `started.json` and the terminal result, but proves causality only from
the durable record chain: supervisor record, helper start, started record, finish and terminal record. PID
separation, hashes, suspended creation, atomic job assignment, deadline, output and stopped-state bindings
remain unchanged. The terminal-present regression covers both timestamp directions and durable-record
reversal. It passed 12/12 three consecutive times; the complete tracked suite passed 2,007 tests with 1,929
passes, 78 intentional skips and zero failures, and independent review reported GO with no P0/P1 finding.
No provider call, model load or campaign identity was involved.

## Current R14 Qwen continuity

The stopped r41 directory contains 70 historical rows. Rows 1-68 are an immutable harness-valid completed prefix; that phrase does not independently assert that every row semantically passed. Historical rows 69-70 are non-model rows and are not qualification evidence. The first corrected continuation began with 52 identities. Its r49 window recorded `qwen36-27b-mtp--agent-05-cancel-drain--2` as completed with one provider call and one native call. The next Agent-06 journey exposed the numeric abort-classification and pause-observation retention defects described above; the old runner did not export a full attempt record, so that event is not qualification evidence and the identity remains unconsumed. The immutable harness-valid prefix is now 69 and the remaining exact continuation contains 51 identities beginning at `qwen36-27b-mtp--agent-06-crash-reconcile--2`.

The r48 preflight stopped before any attempt because the remaining Home lease window was smaller than the sealed launch requirement after correct watcher-first preparation. It made no scored model call. The r49 lease was then cleanly aborted after the harness pause, with zero residency, restored power, no production route change, and task cleanup verified. Any final composition must pass model-facing equivalence and disclose the original r41 window, the one-record r49 window, and the final corrected window; it must not claim one uninterrupted arm.

The r50 lease exposed a prelaunch operator-timing defect: manual build and launch consumed the sealed minimum launch window. It stopped before an output directory or provider call and was cleanly aborted. The bounded remote launcher corrected that method for r51. R51 then reached the exact Agent-06 identity and made one provider call, but its application child was killed by the obsolete 10-minute watchdog during the permitted 15-minute browser checkpoint. The durable r51 pause records zero completed attempts, `modelGraded:false`, `attemptConsumed:false`, the same resume identity, and the full 38-event observation. Its four errors are `m1-browser-checkpoint-unobserved`, two `m1-worker-not-connected` consequences, and the final `m1-campaign-attempt-undrained` pause. The retained provider plan is not silently graded or promoted. Both r50 and r51 ended with cleanup verified, zero owned residency, restored power, and no production-route change.

R53 resumed at `qwen36-27b-mtp--agent-06-crash-reconcile--2` and recorded all 51 remaining identities. The final window result SHA-256 is `f580c708d91fb1a73c4546d022a473ef732468452c00aa4451ea9f362768744f`. The canonical history composition emitted exactly 120 attempts with audit SHA-256 `1761e746fbabbd87a46611c03b18b8b85ede6fcf44e6bd3be59cfdb8e55e5b7e` and result SHA-256 `7449e8705bbe45807e5fe0433efca7985cb97d92da1e05a788f0b138cc951489`. It records three execution windows and does not claim one uninterrupted arm. These are complete execution records, not semantic pass claims.

The corrected candidate-blind review input contains all 360 R14 rows. Its input-manifest SHA-256 is `1ae0fef79d6d64c0dfc3f4f3dd507b2e82338b1202a42e3d51509c070ce630d0`, worksheet SHA-256 is `e31cac23fec2023a2ae319f2ba3aa0e0a20f3ac0f0f1297f399aad6a9b296afa`, and review-binding SHA-256 is `9d85efbb77fe49fb8994b6d0fa44014da26095bd1e617e489ba3d98ebf7704c8`. Candidate identities are omitted from worksheet rows. The rejected first package and rejected v2 decisions remain preserved. The create-only v3 decision bundle SHA-256 is `ad8a3f81d9ccca0e3c6dbf383695d5d9895b11f7a7f5712a1b1ab8d8da09b600`; campaign-grade SHA-256 is `97384b19efc004272ec61847149dac8754f518f5e7e5ba10b1d6c5581fcb53f8`; role-scorecards SHA-256 is `128ae39d36737ce6498dec8ee1980f80b0689892816be7c7099d94eff30d4669`. All 360 attempt grades are determinate, but Review has no qualifying route, so product qualification and the customer trial remain false.

## Completion state

The harness repair, fresh source seal, model-free controls, real-browser preflight, exact 51-attempt
continuation, three-window composition and independent semantic adjudication are complete. R14 is now a
closed evidence campaign. It must not be restarted to erase its genuine model failures. The next work
is a prospective model/prompt correction campaign for Review and the two nonqualifying Agent routes,
not another replay of R14.

## Evidence and verification

- Model-free repair command: `npm run test:m1:harness`
- Result on 2026-09-01 after the r51 worker-lifetime correction: 155 passed, 0 failed, 0 skipped.
- Result after adding the five post-campaign review-topology regressions: 160 passed, 0 failed, 0 skipped. The added attacks cover malformed window manifests, candidate-label swaps, cross-window ordinal movement with coordinated seal reassignment, and incomplete composition audits.
- The canonical independent-semantic validator passes 15/15, including explicit acceptance of evidence-bound determinate failures for semantic checks that intentionally define zero per-fact rows, rejection of contradictory zero-fact reason codes, and failed-check/failed-fact reason linkage.
- The suite now includes exact `68 + 1 + 51` composition, wrong split/order/count rejection, complete source-plan and `notExecuted` suffix validation, both prior-seal drift checks, and direct/junction output-containment regressions.
- Gate 7F result: 28 passed, 0 failed. Roadmap verification: 15 passed, 0 failed.
- The complete repository run initially reported six failures. Two were stale R13/R14 static assertions that still encoded the removed shared publication/observation deadline and are now corrected and included in this gate. The other four were sandbox permission failures: the 21-test Windows process-tree suite and 27-check probe-instrument suite both passed in an authorized non-sandboxed rerun. None was attributed to a model.
- A later default `node --test` discovery run executed untracked retained artifact copies, including an old metadata-publication stress fixture, and reported a transient sharing timeout from that non-source evidence tree. `npm test` now enumerates only Git-tracked `*.test.mjs` files, rejects duplicate/escaping/symlink inventory entries, and therefore cannot turn retained artifacts into an accidental release gate. Environment-dependent tracked tests still require their authorized writable/process environment; they are not model tests.
- The final corrected tracked-only repository run enumerated 195 source test files and completed 1,980 tests: 1,902 passed, 78 intentionally skipped, 0 failed. Its regressions prove exclusion of untracked artifacts, rejection of Git symlink mode, rejection of a parent-junction escape, rejection of Windows case-fold aliases, fail-closed child-process outcome propagation, review-package topology binding, and semantic-publication consistency.
- After the R15 archive-binding and watchdog-timestamp corrections, the complete tracked suite completed
  2,007 tests: 1,929 passed, 78 intentionally skipped and zero failed. The watchdog suite passed 12/12 in
  three consecutive runs, including a terminal-present exact-hash regression for both directions of Windows
  process-time granularity. Independent review reported GO with no P0/P1 finding.
- The frozen R14 qualification-criteria bytes remain identical to the prior sealed source (`565f9b805ef86cfd1bb003e3aeb5e4e6ed063af854dff58a0e5970df15362f5d`). Current campaign status and post-freeze test counts live in this RCA and the continuity addendum, not in that model-facing criteria file, so the exact continuation can satisfy seal equivalence.
- Independent historical audit: ledger totals above and the retained M1-S2 result/RCA documents.
- The independent post-r51 worker-lifetime code review reported GO with no P0/P1 finding. A later review of the first tracked-only runner found that its plain path inventory did not reject Git symlink mode, parent junctions, or Windows path aliases; that release blocker is corrected and covered by the regressions above. Two final independent re-reviews report GO with no P0/P1 finding. The final staged inventory contains 195 tracked test files and the full-suite totals above. The independent documentation/accounting review verified the 30-snapshot arithmetic and found one stale future-tense r49 recovery sentence; that sentence is corrected to the completed, hash-bound provenance used by r50/r51. Provider-consuming execution remains gated on committing/resealing this exact source and passing the fresh model-free real-browser preflight.
- The independent final R14 publication audit initially found that the v3 finalizer did not enforce canonical reason codes or candidate-blind rationales. The shared validator now owns those rules, the finalizer invokes it after exact fact binding, adversarial probes reject the gap, and the re-audit reports GO with no P0/P1 finding while preserving byte-identical decisions, grade and scorecard hashes.
- Final R14 scorecards: Gemma `24/23/24/24/7`, Coder `23/22/24/21/20`, and Qwen3.6 `18/22/24/21/21` across Chat/Research/Code/Agent/Review. Review has no 22/24 route. Product qualification remains false; M1-S2 and all seventeen capability families remain open.
