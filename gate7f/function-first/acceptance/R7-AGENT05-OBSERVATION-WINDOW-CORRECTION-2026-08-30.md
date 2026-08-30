# R7 Agent05 observation-window correction

## Finding

The R7 sealed campaign produced the correct live browser state for Agent05: the
task was cancelled, the exact bounded-drain notice was visible, the dispatched
test remained unsettled, and the UI did not claim immediate termination. The
operator acknowledgement nevertheless reached the isolated Control endpoint
after the original 20-second evidence window and was rejected. The partial
candidate batch was stopped and retained; it was not graded as a model result.

This was an acceptance-harness timing defect. The real path includes campaign
announcement polling, an actual in-app browser refresh, DOM inspection, the
owner-bound Control SSH hop, schema validation, and live observation
publication. A window that can reject that measured path after it has already
displayed the required truth is not a stable qualification boundary.

## Correction

- Increase the in-flight browser observation window from 20 to 24 seconds.
- Retain the synthetic post-receipt delivery hold at 25 seconds.
- Keep the observation window strictly shorter than the hold.
- Keep the planner deadline, sandbox ceiling, and hold inside the existing
  60-second application-route budget. The planner, sandbox ceiling and hold
  total 57 seconds, leaving the existing route margin intact.
- Do not change executor deadlines, process limits, network denial, production
  routing, or the application cancellation semantics.

The hold remains acceptance-only. It starts only after the bounded native
executor has produced its receipt and delays delivery so the actual UI can be
observed while reconciliation is still pending.

## Validation required before rerun

1. Unit tests must accept authoritative browser observations through exactly
   24 seconds and reject later evidence without mutating the ledger.
2. The campaign arithmetic must prove the 25-second hold stays within the
   application route and remains longer than the observation window.
3. The complete local regression and runtime-seal tests must pass.
4. A new source commit, archive digest, case-bundle digest, runtime seal,
   model-free Control run, Home lease, and candidate stages are required. No
   evidence from the stopped batches may be carried into the corrected run.
