# Current slice: Milestone 1, function-first Runa

Roadmap revision: 2026-08-28.1
Milestone: M1
Slice ID: M1-S2
Status: M1-S2A product-foundation implementation and independent review are green. M1-S2B Omen local
folder and local-Git read-only criteria are frozen after independent GO with P0=0/P1=0; implementation,
actual-system acceptance, application release and product qualification remain open.

Product-foundation checkpoint, 2026-09-02: the single-canvas workspace now implements participant-scoped
conversation search/rename/archive/unarchive/branch/export/soft-delete, persisted low-risk appearance
settings, and an honest browser/Control/Home system-status view. Local folders, Local Git, GitHub and Web
research remain visibly unavailable rather than decorative controls. Focused and cross-gate verification
pass 12/12 and 91/91; roadmap checks pass 15/15; the owned predecessor-upgrade PostgreSQL proof passes
25/25. A restricted tracked run's four Windows ACL/process
failures all passed in one exact required-context rerun (31/31), so they are method/environment results,
not model or application failures. Independent publication review returned GO with zero P0/P1 findings.
No model call, actual Control database acceptance, Control deployment or
production routing occurred. Exact evidence and remaining gates are in
`../gate7f/function-first/M1-S2A-CONVERSATION-SETTINGS-SYSTEM-RESULTS-2026-09-02.md`.

Local-context connection freeze, 2026-09-02: `M1-S2B-OMEN-LOCAL-CONTEXT-CONNECTION-CRITERIA-2026-09-02.md`
binds the next slice to the real Omen/Control split. Omen alone owns native folder selection, DPAPI root
custody, bounded file reads and allowlisted local Git. Control PostgreSQL owns participant/project/device
authorization, lifecycle and revocation. Browser-relayed results require signed receipts. No model,
automatic indexing, write, Git mutation, remote operation or production route is included. The original
criteria were published in `3c1dc57`, after which implementation began. Only the Git layer is now paused
pending independent review and publication of the actual-startup amendment.

M1-S2B implementation checkpoint, 2026-09-02: the authority foundation and actual PostgreSQL lifecycle
are green. The prior Omen DPAPI/handle-based file proof was 14/14, but shared native/helper bytes have since
changed and that evidence is historical until one affected-scope rerun. The first actual
Git/MXC startup stopped before Git launched because Omen MXC rejects a non-empty custom environment. The
no-launcher command-line-control amendment has independent GO with P0=0/P1=0 and was published in
`44ead36`. Its corrected implementation passes 8/8 focused checks and awaits exact-byte independent review
and a source commit before one affected-scope actual retry. Independent review stopped those bytes at
P0=0/P1=7 before actual execution; all seven gaps are recorded in
`../gate7f/function-first/M1-S2B-GIT-IMPLEMENTATION-REVIEW-STOP-2026-09-02.md`. Their corrected implementation
and expanded actual-proof source passed 13 focused checks, but a second exact-byte review stopped at
P0=0/P1=8; a third review stopped the next bytes at P0=0/P1=5; and a fourth review found two remaining
watcher/proof-integrity gaps at P0=0/P1=2. The watcher now drains final queued events before returning and
the actual proof contains a mutate-and-restore arm. A fifth review found that close itself was not a drain
and that the mutation was injected too early, again P0=0/P1=2. The latest correction keeps the watcher
enabled through a bounded quiet/drain barrier and injects the byte-neutral mutation after successful child
termination. Both corrections and the amended proof pass 13 focused
checks; fresh independent review returned GO with P0=0/P1=0, and those reviewed bytes were committed as
`11fa6c1`. The affected actual Windows proof then
stopped at `confirm-and-protect-root`: pinned Windows PowerShell 5.1 lacks the helper's three-argument
`System.IO.File.Move` overload. No Git/MXC/network proof followed. The host-compatibility RCA and native
`MoveFileExW` correction are recorded in
`../gate7f/function-first/M1-S2B-ACTUAL-WINDOWS-FAILURE-RCA-2026-09-02.md`; the correction passes its six
syntax checks, 14/14 focused checks, PowerShell parser and updated release pin. Fresh independent review
returned GO with P0=0/P1=0. A source commit remains mandatory before one affected retry.
That correction was committed as `0b4e1d4`; the one affected proof stopped at the same stage. Read-only
diagnostics proved the exact embedded C# type compiled, then found the immediate cause: clean pinned
PowerShell 5.1 had not loaded the `System.Security` DPAPI assembly. Explicit assembly loading succeeds.
The `File.Move` defect was real but latent. The RCA now requires explicit assembly loading, fully qualified
DPAPI types and typed substep errors before another review/commit; no successor actual proof ran.
The first amended-correction review stopped at P0=0/P1=1 because the new PowerShell helper was accidentally
inside the embedded C# here-string. No actual proof ran. The placement is corrected; a pinned-host test now
extracts and compiles the exact embedded C# and asserts helper placement. Focused checks pass 15/15; fresh
independent review returned GO with P0=0/P1=0. A source commit remains mandatory.
No browser, HTTPS, model or production work has run.

Workspace baseline checkpoint: see
`gate7f/function-first/M1-S2-WORKSPACE-BASELINE-IMPLEMENTATION-RESULTS-2026-09-02.md` for the accepted
single-canvas implementation, deterministic verification, and the complete 10-failure RCA from its first
tracked test run. No failure was attributed to a model and the model campaign remained paused.

Implementation checkpoint, 2026-09-02: model comparison is tabled. The active slice configures Gemma as
the single primary for Chat, Research, Code, Agent and Review, preserves the previously qualified Research
checker semantics, isolates the simplified `accept`/`revise` checker to Review, and creates a
machine-enforced composite qualification record. The accepted UX hierarchy uses one primary work canvas;
Chat, Code and Research are contextual task types rather than a permanent top tab row. Agent is a governed
task state inside Code and Review is contextual to selected sources, artifacts or diffs. Deterministic implementation tests cannot qualify the model or
actual application. Any actual method failure stops the gate for RCA and correction before retry.

The application is now under a product-foundation rebaseline before final customer acceptance: complete
the shell and conversation lifecycle, real Settings and Omen/Control/Home status, authorized local-folder
and local-Git connections, Research/Code/artifact work surfaces and governed local changes, then run the
bounded actual-system journeys. No new LLM campaign is part of that work unless a qualified model contract
materially changes. See
`../gate7f/function-first/M1-S2-GEMMA-PRIMARY-APPLICATION-SLICE-2026-09-02.md`,
`../gate7f/function-first/RUNAAI-PRODUCT-FOUNDATION-AND-UX-BASELINE-2026-09-02.md` and
`../gate7f/function-first/M1-S2-DEFERRED-ADVERSARIAL-MODEL-DESIGN-2026-09-02.md`.

Focused actual-system Review result, 2026-09-02: the failed 120-attempt/browser R15 method remains retired
and is not resumed. A reduced Omen -> Control -> Home method used the eight frozen Review scenarios once
each. Gemma produced 8/8 semantically correct Review answers. After actual evidence exposed ambiguity in
the checker token `correct` and a non-semantic ordered-citation echo requirement, the application checker
was reduced to an unconditional non-null `accept`/`revise` contract: accepted output remains
application-owned; revisions retain the one-recheck limit; all citations must remain unique selected
evidence. The final actual checker run returned 8/8 valid `accept` decisions with zero nullable fields,
foreign citations, model errors, infrastructure errors or cleanup errors. Home finished with zero loaded
models and both GPUs restored to 260 W. Gemma is therefore the selected single candidate for this bounded
Review role; no Review model pool is needed. This does not qualify Agent, browser/UI, production routing,
statistical reliability or the product. Evidence and all actual-run RCAs are indexed in
`../gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-RESULTS-2026-09-02.md`. A separate static review of
the frozen evidence and contract returned `GO` with no P0/P1 commit blocker; it ran no model, browser,
mock or test campaign.

Five-function disposition, 2026-09-02: R13 remains immutable valid actual-system evidence for Gemma Chat
24/24, Research 23/24, Code 24/24 and Agent 24/24. R13 used exclusive Home leases, the required actual
application/browser checkpoints, 12/12 controls, candidate-blind semantic review and exact cleanup. The
later R15 method failures do not erase those completed results. Combined with the focused Review pass,
Gemma now has a qualifying route for all five bounded M1 model functions. No further LLM qualification
campaign is required unless a material model, inference-setting, prompt, checker-semantic or frozen-contract
change occurs. The remaining work is exact-current-application acceptance, production routing and the
customer trial, not another model campaign.

The historical halt text below is retained as evidence of the retired method, not current progress.

Campaign halt, 2026-09-02: fresh zero-model stage `b230075b107b439480bfbecd64189e62`
completed 11/12 controls and stopped when the browser reached ordinary sign-in rather than the sealed
synthetic bootstrap. It records no model invocation, production change or protected-data read. Independent
review then returned NO-GO on the proposed handoff correction because `Clear-Clipboard` is unavailable on
the actual PowerShell 5.1 and 7.6.4 host. The selected deterministic checks did not exercise that dependency.
The rejected draft is preserved by audit commit `ae69d6e416a29e6ccb73bc2ca4fc360cadd4e822` and absent
from the active tree by revert `7445d0044c549c0ca8710eb5fc8f47a2670f5270`. No further retry is
permitted until the exact host-real, zero-model dress rehearsal and independent GO specified in
`../gate7f/function-first/M1-S2-R15-CAMPAIGN-HALT-AND-COST-RCA-2026-09-02.md`. Any failure re-halts the
campaign before a model lease or new stage. Earlier updates below are retained history, not current progress.

V14 execution update, 2026-09-02: fresh stage `4109cda2788e4311a6f5832d41446dc5`
reached control 10's live browser checkpoint after finalizing all 2,465 source entries. The first neutral
page loaded, but sign-in and later requests returned `ERR_EMPTY_RESPONSE`. The eight-slot loopback relay
released a browser slot only when its per-connection SSH child exited; abandoned browser connections
could therefore leave all slots occupied by stalled children and cause every successor connection to be
destroyed. Its old tests never exercised browser-style connection turnover. The checkpoint expired,
the stage was retained, no campaign result exists, cleanup left zero stage-owned processes, and Gemma
remains at zero new scored attempts. The repair releases a closed/error client slot at once and terminates
the abandoned child while retaining cleanup ownership until exit. Independent review found that its first
revision still lacked a bound when kill failed or the child stalled; the completed revision adds a separate
16-child cap and makes failed kill or a 10-second exit miss fatal to the relay. Later review found and closed
two shutdown races: premature success/fatal downgrade before child settlement, then duplicate promise/timer
creation during synchronous failed-kill reentry. Shutdown now publishes one shared deferred before cleanup,
waits for listener closure plus zero owned children, keeps fatal status sticky and has one bounded terminal.
Focused relay/proxy tests pass 16/16 and the campaign harness passes 206/206; both independent re-reviews
report GO with no P0/P1 findings. The restricted tracked run passed 1,975 checks, skipped 78 and exposed five
permission-only Windows ACL/process/probe failures; their exact two source files pass 32/32 in the required
host context, accounting for all 2,058 checks with no unresolved failure. Repair commit
`2431ad3ca52d8ec3a87d042c298d2c1de61339da` is pushed. Fresh package
`20260902-campaign-r15-common-v15` binds that exact source, archive
`85445369814694a15ba42bab2c5d70ea3688c02e5ec4ee14c97b74a353258911`, runtime seal
`45e2d5bd0086b0da5170596395959fd543ebbff31edee151b41e22986ea2e7da` and verified 2,465-entry
manifest `078d41257e39a87d47bf0ac026e7f4065f76abb0a55047456b8d2a6982dc06f9`; the propagated harness
passes 206/206. This seal commit, a fresh 12-control stage and separate live-browser proof remain before
inference.

V12 method-gate update, 2026-09-02: fresh stage `08fdd8ae4cce45dd9cb2ee3e0fb17e91`
recorded 11 completed model-free controls and one failed browser-dependent control, with no model calls.
The browser checkpoint ran from 04:17 to 04:32 EDT, but its displayed URL was attempted around 07:46 EDT.
That stale handoff is an operator-method failure, not Edge or Gemma. The outer watcher separately rejected
26 harmless content notifications on four sealed directories while hashes, exact sets and runtime security
state remained unchanged. Independent review stopped packaging on relay-liveness/expiry supervision, a
pre-use classifier race, package/hash propagation and stale status. The repair now couples the live relay
to the exact checkpoint expiry, confirms owned process-tree shutdown, inlines the classifier in the pinned
validator and updates all living status. The final focused suite passes 76/76 and the complete tracked
suite passes 1,971/2,049 with 78 intentional skips and zero failures. Two independent re-reviews returned
GO with no P0/P1 findings. The reviewed repair is committed as
`c760419885e5ba5729335f272f177ef74931b83a`. Fresh package
`20260902-campaign-r15-common-v13` was built from that exact commit, verified against all 2,465
source-tree entries and pinned into the operators by this seal update. A fresh model-free stage, 12
controls and the separate real-browser proof remain required. V12 is retained and not reused; Gemma
has zero new scored attempts in the simplified arm.

V13 execution update, 2026-09-02: fresh stage `9fa6b29e728f4d41ae15580f4f57b421` finalized all
2,465 verified source entries, then stopped at its first browser checkpoint before relay publication or
inference. PowerShell 7 converted the valid ISO UTC expiry string into `System.DateTime`, but the
local operator required a string. The repaired parser accepts only an exact UTC/zero-offset value and is
covered by an actual PowerShell 5/7 `ConvertFrom-Json` coercion regression. Focused checks pass 31/31,
the campaign harness passes 198/198, and the isolated tracked suite passes 1,972/2,050 with 78 intentional
skips and zero failures. Two independent re-reviews returned GO with no P0/P1 findings. The repair is
committed as `4369bcdbf03200cb6334261a5f2820eede1e0602`; package
`20260902-campaign-r15-common-v14` was built and verified against all 2,465 source entries, then pinned
into the operators by this seal update. V13 is retained and not reused; a new model-free stage is required,
and Gemma remains at zero attempts.

V11 finalization-key-order update, 2026-09-02: fresh stage `4b57aec1ddca418dbf20c2df7ddac6da`
finalized all 2,464 source files, then stopped before the first control because the validator's manually
written sorted property list put `runtimeSealSha256` after the `runtimeSecurity*` fields. Its actual
`Sort-Object` output puts `runtimeSealSha256` first, so an otherwise exact receipt was rejected. No control
result or model attempt was recorded. The order is corrected and a regression now derives the actual
finalizer receipt fields and requires the validator list to match their sorted order. Focused checks pass
8/8, the campaign harness passes 197/197, and the full suite passes 1,967/2,045 with 78 intentional skips
and zero failures when its disposable payload directory is writable. Two independent reviewers returned
GO with no P0/P1 findings. The failed stage is retained and not reused; commit/reseal and a fresh stage
remain.

V10 method-gate update, 2026-09-02: fresh stage `288236b61f1e4944a0a77d360f704a51` stopped on its
first model-free normalization preflight, before controls or inference, and has zero matching processes.
The test double had inverted the actual MXC contract: successful execution returns
`startupObservation:null`; a populated observation records startup failure. The real success was therefore
rejected by the outer assertion. The corrected normalizer now requires the complete exact receipt and null
failure observation, while the regression rejects any populated failure observation. Focused checks pass
34/34, the complete model-free harness passes 196/196, and the full repository suite passes 1,966/2,044
with 78 intentional environment-dependent skips and zero failures. Two independent reviewers returned GO
with no P0/P1 findings. The stage is retained and not reused. Commit/reseal and a fresh stage remain before
Gemma.

Gemma-only eligibility update, 2026-09-02: the steward selected one fresh 120-attempt Gemma arm to
conserve compute. It contains 24 ordered attempts per M1 role and permits Nomic only for embeddings. The
simplified unconditional Review contract and completion/review publication chain pass 195/195 model-free
harness checks. Two final independent reviews returned GO with no P0/P1 blocker after adversarially
checking Windows path identity, durable publication, linked ancestors, visible-review evidence, canonical
Home completion and retained operator locks. The complete tracked suite passes 1,965/2,043 with 78
intentional environment-dependent skips and zero failures. No candidate call has occurred. Exact packaging/reseal, 12
controls and the separate real-browser proof remain before inference. A five-role Gemma pass would support
one generation/reasoning model for this bounded route, not comparative R15 completion, product
qualification, production routing or customer-trial acceptance.

V8 method-gate update, 2026-09-02: commit `bf1ec7fdc1aacd1239e6513c29943fb93f4d6342`
was sealed and stage `635e8cecd7b64b6296d9b23043b52015` completed all 12 inner model-free controls
with zero failed drivers and no model calls. The outer witness failed closed on 1,910 runtime `Changed`
notifications despite clean final byte hashes and exact file/directory sets. A bounded one-preflight
reproduction classified all 314 reproduced notifications as `Security` only; no name, size, write-time or
attribute event occurred, and idempotent host ACL preparation emitted none. MXC temporarily applies and
restores runtime access rules as part of process-container startup. The witness now suppresses only those
runtime `Security` notifications while retaining all root/source/tool security monitoring, runtime
name/write/size/attribute monitoring and read locks. It also rehashes and re-enumerates the complete runtime
and compares every file/directory owner/group/DACL before and after execution. Lasting drift still fails
closed. The focused suite passes 27/27 and the complete tracked suite passes 1,937/2,015 with 78 intentional
skips and zero failures; independent P0/P1 review returned GO. Commit/reseal, fresh controls and separate
browser-publication proof still precede the Gemma-only 120-attempt eligibility arm. No v8 candidate identity
was consumed, and the original three-model comparative R15 is not silently declared complete.

V7 method-gate update, 2026-09-02: source `188048537e4770e3ac7719bff55417bb0994c293` was
sealed and a fresh stage reached model-free browser control 10. Final independent review found a late-event
race: after a fixed delay, the validator could see one empty PowerShell event snapshot and stop draining
before an asynchronous filesystem callback arrived. The stage was failed closed, its owned services were
confirmed absent and no model/campaign identity was invoked. The correction drains through a bounded quiet
interval while watchers are enabled, disables and disposes them, drains through a second bounded quiet
interval, and repeats exact-set verification while source/runtime locks remain. The shared helper has
deterministic delayed-event and post-disposal queued-event regressions. Three sequential host runs passed
and independent final review returned GO with no P0/P1 finding. Commit/reseal, controls and browser proof
remain mandatory before the steward-directed Gemma-first 120-attempt arm. The complete tracked suite passes
1,936/2,014 with 78 intentional environment-dependent skips and zero failures; roadmap verification passes
15/15.

V6 method-gate update, 2026-09-01: a fresh sealed stage completed 12/12 model-free controls with no
model calls, then the whole-stage recursive mutation watcher failed after the post-run exact-set check had
passed. The retained failure is harness-only. The corrected operator excludes only the already-bounded
high-churn mutable roots from recursive observation, watches immutable trees separately, disables before
draining, and retains source/runtime locks plus fail-closed diagnostics. Gemma testing remains paused until
fresh controls and the separate browser-publication proof pass.

R15 containment update, 2026-09-01: independent prelaunch review found that the corrected exact-source
stage did not yet prebuild the compact native runtime and that the provisional runtime root would grant
MXC read access to the whole extracted application. Launch remained stopped before inference. The local
correction now create-once manifests the compact runtime, validates its exact archive/source/node-bound
file set, locks every entry read-only before application Node, and retains it as immutable evidence while
cleaning only disposable data/process resources. Focused checks pass 49/49, the complete suite passes
1,933/2,011 with 78 intentional skips and zero failures, the campaign harness passes 164/164, Gate 7F
passes 28/28, and roadmap verification passes 15/15. Independent re-review returned GO with no P0/P1
finding. Commit/reseal, 12 controls and the real-browser proof still precede any Gemma or other candidate
request.

R15 implementation update, 2026-09-01: the prospective model-neutral correction was frozen before
implementation in
`../gate7f/function-first/M1-S2-R15-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`. It addresses only
R14's genuine Review checker-shape, exhaustive evidence-limit/counterexample reasoning, read-only Agent
type/formula reasoning and failed-check repair-context defects. Candidates, cases, 360+12 denominator,
thresholds, authority and existing deadlines remain unchanged. R14 is not replayed, pooled or regraded.
The implementation and its two independent P0/P1 reviews are complete with no remaining finding. After the
archive-binding and watchdog-timestamp corrections, the complete tracked repository suite passes 1,929 of
2,007 tests with 78 intentional skips and zero failures; exact results
and deterministic failure disposition are in
`../gate7f/function-first/M1-S2-R15-CORRECTION-IMPLEMENTATION-RESULTS-2026-09-01.md`. Source
`2e81d94b3f362c6d8d2d04bbf6a486a091228af7` is committed, pushed and resealed. Fresh controls passed
12/12 and a real Brave model-free proof passed all witness/publication/native-release assertions after
five retained method-only failures were corrected. No candidate call was made by those preflights. The
next operation is the fresh full 360-attempt campaign and candidate-blind review, with pause-and-resume
at the first unconsumed identity for any non-model failure.

R15 prelaunch update, 2026-09-01: the first scored-stage rehearsal stopped before a Home lease, provider
call or consumed campaign identity because the create-before-load lease builder rejected eight
source/operator byte hashes. The files had not changed; the plan had hashed CRLF-normalized Windows
checkout bytes while the lease consumed LF bytes from the sealed Git archive. The campaign is paused. The
common builder correction now extracts and hashes the supplied archive, independently verifies every plan
pin against that extraction, and binds the resulting plan hash into the new seal. The related Windows
watchdog correction uses OS process time only for exact identity and durable records for event ordering;
its terminal-present regression and independent P0/P1 review are green. Fresh lease packages for all three
candidates, 12 controls and the real-browser proof must pass before the 360-attempt campaign starts.

R14 completion update, 2026-09-01: R14 is complete and immutable. The corrected method resumed Qwen
at the first unconsumed identity, recorded the remaining 51 rows, and composed an exact disclosed
68 + 1 + 51 history. All 360 attempts and 12/12 controls are complete; the candidate-blind review has
360 determinate grades, zero inconclusive grades and no critical model/product failure. Chat, Research,
Code and Agent have qualifying routes. Review does not: Gemma is 7/24, Coder 20/24 and Qwen3.6 21/24.
Product qualification and the customer trial remain false. The method RCA and exact final pins are in
`../gate7f/function-first/M1-S2-CAMPAIGN-HARNESS-RCA-AND-CONTINUITY-CORRECTION-2026-09-01.md` and
`../gate7f/function-first/M1-S2-R14-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`. The next work is a
prospectively frozen R15 correction for the genuine Review evidence-limit/structured-output defects and
the two nonqualifying Agent defects. R14 must not be replayed, selectively pooled or regraded.

R14 correction update, 2026-09-01: R13 is complete and immutable. All 360 attempts and 12/12 controls
were recorded and independently reviewed candidate-blind with 360 determinate grades. Chat, Research,
Code and Agent have qualifying routes. Review does not: Qwen3.6 is closest at 21/24 and omitted the
relevance of one stated authentication control in all three path-boundary repetitions. Exact results
are in `../gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`. R14 is frozen in
`../gate7f/function-first/M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`; it strengthens only
generic stated-control coverage in the Review answerer/checker and keeps the complete 360+12 denominator,
cases, candidates, thresholds, budgets and independent evaluator unchanged. Its focused deterministic
proof is green at 81/81. No production route or customer trial is authorized yet.

R13 correction update, 2026-08-31: the exact Agent and Review deficits from the immutable R12 review
are prospectively frozen and the model-neutral application corrections are implemented. The contract is
`../gate7f/function-first/M1-S2-R13-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-08-31.md`. It permits only
model-neutral, case-agnostic improvements to grounded Agent completion/repair evidence and strict
structured Review verification. It keeps all candidates, 40 cases, 360 model attempts, 12 controls,
role thresholds and candidate-blind grading unchanged. Deterministic verification is green at 1,919
tests with zero failures; exact implementation evidence is in
`../gate7f/function-first/M1-S2-R13-CORRECTION-IMPLEMENTATION-RESULTS-2026-08-31.md`. No R13 model
inference, role selection, production promotion or customer trial has started. The next operation is
the fresh committed R13 source archive and runtime seal followed by the complete 360+12 campaign.

R12 evaluation update, 2026-08-31: candidate-blind independent review is complete for all 360 rows,
with 963 explicit semantic checks, 350 determinate final grades, 10 retained inconclusive grades and
12/12 model-free controls. Gemma qualifies for Chat, Research and Code; Coder qualifies for Chat and
Code; Qwen3.6 qualifies for Code. No candidate qualifies for Agent or Review, so no all-five-function
route or customer trial is ready. Exact results are in
`../gate7f/function-first/M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md`. No route was selected or
promoted.

R10 evaluation update, 2026-08-30: the frozen corrected application completed all
360 model attempts, 12/12 shared controls, strict lifecycle retention and
candidate-blind independent review. Exact results are in
`../gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md`.
Gemma and Coder qualify only for Chat and Code. No candidate qualifies for
Research, Agent or Review, so no all-five-function route or customer trial is
ready. No production route was selected or promoted.

R9 and R10 are immutable evidence. R11 implemented the prospective criteria in
`../gate7f/function-first/M1-S2-R11-CORRECTIVE-CRITERIA-2026-08-30.md` correct
the exact checker-citation, Research-completeness, repair-continuation and actual
browser-witness mechanics without changing cases, candidates, thresholds or the
independent evaluator. Its first diagnostic arm then exposed a separate time-critical
operator-publication defect; its 120 rows are retained but ineligible. The frozen R12
criteria bind witness-first publication and its matching acknowledgement into one
source-pinned owner process without changing the 24-second observation interval,
25-second native hold or full 360+12 denominator. Role routing stays deterministic and application-owned; a model
cannot select itself, change authority or inherit a pass from another role.

The first remaining-13 supplemental attempt then stopped after 3/13 rows because
the owner browser witness/ack wrappers admitted only full `campaign-*`
directories, not the runner's exact `supplemental-qwen36-27b-mtp-*` directory.
That failed r33 stage remains evidence and is not pooled with immutable R12. The
prospective correction changes only that narrow directory binding; a fresh
source/archive/runtime seal, 12 controls, Home lease and Control stage precede
the next exact 13-attempt run.

The second supplemental arm then reached the Agent05 short-window checkpoint
and exposed a remaining seal-position predicate in both witness wrappers. That
r34 arm was stopped and cleaned with no qualification credit. The complete
prospective correction now binds the runtime-seal prefix at its exact position
in the Qwen supplemental name while retaining the full-campaign suffix rule;
fresh source, controls, Home, and Control ownership are still required.

Completion update, 2026-08-31: corrected r37 recorded all 13 previously
unexecuted Qwen identities with all five actual-browser observations accepted,
no runner stop, complete Control drain, and verified Home cleanup. The steward
clarified that the 13 rows should be composed with the first 107 when the gap is
timing-only. A machine audit proved identical model-facing seals and exactly
three non-model-facing seal differences; the derived result preserves both
execution windows and all 120 Qwen identities. All 360 three-candidate rows were bound into a
candidate-blind review input. Independent semantic review and frozen role scorecards are now complete.
Agent and Review have no qualifying candidate, so no production route or customer trial is authorized
by R12.

Read `PRODUCT-ROADMAP.md` first. This slice is the first milestone only; it does not replace, complete
or retire the rest of the roadmap. All 17 capability families remain tracked in `capabilities.json`.
The current Git branch continues the existing Gate 7F foundation descended from integration `f092d358`;
it preserves local documentation `0702210` and prior qualification `be094bd`. No integration merge,
production route switch or protected-data change is represented by this contract commit.

## Authorization and correction to the old sequence

On 2026-08-28 the steward directed the full roadmap to be hardened, documented, retrieved for every
next-slice decision, committed and pushed, then authorized whatever non-destructive work is needed for
this first milestone, with human involvement for actual testing rather than recurring approvals.

This supersedes the old requirement to select a model before building/testing real disposable project
functions. Build the shared functions, test them deterministically, run all three candidates through
the same functions, then select by role. Old sealed results and prior scope decisions remain historical
evidence; this dated amendment does not rewrite them.

## Immediate order and finite deliverables

1. Publish the roadmap, retrieval guard and this acceptance contract before product implementation.
   The contract commit is `333912a`. Publication initially stopped at the environment check; after the
   steward reaffirmed the existing permission, an ordinary fast-forward push succeeded on 2026-08-28.
   GitHub's `codex/gate7f-agent-foundation` tip was verified as
   `25494137b755828adaef66b72822a4b1258446d3`, including the roadmap and M1-S1 wiring. The publication
   blocker is resolved; it is not a new permission gate for the already authorized M1 work.
2. Add independently selectable model roles behind the existing provider interface. Preserve legacy
   single-model configuration and exact rollback. No model chooses its own authority or fallback.
3. Diagnose Qwen3.6's retained timeout failure and validate three-model runtime readiness; do not silently
   omit it, change the denominator or download a substitute. Root owns Home residency and verifies exact
   artifacts before running one large model at a time. This can run alongside independent local work.
4. Complete each function below through the real application architecture, starting with chat and
   context. Reuse working code. At each function: deterministic checks -> matched model task attempts ->
   actual application route/journey -> independent evidence review. Do not build another mock-only demo.
5. Wire the bounded customer UI and validate recovery/loading/role choices under the intended operating
   profile. Expose a usable test to the steward only after the automated acceptance passes.
6. Retain exact release/rollback evidence and publish the accepted scope. No winner is assumed; if a role
   fails, retain the working route, correct the specific defect and rerun affected fresh acceptance.

## Five functions and customer acceptance scenarios

Each function needs at least eight distinct, prospectively frozen scenarios, three attempts per model
where the model participates. Repetitions are reported separately from unique tasks. Model-free control
tests run once per implementation/version, not three times merely because three models exist. Development
fixtures and known failures are regressions, not unseen acceptance. Freeze the final scenario bundle,
role-specific time/context/output budgets and versioned runtime settings before scored model responses.
This document freezes the implementation acceptance baseline, not the later scored-run corpus/runtime
seal. That separately committed seal is required before model qualification begins.

| Function | Capability IDs | Required scenarios (minimum coverage, not eight restatements of one task) |
|---|---|---|
| Chat/continuity | C01 C02 C15 C16 | new login/new chat; reopen and continue; correct current-turn topic; preserve explicit constraints; meaningful rewrite/summary; sign-out/in recovery; separate projects/users; provider/incomplete-response recovery without saving a false completed turn |
| Approved-source research | C03 C04 | retrieve relevant sections through selected adapters; exact citations; conflicting versions; honest missing evidence; unauthorized-source denial; revoked/stale source exclusion; injected instructions/fake receipt rejection; source/dependency loss without fabricated support |
| Bounded real Code | C06 C07 | inspect project; create a function; change existing function; execute passing tests; observe/fix failing tests; reject unsafe/outside-root access; detect concurrent/stale changes; restore an exact owned change and re-run verification |
| Conversational actions | C12 C15 | plan then execute/observe; read-only denial; ask-every-time approval; bounded safe-autopilot; revoke before effect; cancel/stop; restart/duplicate reconciliation; truthful pending/failed/completed/rolled-back display |
| Deeper review | C02 C06 | cross-file bug; long-document contradiction; current vs obsolete policy; planted security issue; unsupported assertion; evidence-backed explanation; malicious quoted tool result; honest insufficient-context report |

Minimum model quality remains >=90% acceptable task attempts and zero critical failures for each
reported role. Exact contract checks and mandatory product scenarios require 100%. Report a task's final
success and any repaired model mistake separately. A model that cannot run is `blocked`, not passed,
and remains on the roster with diagnostic evidence. No role can be selected without its own evidence.

## Concrete M1 execution/data boundary

- Use isolated, disposable projects with generated non-private fixtures. Real filesystem effects must
  be contained in application-created roots, reject symlink/reparse/path escapes and have exact pre/post
  hashes. No legacy repository or real household project is a test fixture.
- First code envelope: JavaScript text/project files and explicitly selected tests, actual execution
  through the reviewed local isolation boundary, finite wall-clock/memory/output/process budgets, no
  stdin/secrets/network. Preserve the existing Gate 7E primitive; no unrestricted terminal, package manager,
  Git publication, deployment, desktop automation or connector is silently enabled by M1.
- PostgreSQL owns durable task/grant/receipt/effect state; LangGraph owns resumable workflow state.
  Do not promote the synthetic in-memory snapshot adapter or introduce JSON files as another authority.
- Keep trusted application state separate from source/tool text. Recheck actor/project/task/grant,
  expiry, revocation, exact arguments and current state immediately before the effect. Receipt text in
  a file is never execution evidence. An uncertain after-effect crash requires reconciliation, not rerun.
- Research in M1 means explicitly supplied/project-authorized sources. The actual Nomic/Qdrant/windowed
  BGE path must be tested when search is required; direct explicit-source reads are not relabeled vector
  search. Live web is C04/M2, visibly remaining work rather than an unmentioned permanent limitation.
- Chat does not silently gain project executors. Owner/admin/learning/recovery controls are unchanged.
- Synthetic candidate data only; do not open private conversations or protected stores for evaluation.
  No production model-routing change until exact candidate/customer checks and rollback pass.

## Completion evidence and rollback

For each delivered function retain source commit, deterministic test results, exact scenario/model/runtime
pins, every model attempt, independent output/effect checks, application-route/browser evidence and
remaining limitations. The selected function must work without the evaluator injecting its expected
answer or bypassing the application's scope/approval path.

M1 closes only after all five functions have accepted evidence, three-model dispositions are explicit,
the user completes the bounded customer trial, and the deployed scope/recovery is reconciled. A partial
module commit is progress, not M1 completion. Keep the current release/config as predecessor; roll back
only the candidate route/owned effects, preserving later user data. A failed trial returns the affected
function to work without erasing passed historical evidence or unrelated roadmap items.

## Next implementation slice

Active work remains M1-S2, specified in
`../gate7f/function-first/M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`. The complete R10
result leaves only Chat and Code qualified and does not support a customer route.
R12 was the next finite correction under its prospectively frozen criteria. The
steward reaffirmed continuation until completion or genuinely needed human
testing. Internal module, commit and publication checkpoints are not turn-ending
gates. R12, R13 and R14 model execution and independent review are complete. R14 provides qualifying
Chat, Research, Code and Agent routes but no Review route. The prospective R15 contract and deterministic
implementation now address the measured generic Review evidence-limit/structured-output defects and the
two nonqualifying Agent defects without candidate branching, case-answer injection, threshold change,
subset retry or favorable pooling. The next gate is commit/reseal, fresh controls and real-browser proof,
then a fresh full 360+12 qualification plus candidate-blind independent review. The customer trial stays
hidden until all five M1 functions have a qualifying route. The M1-S1 result below is retained history.

M1-S1: role-separated provider contract and compatibility wiring, with current-state/receipt acceptance
requirements captured for the later project tools. This is first because all three model comparisons and
real functions need a common boundary. No three-model result, new project executor or product release is
claimed by M1-S1. Human testing is not needed until the candidate customer journey is ready.

Local implementation update, 2026-08-28: M1-S1 source wiring and deterministic verification now pass;
see `../gate7f/function-first/M1-S1-RESULTS-2026-08-28.md`. This does not close the five-function milestone.
The next-slice decision must retrieve this roadmap and record its own finite acceptance before extending
chat/context and real project functions. The Qwen3.6 readiness plan is
`../gate7f/function-first/QWEN36-READINESS-PLAN-2026-08-28.md`; it can run alongside shared function work.
Neither the old two-arm runner nor its seals may be widened in place.

Live R15 gate update: inference is still paused. Three fresh create-only stages exposed only method
defects: stale archive-count publication, transient-root exact-set admission, and a resource watchdog
whose 15-minute lifetime equaled the permitted 15-minute browser-witness wait. The first two stopped
before controls; the third completed controls 01-09, timed out at the browser witness, and invoked no
model. Functional-control resources now live 30 minutes for one 15-minute witness window; the separate
publication proof lives 45 minutes for its two sequential witness windows. Deterministic tests require
both resource windows to exceed their complete permitted waits. Commit/reseal and one fresh
controls/browser pair must pass before the Gemma-first arm begins.
