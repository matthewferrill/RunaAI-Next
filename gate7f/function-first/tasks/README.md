# M1 durable project tasks

This is the M1-S2 implementation of the previously frozen real-function contract, not completion of M1
or production qualification. It is side-by-side with the old synthetic Gate 7F core. It uses only
generated, non-private candidate projects; private payload encryption/retention is not established here.

## Composition API

`PostgresTaskStore({pool, schema = "runa_m1"})` has additive `initialize()` and no drop/reset operation.
`M1TaskService({store, adapter, now})` uses the project's `DisposableJavascriptProjectAdapter`.
`createM1TaskWorkflow({service, checkpointer})` receives a real PostgreSQL `PostgresSaver`; checkpoint
progress is not an authority substitute. Every call takes fresh server-derived
`{principalId, projectId, sessionId}`. Never derive that tuple from planner/source/browser payloads.

- `registerProject(context, {environmentId, files: {"index.js": "exports.add=(a,b)=>a+b;"}})` creates an
  immutable fixture and registers its PostgreSQL revision. Re-registration must match exactly.
- `currentProject(context)` returns authoritative reference and revision.
- `createTask(context, {requestId, objective})` is scope-idempotent.
- `createGrant(context, {taskId, profile, allowedPaths, allowedSuites, expiresAt, capabilityIds?})` creates
  an exact versioned grant and revokes previous active grants for that task. Profiles are `read-only`,
  `ask-every-time`, and `safe-autopilot`; expiry is at most 24 hours. A new authenticated session can read
  the task but must receive a fresh application-issued grant before new work.
- `propose(context, {taskId, grantId, grantRevision, requestId, capabilityId, arguments})` stages exact
  work; it never executes. `bindModel(context, {taskId, grantId, grantRevision})` exposes only a proposal
  port, not authority issuance, approval, cancellation or receipts.
- `approve(context, {proposalId, proposalDigest})` records exact approval; `execute(context, {proposalId})`
  executes or reconciles. The caller may execute automatic proposals, and must pause for ask-profile
  approvals. `workflow.run(context, {proposalId}, {resume})` wraps this with durable LangGraph checkpoints.
- `reconcile(context, {proposalId})` observes uncertain effects without repeating them.
- `cancel(context, {taskId})`, `revokeGrant(context, {grantId})`, and `status(context, {taskId})` are trusted
  application ports. `restore(...)` is a convenience proposal for `project.restore`, not a bypass.

Capabilities are `project.inspect {path}`, `project.preview-change` and `project.apply-change
{path, content, expectedSha256}`, `project.run-tests {suiteId}`, and `project.restore {receiptId}`.
The last resolves an exact owned forward receipt server-side; clients cannot supply a revision reference.
Paths are flat lowercase JavaScript filenames, maximum four files/4,000 project bytes. Tests are selected
only from application-registered suites; no arbitrary shell, test command, dependency, network or host path.

## Durability and honest recovery

PostgreSQL owns task, grant, proposal, dispatch intent, receipt, audit, outbox and the current project
revision. Scope locks serialize authority updates; a PostgreSQL operation lock prevents concurrent
dispatch of one proposal. The immutable byte adapter only stages revisions. Publication changes the
authoritative pointer and records the receipt/outbox in one transaction. A failed transaction cannot
publish the staged bytes. Old versions are preserved, including after restore.

Before dispatch and again before publication, the application validates scope, active task, exact
capability-set digest/version, grant revision/session/expiry/revocation, exact arguments, approval and
current project version. The pinned version includes the limits, so future executors/limits cannot
silently expand old grants. Test results must match the prepared suite and source revision.

On restart an existing intent never triggers another blind execution. An existing receipt is replayed.
An immutable staged revision can be read and published only if its original authority remains valid.
Missing staging is recorded as not published. Lost test output remains **unknown**, because neither
source code nor an LLM's prediction proves execution. A new intentional test is a new request, not a
replay of the uncertain request. Historical receipts are distinguished from the current project revision.

Cancellation immediately revokes subsequent authority. An already-started Gate 7E sandbox has no
immediate kill API in this slice: it drains within the unchanged 1.2-second QuickJS/2-second process
ceilings. Display **Cancellation requested — finishing bounded sandbox step** until the bounded result
is observed. Preserve that real receipt with cancellation/revocation annotations; do not call it killed
or erase execution evidence. No project revision is published after cancellation/revocation wins the
authority lock. Source staging that never became current is not represented as a published edit.

## Verification boundaries

`node --test gate7f/function-first/tasks/contracts.test.mjs` exercises the closed contract.
Set `M1_TASK_PG_URL` to an owned disposable PostgreSQL instance, then run
`node --test gate7f/function-first/tasks/postgres.test.mjs` for real database authority, transaction,
duplicate, revocation, cancellation, restore and fresh-process LangGraph checkpoint recovery checks.
These executor doubles are explicitly not filesystem or sandbox proof. The separate real-project
integration uses actual immutable files and the retained Gate 7E executor. Root owns the disposable
PostgreSQL lifecycle; these tests never stop it or access a production/private database.

This module does not implement the authenticated HTTP/UI adapter, model planner, matched three-model
qualification or steward customer trial. Root composes those; no module test is M1 completion evidence.
