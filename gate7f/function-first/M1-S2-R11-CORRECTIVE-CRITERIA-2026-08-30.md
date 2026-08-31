# M1-S2 R11 corrective qualification criteria

Status: prospective criteria frozen before implementation; no R11 inference has started.

R11 is a fresh, complete qualification after the retained R10 comparison. It corrects only the
model-neutral application and evidence mechanics exposed by R10. It does not change the frozen case
bundle, model roster, role threshold, independent evaluator, protected-data boundary, production route
or broader roadmap.

## Parent evidence and planning pins

- Parent source commit: `ee1a15ae5d0c6ba18e9eaa24e623645be74a238b`
- Parent result: `M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md`
- Parent result digests: Qwen3.6 `eb2b783cbd7d640108ed1947008ff1c46152da2e68fe7cb70164a0871be6b54d`,
  Gemma `5270e687cf86237abb41321bf135f6c10c019fc5942f49b0dca7c1fd5151709e`,
  Coder `09b1e21f5e551c831d929def33c9de6c423b4513ff94a35476d614027f324746`
- Roadmap revision: `2026-08-28.1`
- Roadmap digest before this correction: `3a80fe6e10ece8a8bea015d5554e20b272f81efbbcdefa103764be4211f96777`
- Capability families exercised: C01, C02, C03, C04, C06, C07, C12, C15 and C16
- Acceptance policy: `runaai-m1-product-case-policy/v1`, version `2026-08-30.1`
- Frozen case-bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Fixed denominator: 120 attempts per candidate, 360 total, plus 12 model-free controls
- Role threshold: at least 22 acceptable attempts out of 24 with no critical failure

## Authorized correction

### 1. Exact accepted-checker citation echo

An evidence checker may accept with `citations:null` or with the exact ordered citation array supplied
by the primary candidate. The application must reject any added, removed, duplicated, reordered,
mutated or unselected citation. The primary selected citations remain the answer authority; a checker
echo never becomes a new source or grants authority. An accepted checker still requires
`correctedAnswer:null`. Fenced JSON remains subject to the same exact schema after its single fence is
removed.

### 2. Generic evidence completeness for Research and Review

Evidence-bearing Research and Review answers use the same model-neutral completeness protocol. The
checker sees only the current request, selected evidence, candidate answer and candidate citations. It
checks every explicit request clause plus relevant absent, unapproved, contradicted, superseded,
authority-limited or unknown evidence. A rejected answer may receive one direct correction, and that
correction must pass the same checker once. Research keeps its sealed role output ceiling; Review keeps
its 1,024-token ceiling. Both remain inside the original total request deadline, exact model identity,
zero SDK retries and existing byte limit. General conversation without selected evidence is not checked.

### 3. Typed, non-authoritative response-check attribution

Application evidence records the check kind (`code`, `evidence-research` or `evidence-review`), whether
it ran, whether it corrected the final answer, whether the final bytes came from the primary or the
checker correction, and the exact attempt count. Captured provider calls are classified from the
application-owned request schema as primary answer, evidence checker, code checker, initial plan or plan
correction; unknown schemas remain unclassified. Attribution may prove that a check ran and which bytes
were delivered. It cannot prove semantic correctness merely because a model checker returned
`accepted:true`; the independent evaluator still grades the final delivered output.

### 4. Durable, bounded repair continuation

Repair is a quiescent durable state, not an extension of one HTTP request. After a failed-test receipt is
durably consumed, `run.start` or `run.resume` returns `repair-required` immediately without a second
planner call. One later explicit `run.resume` continues the same run under the same task, project,
participant, session and grant lineage after rechecking authority, grant definition, current revision and
outstanding intent.

The budgets are separate and cumulative:

- maximum planning time per planner call: 30 seconds;
- maximum active time in one start/resume request: 55 seconds, below the 60-second application route;
- maximum active time over the durable run: 120 seconds;
- maximum plans: two; maximum actions: 12; maximum age remains one hour.

The application reserves each active window before starting work and settles its measured use on normal
return. If a worker dies with a window open, a later continuation conservatively charges the reserved
window before opening another. A restart, duplicate request or session rebind cannot reset that charge.
Planning uses the least remaining planner, request and run budget. Status/reconciliation precedes any
continuation after a lost acknowledgement. No uncertain proposal or effect is blindly repeated.

### 5. Model-neutral repair-plan completeness

Only when `repair:true` and a failed suite is present, the protocol requires an exact preview/apply pair
for the same replacement and the exact failed suite rerun after apply when those capabilities are in the
grant. It rejects a rerun before correction, a different suite, mismatched preview/apply bytes or a
repair plan that omits apply or rerun. One advisory protocol correction remains inside the same 30-second
planner deadline. The protocol does not judge the repair algorithm and contains no case answer; a
semantically wrong repair remains a model failure.

### 6. Actual browser witness only

The Agent05 witness publisher must be source-pinned, expiring, one-use and callable only after actual DOM
observation. Waiting code must not synthesize an expected witness from request metadata. The acceptance
journey records the real observed state, exact run and checkpoint. Contaminated or absent browser proof
remains inconclusive.

## Required proof before inference

- Accepted-null and accepted-exact-echo tests pass; altered, reordered, duplicate, extra and unselected
  checker citations fail closed.
- Research and Review each prove actual checker wire calls, omitted-negative correction, one correction
  recheck, role-specific bounds and no case-specific prompt text.
- Response-check provenance and capture-purpose tests prove exact attribution without changing answer or
  citation authority.
- Orchestrator tests prove two-request repair, no repair planner call before explicit resume, same durable
  lineage and snapshot evidence, failed then passed receipts, revocation/stale/session denial, duplicate
  serialization, lost-response reconciliation, crash-reservation charging and truthful total exhaustion.
- Planner-protocol tests reject incomplete/mismatched repair plans and accept only the bounded exact-suite
  sequence without embedding a semantic solution.
- The function panel and HTTP journey show `repair-required` before completion and invoke exactly one
  explicit continuation; stale sessions use the existing explicit rebind path.
- Browser-witness tests require actual observation and reject synthetic, stale, replayed or mismatched
  publication.
- The complete repository suite, roadmap verifier and `git diff --check` pass.
- A fresh committed source archive, package lock, case bundle, hardware plan and versioned R11 runtime seal
  are hash-pinned before any model call.
- The complete exact Control regression and all 12 controls pass against the same sealed source and
  runtime, including actual-browser Control10.

## Required proof after inference

- Run all 360 planned attempts from fresh candidate stages, one model resident on Home at a time. No
  subset retry or favorable historical composition is allowed.
- Retain every primary, checker, planner and correction output separately with its application purpose,
  final-delivery attribution and exact result row.
- Independently review all retained final outputs under the unchanged candidate-blind evaluator. Passing
  application checks do not substitute for semantic grading.
- Select a role only when its own whole-attempt 22/24 threshold and critical-failure boundary pass. Do not
  pool models or use semantic-only rows.
- Bind each 120-row result to its source/runtime/lease seals, closed completion publication, complete Home
  export, before/after final observations, exact owned task and stable listener inventory.
- After each arm, verify zero owned model residency, both GPU power limits restored, the exact owned task
  retired, production listeners unchanged, no protected-data read and no production-route change.

## Stop conditions

Stop and retain evidence on source/seal/case drift, a changed denominator or threshold, case-specific
checker/planner logic, an uncharged active window, a blindly repeated uncertain effect, synthetic browser
proof, protected-data access, production-route change, critical model/product failure, cleanup failure or
inability to reconcile exact attempt records. None authorizes weakening or rewriting earlier evidence.

Passing R11 can qualify deterministic role routing for the bounded five-function customer trial. It does
not complete M1, activate a production route or replace M2-M5 and the remaining 17-family roadmap.
