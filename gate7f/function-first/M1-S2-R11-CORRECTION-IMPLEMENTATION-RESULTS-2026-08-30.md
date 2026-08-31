# M1-S2 R11 correction implementation results

Status: implementation complete; ready to create a fresh committed source archive and begin Control
qualification. No R11 model inference has started and no role or production route is qualified by this
record.

## Implemented application corrections

- Evidence-bearing Research and Review use the same bounded completeness checker. One rejected answer
  may be corrected once and that correction is checked once inside the unchanged role deadline and
  output ceiling.
- Accepted checker citations are either null or the exact ordered primary citation array. Added,
  removed, duplicated, reordered, mutated and unselected citations fail closed.
- Response-check evidence records the application-owned kind, whether it ran, whether it corrected the
  delivered bytes, the final-byte origin and exact attempt count. Provider capture classifies calls from
  the application request schema rather than model text.
- A failed-test receipt now returns `repair-required` without another planner call. A later explicit
  `run.resume` is required for the one bounded repair plan.
- Each start/resume request reserves at most 55 seconds before work. A durable run has a cumulative
  120-second active ceiling; an abandoned reservation is charged before any continuation. Planning
  remains capped at 30 seconds, two plans and 12 actions.
- Repair-plan validation requires an exact matching preview/apply pair and reruns only the retained
  failed suite after the correction when the complete capability set is present.
- The function panel labels the quiescent repair state and exposes one `Continue bounded repair` action
  only for the same live session and exact active grant.
- Browser-witness publication now requires canonical state obtained from actual DOM observation. The
  source-pinned owner wrapper cannot construct expected witness state from request metadata.
- A versioned R11 runtime-seal contract and builder bind the unchanged 360-attempt case bundle, complete
  three-candidate roster, committed source archive, package lock, criteria, readiness and hardware plan.
  The builder rejects a source archive whose embedded commit is not the current committed source.

## Verification completed before source freeze

- Focused evidence, planner, UI, witness, smoke and seal regression: 131 passed, zero failed, zero skipped.
- Disposable PostgreSQL orchestrator regression: 73 passed, zero failed, zero skipped. Cleanup confirmed
  the synthetic data removed, process stopped and `productionChanged:false`.
- Actual isolated Edge DOM regression: 16 passed, zero failed, including visible non-completion at
  `repair-required` and exactly one same-session continuation without a new grant.
- Complete repository suite under normal Windows child-process permissions: 1,814 passed, zero failed,
  78 environment-dependent skips. The skipped PostgreSQL path was separately executed above with zero
  skips. The exact Windows owner process-tree regression also passed 21/21 outside the restricted
  command sandbox.
- R11 runtime-seal tests: two passed; builder and seal modules passed syntax validation.
- `git diff --check` and the roadmap verifier are required again immediately before commit.

The sandbox-only full-suite attempt first retained three `taskkill` access denials as
`owner-stop-unconfirmed`; running the exact process-tree tests with normal host permissions passed. This
was an execution-environment restriction, not a changed expectation or weakened test.

## What this does not prove

This record does not prove Control regression, all 12 model-free controls, Home readiness, any of the
360 R11 candidate attempts, independent semantic grading, deterministic role selection, production
routing, protected-data access or broader M1 completion. Those remain the next sealed steps under the
prospective R11 criteria.
