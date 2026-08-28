# Prospective evidence-reader corrections after the first M1 campaign stop

This is M1-S2 corrective work, not a new capability, model promotion, completed
milestone or replacement for the remaining product roadmap. Roadmap digest:
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
The frozen 40 cases, three candidates, three repetitions, thresholds, model
budgets and native execution limits are unchanged.

## Preserved observation

Source `aa5deecf1c50bf54d4713784faab02333c05c590`, runtime seal
`62c9b2f5ea5d65874f7e18ed24d0a056011941b45c674a193ed04d9e3f118eee`:

- All 12 model-free controls passed independent regrading, including the actual
  browser's explicit unknown-execution view. Raw control report SHA-256:
  `5fd7cf6cc5f8d96b7bd7e96fe27e047ce36a93712170d21b651b802673fdb333`.
- The Gemma campaign stopped at attempt 23, `code-07-concurrent-stale`, before
  any browser campaign checkpoint. The 23 observations and all unexecuted slots
  remain in the original 360-slot campaign record; this is not qualification.
- The stale original approval returned HTTP 400 `m1-stale-project`, the newer
  concurrently approved bytes were preserved, and the original task had zero
  mutation receipts. The actual defect was stale pending state: its proposal
  still said `pending-approval`, and resume returned `waiting-approval` with no
  error. The parent corrective change handles durable invalidation and resume.
  This reader change does not weaken the stale-state expectation or reclassify
  the old failed check as passing.

All 23 copied raw observation files were rehashed against their immutable
`.record.json` hashes after diagnosis. No raw observation, grade, case, runtime
seal or production artifact was modified. Future scored work needs a new
prospective source/runtime seal and new same-version control evidence.

## Confirmed measurement gaps and bounded corrections

1. **Scoped database probes.** Actual continuity and read-only effect probes
   include `experience`, while the closing capture manifest omitted it. Full
   object equality rejected otherwise identical participant/project/thread
   scopes. The reader now compares those exact authority IDs and validates any
   supplied experience against the frozen case's lane. New capture manifests
   explicitly include experience. Wrong IDs or wrong experience still fail.
   This explained the missing Chat continuity/policy and research effect/policy
   proofs; it was not an observed data leak or missing database write.
2. **Pending-tail checkpoint probe.** The old host read only the last proposal's
   checkpoint. An approval-pending proposal has not invoked the graph and
   legitimately has no checkpoint; two earlier executed proposals did. The new
   read-only helper inspects at most 30 exact, scoped proposal thread keys,
   retains every present/absent result, and selects the latest existing actual
   checkpoint. It never invokes a graph or creates a checkpoint. Foreign scope,
   duplicate proposals, mismatched checkpoint binding and unexpected payload
   fields fail closed. No checkpoint at all remains absent, not a fabricated
   PostgreSQL/LangGraph success. The old code07 capture remains incomplete.
3. **Retry proof.** The retry comparator counted a later `chat.read` in the
   `recovered` phase as a second retry. It now selects only actual `answer`
   operations, requires matching captured application HTTP evidence, and still
   requires one request per phase with exactly the same ID and full input.
4. **Semantic-summary pointers.** Actual Code summaries live at
   `workflow.run.plans[N].summary` and in the corresponding application run
   response. Independent reviewers may cite these exact existing paths, including
   the response `result` wrapper when present. The quoted stored summary must
   also equal the summary decoded from an actual captured model plan. No
   `run.summary` alias or harness-authored model answer is invented. Application
   phase, own-property pointer and independent-evaluator checks still apply.

The new reader was used diagnostically against read-only copies to confirm the
scope explanation, without saving replacement grades. Genuine observed quality
failures remain: Chat01 wrote three sentences instead of two, Chat05 omitted the
requested kit count, and Code05's repair plan repeated the failing test before
its edit, exhausting the bounded repair with two actual failures. Semantic
uncertainties remain for independent review; none is resolved by these helpers.

## Verification and limits

- Focused reader/grader/checkpoint suite: 57 passed, one actual-PG case initially
  skipped without a test database.
- Separate disposable Omen PostgreSQL/LangGraph run: 5/5 passed, including actual
  checkpoint reconstruction with a pending tail, unchanged checkpoint-row count
  during probing, and zero extra execution callback calls. Its authority callback
  is an explicit test fixture; this is not a filesystem/native/model acceptance
  claim. The owned database and generated data were stopped and removed.
- Surrounding browser bridge, capture transport, fault, control and campaign
  runner regressions: 56/56 passed.
- Combined acceptance regression suite with the disposable PostgreSQL instance:
  114/114 passed, zero skips. Cleanup confirmed the instance stopped and only its
  generated synthetic data was removed. Roadmap retrieval and all 15 roadmap
  integrity tests also passed; all 17 remaining capability families stay visible.
- A new exact functional campaign must execute the corrected host probe; old
  absent checkpoints cannot be retrospectively recovered from removed databases.
- No Home operation, model inference, production change or private-store access
  was performed for these corrections. The existing Control model campaign was
  read only, and the local verification used disposable synthetic resources.
