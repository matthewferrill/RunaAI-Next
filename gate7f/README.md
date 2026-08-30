# Gate 7F — Runa Agent Mode foundation

Current planning authority: `../PRODUCT-ROADMAP.md` and `../roadmap/CURRENT-SLICE.md`.
Run `node roadmap/read-next-slice.mjs` from the repository root before choosing further work. The
historical foundation below is a component of Milestone 1, not the full Runa product roadmap.

The 2026-08-28 function-first increment is in `function-first/`. Its model-role contract is wired into
the existing release composition; `function-first/M1-S1-RESULTS-2026-08-28.md` records local validation
and `function-first/QWEN36-READINESS-PLAN-2026-08-28.md` records the third-model diagnosis design.
Run `npm run test:m1:roles` for the focused tests. This is not live qualification, a deployment or full M1.

The complete R9 three-model functional comparison is recorded in
`function-first/M1-S2-R9-THREE-MODEL-RESULTS-2026-08-30.md`. Four roles now have
at least one qualifying candidate, but no candidate qualifies for Review and no
whole candidate qualifies. The result is synthetic evidence under the frozen R9
seal; it does not select or deploy a production route, close M1 or replace the
remaining roadmap.

Gate 7F-0 is the inert control plane for conversational project work. It implements task scope,
capability schemas, deterministic approval profiles, exact proposals, remembered decisions, synthetic
execution receipts, idempotency, restart continuity, and governed rollback without touching a real
workspace.

## Modules

- `contracts.mjs` — strict versioned task, capability, approval, proposal, and receipt contracts.
- `registry.mjs` — the closed synthetic capability registry.
- `policy.mjs` — deterministic profile and remembered-choice evaluation.
- `core.mjs` — task orchestration and the only automatic-execution pathway.
- `adapters/memory.mjs` — synthetic repository and restart snapshot adapter.
- `adapters/synthetic-executor.mjs` — in-memory workspace preview, inspect, change, verify, and restore.
- `gate7f.test.mjs` — authority, profile, failure, replay, rollback, privacy, and containment checks.
- `run-synthetic.mjs` — aggregate-only end-to-end proof across denial, approval, restart, rollback, and
  safe autopilot.

## Verification

```text
npm run test:gate7f
npm run verify:gate7f:synthetic
npm test
git diff --check
```

## Boundary

This package has no HTTP route, browser wiring, real filesystem adapter, process executor, Git adapter,
network client, provider call, credential access, PostgreSQL schema, Control operator, or production
activation path. The in-memory snapshot contains synthetic private task/workspace state and is an internal
test adapter, not a public audit format or production store.

PostgreSQL and LangGraph remain the selected production authorities. Gate 7F-1 will use this foundation as
the inert agent workload for the separately preregistered Gemma/incumbent burn-in; no model is selected or
activated here.
