# M1-S2 R13 Agent and Review corrective qualification criteria

Status: prospective criteria frozen before implementation; no R13 model inference has started.

R13 is a fresh, complete qualification after the immutable R12 result. It corrects only the
model-neutral Agent and Review application/evidence deficits exposed by candidate-blind R12 review. It
does not rewrite R12, inject an expected answer, change a case, remove a candidate, pool candidates,
lower a threshold, change the independent evaluator, activate a production route or read protected data.

## Selection record and planning pins

- Selection date and parent source commit: 2026-08-31 at
  `1b94c174750477fd6320f095ae1f3ed5c8839eb1`
- Parent result: `M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md`
- Parent result SHA-256: `1bb5fca49bda486d9fdb0cba6397d8711edb1f35f6d98080d1e4c4404130e390`
- Roadmap revision: `2026-08-28.1`
- Roadmap SHA-256 after selecting R13: `1e453193d53303a6faffa9fe6443f32f8cab062902997d359407f93320902ecc`
- Milestone and slice: M1, M1-S2
- Capability families exercised: C01, C02, C03, C04, C06, C07, C12, C15 and C16
- Acceptance policy: `runaai-m1-product-case-policy/v1`, version `2026-08-30.1`
- Frozen case-bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Fixed denominator: 120 attempts per candidate, 360 total, plus 12 model-free controls
- Fixed candidates: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B and Qwen3.6 27B MTP
- Role threshold: at least 22 acceptable attempts out of 24, no blocked or indeterminate row and no
  critical model or product failure

R12 proved qualifying Chat, Research and Code routes but no Agent or Review route. It found no critical
failure. Agent failures were bounded to ungrounded read-only completion summaries, one semantically
wrong failed-test repair and absent durable browser/journey observations. Review failures were bounded to
contradictory checker transport and incomplete treatment of claims, counterexamples, authority and
support limits. R13 must correct those mechanisms generically; passing R12 rows remain immutable history
but are not substituted into the fresh R13 denominator.

## Included corrections

### 1. Grounded Agent completion projection

The final Agent response is derived only after the run is quiescent and from the trusted current
snapshot, exact action arguments and retained receipts. A plan preview or initial planner summary is not
presented as the completed result. The projection identifies what was inspected or changed, the exact
verification suite and its observed result, remaining failure/repair state and whether any effect was
applied. Read-only work must report the inspected result without implying a change. Effectful work must
not claim success from a proposal, preview or unverified receipt.

This is application-owned evidence projection, not a semantic answer key. It contains no case name,
fixture-specific value, expected formula or expected implementation. It preserves candidate planner
bytes and records separately whether the final displayed bytes are planner prose or trusted
application evidence.

### 2. Exact bounded failed-test repair continuation

The existing durable `repair-required` boundary remains mandatory. A failed test receipt returns a
quiescent state; one later explicit continuation may obtain one correction plan under the same actor,
project, task, session, grant, intent, revision and cumulative budgets. The repair plan must preview and
apply identical bytes, then rerun the exact failed suite. A second failure remains a truthful failure; it
does not loop, silently choose a different suite or inherit a pass from expected fixture state.

The acceptance journey must exercise the continuation whenever the candidate creates a repair-required
state. A runner timing cutoff or missing continuation cannot be graded as a completed model failure and
cannot be filled from anticipated state.

### 3. Durable Agent journey evidence

Actual application journeys must retain enough source-pinned evidence to determine cancellation/drain,
crash/reconciliation and ask-every-time approval reload outcomes. The observation binds actor, project,
task, run, checkpoint, current revision, grant/profile and the final durable snapshot. Cancellation must
show that no later effect started. Crash reconciliation must distinguish an already-recorded effect from
an unapplied proposal and must never repeat an uncertain effect. Approval reload must show the exact
pending digest before and after rebind and the single authorized effect after approval.

Browser or operator evidence remains expiring, one-use and based on actual DOM/application observation.
The runner may wait, resume and reconcile, but it may not synthesize a witness from expected metadata.

### 4. Strict structured Review verifier transport

Review verification uses an application-owned structured-output schema with exactly two valid shapes:

- accepted: `accepted:true`, a non-empty `reason`, `correctedAnswer:null`, and either `citations:null` or
  the exact ordered selected-citation echo;
- rejected: `accepted:false`, a non-empty `reason`, a non-empty `correctedAnswer`, and a non-empty exact
  subset of selected citations sufficient for that correction.

Unknown keys, prose wrappers, fences outside the existing single-fence allowance, accepted corrections,
unselected/mutated/reordered citations and malformed values fail closed. A rejected primary answer may
receive one correction and one recheck within the unchanged Review deadline, token and byte budgets.
The checker cannot add source authority or turn its own acceptance into independent semantic proof.

### 5. Generic Review completeness protocol

The primary Review request and checker require a claim ledger derived from the user request and selected
evidence. For every material claim, the answer must distinguish supported, contradicted and unknown;
address relevant counterexamples and cross-file interactions; distinguish current authority from stale
or superseded material; state sampling/baseline limitations; distinguish authentication from
resource/path authorization; cite selected evidence precisely; reject quoted instructions or fake
receipts as authority; and say when context is insufficient.

These are generic evidence categories. Prompts and code must contain no case identifiers, fixture names,
expected numeric conclusions, expected vulnerabilities or frozen-rubric answers. The independent reviewer
continues to decide whether the delivered answer is semantically correct.

### 6. Exact attribution and truthful incomplete state

Every retained Agent and Review record identifies each provider call by application-owned purpose,
records primary/checker/planner/correction bytes separately, and states which bytes reached the user.
Malformed checker output, exhausted repair, absent journey proof and unknown reconciliation remain
incomplete or failed. They cannot be converted to a pass by a UI label or evaluator expectation.

## Required deterministic proof before inference

- Grounded Agent projection tests cover read-only inspection, applied change, failed then repaired test,
  exhausted repair, cancellation, uncertain effect, crash reconciliation and ask-every-time reload. They
  prove that initial-plan prose cannot masquerade as the final result.
- Orchestrator and HTTP/application tests prove exact lineage, budgets, single continuation, same-suite
  rerun, no blind repeat, truthful drain and stable duplicate handling.
- Actual-browser tests prove source-pinned observation for cancellation/drain, crash/reconcile and
  approval reload, and reject synthetic, stale, replayed or mismatched publication.
- Review schema tests accept only the two frozen transport shapes and reject the contradictory
  `accepted:true` plus non-null correction shape observed in R12.
- Review wire tests prove that the verifier actually receives the structured-output schema, one rejected
  answer can be corrected and rechecked, malformed output fails closed, citation authority is unchanged
  and role-specific time/token/byte limits remain enforced.
- Generic prompt tests prove coverage categories are present and frozen case answers are absent.
- The complete repository suite, native runtime suite, roadmap verifier and `git diff --check` pass.
- A fresh committed source archive, package lock, unchanged case bundle, hardware plan and R13 runtime
  seal are hash-pinned before any model call.
- The exact Control regression and all 12 controls pass against that same source and runtime, including
  actual-browser controls.

## Required fresh proof after inference

- Execute all 360 planned attempts from fresh candidate stages, one large model resident on Home at a
  time. No subset retry, R12 carry-forward, semantic-only substitution or favorable cross-model pooling
  is allowed.
- Retain every primary, checker, planner and correction output with purpose and final-delivery
  attribution, plus every trusted receipt and actual journey observation needed for the grade.
- Independently review all 360 final rows candidate-blind under the unchanged evaluator. Freeze semantic
  decisions before unblinding and publish all blocked or indeterminate rows without filling them.
- Qualify a role only from its own candidate's whole-application 22/24 score, with no blocked or
  indeterminate row and no critical failure. Deterministic role routing remains application-owned; a
  model cannot select itself or gain authority from another role.
- Bind each 120-row result to its source/runtime/lease seals, complete Home export, before/after final
  observations, exact owned task, stable listener inventory and closed Control drain.
- After each arm, verify zero owned model residency, both GPU limits restored, exact owned task retired,
  production listeners unchanged, no protected-data read and no production-route change.

## Environment, exclusions, rollback and stop conditions

The runtime remains the bounded disposable JavaScript project and authorized-source envelope already
defined for M1-S2. No unrestricted terminal, package manager, Git publication, deployment, network,
desktop control, connector, private conversation or protected store is added. PostgreSQL remains product
record authority and LangGraph durable workflow authority; synthetic acceptance adapters do not become a
production authority.

Stop and retain evidence on source/runtime/case drift, denominator or threshold change, case-specific
prompt/code, uncharged active work, repeated uncertain effect, fabricated browser evidence, protected-
data access, production-route change, critical failure, cleanup failure or inability to reconcile exact
attempt records. Rollback removes only R13-owned candidate runtime/effects and preserves predecessor
configuration, immutable evidence and later user work.

No human customer test is required before deterministic and model qualification. If and only if fresh
R13 evidence provides qualifying routes for all five M1 functions, expose the bounded customer trial for
the steward's actual judgment. Passing that trial still completes only M1; C01-C17 and M2-M5 remain on
the roadmap until their own accepted evidence exists.
