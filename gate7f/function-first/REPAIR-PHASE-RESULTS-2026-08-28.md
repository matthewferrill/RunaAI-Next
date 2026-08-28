# Model-neutral repair continuation: implementation results

2026-08-28. Criteria committed first as `bdc1301`; separate stopped-campaign record is `c3952f3`.
This is M1-S2 C06/C07/C12, not completion of M1 or the 17-family roadmap.

## Change

`planner-progress.mjs` projects the service's already verified, scope-filtered receipt history into
versioned initial/repair progress. It distinguishes observed work, published changes, actual failed or
passed tests, and incomplete execution. It binds current failures to the exact recorded revision,
workspace bytes and suite. Malformed or inconsistent records, mixed scope, duplicates, stale evidence,
unrecorded current state and model-written receipt substitutes cannot establish a repair basis.

The planner keeps the original objective and input evidence. Its common instructions clarify that
steps are unconditional, a failed test stops the plan, previously executed work is not pending, and
unexecuted steps are not completed work. Repair should correct the recorded failure before retesting
the same suite against changed bytes. There is no fixture-specific solution or expected answer in the
prompt, no output-plan rewriting, and no new execution authority.

The progress helper validates a lossy receipt projection; it does **not** claim to reverify a digest
after opaque references were omitted. The actual service verifies original receipts before the
orchestrator filters and projects them. Effect-time governance stays in the existing service.

Unchanged: model-neutral role selection, request controls, maximum 1,536 output tokens, temperature 0,
zero SDK retries, 96,000-byte input and 24,000-byte output limits, six steps per plan, two plans and
twelve actions per run, deadlines, capability envelope and sealed test cases. No product database
migration or new persistent authority is introduced.

## Verification

- `node --test gate7f/function-first/planner.test.mjs gate7f/function-first/planner-progress.test.mjs
  gate7f/function-first/operator-smoke.test.mjs`: **43/43**, zero skips. Includes the existing 11-test
  planner baseline, all three candidate IDs in both Code and Agent roles through the real Mastra/AI SDK
  request adapter with deterministic responses, exact reasoning controls and no hidden transport retry.
- `node --test gate7f/function-first/tasks/orchestrator.test.mjs`, with `M1_TASK_PG_URL` bound to a
  newly created, loopback-only Omen fixture: **20/20**, zero skips. The actual service, encrypted task
  store, LangGraph checkpoint store, planner wrapper and orchestrator observed failed test -> repair
  progress -> preview -> permitted edit -> same suite passed. Reopen did not replay effects. A planner
  that ignored the guidance still failed after exactly two attempts; no third attempt was added.
- The orchestration executor and model responses in those tests are explicitly deterministic doubles;
  this proves plumbing/governance, not live model quality or new native containment proof.
- A separate reviewer reported all eight old captured Code planner inputs remained shape-compatible,
  including exactly one current failed-suite receipt for the stopped Code05 repair. This read-only
  compatibility check does not alter or upgrade those historical results.
- `npm run verify:roadmap`: **15/15**. `git diff --check`: clean.

The fixture used the installed tools at `D:/Projects/Runalab/artifacts/tools` and the repository's
`startSyntheticPostgres` helper, with a unique child under `artifacts/runs/repair-phase-20260828`.
Initial sandboxed PostgreSQL startup was refused; the authorized unrestricted retry ran the tests.
The helper's final receipt confirmed `stopped:true`, `ownedSyntheticDataRemoved:true`, and
`productionChanged:false`. No live model, Home service, Control store or production routing changed.

## Remaining proof

A fresh common source seal, formal model-free controls and full matched three-candidate functional
campaign are still required. Better live model behavior is not assumed. Old campaign failures,
inconclusive checks, 23 attempted cases and 97 unexecuted cases remain preserved unchanged.
