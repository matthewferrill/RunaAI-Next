# M1 durable project tasks

This is the M1-S2 implementation of the previously frozen real-function contract, not completion of M1
or production qualification. It is side-by-side with the old synthetic Gate 7F core. It uses generated,
non-private candidate projects for its tests. Candidate composition must provide the core envelope cipher;
project/task/grant/proposal/intent/receipt/run JSON is encrypted with participant/project/kind/record-ID
binding. Only IDs and digests remain public. Plaintext is rejected unless an explicit
`allowPlaintextForSynthetic: true` option is supplied by a synthetic fixture. Encryption does not by
itself establish broader private-project retention, deletion or production qualification.

## Composition API

`PostgresTaskStore({pool, cipher, schema = "runa_m1"})` has additive `initialize()` and no drop/reset operation.
`M1TaskService({store, adapter, now, authorizeContext})` uses the project's `DisposableJavascriptProjectAdapter`.
The required `authorizeContext(context)` hook must return `true` or `{allowed:true}` after validating the
current ordinary session and project ownership. Missing/expired/offline authority fails closed; only
explicit synthetic fixtures may use `allowSyntheticAuthority:true`. This hook runs before dispatch,
before revision publication and in cooperative cancellation checks. It does not erase a receipt for an
already-dispatched bounded test when the user logs out.
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
- `listTasks(context)` returns `{tasks:[...]}` with at most twenty recent, scoped summaries.

## Conversational orchestration

`M1TaskOrchestrator({service, planner, workflow, budgets?})` receives the same service, its checkpointed
workflow, and `planner.plan({objective,snapshot,receipts,previousPlans,repair,allowedPaths,allowedSuites,
capabilityIds,signal})`. The planner returns strict data: `{summary,steps:[{capabilityId,arguments}]}`.
No model-supplied approval, receipt, completion or runtime instruction is accepted. Initial maximums are
six steps/plan, two plan attempts (one repair), twelve actions, 120 seconds/planning call, five minutes
active work and one hour run age. Callers may narrow, not widen, these limits.
The model sees only grant-selected file contents, not the full immutable reference or other paths'
historical content. Execution authority and the complete revision remain application-owned.

- `start(context,{taskId,grantId,grantRevision,requestId})` plans and advances through ordinary authority.
- `resume(context,{runId})` continues a persisted run. Ask-profile work pauses for exact service approval;
  approving a proposal then resuming advances it without a fresh model-issued authority decision.
- `status(context,{runId})` returns `{run,task,project,proposals,receipts,pendingProposal,pendingReconciliation}`.
- `list(context)` returns `{runs:[...]}` with at most twenty scoped summaries for reload/login recovery.
- On explicit user Continue after login/profile change, the application creates a fresh grant and calls
  `resume(context,{runId,grantId,grantRevision})`. This revokes old pending work and plans afresh; it does
  not transfer old approvals to a new session/profile. Existing plans/receipts remain historical and
  budgets do not reset. Any unknown old effect first requires reconciliation and blocks new actions.

Run/plan/step IDs, exact proposal and receipt references are durable/encrypted PostgreSQL records.
LangGraph checkpoints resume each effect through the same service. A lost acknowledgement is reconciled,
not retried as another mutation. A failed real test may request one repair from a fresh snapshot; another
failure stops. `outcome:"plan-completed"` means the governed plan completed, not that an LLM proved every
possible interpretation of the user's goal. Current test success is independently present in receipts.

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
These executor doubles are explicitly not filesystem or sandbox proof. Run `orchestrator.test.mjs` with
the same disposable URL for real PostgreSQL/LangGraph planning, approval, repair, encryption, login and
logout recovery. The separate real-project
integration uses actual immutable files and the retained Gate 7E executor. Root owns the disposable
PostgreSQL lifecycle; these tests never stop it or access a production/private database.

The completed isolated Control transport proof is retained in
`CONTROL-NATIVE-RESULTS-2026-08-28.json` and `RESULTS-2026-08-28.md`. Its six actual native scenarios
passed using a compact staged runtime and dedicated temporary source directory. `control-native-proof.mjs`
is intentionally restricted to an exact newly owned Control staging directory and a disposable database;
it must not be pointed at production storage or used to prepare existing production/ancestor ACLs.

This module does not implement the authenticated HTTP/UI adapter, a particular model provider, matched three-model
qualification or steward customer trial. Root composes those; no module test is M1 completion evidence.
