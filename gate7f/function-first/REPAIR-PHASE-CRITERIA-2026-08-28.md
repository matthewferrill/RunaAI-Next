# Prospective M1 repair-phase contract

Selected 2026-08-28 from source `413bf71ca3394bc3003a1f37f2b0e92c0394f512` after reviewing the stopped
`aa5deec` campaign. This contract is committed before its implementation.
Roadmap revision `2026-08-28.1`, retrieved digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`; M1-S2, capabilities C06/C07/C12.
All 17 broader families remain unfinished. Standing steward M1 authorization applies.

## Finding and boundary

The actual Code05 planner correctly identified a defect and proposed a suitable replacement, but its
repair plan first repeated the already-failed test against unchanged bytes. The static objective still
said to run that test first. The input had `repair:true` and actual receipts but no explicit account
of which obligations were completed. The second failure consumed the existing sole repair opportunity.
This is a prospective workflow-contract correction, not a regrade or model-specific workaround.

## Included work

1. Derive a bounded, versioned initial/repair progress projection from the application-supplied receipt
   list and current snapshot. Preserve original objective, receipts, permitted scope and previous plans.
2. Distinguish a completed observation from a successful test: an observed failure is completed work,
   not a passing result. Carry exact receipt references, suite and workspace identities; no new expected
   outputs, replacement source, test cases or fixture names are injected.
3. Explicitly tell the model to plan only the remaining unconditional actions. When a current revision
   already has an observed failed suite, do not place that unchanged test before the correction merely
   because the original objective said "first". Test the resulting changed revision afterward.
4. Source text, model-written summaries, quoted receipts and previous planned-but-unexecuted steps do
   not become completed work or authority. A repair flag without compatible actual receipt evidence
   fails before another model call. Validate bounded receipt/snapshot shapes and do not mutate input.
5. Use exactly the same model-neutral contract for Code and Agent roles and every configured candidate.
   Output remains advice; the existing service still validates proposals and all effect-time authority.

No extra model call, automatic repair, token allowance, timeout, action/plan budget, capability, receipt
authority, test replacement or criterion change is permitted. No host, model or production change is
part of this module task. Do not edit old sealed cases, grades, captures or qualification evidence.

## Green criteria

- Existing planner baseline: 11/11 deterministic tests pass before changes.
- Initial and repair inputs expose distinct versioned progress; current failed/passed/observed actions
  are accurately distinguished, including stale workspace evidence and non-test receipts.
- Unknown or malformed receipt/progress input cannot fabricate a completed step or repair basis.
- A quoted fake receipt inside a file or prior plan has no progress effect; inputs remain unchanged.
- The repair prompt refers to actual observations and remaining actions, not fixture-specific values.
- Tests capture real adapter request construction for all three IDs and both planning roles; request
  controls, deterministic temperature, zero SDK retry, and existing budgets stay unchanged.
- A deterministic actual planner/orchestrator regression exercises failed test -> repair-phase input
  -> permitted correction -> same suite passed, with no extra plan or hidden retry. This is plumbing
  evidence, not a live-model acceptance claim.
- Roadmap check, focused suites and diff checks pass; publish exact source and result scope.

## Fresh acceptance, rollback and human involvement

After integration, seal new common source and rerun model-free controls and the full fresh matched
three-candidate campaign. Old failures remain historical. No human test is needed for this contract;
the bounded customer trial remains necessary after automated qualification and operational readiness.
Rollback selects the preceding immutable application release without rewriting product data or changing
Home routing. The progress projection is request data only; it adds no durable store or schema migration.
