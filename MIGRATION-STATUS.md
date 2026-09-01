# RunaAI migration status

Status date: 2026-09-01. This is the living migration handoff for RunaAI-Next. Update it in the same
commit whenever a gate changes repository direction, authority, implementation status, safety
boundaries, verification state, or the next planned work.

## Required product-roadmap retrieval

Before choosing the next slice, run `node roadmap/read-next-slice.mjs` and read `PRODUCT-ROADMAP.md`
and `roadmap/CURRENT-SLICE.md`. The 2026-08-28 steward direction makes the existing five-function plan
**Milestone 1 only**, with all 17 broader capability families retained. Three primary candidates are in
scope: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B, Qwen3.6 27B MTP. Build/test real shared functions before
model-role selection; do not repeat the stack bakeoff or silently omit Qwen3.6. Existing frozen results
are unchanged. M1 is authorized, not complete; its first local wiring result is recorded below.
The steward authorized necessary non-destructive work and commit/push to RunaAI-Next without recurring
permission requests. Human involvement is reserved for genuine customer tests or human-only operations.

### Current checkpoint: R13 complete; R14 Review correction frozen and locally verified

R13 completed 360/360 planned attempts, 12/12 model-free controls, strict Home/Control cleanup and a
fresh candidate-blind review covering 611 provider outputs and all 963 semantic checks. All 360 attempt
grades are determinate and no critical model/product failure was found. Gemma qualifies for Chat, Code
and Agent; Coder qualifies for Chat, Research and Code; Qwen3.6 qualifies for Research and Code. Review
has no route. Qwen3.6 is closest at 21/24 and its only three Review failures are the same omission: it
identifies path traversal and post-resolution containment but does not explicitly explain that the
stated authentication control does not authorize the requested path. Exact pins and scores are in
`gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`.

R14 is prospectively frozen in
`gate7f/function-first/M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`. The only permitted change is
generic stated-control coverage in the Review answerer and checker; no case answer or candidate branch is
present. Focused actual-wire and semantic suites pass 81/81. R14 retains all candidates, 40 cases,
360 attempts, 12 controls, budgets, thresholds and candidate-blind review. The next operations are the
complete deterministic suite, committed source/archive/runtime seal, controls, full campaign and fresh
independent review. No production route or customer trial is authorized yet.

### Previous checkpoint: R12 independent review complete; no all-five-function route

Independent candidate-blind review is complete for all 360 R12 rows. The reviewer froze 963 explicit
semantic decisions before unblinding, recomposed the exact raw observations and retained 350 determinate
and 10 inconclusive final grades. All 12 model-free controls passed and no critical model or product
failure was identified. Exact evidence and hash bindings are in
`gate7f/function-first/M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md` and
`gate7f/function-first/acceptance/evidence/20260831-r12-independent-semantic-review/`.

Gemma qualifies for Chat 24/24, Research 22/24 and Code 24/24; Coder qualifies for Chat 24/24 and Code
24/24; Qwen3.6 qualifies for Code 24/24. No candidate qualifies for Agent or Review. Therefore the
required all-five-function route does not exist, product qualification and customer-trial readiness
remain false, and no candidate route was selected or promoted. The next finite work is a prospective
correction and fresh acceptance for the exact Agent and Review deficits; passed Chat, Research and Code
evidence remains immutable.

Qwen remaining-13 r37 used source `9ffa9d8a`, runtime seal `0afb31fa`,
12/12 fresh controls, Home lease `20260829-campaign-qwen36-r37`, and Control
stage `9c24e5bc6eed47a2a8c73e34dd7f7805`. All five actual-browser observations
were accepted, including Agent05 inside its unchanged 24-second truth window.
All 13 planned identities were recorded, none were unexecuted, the runner stop
code was null, Control drained, and Home finished with zero model residency,
restored GPU limits and unchanged production routing.

The steward clarified that these 13 rows should be composed with Qwen's first
107 when the missing rows were caused by the batch timing cutoff rather than
model-facing drift. The machine audit binds both immutable results and proves
the same Qwen artifact and controls, case bundle, evaluator, role limits, model
runtime, retrieval artifacts and native suites. Only source commit/archive and
telemetry-policy seal fields differ. The derived 120-row result preserves both
execution windows and explicitly does not claim one uninterrupted arm. The
three supplemental model failures remain failures.

Gemma 120, Qwen3 Coder 120 and equivalence-composed Qwen3.6 120 are now bound
into one candidate-blind 360-row review input. Exact hashes and the change-
control boundary are in
`gate7f/function-first/M1-S2-R12-QWEN-EQUIVALENCE-COMPOSITION-DECISION-2026-08-31.md`
and `gate7f/function-first/acceptance/evidence/20260831-r12-equivalence-composition/`.
Independent semantic review, per-role scorecards and route disposition are now complete with the
negative all-five-function result above. Product qualification, production promotion and the customer
trial remain pending.

### Previous checkpoint: Qwen remaining-13 r33 stopped

The first R12 Qwen remaining-13 supplemental run used source `9028d123`, runtime
seal `64e4614c`, 12/12 controls, Home lease
`20260829-campaign-qwen36-r33` and Control stage
`35304669bab045cd97c3df555b9f5521`. It recorded 3/13 attempts and stopped with
`m1-campaign-attempt-undrained`; ten identities were not executed. The exact
result and raw-file manifest are retained under
`gate7f/function-first/acceptance/evidence/20260831-qwen-r33-supplemental-failed/`.
This failed supplemental arm is not pooled with immutable R12 and provides no
qualification credit.

The RCA is an operator-wrapper integration defect. The runner correctly uses a
`supplemental-qwen36-27b-mtp-<runtime>-<prior>` directory, while the owner
witness and acknowledgement bindings accepted only `campaign-*`. Agent04's
ordinary acknowledgement was published through a lower-level helper; later
ordinary and combined checkpoints could not use the normal owner path. The
prospective correction admits only the exact generated Qwen supplemental shape;
other candidates, malformed lengths, child paths and traversal remain denied.
Focused wrapper/supplemental tests pass 16/16. No scored input, expectation,
threshold, model setting or immutable prior result changed.

The r33 lease expired safely. Live Home verification found zero model residency,
both GPU limits restored to 260 W, and `cleanupVerified=true`; the exact idle
scheduled task was retired while its evidence directory remained. Control has
no stage-owned process. Production routing remained unchanged and no protected
data was read. Next: commit and reseal the corrected source, rerun 12 controls,
create fresh Home/Control ownership, and rerun all 13 exact identities.

### Current checkpoint: R10 complete; prospective R11 correction frozen

On 2026-08-30 R10 completed all 360 fixed model attempts plus 12/12 byte-identical
model-free controls on source `ee1a15ae5d0c6ba18e9eaa24e623645be74a238b`,
archive `a1ff6e01a378d6b93a0329cc6d733a31469754caf2f6946dea25b66469bd40a0`
and runtime seal `ae29fe27c9ff6b937e612623e1d8f1b21d36f65d7b8edbd682bef683daf39b5d`.
Candidate-blind independent review bound 360/360 raw and ledger records, covered
520/520 provider outputs, adjudicated every semantic assertion and found no
critical model or product failure.

No whole candidate qualified. Across Chat/Research/Code/Agent/Review, Gemma
recorded 24/19/24/20/0 acceptable attempts with one inconclusive Agent row,
Coder 23/21/24/21/0, and Qwen3.6 18/21/21/20/19 with one inconclusive Agent row.
Gemma and Coder qualify only for Chat and Code under whole-application grading.
No candidate qualifies for Research, Agent or Review, so the customer trial is
not ready and no production route is selected or promoted.

Exact pins, result hashes, attribution and cleanup are in
`gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md`. The strict
completed-campaign verifier passed all three Home leases and bound each result to
its source/runtime/lease seals, complete export, before/after final observations,
owned-task retirement and stable listener inventory. Each arm ended with zero
owned model residency, both GPU limits restored to 260 W, production unchanged
and no protected-data read.

The next finite correction is prospectively frozen in
`gate7f/function-first/M1-S2-R11-CORRECTIVE-CRITERIA-2026-08-30.md`: exact accepted
checker citation echoes, generic Research/Review completeness, typed attribution,
two-request crash-bounded repair, repair-plan completeness and actual-browser-only
witnessing. Cases, candidates, thresholds and the independent evaluator remain
unchanged; R11 requires a fresh source/archive/runtime seal and full 360+12 run.
M1 and the required human customer trial remain open; M2-M5 remain required.

The frozen application is `9556ed01f9dbabe8c93eea309e482aad60bf809f`, common runtime seal
`416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`. The complete actual Control
regression passed **1,266/1,266, zero skips**; all **12/12 formal functional controls** then passed
the original raw-proof verifier, including actual browser observation. See
`gate7f/function-first/acceptance/R4B-CONTROL-REGRESSION-RESULTS-2026-08-28.md` and
`gate7f/function-first/acceptance/R4B-CONTROLS-RESULTS-2026-08-28.md`. Earlier failed/partial arms
below remain historical evidence, not retroactively passed. The replacement Coder batch has
completed 120/120 and independent review of 148 actual role-provider outputs:
73 passed, 10 failed, 37 inconclusive. Qwen3.6 completed120/120 and independent
review of147 actual outputs:79 passed,6 failed,35 inconclusive. Gemma also
completed120/120, with independent semantic review still in progress. Thus all
360 planned baseline task attempts are recorded; runner completion is not model
qualification. No winner is selected. Separate immutable Coder and Qwen reports
are under `gate7f/function-first/acceptance/evidence/campaign-20260828-r4b/`.

Gemma's independent Control cleanup at23:30:11Z found zero owned processes and
listeners and all six disposable runtime/data directories absent. No stop or
cleanup error was recorded. Home's owner independently unloaded the test models,
restored both260-W limits and removed owned campaign tasks at23:31Z. All original
abandoned arms, timing failures and per-attempt model failures remain retained.

Shared corrections are implemented separately from that frozen baseline:
exact source-byte preservation (`f2b6112`), whole-plan argument/receipt preflight
(`5a1f0c2`), native evidence JSON-schema transport (`801a8c3`) and continuing-user-
constraint instructions (`793ebc4`). These do not rewrite earlier grades.
Actual local request/service/SDK/HTTP regression is91/91, zero skips; the separate
native-runtime suite is162/162, zero skips. Synthetic model responses prove
integration only. Actual model quality and live auxiliary/source-byte validation
on the corrected application still require the fresh matched run.

The next-work authority is
`gate7f/function-first/CORRECTED-STACK-CONTINUATION-2026-08-28.md`. Complete actual
native owner/caller-drain and bounded deployment recovery, freeze the common
corrected source/runtime, run all three models without changing thresholds,
then perform rollback-protected release validation and the real customer trial.
No new permission gate is introduced. The production release and protected data
remain unchanged by this baseline/correction work.

The first R4b Coder batch is retained at 32/120, with 21 passes, two failures and
nine inconclusive attempts after independent review of all 41 model outputs. An
operator browser-preparation acknowledgement exceeded the unchanged 30-second
freshness bound before any model call in Agent05. The parent closed the lease
during Agent08's browser checkpoint; 88 Coder and 240 other-model slots remain
unexecuted. No result was pooled, retried individually, regraded or qualified.
The independent report and complete denominator manifest are under
`gate7f/function-first/acceptance/evidence/campaign-20260828-r4b/aborted-coder-first-batch/`.
Actual Control cleanup has no error; Home separately verified zero models/tasks
and restored 260 W after a retained completion-marker publication failure.

A synthetic Windows reproduction demonstrated a separate `File.Replace`
metadata publication race. The prospective operator-only writer correction is
`gate7f/function-first/readiness/CAMPAIGN-METADATA-PUBLICATION-CRITERIA.md`.
Its seven-case actual Windows suite passed on both Omen and Control. Control's
three stress repetitions completed 600 publications and 61,021 valid concurrent
reads with zero reader errors; all owned test processes exited.
The scored source, seal, cases, model settings and reader freshness limits are
unchanged. New Coder hardware lease R5 is the same candidate, not a fourth model;
the new full batch uses its own fresh stage and retains the abandoned batch.
R5 completed all 120 attempts with no unexecuted slots and no runner stop. A fresh
Control check at 21:47:11Z found zero owned processes/listeners and all six owned
temporary directories absent. Home separately completed owned cleanup at 21:50Z:
zero models/tasks and both original 260 W limits restored; root revalidated all 19
raw outcome pins. Independent grading retained every slot and exactly one definite
critical model behavior. Completion is not qualification. The Coder agent-role
failure is an explicit claim
that tests ran against corrected code contradicts the unchanged canonical file
and actual original-file test receipts. That role cannot qualify. The contained
model failure stays in the denominator; it does not authorize production changes
or alter the other candidates' matched evaluation.

Two R5 browser timing gaps remain inconclusive, not retrospectively passed.
The read-only operator handoff was shortened without altering the frozen limits;
Agent05 repetition 2 was then consumed at 21:28:16.069Z before its unchanged
21:28:19.465Z expiry. See
`gate7f/function-first/acceptance/BROWSER-OPERATOR-TIMING-2026-08-28.md`.
Independent review also found that the application's source attachment trims
trailing whitespace while the frozen citation verifier expects the supplied
bytes. The affected review checks remain inconclusive; no normalization or
regrading has been applied to hide that mismatch. Complete the matched diagnostic
comparison and correct the canonical-source contract before qualification.
The development-only exact-source correction now passes 25 input/index unit tests,
16 real disposable PostgreSQL checks, and 8 real PostgreSQL/Qdrant integration
checks with explicit embedding/reranker HTTP test doubles. Independent review of
`f2b6112` found no blocker and independently reran the 25 unit tests. Its live
auxiliary and application/citation qualification remain pending. See
`gate7f/function-first/SOURCE-BYTE-PRESERVATION-CRITERIA-2026-08-28.md`.

The separate Home operational-guard code is integrated but **not activated**. Its root local
OS/contract regression most recently passed 104/104, zero skips, after integration of
native transition and private TLS enrollment. The earlier 81/81 run and restricted
shell's CIM-access failure remain retained. This does not prove actual Home
installation, native caller quiescence, TLS admission, long-idle behavior or recovery. Those
operational checks and rollback-protected deployment remain required before the prepared human
trial. New operator/documentation commits do not change the frozen application under evaluation.
Continue under existing permission; this checkpoint is neither completion nor another approval gate.

The later operator regression passed 115/115 in its development checkout, including
direct native-settings restore ownership validation;
root independently reran the nine new enrollment/transport cases, all passing.
Root also independently reran all 23 settings/transition cases, including actual
Windows late-writer, ACL-drift, crash-recovery and direct-restore ownership checks;
all passed with zero skips.
No private enrollment or route is activated. The new Control quiescence v2 code
is integrated with 53/53 root tests and a separately retained 34/34 actual pinned
Caddy proof. Independent review reproduced and verified corrections for both
specific-path maintenance bypass and late unresolved restoration. Its receipt
is explicitly **selected Caddy traffic only**, not proof of Home-wide idle state.
The existing deployment script still needs the separately tested closed-admission
successor assembly; reloading its ordinary final route before health checks is
not acceptable. Native caller ownership, installed guard/TLS proof, long idle,
recovery, model qualification and final customer testing remain open.

### 2026-08-28 M1-S2 continuing integration

M1-S2 is in progress under the existing standing permission. Its preregistered contract is
`gate7f/function-first/M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`; current implementation evidence is
`gate7f/function-first/M1-S2-INTEGRATION-PROGRESS-2026-08-28.md`. Durable encrypted task/source work,
server-authoritative conversation context and the ordinary-user function surface are being integrated.
Actual Control sandbox/project proof passed 6/6 with disposable resources and unchanged production.
The three actual adapter readiness checks passed. All 12 model-free controls then passed together on
source `aa5deec`, runtime seal `62c9b2f5ea5d65874f7e18ed24d0a056011941b45c674a193ed04d9e3f118eee`.
The first Gemma campaign stopped after 23/120 slots: a stale edit was correctly denied and the newer
bytes preserved, but the old task still reported waiting for approval. That raw campaign and its 97
unexecuted slots remain unqualified; Home was unloaded and both power limits restored. The durable
pending-action correction is recorded in
`gate7f/function-first/acceptance/STALE-PENDING-RESULTS-2026-08-28.md`. Corrected source needs a new
common seal and all 12 controls before the fresh fixed 360-attempt, three-model campaign.
The campaign runner now retains exact archive/source/runtime pins, actual per-attempt hardware
observations, browser checkpoints, all failures and unchanged denominators. Task reopen preserves
only still-valid explicit approvals; Undo uses the original task's owned receipt. The separately
executed task/orchestrator PostgreSQL and pending-authority regression suite passed 44/44 with zero
skips. Source and private rows remain isolated. The new isolated Qdrant service passed actual
stop/restart persistence and rollback and is left registered disabled; see
`gate7f/function-first/control/qdrant/CONTROL-LIFECYCLE-RESULTS-2026-08-28.md`.
Production deployment and the real customer trial remain open; no model winner is presumed. Home's
ordinary desktop startup/JIT defaults are not a reliable qualified-model service; a separate exact-profile
admission/startup guard is being developed and must be proved before a reliable customer trial.
Do not stop or request another approval at internal commits. Do not claim M1 or the broader roadmap is
complete from these component results; preserve the historical M1-S1 result below.

### 2026-08-28 second campaign retained; readiness-capture correction

The fresh source `b0758dbae7f3db53bdee23c66ab08269f6152447` passed all 12 formal controls under
seal `c85583188c65df5d446f83fc6ba414ea32ba234d2c955ae8f923419440ef93c9`. The second Gemma arm
recorded 24/120 attempts and stopped; 96 slots remain unexecuted and no role is qualified by that arm.
The actual stale-edit and observed-repair checks passed. The real browser verified exact restoration
and showed the restored baseline's failed tests, retaining the earlier successful run as history.

The stop was a capture-harness defect, not an unauthorized restore or wrong model: opening the
application's readiness view caused legitimate embedding `GET /models` and reranker `GET /health`
requests. The POST-only capture proxy classified them as disallowed inference routes. The retained
Code08 raw SHA-256 is `2aff2c4dd8615d44da49385b8cc6c2652af25ac6704bccdf9b46d9b1e9b59d4a`;
it has no critical product failures, but its original role-check failure and stop remain unchanged.
Do not rewrite this evidence as a pass. A prospective strict health-read capture correction and fresh
common seal/controls are required before the next matched campaign. Ordinary answer-quality failures
remain independent findings and are not excused by this harness defect.

Home cleanup was independently observed: zero loaded instances, both original 260 W limits, no owned
lease tasks, unchanged existing listeners, with retained telemetry/receipts in
`gate7f/function-first/readiness/evidence/20260828-campaign-gemma-r2-outcome/README.md`.
Fresh offline R3 hardware packets retain the same limits and three-model roster; the next order is
Coder, Qwen3.6, then Gemma, still 120 attempts each. No model is loaded by packet preparation.
Continue the authorized work; no new approval is needed. Deployment and meaningful human trial remain
pending exact qualification and the separately tested operational runtime guard.
The prepared human trial is `gate7f/function-first/M1-CUSTOMER-TRIAL.md`; it is explicitly not ready
to start and is not an additional permission gate. Fill its verified deployment entry record first.

### 2026-08-28 health capture verified; fresh three-model run

The prospective correction is implemented and verified in
`gate7f/function-first/acceptance/HEALTH-CAPTURE-RESULTS-2026-08-28.md`. Actual Control application
initial load and browser reload passed with 46 permitted auxiliary health reads, zero inference calls
and zero unexpected calls. The full acceptance suite passed 125/125 against disposable PostgreSQL;
the subsequent serialized-diagnostic-budget regression passed with the 11/11 focused health suite.
The root default suite passed 1,153 tests with zero failures and 47 explicit environment-dependent
skips; this is not a claim that every native/database test ran in that default invocation.

The independent second-arm review is
`gate7f/function-first/acceptance/STOPPED-GEMMA-R2-INDEPENDENT-REVIEW-2026-08-28.md`:
24 attempts and all 33 model outputs were reviewed, with 17 passes, four failures and three
inconclusive outcomes. Its semantic uncertainties and all 336 unexecuted slots across the three-model
plan remain explicit; no model or role is qualified. No earlier result or denominator was rewritten.

Next is a fresh exact-source seal, 12 fresh formal controls and the unchanged 120 attempts each for
Coder, Qwen3.6 and Gemma. The separately owned Home operational-guard work continues in parallel.
Production routing, protected stores and the existing release are unchanged. Continue through
qualification and rollback-protected deployment until a real customer test is ready; internal commits
and successful component checks are not stopping points or new permission gates.

### 2026-08-28 third campaign retained; approval protocol correction

The fresh source `46070a0` passed a complete repeated 12-control run under common seal
`63e53f4e851113f6c35ae9aec2df306100ceadefab9e86de5c2243f505b2b467`. The first control report is
also retained: an incorrectly bound browser acknowledgement made that initial report unqualified.
Coder then recorded 23/120 attempts and stopped at Code07; no other model arm started. All 337
unexecuted slots remain in the three-model denominator. No model or role is qualified.

The model proposed only a read-only preview, so there was no original pending edit to approve after
the concurrent change. No original mutation or unexpected call occurred. The reducer incorrectly
treated the unexercised stale-denial transition as a demonstrated critical failure. Original raw flags
remain unchanged. See `gate7f/function-first/acceptance/STOPPED-CODER-R3-FINDING-2026-08-28.md`.

The prospective model-neutral planner clarification follows the criteria committed in
`gate7f/function-first/APPROVAL-PLANNING-CRITERIA-2026-08-28.md`. Planning a requested effect is not
approval or execution; the application creates and pauses its exact proposal. Actual preview-only
requests remain effect-free. Separate evaluator evidence corrections, independent review, real
database checks and a fresh common seal/full controls are required before the new matched campaign.
The planner correction's 40/40 wire/planner tests and actual 46/46 PostgreSQL regressions now pass
with zero skips; see `gate7f/function-first/APPROVAL-PLANNING-RESULTS-2026-08-28.md`. Those tests
use deterministic provider/executor fixtures and do not establish any model's compliance.
The independent R3 semantic record is
`gate7f/function-first/acceptance/STOPPED-CODER-R3-INDEPENDENT-REVIEW-2026-08-28.md`: all 23
attempts and 32 outputs reviewed, 18 pass, three fail and two inconclusive. The shared read-only
explanation gap is corrected prospectively in
`gate7f/function-first/READ-ONLY-EXPLANATION-RESULTS-2026-08-28.md`: 40 wire/planner, 48 actual
PostgreSQL and 19 UI/routing tests pass. An actual browser using the product module plus synthetic
response fixtures confirmed literal summary text and separate observed receipts; it is not a model
or signed-in customer test. Initial-snapshot explanations do not claim a new post-tool synthesis phase.
Home is unloaded with both 260 W limits restored. No production or protected-data changes were made.
The operational Home guard continues in parallel; do not stop at this internal correction or request
new permission. Continue until the qualified deployment is ready for genuine customer testing.

### 2026-08-28 R4 prospective application freeze

The approval protocol, read-only explanation and conditional-evidence corrections are now
integrated at `ec0a63d974e53ac7e19a2a6bae1c6caa40fc1a8a`. The prospective common seal and
unchanged three-model/360-attempt contract are recorded in
`gate7f/function-first/acceptance/R4-FREEZE-2026-08-28.md`. The conditional reader's actual
PostgreSQL acceptance suite passed 176/176 with zero skips; this is not model qualification.

The combined Omen real-PostgreSQL suite ran 1,259 tests: 1,254 passed, five native-start failures,
zero skips. This used the default checkout/profile-temp MXC envelope, not Control's reviewed
compact envelope; original failure output is retained. Fresh Control staging, full compact-runtime
regression and twelve qualified controls are required before the R4 model requests. No failed
invocation is relabeled green. Production remains unchanged and M1 remains in progress.

The first full compact Control regression completed: 1,241/1,259 passed, eighteen failed,
zero skips. All six actual filesystem/PostgreSQL/MXC cases passed. Seventeen other tests
detected line-ending conversion of frozen modules in the archive, and the Qdrant package
test assumed Omen's local binary path. These are retained validation/packaging failures,
not successful qualification. The narrow test-path correction passed seven local tests;
see `gate7f/function-first/control/qdrant/TEST-PORTABILITY-RESULTS-2026-08-28.md`.
Strict original-byte archive preservation and a fresh source/seal/full run are required.
No R4 model inference began; its existing source/seal and failed preflight remain preserved.

Packaging/test portability is corrected at `9556ed01f9dbabe8c93eea309e482aad60bf809f`.
All fourteen original historical pins now survive both archive line-ending modes, without
changing their seals, and the root focused suite passed 31/31 with zero skips. The fresh
common seal and unchanged qualification contract are recorded in
`gate7f/function-first/acceptance/R4B-FREEZE-2026-08-28.md`. Fresh stages and the complete
actual-runtime regression precede the new controls/model requests; no partial result
qualifies a model or closes M1.

### 2026-08-28 stopped-campaign independent semantic record

Independent review of the stopped Gemma arm covers 23/120 attempts and all 32 captured model outputs;
97 attempts remain unexecuted. The raw-hash-bound record and limitations are in
`gate7f/function-first/acceptance/STOPPED-GEMMA-INDEPENDENT-REVIEW-2026-08-28.md`.
It preserves every original failed/inconclusive check, identifies three task-quality failures and one
ambiguous semantic criterion, and does not qualify any role or alter the frozen campaign.
The prospective model-neutral repair continuation contract is
`gate7f/function-first/REPAIR-PHASE-CRITERIA-2026-08-28.md`; implementation and new matched acceptance
remain separate from the stopped campaign and do not increase its repair budget.
Implemented and verified locally: `gate7f/function-first/REPAIR-PHASE-RESULTS-2026-08-28.md`
records 43/43 deterministic adapter/smoke checks and 20/20 real PostgreSQL orchestration checks,
including unchanged two-plan exhaustion. These are workflow/plumbing results, not model qualification.

### 2026-08-28 M1-S1 implementation and verified publication

- The full roadmap/retrieval contract was committed as `333912a`; model-role contracts and independent
  test additions followed in `daf92c6` and `c5ea7d1`, with final wiring/results in `2549413`. All five
  commits, including the prior `0702210` documentation, are published on `codex/gate7f-agent-foundation`.
  This is not an integration merge or deployment.
- M1-S1 now wires independent chat/research/code selections into the actual answer-service composition,
  with separate v2 configuration/manifest schemas and exact startup model binding. Review/agent selections
  remain inert; no route, executor or grant is created. Legacy ordinary v1 values/digests are preserved.
- Local validation: full suite **797/797**, role contracts **12/12**, role integration **15/15**, roadmap
  **15/15**, all three prior seals intact. Independent review found no blocking issue. The tests use
  synthetic inputs and provider doubles; they do not qualify a model, live stack or production release.
- Results and limitations: `gate7f/function-first/M1-S1-RESULTS-2026-08-28.md`. Specific Qwen3.6 runtime
  diagnosis: `gate7f/function-first/QWEN36-READINESS-PLAN-2026-08-28.md`. Historical timeouts are not a
  demonstrated model-quality failure; the old reasoning directive and transport need controlled diagnosis.
- The initial environment publication block is resolved. The steward reaffirmed already-given permission;
  a fresh fetch confirmed ancestry, then the normal non-force push advanced GitHub from `be094bd` to
  `25494137b755828adaef66b72822a4b1258446d3`. `git ls-remote` independently confirmed the exact branch tip.
  No indirect route, force push or new product approval gate was used. Continue under the recorded M1
  authorization; ask only for genuinely needed human testing/presence, not repeat permission for this work.
- No Home/Control command, model load/download, service change, production routing change, protected-data
  access or source-repository edit was made for this increment. The running-release details below are
  retained prior evidence, not a fresh 2026-08-28 live-status check.
- Next: retrieve the full roadmap, finish the M1 customer-function work (starting chat/context) and run
  bounded third-model readiness in parallel. Freeze the actual functional acceptance cases/runtime before
  matched three-model runs. Do not declare M1 or any of the 17 complete from this wiring result.

## Repository identity and authority

| Repository or branch | Current role | Authority |
|---|---|---|
| Legacy `RunaAI` repository | Intact rollback system and behavior reference | Verified fallback; no longer selected-core write authority after Gate 6D close |
| `Runalab` repository | Completed stack-selection and evidence archive | Historical component evidence only; no new product implementation |
| RunaAI-Next `main` | Exact inherited RunaLab completion baseline | Stable integration target only after reviewed migration completion |
| RunaAI-Next `runa2/integration` | Accumulated accepted migration gates | Development integration; not production |
| Short-lived `runa2/*` gate branches | One approved, measured migration slice | Experimental until validated and approved |
| Control release `runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc` | Running selected-core RunaAI application and bounded JavaScript sandbox at the canonical LAN origin | Production authority for the exact selected read-only core, reviewed Chat/Code navigation, and harmless JavaScript Run envelope; later product capabilities remain separately decision-gated |

The product name is RunaAI. `RunaAI-Next`, `runa2`, and similar labels are repository and branch
identifiers during migration, not product identities.

## Verified lineage

```text
RunaLab source commit: ec5e3466f6f937c8c610bdecf62a09c2491c7137
RunaAI legacy reference at bootstrap: 71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2
RunaAI-Next baseline tag: runalab-stack-baseline-2026-08-20
RunaAI-Next origin: https://github.com/matthewferrill/RunaAI-Next.git
```

`runalab` and `runaai-legacy` are configured as fetch-only remotes in the Omen bootstrap checkout.
Their histories are reference inputs. Never merge the unrelated legacy RunaAI history into this
repository and never push migration work into either source repository.

## Current status

- Repository lineage and source remotes are established.
- GitHub branch protection is active on `main` and `runa2/integration`: pull requests and resolved
  conversations are required; stale reviews are dismissed; admins are included; force-pushes and
  deletion are blocked. Required status checks remain unset until a real CI check exists.
- `main` remains at the exact RunaLab completion baseline. `runa2/integration` contains accepted work
  through the reconciled Gate 6D production release and post-cutover hardening.
- The completed laboratory evidence, seals, probes, stack bakeoff, model findings, architecture
  assessment, and conditional estimates are inherited.
- Gate 1 contains an isolated synthetic-only implementation of the smallest ordinary read-only
  chat/research path. Its approved code-review remediation and refreshed evidence were accepted by the
  steward on 2026-08-21 and merged into `runa2/integration` as `7107ead`. It is development evidence,
  not an authority for production behavior.
- The one approved Gate 4A aggregate inventory opened only the named project/chat roots and decrypted
  chat records in memory under Matthew's Control identity. It emitted no protected value and copied,
  converted, imported, or migrated no record.
- Gate 7F-1 has downloaded only the explicitly authorized, pinned Gemma 4 26B A4B Q4_0 artifact to
  Home. Its 14,439,363,584 bytes and full SHA-256 match; no multimodal projection or other model was
  downloaded. Download evidence is `gate7f/evidence/GATE7F1-GEMMA-DOWNLOAD-2026-08-27.json`.
- Gate 6D activated the exact private Control production path for the selected core. No model was
  downloaded, no provider credential was introduced, and no external spending path was activated.
  Candidate PostgreSQL, Keycloak, OpenFGA, Node, and Caddy are retained; only private Caddy TLS is
  exposed, while the other candidate listeners remain loopback-bound.
- Gate 7A's canonical LAN origin is active at `https://runa.bridgebuildersai.com`. The Porkbun A record
  resolves to Control's private address, the ordinary WebPKI certificate is trusted from Omen, Caddy is
  the only new LAN-facing service on TCP 443, and every backend remains loopback-bound. Keycloak now
  advertises the same-origin `/auth` issuer and `runa.bridgebuildersai.com` RP ID. The session cookie is
  host-only, `Secure`, `HttpOnly`, and explicitly `SameSite=Lax`; off-LAN ingress remains disabled.
- The exact active release is `runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc`, commit
  `747aabc03b291badf4f8a16743a7bd019d384451`, and artifact digest
  `248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167`. Authority remains active,
  cutover is closed, and PostgreSQL, Keycloak, OpenFGA, the model provider, and the JavaScript sandbox
  are ready. The exact Gate 7D predecessor remains the automatic application rollback target;
  configuration, identity policy, model, legacy, and protected product data are unchanged. Ordinary
  verified users may explicitly run only the accepted harmless JavaScript envelope.
- Gate 7A is not closed. Canonical-origin owner passkey sign-in has completed and the protected
  `matthew-owner` path remains passkey-only. The steward approved a separate ordinary-user model:
  invitation-only enrollment, an individual username/password, verified-email recovery, and an
  optional passkey for ordinary chat. Public self-registration remains disabled. The local
  implementation uses a separate exact password-only Keycloak client, separate encrypted sessions,
  owner-role password denial, an exact automatically reversible application successor, and short-lived
  rollback-safe invitations. Focused Gate 7A validation is 67/67. The separate client and password route
  reconcile exactly, the owner client is unchanged, and selected-core authority/protected data remain
  unchanged. SMTP, the first ordinary invitation, password setup, ordinary sign-in, and the initial
  conversational UI are active. A second PC, a phone, off-LAN ingress, and certificate renewal remain
  separate checks.

- Gate 7B is now frozen by
  `gate7b/GATE7B-CUSTOMER-JOURNEY-SCOPE-AND-GREEN-CRITERIA-2026-08-24.md`. It replaces symptom-by-symptom
  chat repair with one login-to-logout acceptance unit covering sustained ordinary chat, safe provider
  results, retries, continuity, all internal read-only answer lanes, and truthful workspace/code limits.
  No new effect, source picker, web research, code execution, learning activation, protected-owner
  capability, or off-LAN ingress is included.
- Gate 7B's source correction now passes 393/393 repository tests and all 11 checks in the executable
  login-to-logout synthetic customer journey. The already-running Control private model passed all
  five aggregate checks for cold/warm plain chat, evidence-bearing research, evidence-bearing workspace,
  exact model identity, deterministic role routing, and citation mode. Ordinary chat no longer requires
  model-generated JSON; incomplete model results are typed, not recorded as completed turns, and receive
  a customer-safe retry path. The bounded deadline chain is 60 seconds application, 65 seconds browser
  and provider proxy, and 70 seconds public application proxy. The rollback-protected application/Caddy
  successor is active. Omen live acceptance proved ordinary password sign-in, session entry, ten sustained
  customer turns, general model conversation, honest live-lookup refusal, and continued recovery after
  the prior failures. It also exposed two presentation defects: `.mjs` was served as generic binary data,
  preventing Edge from running the page, and typed audit labels were appended to otherwise valid customer
  prose. Both are corrected in the Gate 7B exact release. The steward's exact-release recheck returned the
  correct square root of pi without an audit label and the live-weather limitation without Gate terminology.
  Gate 7B is complete.
- Gate 7C is frozen by
  `gate7c/GATE7C-UI-SHELL-SCOPE-AND-GREEN-CRITERIA-2026-08-24.md` and implemented on the isolated
  `codex/gate7c-ui-shell` review branch at `1490a9b`. The presentation-only slice restores the familiar
  RunaAI three-column workspace around the existing ordinary chat: independent empty left and right
  expansion areas, the central transcript and composer, warm Dawn styling, and no labels, feature
  wiring, persistence, or data access. Gate 7C passes 5/5 focused checks, Gate 6B
  passes 32/32, Gate 7B passes 17/17, and the full repository suite passes 398/398. Disposable
  loopback visual checks passed at wide desktop, constrained desktop, and phone widths after correcting
  mobile grid placement. The exact rollback-protected successor is now active on Control as the release
  named above; its configuration digest is unchanged, owner proof and both login routes reconciled, and
  its predecessor remains retained. Full evidence is in
  `gate7c/GATE7C-UI-SHELL-RESULTS-2026-08-24.md`. The steward accepted the proportions and visual
  direction before Gate 7D added the first rail capability.
- The steward accepted Gate 7C's overall visual direction and requested the first left-rail capability.
  Gate 7D is frozen and implemented on the dependent `codex/gate7d-chat-code-navigation` branch.
  It replaces the generic ordinary-member label with a bounded initials avatar and signed-in display
  name, and adds separate Chat and Code navigation areas. Each area has its own New action, encrypted
  participant-scoped projects, durable chat-record list, and independent in-memory selection state.
  PostgreSQL remains the only record authority; the browser gains no local catalog. Code is a distinct
  deterministic conversational role with no repository, file, terminal, execution, network, learning,
  or protected-record capability. Focused validation passes 8/8, the full repository suite passes
  406/406, `git diff --check` passes, and desktop/phone visual checks passed against a disposable
  loopback preview. Source commits are `27fa026` for frozen criteria, `7b9b3bb` for implementation,
  `3ddaee0` for source evidence, `fa1ac32` for rollback-window live validation, and `65b907b` for exact
  successor launcher binding. The corrected exact release is active on Control. Authority, protected
  data, identity, Caddy configuration, network exposure, model configuration, and legacy RunaAI remain
  unchanged. The retained Gate 7C release is the automatic application rollback target. Full evidence
  is in `gate7d/GATE7D-CHAT-CODE-NAVIGATION-RESULTS-2026-08-24.md`; the remaining Gate 7D decision is
  ordinary-user live review followed by a separate merge decision. The first live review passed fresh
  ordinary sign-in, new Chat creation, exact record reopening, switching between retained chats, and
  continued history, but blocked merge on five end-to-end defects: a generic `test` false-positive in
  project-intent routing, approved-knowledge failures retained as completed turns, standalone Code
  incorrectly requiring project knowledge, and an ordinary session capped by the short-lived access
  token despite retaining a refresh credential. A separate current-message relevance failure repeated
  the prior Italy answer for a France question. The bounded correction is frozen in
  `gate7d/GATE7D-END-TO-END-FLOW-CORRECTION-SCOPE-AND-GREEN-CRITERIA-2026-08-25.md`; the active release
  remains unmerged and no model or protected authority changed.
- The first correction successor fixed Chat routing, failed-turn retention, standalone Code routing,
  current-message instructions, and ordinary-session renewal. Live Chat then passed, while Code
  invented `64/12` context and returned `76` for the retained `14+12` follow-up. Direct private-model
  probes ruled out request replay, Caddy caching, role drift, and a consistently bad endpoint; the
  remaining defect was unverified model-output relevance and arithmetic consistency. Standalone Code
  received a bounded second-pass response review, and any correction had to verify before retention.
  That successor passed the opening and retained `14+12=26` live checks but failed twice on the next
  `15+15` request. Exact replay proved the draft was correctly `30` while the verifier promoted the
  previous `14+12` turn into current authority and proposed `26`; fail-closed re-verification prevented
  that stale correction from being retained. The verifier now receives only the current request and
  candidate answer, while conversation continuity remains with the drafting provider. Source and exact-
  Control suites pass 423/423. The exact active release at `e10e3db` accepted `15+15=30` 3/3, rejected
  stale `14+12=26` 3/3, and passed the integrated active-release history smoke 3/3. The `16adbca`
  predecessor is retained for automatic rollback. Ordinary-browser acceptance then returned
  `15+15=30`, `115+25=140`, a correct new four-parameter program, and the retained composite result
  `25` without an incomplete response or stale values. Gate 7D merged into `runa2/integration` as
  `3d95e503d6e56b61c16324eba650ef0c8161b5fa`. The merged tree exactly matched the accepted branch,
  the full post-merge suite passed 423/423, and the source branch remains retained.
- Gate 7D's first exact activation attempt failed closed because its staged launcher was still bound to
  Gate 7C while its manifest named Gate 7D. Artifact verification rejected the mismatch and the guarded
  operator automatically restored the exact Gate 7C release and readiness state. The corrected operator
  now rejects a predecessor-bound launcher before creating release or rollback paths. The second attempt
  used a newly generated successor-bound launcher, activated the exact commit and artifact, reconciled
  owner and ordinary login routes, and validated every required live HTML and controller marker before
  reporting success. No protected or private values were retained in the evidence.
- Gate 7E-0 / 7E-1 is active and accepted as a bounded extension: truthful drafted-versus-executed
  status and one harmless, authenticated, ordinary-user JavaScript Run action. The source implementation
  merged into `runa2/integration` as `f092d358a18f0ec0b6c2eaaeaf9a057b1d7f6d68`; the corrective branch
  replaced unsafe MXC drive-root propagation with a repository-owned target-only operator, preserved
  AppContainer isolation, and activated the exact release named above. Local, Control, and active-runtime
  suites pass 441/441. A real SYSTEM-context sandbox run returned exact stdout `140`, and ordinary-browser
  acceptance proved **Draft -- not run**, explicit **Run in sandbox**, **Ran in sandbox**, and exact output
  `140`. It does not add network, packages, repositories, persistent files, Git, terminal access, or
  broader Code work. Full evidence is in
  `gate7e/GATE7E-CONTROL-REPAIR-AND-ACTIVATION-RESULTS-2026-08-26.md`.
- The steward accepted Runa Agent Mode as the broader Code product direction on 2026-08-26. Runa will
  support conversational project work with selectable approval profiles, isolated workspaces,
  deterministic capability governance, truthful execution receipts, and rollback. The accepted sequence
  is to build the inert/model-independent foundation first, run the separately reviewed Gemma and
  incumbent burn-in against that realistic harness, and activate broader project effects only after a
  model role and exact capability set pass their own gates. The direction and non-authorization boundary
  are recorded in `gate7f/GATE7F-RUNA-AGENT-MODE-DIRECTION-AND-SEQUENCING-2026-08-26.md`.
- Gate 7F-0 is implemented and locally green on the isolated `codex/gate7f-agent-foundation` branch.
  The model-independent control plane covers project-scoped tasks, a closed synthetic capability
  registry, deterministic approval profiles, exact proposals, remembered allow/deny choices,
  executor-issued receipts, idempotency, restart continuity, scoped audit, and separately governed
  rollback. Focused validation passes 28/28 and the full repository suite passes 469/469 across 451
  subtests. The aggregate synthetic journey passes denial, approval, restart replay, rollback, and safe
  autopilot without a real filesystem, process, network, provider, model, protected-data, or production
  effect. It is not browser-wired or deployed. Full evidence is in
  `gate7f/GATE7F0-INERT-AGENT-FOUNDATION-RESULTS-2026-08-26.md`.
- Gate 7F-1 is preregistered and sealed before any model output. The exact first new arm is Google's
  first-party Apache-2.0 Gemma 4 26B A4B instruction-tuned QAT Q4_0 GGUF; Gemma 4 31B is an exact
  conditional quality arm, and the installed Qwen3 Coder remains the mandatory incumbent rerun. The
  deterministic corpus contains 35 cases repeated three times, with hard all-attempt gates for
  current-turn relevance, authority boundaries, and execution honesty. Focused validation passes
  11/11, the complete 105/105 offline stub denominator passes, the five-file seal passes, and the full
  repository suite passes 480/480 across 462 subtests. No model was downloaded, loaded, called, or
  selected. Full evidence is in
  `gate7f/GATE7F1-OFFLINE-PREREGISTRATION-RESULTS-2026-08-26.md`.
- On 2026-08-27 the steward explicitly authorized the pinned Gemma 4 26B A4B download and Home-only
  sealed comparison against the installed Qwen incumbent, one model at a time, with exact hashes,
  synthetic evidence, telemetry, and unload afterward. Control and production routing must remain
  unchanged. The execution plan is `gate7f/GATE7F1-HOME-EXECUTION-PLAN-2026-08-27.md`; the initial
  read-only Home preflight found no LM Studio instance loaded. The exact download is now verified.
  Home capture is complete to the sealed stop condition, not accepted as a model comparison: each arm
  retained 66 complete observations, then hit the 256-token cap on the first execution-honesty case.
  Both exact instances were unloaded, GPU memory returned to its prior baseline, all nine raw evidence
  transfer hashes match, and the original five-file seal is unchanged. The selected runtime was the
  already-installed Vulkan 2.28.2; an initial unscored CUDA-manifest mismatch was retained and corrected
  before any scored output, without changing runtime settings. Focused capture/metadata/summary tests
  pass 17/17 and the complete repository passes 497/497 across 479 subtests. Numeric/keyword grading
  defects and an incomplete model-facing nested JSON contract prevent a clean role-selection result;
  genuine model-layer authority confusion is recorded separately. Full evidence and the proposed
  decision to correct/reseal the evaluation are in
  `gate7f/GATE7F1-HOME-BURNIN-RESULTS-2026-08-27.md`. No Control or production change was made.
- The steward subsequently authorized correction/resealing and a fresh rerun of both exact artifacts
  under the same Home-only boundary. The committed v2 criteria are
  `gate7f/GATE7F1-V2-CORRECTION-PLAN-2026-08-27.md`. V2 lives alongside the unchanged v1 package,
  supplies the complete nested schema, uses explicit current-answer fields and numeric tolerance for
  bounded fact cases, flags ambiguous prose for review, and freezes equal larger output caps with
  cutoff-as-failed-observation accounting. Criteria commit `25b6c5a` precedes implementation/seal commit
  `9e1e36c`; the 21-file v2 seal was frozen before either model call. Both Home arms completed all
  105 observations with zero cutoffs and unloaded. Qwen has 75 automatic passes, 18 failures, and
  12 reviews; Gemma has 90 passes, six failures, and nine reviews. Twelve Qwen failures are correct
  answers missing the requested label, not wrong facts. Gemma proposed an unauthorized change in all
  three simulated tool-output-authority attempts; both models also have planning or supplied-state
  gaps. Neither is automatically eligible. Full validation is 512/512, v2 focused tests are 15/15,
  both seals pass, and all six raw evidence transfer hashes match. Full results and limitations are
  `gate7f/GATE7F1-V2-HOME-RERUN-RESULTS-2026-08-27.md`. The correction/reseal/rerun task is complete;
  no post-output tuning, Control change, model switch, push, merge, or production activation occurred.
- The first ordinary-user activation attempt failed closed before identity creation or application
  restart. RCA: Windows PowerShell 5.1 collapsed the empty Keycloak client response to `$null`, and
  strict mode rejected `.Count`. Normalized reconciliation then proved zero ordinary clients, zero
  ordinary flows, no generated secret, unchanged registration/username policy, and the exact prior
  application release. The operator now array-wraps empty and single-item API results before counting;
  focused and full validation remain green before retry.
- The second attempt reached the successor and preserved selected-core readiness, then failed its final
  route probe because the operator expected HTTP 302 while the tested application contract uses HTTP
  303 for browser sign-in redirects. Automatic rollback restored the exact predecessor and removed the
  attempt-created ordinary client, flow, and secret. The probe now requires 303; application behavior
  is unchanged.
- The third attempt proved the ordinary password route initialized, then failed closed because the
  successor's owner route required the completed owner proof to be bound to that exact immutable
  release. The proof correctly remained predecessor-bound, and the deployment omitted the audited
  completed-owner rebind that earlier canonical activation already required. A wrapped Windows
  PowerShell HTTP exception obscured the safe component error. Automatic rollback restored the exact
  predecessor and removed the attempt-created client, flow, and secret. The corrected deployment now
  rebinds only the completed owner proof, retains the prior proof, changes no authority or protected
  product data, is idempotent for an exact retry, and safely unwraps nested HTTP exceptions. Focused
  Gate 7A validation is 67/67 and the full suite is 370/370.
- The fourth attempt reached the successor and failed closed before owner-proof mutation because the
  successor's stricter configuration parser rejected the older predecessor configuration, which
  correctly predates the ordinary-client block. Automatic rollback restored the exact predecessor and
  removed the attempt-created client, flow, and secret. The rebind operator now validates each config
  with the parser shipped by its own immutable release while still comparing the exact shared authority,
  database, key, and canonical-origin bindings. Native Node stderr is captured without letting Windows
  PowerShell convert a safe structured error into an early terminating error.
- The first interactive Porkbun enrollment attempt failed closed with no credential retained. RCA: a
  clean Windows PowerShell 5.1 process had not loaded `System.Security`, so the DPAPI `ProtectedData`
  type was unavailable. A secret-free owner probe proved DPAPI and restricted-directory writes healthy.
  Enrollment and preflight now load the assembly explicitly before DPAPI use, and unexpected enrollment
  failures report only a safe stage-specific code.
- The remediated Control-local Porkbun enrollment passed under `RUNA-CONTROL\Matthew`; the credential is
  retained only as DPAPI CurrentUser data in the existing ACL-restricted candidate secrets root. The
  authenticated read-only preflight passed for `bridgebuildersai.com` and confirmed zero existing
  `runa` A/AAAA/CNAME records at that time. No private value was retained in evidence. The wildcard
  certificate was subsequently staged, validated, and activated without exposing its private value.
- No migration gate is approved merely by this bootstrap.
- Bootstrap documentation and clean-clone validation were reviewed and merged into
  `runa2/integration` as `94ba860`.
- Gate 0 contract/evidence freeze was approved by the steward on 2026-08-20 for integration through
  PR #2. The steward separately approved Gate 1 implementation on 2026-08-20.
- Gate 1 prerequisites are complete: exact Node 22.22.0 is installed and green, Node 22.23.2 is
  rejected by the sealed latency gate, and the low npm advisory has an explicit synthetic-slice-only
  disposition.
- Gate 1 implementation was explicitly approved and built on `runa2/gate-1-read-only-slice`. The
  remediated deterministic suite passes 24/24 and the disposable real-stack integration passes 25/25
  with clean shutdown. The full repository suite passes 38/38, 10/10 seals and all 12 pinned legacy
  suites remain green, and Qwen3 Coder passes 12/12 refreshed live synthetic acceptance runs. On 2026-08-20 the steward approved
  a Gate 1 scope amendment deferring Qwen3.6 deliberate review and the existing live BGE endpoint;
  neither is silently replaced or credited. The steward subsequently accepted the regenerated Gate 1
  evidence. Protected review then found total-deadline, concurrent-idempotency, and post-window-32
  reranker gaps. The steward approved the narrow remediation on 2026-08-21; it completed with green
  refreshed evidence on 2026-08-21, which the steward accepted the same day. The steward separately
  approved the protected merge, completed as `7107ead` on 2026-08-21. The source branch remains
  available.
- Gate 2 planning and implementation are isolated on `runa2/gate-2-read-only-continuity` from
  `7107ead`. The steward approved Gate 2A on 2026-08-21. The bounded synthetic implementation now
  passes all 34 frozen corpus cases and 21/21 disposable selected-stack integration checks with clean
  shutdown and Gate-2-only rollback. Gate 2 regression review exposed an intermittent Gate 1 Qdrant
  timeout-label race; the steward approved a narrow remediation on 2026-08-21. The refreshed Gate 1
  deterministic suite passes 26/26, Gate 1 integration passes 25/25, and full Gate 0 verification
  passes 48/48 plus 10/10 seals. Timeout and genuine dependency loss are now deterministically
  distinguished. The steward accepted Gate 2B evidence and separately approved Gate 2C on
  2026-08-21. The protected merge completed as `4c4767f`, preserving the reviewed Gate 2 commits and
  source branch. Live-model validation was not run and remains separately decision-gated.
- Gate 3 was explicitly approved and implemented on `runa2/gate-3-governed-action` from integration
  head `93cc44e`. The bounded slice has one action only: changing the synthetic verified participant's
  default intelligence level in an owned managed-project context. Its 26/26 contract suite and 16/16
  disposable PostgreSQL/LangGraph integration checks pass, including response-loss resume, direct and
  concurrent replay, atomic failure rollback, stale-revision denial, one deed/one receipt/outbox, and a
  separately governed rollback from `High` to `Medium`. The full 74/74 Node profile, 10/10 seals,
  12/12 pinned legacy suites, and Gate 1/2 integration regressions remain green. The steward accepted
  the evidence and separately approved the protected merge, completed as `0680cfb` on 2026-08-21.
  The source branch remains available; this is not production authorization.
- Gate 4A is isolated on `runa2/gate-4a-project-chat-plan` from `0680cfb`. The steward approved Gate
  4A-1 on 2026-08-21. The synthetic project/chat migration at `1f5f8be` implements the typed
  `runa_core` authority, immutable `runa_migration` ledger, application AES-256-GCM envelopes,
  external keyed reconciliation, content-free tombstones, idempotent/restart-safe imports, scoped
  reads, and Gate-4A-only rollback. All 19/19 frozen Gate 4A cases, 16/16 disposable PostgreSQL
  integration checks, and the full 93/93 Node profile pass. Gate 1, 2, and 3 disposable integration
  regressions pass 25/25, 21/21, and 16/16 respectively; Gate 0 passes with 10/10 seals and all 12
  pinned legacy suites. The aggregate-only owner inventory tool is implemented and fails closed on
  authority mismatch. RUNA-CONTROL's clean production checkout is at `b4db040`, while live GitHub
  `main` was observed at the rewritten `71ce985` history. All ten Gate 4A legacy source selections are
  content-equivalent after `utf8-lf` canonicalization; the inventory now verifies those pins, bound
  to `b4db040`, before protected roots can open. The approved owner-context execution passed on
  RUNA-CONTROL: 25 readable unassigned chats, 75 turns, zero projects or project-memory records, zero
  unreadable/relationship findings, deterministic second pass, and no disallowed output. No record
  was exported, copied, converted, imported, repaired, or migrated during inventory. The steward then
  approved Gate 4A-2, and the Control-local protected rehearsal at `04bfb7d` preserved all 25 chats and
  75 turns with identical whole-domain logical digests, one committed run, 100 ledger items, atomic
  failure rollback, idempotent restart/replay, owner-bound DPAPI key recovery, scoped-read denial, and
  no private value in retained evidence or target/log scans. The source remained byte-exact. The
  temporary target schemas, data, key, backup, runtime, listener, and root were removed. On 2026-08-21
  the steward accepted the Gate 4A-2 evidence and separately approved the Gate 4A protected merge into
  `runa2/integration`. The protected merge completed as `90572a0`, preserving the reviewed Gate 4A
  commits and source branch. Post-merge verification passed the full 93/93 Node profile, Gate 1–4
  disposable integration regressions, 10/10 seals, and all 12 pinned legacy suites. No production
  adapter or cutover is authorized.
- Gate 4B planning is isolated on `runa2/gate-4b-learning-events-plan` from accepted integration head
  `9b0d4a4`. The steward approved synthetic contract work and a protected aggregate-inventory design
  on 2026-08-21. The branch preserves the complete E6 append-only learning-event and approval-history
  chain in authenticated envelopes, enforces append-only successors and retry safety, and keeps all
  approved-knowledge projection and retrieval disabled. Its frozen corpus contains 20 synthetic
  cases. The steward approved Gate 4B-I on 2026-08-21; its fail-closed Control runner adds five
  synthetic checks for exact owner/host/commit/branch/source-pin authority, two-pass determinism, and
  reconstructed allowlisted output. The one approved Control owner inventory passed on 2026-08-21:
  90 healthy E6 entries contain 63 learning events, 10 lifecycle entries, and 63 approval decisions in
  17 batches; 53 lessons are active and 10 corrected, with zero unreadable, integrity, or lineage
  findings. One readable E3 inbox record remains unresolved; E4 has two authority records but no
  review transactions/capsules; E5 is absent; and the device vault remains owner-bound and unchanged.
  No protected value was retained and no data was copied or migrated. The steward then approved the
  E6-only Gate 4B-R rehearsal. At `4ee5e93`, the complete 90-entry journal was re-encrypted into
  disposable loopback PostgreSQL, read back in exact order, and removed. Source and target logical
  digests matched; transaction rollback, concurrent replay, changed-run refusal, restart retry,
  encrypted typed storage, and private-value scans passed. E3, E4, E5, the device vault, and every
  protected source byte remained unchanged. The temporary schemas, database, key, backup, runtime,
  listener, Control root, and Omen staging root were deleted. Focused Gate 4B tests pass 25/25 and the
  full repository suite passes 118/118. The steward accepted the evidence and approved the protected
  development merge on 2026-08-21. The merge completed as `61d364b`, preserving the reviewed commits
  and source branch. It does not authorize a retained migration, learning activation, Gate 4C, or
  production cutover.
- The steward selected projection-first Gate 4C-1 on 2026-08-21. The isolated branch
  `runa2/gate-4c-approved-knowledge-projection` reconstructs active approved knowledge only from an
  authenticated accepted Gate 4B chain, requires explicit participant/project/capability scope before
  deterministic bounded relevance, uses keyed provenance, and denies stale or lifecycle-due
  projections. Curriculum catalogs remain inactive candidate templates. Its frozen corpus passes
  28/28, the full Node suite passes 146/146, and Gate 0 plus Gate 1-4 disposable regressions are green.
  No protected data was opened; model-context activation, answer-lane wiring, persistent projection,
  Qdrant, embeddings, BGE, and production routing remain disabled. The steward accepted Gate 4C-1A
  and approved its development merge on 2026-08-21. The merge completed as `d203cc7`, preserving the
  reviewed commits and source branch.
- Gate 4C-2's explicitly authorized Control comparison reconstructed the complete E6 active boundary
  independently in legacy RunaAI and the Gate 4C projection. Both produced 53 active lessons with
  exact scope parity: 1 personal, 5 project, 16 capability, and 31 global. No protected content or
  identifier was retained, both Control repositories remained unchanged, the temporary dependency
  copy was removed, and the full Node suite passed 152/152. The steward accepted and merged the
  comparison-only development evidence into `runa2/integration` as `4ed6a52` on 2026-08-21. It did
  not activate answer lanes, persist a projection, or authorize a derived index.
- The accelerated synthetic closeout contract for Gate 4C-3A, Gate 4D, and Gate 4E was frozen from
  accepted integration head `4ed6a52` on `runa2/gate-4-closeout-synthetic`. It preserves the standing
  no-protected-data/no-network/no-persistent-service boundary and stops on any hard safety failure.
- The accelerated synthetic closeout was accepted and merged into `runa2/integration` as `2c38dd5`
  on 2026-08-21. Gate 4C-3A supplies scoped synthetic approved knowledge through
  every read-only lane as non-authoritative advisory context; Gate 4D proves the one-setting
  compatibility boundary and retires/defer-dispositions the legacy provider surface; Gate 4E records
  a current skip for a separate approved-knowledge index, with semantic remeasurement triggers. The
  full 167/167 Node suite, 10/10 seals, 12/12 pinned legacy suites, and disposable Gate 1–4 integration
  regressions are green. No protected data, model endpoint, persistent service, or production route
  was opened or changed. The reviewed source branch remains available.
- Gate 5 planning is isolated on `runa2/gate-5-operations-security` from accepted integration head
  `2c38dd5`. Its frozen synthetic train preserves Runa's household authority policy while replacing
  Windows-bound target authentication/session plumbing with Keycloak OIDC, OpenFGA enforcement,
  one-time capabilities, private Caddy transport, secret references, allowlisted telemetry, and
  authoritative PostgreSQL recovery. Protected E3/E4/device-vault access, production identity,
  non-loopback networking, retained services, and cutover remain separately blocked.
- Gate 5's synthetic implementation and local review are complete. The focused suite passes 40/40,
  the full Node suite passes 207/207, Gate 0 passes 10/10 seals and 12/12 pinned legacy suites, and
  disposable Gate 1-5 integrations are green with clean shutdown. The existing disposable Keycloak
  and OpenFGA bakeoff also passed from an isolated tool copy. No protected store, owner credential,
  production secret, non-loopback listener, retained service, or production route was opened. E3
  remains deferred; E4/device-vault ciphertext will not be copied and requires later witnessed
  re-enrolment; E5 is absent. The steward accepted Gate 5 and its protected merge completed as
  `a986419` on 2026-08-21. The source branch remains available. The merge accepts the application
  contracts and disposable evidence; it is not proof that a production target is deployed.
- Gate 6 planning is isolated on `runa2/gate-6-selected-core-cutover` from accepted integration head
  `a986419`. The steward approved proceeding under the production boundary on 2026-08-21. The frozen
  Gate 6 contract limits promotion to the three read-only lanes, project/chat/setting continuity, the
  complete E6 chain and scoped approved-knowledge projection, one governed setting action, and the
  Gate 5 security boundary. E3 remains deferred; E4 credentials are re-enrolled rather than migrated;
  E5 is absent; device-vault/DPAPI/session/private-key ciphertext is not copied; the separate approved-
  knowledge vector index and broader legacy surfaces remain Gate 7 decisions. Gate 6 begins with an
  executable fail-closed release/cutover rehearsal because the repository currently contains
  selected-core libraries and harnesses, not a production application entry point or steward UI.
- Gate 6A's executable release/readiness/cutover boundary is green locally. Its focused suite passes
  25/25; the full repository run passes 232/232; Gate 0 passes 10/10 seals and all 12 pinned legacy
  suites; and disposable Gate 1-6 integrations are green with every component stopped. The Gate 6
  PostgreSQL rehearsal survives restart and response loss, refuses mismatched live identity without
  advancing state, closes only after the frozen observation window, and proves target-session-aware
  rollback to legacy. Retained evidence is aggregate-only. A read-only Control inventory found the
  live legacy runtime clean and commit-aligned at `b4db040`. At that Gate 6A observation, the clean
  RunaAI-Next verification checkout was still at `4ed6a52` with no Gate 6, dependency tree, release
  entry point, or persistent selected-stack service. That was the hard blocker Gate 6B subsequently
  closed; no production traffic or protected data changed during the Gate 6A inventory.
- Gate 6B's exact release-composition and parallel-candidate criteria are frozen on
  `runa2/gate-6b-release-composition` from accepted integration commit `2b15ef1`. The release must
  wire `runa_core`, `runa_learning`, the selected setting/action receipts, Gate 5 security, and Gate 6
  authority into one fail-closed Node 22.22.0 entry point. It may run on Control only as an isolated
  empty shadow candidate; protected data, owner credentials, selected-write freeze, and traffic
  promotion remain Gate 6C/6D boundaries.
- Gate 6B is green and complete, including the accepted host-restart criterion. The exact running
  release is
  `runaai-next-selected-core-2026-08-21-77f3017` (`77f3017`). Control now runs candidate-owned
  PostgreSQL 18.6, Keycloak 26.7.2, OpenFGA 1.18.3, Node 22.22.0, and Caddy 2.11.4 with only the exact
  private Caddy bind exposed and every other candidate listener on loopback. The live artifact's
  29,380 files verify; all dependency, service-restart, shadow-denial, and encrypted distinct-target
  restore checks are green. The full suite passes 252/252, the focused suite 19/19, and the disposable
  Gate 6B and Gate 6 integrations pass 11/11 and 10/10. Legacy Control remains reachable, clean, and
  commit-aligned at `b4db040` on its original loopback listeners. No protected data, owner credential,
  legacy-write freeze, traffic change, or promotion occurred. Recurring protected-data backup and a
  recurring protected-data backup remains deferred until before Gate 6C import. The owner-approved
  Control reboot passed: all five candidate tasks started at boot, the exact candidate returned after
  its 29,380-file cold scan within the ten-minute allowance, and legacy returned after Matthew's login
  at the exact pre-restart commit. Pre/post schema, counts, and complete logical authority digests match
  for the application, Keycloak, and OpenFGA databases. Gate 6B is closed without importing protected
  data or changing authority.
- Gate 6C preparation was merged to accepted integration as `ff15c61`. Its frozen train binds the
  exact four selected domains, new target owner
  ceremony, recurring encrypted backup, bounded selected-write freeze, aggregate owner preflight,
  memory-only retained delta, exact reconciliation, abort cleanup, and promotion-ready handoff. The
  setting value and selected action-receipt count remain unknown until an authorized aggregate-only
  preflight. Non-protected implementation may proceed, but owner enrollment, protected-store access,
  legacy write freeze, retained import, and traffic promotion remain blocked until the coordinated
  maintenance window.
- Gate 6C's first non-protected preparation tranche is green. Its focused suite passes 27/27, the
  full Node suite 280/280, Gate 0 and all disposable Gate 1-6C integrations are green, and every
  disposable service stopped. The tranche implements exact authority contracts, the owner-ceremony
  state machine, encrypted backup/scheduled restore tooling, a fail-closed selected setting/action
  inventory, four-domain PostgreSQL staging, exact reconciliation, restart/replay, and target-only
  rollback. The exact merged release `runaai-next-gate6c-shadow-2026-08-22-ff15c61` now runs on
  Control at commit `ff15c618`, verified artifact `fff3c379`, and verified configuration `f8db543c`.
  Its browser entry point is green and stopped at `verify-recovery-authority`; selected data and target
  users remain empty. It opened no protected store and changed no legacy service, ACL, credential,
  retained protected row, traffic, or authority. Legacy has no reliable selective maintenance switch;
  the prepared safe default is a reversible whole-state write deny that preserves reads and requires a
  named maintenance-window decision before activation. The current hard boundary is the witnessed
  recovery-authority and owner passkey ceremony; synthetic evidence or an admin token cannot
  substitute for witnessed owner sign-in, step-up, revocation, and recovery.
- Gate 6C target-owner and backup readiness is now complete on Control. The exact running release is
  `runaai-next-gate6c-readiness-2026-08-22-669139e` at commit `669139e`, artifact `d8a39de1`, and
  configuration `c0980e45`. The witnessed ceremony is complete at revision 7 with two distinct
  passwordless credentials. The SYSTEM-owned recurring backup passed under that release, and
  generation `20260822T0843051927477Z` restored all three databases into distinct disposable targets
  that were then destroyed. The read-only freeze preflight passed, but no freeze is active. The live
  readiness result is deliberately `ownerCredentialEnrolled=true` and `authority=shadow`; cutover is
  still `planned` revision zero, protected data is not imported, production traffic is unchanged, and
  legacy remains clean at `b4db040`. Owner completion is not candidate promotion.
- The steward explicitly authorized the protected Gate 6C/6D maintenance window on 2026-08-22. The
  bounded operator is implemented with exact-pinned promotion-candidate deployment, read-only
  preflight, whole-state freeze, two-pass four-domain capture, retained-row and approved-knowledge
  reconciliation, promotion/rollback, fresh passkey live validation, 120-sample one-hour observation,
  and verified freeze release. Synthetic and disposable verification is green at 293/293 overall,
  24/24 Gate 6B, and 36/36 Gate 6C; this entry does not claim the live window has run.
- The first exact promotion-candidate deployment failed closed on SQLSTATE `42P01` because readiness
  queried the Gate 6C run table before the protected-import schema existed. Automatic rollback restored
  the exact prior shadow release and backup action; live confirmation retained planned revision zero,
  legacy authority, no protected import, no traffic change, and no freeze marker. The bootstrap state
  now means “not imported,” while all other database errors still fail readiness closed.
- The first authorized protected attempt failed before any cutover transition. Target rollback kept
  legacy authority; ACL restoration succeeded, but marker finalization initially failed because two
  audit properties were absent. Bounded recovery finalized the marker as `released` and confirmed zero
  deny rules, no import, no traffic change, and planned revision zero. The corrected design archives a
  released lease before a distinct retry, inserts audit fields explicitly, runs operator prerequisites
  before freeze activation, and emits a safe step-specific failure code.
- Gate 6D is complete and closed. Exact release
  `runaai-next-gate6d-promotion-2026-08-22-a886754` at `a886754` is authoritative for the selected
  core on Control. The four approved domains reconciled exactly with 102 project/chat records, 90 E6
  entries, one selected setting, zero selected action receipts, and 53 active approved-knowledge
  lessons. A fresh owner passkey session, all three representative read-only lanes, the governed
  setting change and rollback, target-session revocation, 120/120 samples over 60 minutes, 14 freeze
  checks, and final reconciliation passed. Cutover closed, the freeze was released with reason
  `gate6-closed`, and legacy remains healthy and tracked-clean at `b4db040` as the rollback system.
  Matthew's exact Caddy root is trusted only in `CurrentUser\Root`; Windows-native chain validation
  reaches the private HTTPS entry point with status 200 and no certificate bypass. Full verification
  passes 298/298 and the combined Gate 6B/6C focused suites pass 65/65. Details are in
  `gate6c/GATE6D-CUTOVER-RESULTS-2026-08-22.md`.

## Bootstrap findings

- The inherited Node suite passes **14/14** in the repository-owner context. The sandbox-only first run
  could not create `probes/results/_payloads` in the newly added checkout and reset its localhost stub;
  the exact owner-context rerun passed.
- All **10/10** current seal verifiers pass in this fresh Windows clone.
- Clean-clone validation found four seal verifiers hashing raw checkout bytes while the repository's
  existing `seal-file.mjs` helper canonicalized Git's LF/CRLF transport difference. The four verifiers
  now use that helper. No sealed preregistration, runner, result, seal hash, or adjudication changed.
- `npm ci --cache .npm-cache` installed the committed lockfile: 336 packages, one low-severity audit
  advisory, and an engine warning because installed `posthog-node@5.49.1` requests Node `^20.20.0` or
  `>=22.22.0` while Omen currently provides Node `22.21.0`. Do not run `npm audit fix` or change the
  runtime implicitly. Gate 0 must select a supported Node patch and explicitly disposition the advisory.

## Selected foundation

- Mastra plus AI SDK/OpenAI-compatible application/provider boundary;
- LangGraph JS with PostgreSQL checkpointing;
- PostgreSQL as authoritative records, idempotency, outbox, and postcondition store;
- Nomic embeddings, Qdrant derived vectors, and existing BGE with explicit overlapping windows;
- Caddy as outer transport and timeout boundary;
- OpenTelemetry with allowlisted/redacted attributes;
- deterministic application routing across the selected model roster; and
- one-time scoped capabilities for governed effects; and
- Keycloak and OpenFGA only after functional/data parity.

This list selects infrastructure. It does not replace Runa's identity, constitution, authority,
consent-first learning, typed knowledge, project/participant scope, provenance, honest uncertainty,
plain-language steward experience, or governed action pathway.

## Gate tracker

| Gate | Scope | Status | Approval required to start |
|---|---|---|---|
| Bootstrap | Establish repository lineage, remotes, branches, instructions, and status | Complete | Reviewed and merged as `94ba860` |
| 0 | Freeze contracts, parity corpus, data inventory, redaction policy, and green thresholds | Complete | Approved by steward 2026-08-20; PR #2 accepted for integration |
| 1 | Smallest disposable read-only chat/research slice | Complete; accepted and merged as `7107ead` | Complete |
| 2 | All three read-only answer lanes plus chat/project/settings continuity | Complete; evidence accepted and merged as `4c4767f` | Complete |
| 3 | One reversible governed idempotent action | Complete; accepted and merged as `0680cfb` | Complete |
| 4 | Governed data migration, one domain at a time | Complete; accepted and merged as `2c38dd5`; legacy unchanged | Complete |
| 5 | Operations, private transport, authentication/authorization, recovery | Complete; accepted and merged as `a986419` | Complete |
| 6 | Selected-core production cutover and rollback window | Complete and closed; exact selected-core release is authoritative, observation green, freeze released, legacy rollback healthy | Complete |
| 7A | Multi-device access foundation | Canonical LAN origin, owner passkey path, SMTP/invitation, separate ordinary password client, and Omen customer acceptance active | Representative clients, certificate renewal, and off-LAN boundary remain |
| 7B | Complete customer journey through the selected read-only stack | Complete; production sign-in, sustained chat, safe presentation, exact-release recheck, and rollback evidence green | Approved by steward 2026-08-24; completed 2026-08-24 |
| 7C | First user-interface shell | Complete and superseded on Control by the Gate 7D presentation release | Source integration remains part of the Gate 7D review chain |
| 7D | Identity-aware Chat/Code navigation and end-to-end flow correction | Complete; accepted and merged as `3d95e50`; current-turn verifier successor active on Control at `e10e3db`; post-merge and exact-Control suites 423/423 | Complete |
| 7E-0/1 | Truthful execution status and harmless bounded JavaScript Run | Complete; exact successor active and ordinary-browser acceptance green; local, Control, and active-runtime suites 441/441 | Complete |
| 7F | Conversational Agent Mode with selectable approval profiles | Matched qualification complete: 256 requests and one-hour endurance per model; independent blind review and provenance complete; 755/755 repository tests; neither meets a complete frozen role threshold | Gemma is the stronger development candidate; fix and requalify the bounded workflow before any model switch or effectful activation |
| M1 | First useful agent milestone; five functions, three primary model candidates | Authorized, not complete; scope and acceptance in `roadmap/CURRENT-SLICE.md` | Standing 2026-08-28 authorization; human customer test before closure |
| M2-M5 | Remaining full-product capability families | Required destination in `PRODUCT-ROADMAP.md`; not satisfied by M1 | Preserve explicit scope, governance and evidence for each capability |

## Bootstrap validation

Before closing bootstrap:

1. Confirm `main`, `runa2/integration`, and the baseline tag resolve to `ec5e346` before documentation.
2. Confirm `runalab/main` resolves to `ec5e346` and `runaai-legacy/main` resolves to `71ce985`.
3. Confirm source remotes have disabled push URLs.
4. Run the inherited 14 Node tests and all 10 current seal verifiers. **Complete: 14/14 and 10/10.**
5. Run `git diff --check` for the bootstrap documentation. **Complete before staging.**
6. Stage explicit paths, commit on `runa2/bootstrap`, and push only to RunaAI-Next origin.
7. Review the bootstrap branch before merging it into `runa2/integration`.

## Gate 0 evidence

`gate0/` freezes the proposed Gate 1 request/response contract, 18-case synthetic parity corpus,
seven exact deterministic sample outputs, legacy source/test hashes, 12-suite focused profile,
data-inventory command contract, trace allowlist, 24-hour synthetic retention, and hard green
thresholds. The Gate 0 verifier passes 14/14 inherited Node tests, 10/10 seal verifiers, and 12/12
focused legacy suites in the repository-owner context.

The full legacy portable verifier ran 128 applicable checks: 127 passed and one action-executor test
failed because the sandbox identity cannot read `C:\Users\matth\.config\git\ignore`; Git's warning
text entered an assertion that expected an empty change list. Owner DPAPI and configured-provider checks
were correctly skipped, and live approved-library provenance was explicitly not checked because no
application service was started. This is recorded as an environment limitation, not as guarded-lane
or Gate 1 parity evidence.

The Gate 1 prerequisite batch installed exact Node 22.22.0 and reran the full Gate 0 verifier green.
Node 22.23.2 was tested and rejected because its sealed stub average repeatedly measured 12.54–14.70
ms; installed Node 22.22.0 measured 0.66–0.78 ms. The repository now pins the accepted patch.

The npm result is two low dependency entries for one underlying uncontrolled-resource-consumption
advisory, `GHSA-866g-f22w-33x8` / `CVE-2026-8769`, through
`@mastra/core@1.59.0 -> @ai-sdk/provider-utils-v5@3.0.30`. GitHub lists no first patched version and
the newest published 3.x observed during disposition was 3.0.32, within the advertised affected range.
The risk is temporarily accepted only for Gate 1's disposable synthetic boundary with hard time,
byte, abort, and retry controls. It continues to block production and widened network/provider scope.
No dependency was changed during the prerequisite disposition. Full evidence is in
`gate0/GATE1-PREREQUISITES-2026-08-20.md`.

## Next operation

Active continuation is M1-S2. Its committed green criteria are
`gate7f/function-first/M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`: real conversation/context, supplied-source
research/review, disposable project execution, durable governed tasks and customer integration. Continue
under standing permission until completion or meaningful human testing; do not stop after internal commits.

The roadmap/retrieval guard and M1-S1 role wiring are implemented, tested and published through `2549413`.
Retrieve the full roadmap before the next bounded chat/context function slice, alongside the separate
Qwen3.6 readiness diagnosis. The full sequence, failure criteria, human-test boundary and remaining work
are in `roadmap/CURRENT-SLICE.md`. The publication blocker is resolved, not a reason to re-request permission.
Model identity, tool authority and durable records remain application-owned. Preserve the current
Control release and all protected data while validating the candidate. This replaces the old
two-model/qualification-before-disposable-functions next-step sequence below.

## Previous qualification closeout (2026-08-27, retained evidence)

The steward has now authorized the coordinated qualification package, reversible environment work on
Omen/Home/Control, parallel agents, documentation, commits and branch pushes, with no destructive work.
`gate7f/GATE7F-QUALIFICATION-AUTHORIZATION-AND-CRITERIA-2026-08-27.md` freezes the work boundary and
role criteria before implementation: independent fresh cases/review, shared context/structured-output
and authority corrections, matched synthetic end-to-end runs, and an initial one-hour soak per model.
Production routing and protected data remain unchanged. Human input is reserved for human-only testing.

The coordinated qualification is complete. The first `RUN-SEAL.json` arm completed
Qwen's 117 quality requests but stopped safely on a GPU boundary before integration/soak; its exact
failing sample was not retained, so heat remains the leading explanation rather than a proven exact
sample. That capture and seal are preserved. Both models completed under the identical temporary
160-W/GPU envelope in `gate7f/qualification/RUN-SEAL-POWER-V2.json`, with unchanged 85-C cutoff,
new unsafe-sample retention, exact UUID/power telemetry, cool starts, and required verified restoration to
260 W afterward; restoration was verified by the operator and a separate final Home read. No answers
were inspected to tune this environmental change. These are repeated
acceptance inputs, not a newly unseen holdout. Details are in `THERMAL-RESEAL-2026-08-27.md`.
The design and diagnostic findings are in
`gate7f/qualification/QUALIFICATION-FREEZE-2026-08-27.md`. Both models completed the 42 protocol
probes and nine corrected full-schema probes. Large decoder string limits caused a pre-generation
grammar rejection; a single-factor adapter change resolves that rejection while the unchanged
application parser retains its limits. Dropped second-system state was not reproduced in the simple
state probes. Exact task grants, effect-time policy checks and receipt-bound state now cover the
independently found synthetic authority races. These corrections are not production Agent Mode.

Both 117-request acceptance sets, eight actual synthetic application round-trip requests and 131-request
one-hour endurance arms per model are complete: 256 requests each, no provider failures or incomplete
responses, and verified unload. Both full arms passed independent source and measurement checks.
Final Home status confirms no model left loaded and original 260-W GPU settings. Control's final
runtime/health records match its initial baseline; production routing and release remain unchanged.
Independent blinded grading and adjudication of all 234 responses are retained in qualification's
`initial-judgments` and `results` directories; initial records are not overwritten. All semantic
ambiguities are resolved; an underspecified source-label comparator remains an explicit measurement
limitation with its original protocol failures intact. Only afterward was Candidate-A revealed as Gemma
and Candidate-B as Qwen. Gemma is stronger on this bounded conversational/static-code set, but neither
passes every frozen complete-role threshold. Both have three repeated critical model failures of
different kinds. No current candidate is promoted.

The final source-bound composition verifies both complete captures against the original review
snapshots, anonymous packets and final independent judgments; no semantic regrading is involved.
The evidence-backed recommendation, hardware limits, retained-source paths and read-only reproduction
command are in `gate7f/GATE7F-QUALIFICATION-RESULTS-2026-08-27.md`. Final regression validation is
755/755 tests with all original/new seals and initial judgment hashes intact.

The follow-up role clarification and ordered work are in
`gate7f/GATE7F-ROLE-DISPOSITION-AND-NEXT-STEPS-2026-08-27.md`. All four product areas had bounded
coverage, not four independent role approvals: coding was static drafting/explanation, tools were
synthetic, and research used supplied sources rather than the live web. Qwen here means Qwen3 Coder,
not the separately deferred Qwen3.6 deliberate-review model; no comparison with Qwen3.6 was performed.

The next work is a bounded workflow successor: independently selectable role/model contracts,
model-independent grant/revocation enforcement and truthful receipt presentation, exact-proposal and
calculation reliability, and a prospective source-label correction. Then qualify the changed workflow
on newly sealed independent cases before validating exact routing/residency and the customer trial.
Prioritize Gemma as an ordinary-chat candidate while retaining Qwen3 Coder as the incumbent/coding
candidate; select each role independently. Neither model is approved for a production switch or
broader autonomous work by these results. Keep the accepted production route and harmless sandbox
unchanged until the successor's applicable gates pass; broader code execution and live research remain
separate capability work, not prerequisites to completing every limited chat improvement.

The original partial v1 and complete v2 records are preserved. V2 recorded
105 observations per model with zero cutoffs; its verifier accepted them, but later review found
missing provenance bindings, now covered by 85 independent mutation/sequence checks in qualification.
Its role findings remain historical, not a substituted final model selection. Keep production routing
unchanged. Do not open the 31B arm,
alter sealed v2 grades, or infer a model switch/tool activation from this experiment. Any revised
evaluation requires a new preregistered version. The first effectful capability set, disposable-project execution,
retained-project use, and each later capability group remain separate approval gates. UI refinement, live
weather/web access, attachments, additional project functions, and off-LAN access also remain separate
decisions. The active Control release and its exact Gate 7D rollback predecessor remain unchanged by this
direction record.

Gate 6 remains closed and selected-core production authority remains active at the exact release named
above. Gate 7A follow-on checks for a second PC, phone, certificate renewal, and separately reviewed
off-LAN ingress remain independent of the Gate 7C presentation branch. E3, E4/device-vault recovery,
the separate approved-knowledge vector index, Qwen3.6 deliberate review, the existing live BGE
endpoint, and broader legacy capabilities also remain separately deferred.
