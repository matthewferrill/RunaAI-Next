# Gate 7F-0 inert Agent Mode foundation results

Date: 2026-08-26
Branch: `codex/gate7f-agent-foundation`
Scope commit: `2066a3c5c35824e20cdfa833d35d282a68ee4dbb`
Implementation commit: `de4981e`
Status: locally green; inert and not deployed

## Outcome

Gate 7F-0 is green against its frozen criteria. RunaAI-Next now has a model-independent control-plane
implementation for conversational Agent Mode, but the implementation can operate only on an in-memory
synthetic workspace. It cannot reach a real file, process, repository, network, model, credential,
identity store, protected record, or production service.

This proves the control semantics needed before comparing models or granting real project capabilities:

- an authenticated user creates a project-scoped task and selects an approval profile;
- user or model output may stage a typed proposal but cannot manufacture authority;
- deterministic application policy alone returns deny, approval-required, or automatic;
- exact previews bind arguments, current state, scope, expiry, and rollback linkage;
- approvals and remembered decisions bind the authenticated participant and exact capability scope;
- duplicate, concurrent, restart, and delivery-retry paths preserve one deed and one receipt;
- failures restore synthetic state when a deed cannot be recorded;
- rollback is a second governed proposal and refuses after later state drift; and
- public receipts and task-scoped audit summaries omit objective text, file content, model output, and
  private rollback state.

## Verification

| Check | Result |
|---|---|
| Focused Gate 7F suite | 28/28 passed |
| Full repository suite | 469/469 passed across 451 subtests |
| Aggregate synthetic journey | Passed |
| Diff whitespace check | Passed after normalizing four new-file endings |
| Real filesystem use | None |
| Process or service start | None |
| Network or provider call | None |
| Model call or download | None |
| Protected/private data access | None |
| Production change | None |

The retained aggregate result is
`gate7f/evidence/GATE7F0-SYNTHETIC-RESULTS-2026-08-26.json`. It covers read-only denial,
ask-every-time preview, exact approval, restart replay, separately governed rollback, and safe-autopilot
execution in the synthetic environment.

## Defects found during verification

The task-isolation test found that a task-filtered audit summary excluded another task's event categories
but still reported the repository-wide event count. That count was an avoidable cross-task metadata leak.
The adapter now computes the count from the same participant/task-filtered event set as every category,
and the adversarial test passes.

Receipt-validation failure was also tested beyond the planned simulated failure switches. If receipt
construction or recording rejects after a synthetic effect, the executor restores the prior state and
the proposal becomes a typed failure rather than leaving an unrecorded deed.

## Architecture decisions confirmed

- The existing Runa propose -> preview -> approve -> execute -> record pathway is reused, not replaced.
- Approval profiles are deterministic prior authority over a closed registry, not model-controlled trust
  levels.
- PostgreSQL remains the selected production record/idempotency authority and LangGraph remains the
  selected workflow/checkpoint authority; the memory adapter is evaluation infrastructure only.
- Cloudflare Sandbox SDK lifecycle guidance was reviewed, but a cloud executor was not introduced. The
  approved estate is local/Windows and already has the measured MXC/QuickJS sandbox boundary.
- Gate 7F-0 adds no browser or chat wiring. It therefore requires no customer test and cannot affect the
  active Control release.

## Remaining boundary

This result does not authorize a real workspace adapter, real code execution, Git, packages, terminal,
network, deployment, a model change, or any customer-facing approval profile. The next stage is Gate
7F-1 preregistration: seal an exact Gemma candidate, incumbent candidate, runtime parameters, evaluation
corpus, metrics, and acceptance thresholds against this inert workload. Downloading or running a new
model remains a separate protected boundary after preregistration.
