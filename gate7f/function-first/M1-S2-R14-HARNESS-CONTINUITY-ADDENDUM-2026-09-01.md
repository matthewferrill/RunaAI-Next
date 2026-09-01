# M1-S2 R14 harness continuity addendum

Date: 2026-09-01
Parent: `M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`
Status: corrected r53 continuation complete; 120-row Qwen history composition verified; 360-row candidate-blind semantic review complete; R14 product qualification false because Review has no qualifying route

This addendum changes only test-system failure handling. It does not change model prompts, model-visible cases, request controls, scoring rules, provider settings, candidate artifacts, or the R14 qualification denominator.

## Frozen invariants

- The R14 model-facing case bundle and evaluator contract remain frozen.
- A model-attributed attempt remains immutable and consumes its planned identity.
- A non-model failure never becomes a candidate failure and never consumes an attempt.
- Every non-model failure pauses the campaign before another model call.
- Every post-attempt non-model pause retains a hash-bound full ungraded observation; a summary-only pause can never be retroactively treated as qualification evidence.
- A phase-matched durable `m1-planning-deadline` is a model result. A raw disconnect without that durable proof remains a non-model pause.
- A harness-valid completed prefix is retained. That phrase does not independently assert semantic passage. Continuation begins at the exact first unconsumed identity.
- A new source/runtime seal may be combined with a prior prefix only when the existing equivalence composer observes exactly its allowlisted non-model-facing seal differences and identical model-facing views.
- The composed result discloses all execution windows and never claims one uninterrupted arm.

## R14 Qwen bound continuation

- Historical r41 rows: 70.
- Immutable harness-valid completed prefix: 68.
- Historical non-model rows excluded from qualification: attempts 69 and 70.
- Exact continuation: attempts 69 through 120, 52 identities.
- Resume identity: `qwen36-27b-mtp--agent-05-cancel-drain--2`.
- Full denominator after an equivalence-audited composition: 120 unique planned identities, no duplicates and no omissions.

The create-only recovery and continuation artifacts are retained under:

- `artifacts/m1-readiness/20260901-campaign-r14-qwen36-r41-continuation-recovery-v2`
- `artifacts/m1-readiness/20260901-campaign-r14-qwen36-r41-continuation-plan-v2`

The corrected recovery binds 70 historical records. The continuation audit retains the first 68, classifies rows 69 and 70 as the exact non-model browser failures `m1-browser-checkpoint-unobserved` and `m1-browser-checkpoint-aborted`, and creates exactly 52 remaining identities. Its result, plan, and audit hashes are:

- recovered result: `b1cacccba81a2c558a531a671b5c4ffed24af4b22cd0314f43cf9186dbf60604`
- continuation plan: `c27b5de8d5eb391c296a72b41bc7291eb82b5abdcf6bc6e4b0bfdd866e7ebcc7`
- continuation audit: `7bc0ff07d9abe0b7dac62754e22624cf479ac6bcfc9b7d7da7fe517d445de6d9`

## Post-r49 continuation cursor

- The r48 preflight made zero scored calls and stopped before attempt start because its remaining lease time was below the sealed launch window.
- The r49 window completed `qwen36-27b-mtp--agent-05-cancel-drain--2`; its create-only attempt artifact SHA-256 is `1dea7abd44aa5ee6b6efa1da2171c76ae5b0f2179aeb40d492dff88f62bae364` and it contains one provider call plus one native call.
- The following Agent-06 execution exposed a harness classification defect: a downstream abort was stored as numeric DOM code `20`, so the runner paused as `m1-campaign-unknown-failure` instead of correlating the durable `m1-planning-deadline`.
- The old pause receipt did not retain the full ungraded observation. That Agent-06 execution therefore cannot be promoted after the fact and remains unconsumed by the qualification record contract.
- Current immutable harness-valid prefix: 69 planned identities across r41 and r49.
- Current exact continuation: attempts 70 through 120, 51 identities.
- The continuation-history manifest is constrained to exactly two ordered prior windows: r41 `original` ordinals 1-68 and r49 `continuation` ordinal 69. It cannot accept a different split, reverse the windows, retain r49 Agent-06, or add a fourth execution window.
- Each prior window binds its result, source plan, and runtime seal by SHA-256. The canonical 120-row base plan is separately bound; every retained row must match its full attempt identity tuple and every prior result must publish the exact remaining `notExecuted` suffix.
- The prepared v2 plan repeats the history-manifest hash, base-plan hash, and both result/plan/seal triples. Final composition requires exactly 51 completed rows (ordinals 70-120), rechecks both prior seals directly against the fresh seal, and emits exactly three disclosed execution windows with `singleUninterruptedArmClaimed:false`.
- Preparation and composition outputs are create-only and reject direct or junction/reparse escapes from `acceptance-evidence`.
- Independent implementation review is GO with no P0/P1 blocker. The authoritative r49 source directory was located on the Control host at `C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-41458a2cce3141c1a0bfdd2e1da26738\acceptance-evidence\supplemental-qwen36-27b-mtp-dbb124843ae3e844-b1cacccba81a`; it contains the source plan/seal, the exact Agent-05 start/record/observation triple, and an Agent-06 start/pause pair but no Agent-06 record. Those exact bytes were recovered to `artifacts/m1-readiness/20260901-r49-authoritative-raw`, hash-verified against the source, and bound into the two-window continuation history used by r50 and r51 before attempt 70.
- Current resume identity: `qwen36-27b-mtp--agent-06-crash-reconcile--2`.
- A final equivalence-audited composition must disclose three execution windows and may claim neither a single arm nor a retest-free Agent-06 record.

## R50 and r51 pause accounting

- R50 acquired the fresh lease but the manual build/launch sequence crossed the sealed minimum launch window. It created no campaign evidence directory, started no attempt, made zero provider calls, and was aborted with cleanup and power restoration verified.
- R51 used a bounded remote build/launch and reached the exact Agent-06 repetition-2 identity. Its start receipt SHA-256 is `7c53009d23b4c5db0f4adc67aff2aecf91bc92cdc4e80be58cbaf9c2686f438e`.
- The scored crash worker was capped at 600,000 ms while an actual browser checkpoint could remain open for 900,000 ms plus publication/finalization. The worker therefore exited inside a valid checkpoint window. The browser could no longer restore the saved task; final proof and drain then reported `m1-worker-not-connected`.
- The corrected runner gives that worker the remaining campaign lifetime, bounded by the worker's 3,600,000 ms construction ceiling. This remains below the campaign hard stop and above the complete browser observation/publication window.
- R51 correctly paused fail-closed with result SHA-256 `675b2d3bf72a3ba969b7a5ff980e43bcf5d54c8e759a0ee06b2c857f5283cfbb`, pause receipt `afa1b4e47c00e76e80a6a86ec3ff390a1a3ec5cb87c070c613d816828006269c`, and full paused observation `f4697ca79b297320fb4c787af641e6bfb43151544b4e3cd5cbbffb12977f435e`.
- The paused observation contains one provider call and 38 evidence events, but publishes `modelGraded:false` and `attemptConsumed:false`. Its model output is retained for audit only; it is not qualification evidence.
- Both r50 and r51 lease exports prove abort completion, cleanup verified, power restored, zero final residency, and no production-route change.
- Model-free verification after the complete correction and review-publication hardening: complete harness 160/160; hardened 195-file tracked repository run 1,980 tests with 1,902 passed, 78 intentionally skipped, and 0 failed; Gate 7F 28/28; roadmap 15/15.

## R53 completion and review binding

- Fresh source archive SHA-256: `96a92ea655d9215156f3a1614a412b5ff60b8e8f0b9712ca6fdf47c15922e6c5`; `git get-tar-commit-id` returns `cf2065daa7c4e47cc24a63582bea80e36065a4ca`.
- Runtime seal SHA-256: `4855a990f7a36278eae546d8bfa18f04b507356300784109334a82fcd16bb42a`; frozen criteria SHA-256 remains `565f9b805ef86cfd1bb003e3aeb5e4e6ed063af854dff58a0e5970df15362f5d`.
- Fresh model-free controls SHA-256: `e1af06f321437a34a30233a26d94c97b8fe91e8dcbd69c31fbdb9ca0c1a651e2`; 12 completed, zero failed, zero model calls, and no production change.
- Fresh real-browser publication proof SHA-256: `ffd2a2a8ae33d48f1af658fedc493d329aab8214c4836e3c55a8ed719886e323`; actual browser exercised, witness and ACK on time and ordered, native release within its ceiling, zero model calls, and no production change.
- R53 resumed at the exact unconsumed Agent-06 repetition-2 identity and completed all 51 remaining rows. Final-window result SHA-256: `f580c708d91fb1a73c4546d022a473ef732468452c00aa4451ea9f362768744f`.
- Canonical three-window composition: 68 r41 + 1 r49 + 51 r53 = 120 unique Qwen identities. Audit SHA-256: `1761e746fbabbd87a46611c03b18b8b85ede6fcf44e6bd3be59cfdb8e55e5b7e`; result SHA-256: `7449e8705bbe45807e5fe0433efca7985cb97d92da1e05a788f0b138cc951489`.
- Home completion and cleanup are verified: completed lease result, cleanup verified, power restored, owned task retired, zero final residency, and unchanged production routing.
- Independent negative testing rejected the first multi-window review package before semantic grading because it allowed Gemma/Coder label swaps and Qwen cross-window row movement while preserving the combined identity set. That package is retained as invalid review evidence and is not an adjudication input.
- The corrected candidate-blind v2 360-row worksheet is bound by input-manifest SHA-256 `1ae0fef79d6d64c0dfc3f4f3dd507b2e82338b1202a42e3d51509c070ce630d0`, worksheet SHA-256 `e31cac23fec2023a2ae319f2ba3aa0e0a20f3ac0f0f1297f399aad6a9b296afa`, and review-binding SHA-256 `9d85efbb77fe49fb8994b6d0fa44014da26095bd1e617e489ba3d98ebf7704c8`.
- The v2 review preparer binds Gemma/Coder labels to their exact candidates and canonical 120-row order, binds Qwen to exact canonical slices 1-68, 69, and 70-120, and deeply matches the composition audit/result's schema, candidate, case bundle, execution windows, result hashes, and runtime seals before writing the blind worksheet.
- The expanded model-free harness, including five review-topology attack regressions, passes 160/160.
- The first corrected decision bundle was rejected because normalized excerpts were not literal substrings of their bound values and critical-policy rationales described absent prohibited behavior ambiguously. The preserved v2 decisions are not qualification evidence.
- The hardened finalizer then exposed a publication-contract defect: it treated every zero-fact semantic check as a mandatory pass, making 25 legitimate direct citation/counterexample failures impossible to encode. The accepted v3 finalizer now applies fact/verdict consistency only to checks that define expected facts and delegates reason-code and candidate-blind-rationale enforcement to the shared canonical validator. Its 15/15 suite covers explicit zero-fact failures, contradictory zero-fact reason codes and failed-check/failed-fact reason linkage. Independent re-audit is GO with no P0/P1 finding.
- Accepted independent decisions SHA-256: `ad8a3f81d9ccca0e3c6dbf383695d5d9895b11f7a7f5712a1b1ab8d8da09b600`; campaign grade SHA-256: `97384b19efc004272ec61847149dac8754f518f5e7e5ba10b1d6c5581fcb53f8`; role scorecards SHA-256: `128ae39d36737ce6498dec8ee1980f80b0689892816be7c7099d94eff30d4669`.
- All 360 rows are determinate. Chat, Research, Code and Agent each have at least one qualifying candidate. Review does not: Gemma is 7/24, Coder 20/24 and Qwen3.6 21/24. Product qualification and customer trial readiness remain false.

No model rerun is authorized or required by semantic review. Any review-tool failure pauses adjudication against these immutable outputs; it cannot consume or change a campaign attempt.

## Mandatory no-model gate

No R14 model call may restart until all of the following are true:

1. `npm run test:m1:harness` passes completely on the intended source.
2. A fresh runtime seal and Control stage bind that exact source.
3. The actual browser proves DOM-derived bounded-drain truth without a model.
4. The exact watcher is armed before preparation ACK.
5. Live witness, publication ACK, audit receipt, native release, and exact status readback complete within their separate deadlines.
6. An independent reviewer reports no critical or high-severity harness finding.
7. A synthetic regression proves numeric DOM codes cannot be silently model-attributed, source-aware downstream cancellation requires phase-matched durable deadline evidence, and every non-model post-attempt pause retains a hash-bound full observation.

Any failure returns to the failed model-free gate. It does not restart a candidate arm and it does not load a model.
