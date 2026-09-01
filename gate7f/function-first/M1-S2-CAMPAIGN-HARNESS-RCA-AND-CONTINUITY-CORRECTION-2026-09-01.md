# M1-S2 campaign harness RCA and continuity correction

Date: 2026-09-01
Status: campaign paused; strengthened model-free repair gate passed 133/133; independent P0/P1 review is GO; no model was loaded during repair

## Executive result

The historical campaign method repeatedly treated test-system failures as candidate failures, consumed the attempt, and often restarted the whole arm. That was wrong. Across the retained history there are **27 countable fault-invalid snapshots containing 1,578 recorded attempts**. Of those attempts, 139 were later salvaged, 70 are in the currently paused Qwen snapshot, and 1,369 were permanently discarded or made qualification-ineligible. Exact retained result/raw evidence proves at least 1,766 provider calls, plus 138 early retained provider/model outputs whose exact call totals were not published. One additional Coder abort is excluded because its marker has no attempt count.

None of the 27 arm dispositions is a valid candidate or model rejection caused primarily by model quality. Individual attempts may still contain legitimate model-quality evidence, including the 139 attempts retained by later salvage. The exact machine-readable ledger is `acceptance/evidence/20260901-non-model-failure-ledger.json`.

## Root causes and permanent corrections

| Area | Root cause | Why it repeated | Correction now enforced | Release gate |
|---|---|---|---|---|
| Application | Stale pending authority, inert scope transitions, and incorrect evaluator preconditions were first discovered inside scored model runs. | The campaign did not require all application invariants to pass without a model before leasing hardware. | Pending authority is invalidated durably; UI labels are derived only from current server receipts; scope and function-panel invariants are in the model-free gate. Application-attributed failures now produce a pause receipt and never grade the model. | Pending-authority and function-panel tests must pass before a model lease. |
| Harness | The runner collapsed infrastructure, capture, operator-stop, and browser failures into ordinary failed attempt rows. Create-only output then made the whole arm appear unrecoverable. | Failure attribution was implicit and there was no exact recovery/continuation contract. | A typed taxonomy separates model faults from non-model faults. Non-model faults pause without writing a scored record. A killed writer can be reconstructed from create-only plan, start, record, and observation files. Continuation retains the immutable harness-valid completed prefix and resumes at the exact first unconsumed identity. | Any non-model fault pauses the campaign; it cannot consume an attempt or produce a model grade. |
| Operator publication | Separate/manual witness and ACK helpers, stale preparation receipts, allowlist/seal predicates, file-sharing races, and a crash gap between live acceptance and audit-file publication lost valid events. | Publication was not one idempotent transaction and the watcher was not bound to an exact checkpoint before dispatch. | The watcher writes an atomic exact-scope arm receipt before preparation can succeed. The canonical helper publishes live first, writes the audit file second, and safely retries the exact same ACK. Conflicting retries fail closed. Publication is checked against its own later deadline. | Exact watcher arm, live acceptance, audit receipt, and exact ACK status must all agree. |
| Timeout | Observation, publication, native release, lease, telemetry, and batch deadlines were combined or left with about one second of scheduling margin. Some checkpoints advertised times beyond the campaign hard stop. | Timers described different operations but were treated as one deadline; dispatch did not reserve finalization time. | Discovery, 45-second observation, 55-second native hold, 60-second publication grace, dispatch stop, and application hard stop are separate. The browser checkpoint cannot advertise a deadline beyond the campaign hard stop. Observation has ten seconds of native-hold margin. | Boundary tests cover 10, 30, 44, and greater-than-45-second evidence plus hard-stop reservation. |
| Browser witness | The proxy constructed the expected cancellation statement rather than reading it from the application DOM. The watcher sampled a global accepted counter, so it could miss an event before its baseline or accept an unrelated checkpoint. | Browser truth and transport completion were conflated; identity was global instead of checkpoint-specific. | The witness control is injected into the actual application page, not an iframe. It reads exact DOM attributes emitted with the visible task and hashes task, project, experience, objective, cancellation time, and browser-visible URL together with the bounded-drain witness. The watcher polls that exact checkpoint and stays alive for all repetitions. | Unit/static coverage is green; a real-browser model-free DOM preflight is still required before any model lease. |

## Corrected campaign behavior

1. Run the complete model-free harness gate.
2. Run a real-browser model-free witness/publication preflight on the freshly sealed source.
3. If either fails, do not acquire or use a model lease. Fix the method, reseal it, and repeat only the failed model-free gate.
4. During a scored campaign, classify every stop before recording it.
5. A provider/model/semantic result consumes its exact attempt and remains immutable.
6. An application, harness, browser, timeout, publication, capture, telemetry, or operator-stop result writes a create-only pause receipt, does not grade the model, and does not consume the attempt.
7. Recover the immutable completed prefix from create-only artifacts, bind every input by SHA-256, and build a continuation beginning at the first unconsumed attempt.
8. When source or runtime seals differ, compose windows only after a machine comparison proves the model-facing view, cases, prompts, provider settings, and evaluator contract are identical. Never claim one uninterrupted arm.
9. Resume at the exact cursor. Never restart a valid prefix merely because the harness stopped later.

## Current R14 Qwen continuity

The stopped r41 directory contains 70 historical rows. Rows 1-68 are an immutable harness-valid completed prefix; that phrase does not independently assert that every row semantically passed. Historical rows 69-70 are non-model rows and are not qualification evidence. The exact continuation contains 52 identities and resumes at `qwen36-27b-mtp--agent-05-cancel-drain--2`. Only those 52 identities may run after all model-free gates pass. The final result may be composed only with a model-facing equivalence audit and must disclose two execution windows.

## Completion estimate from this checkpoint

- Documentation, final diff review, source commit, and fresh seal/stage: **45-90 minutes**.
- Model-free real-browser witness/publication preflight of the direct-page injected control: **30-60 minutes**.
- If actual browser execution exposes an unmodeled navigation or policy defect: add **60-120 minutes**, then repeat only the browser preflight.
- After all repair gates pass, the exact 52-attempt Qwen continuation plus collection: **40-70 minutes**.
- Independent semantic/equivalence review and final R14 reporting: **45-90 minutes**.

Expected remaining end-to-end time is approximately **2.5-5 hours** if the direct browser preflight works, or **3.5-7 hours** if it exposes another browser-delivery defect. No model time is spent while the repair gates are red.

## Evidence and verification

- Model-free repair command: `npm run test:m1:harness`
- Result on 2026-09-01 after independent-review and stale-test corrections: 133 passed, 0 failed, 0 skipped.
- Gate 7F result: 28 passed, 0 failed. Roadmap verification: 15 passed, 0 failed.
- The complete repository run initially reported six failures. Two were stale R13/R14 static assertions that still encoded the removed shared publication/observation deadline and are now corrected and included in this gate. The other four were sandbox permission failures: the 21-test Windows process-tree suite and 27-check probe-instrument suite both passed in an authorized non-sandboxed rerun. None was attributed to a model.
- Independent historical audit: ledger totals above and the retained M1-S2 result/RCA documents.
- Independent repair review found no P0/P1 blocker and authorized a fresh seal and formal model-free real-browser preflight.
- Product qualification remains false; M1-S2 and all seventeen capability families remain open until the existing acceptance process completes.
