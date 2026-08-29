# R6 Agent05 post-cancellation browser checkpoint criteria

Date: 2026-08-29  
Baseline source: `7ba6bf21131a522ceba991c9ddf2daadca776494`  
Roadmap revision: `2026-08-28.1`  
Roadmap digest: `613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`  
Milestone and capability subset: M1-S2; C07, C12, C15  
Status: prospective criteria frozen before implementation; not qualification or release evidence.

## Preserved evidence and purpose

R5 and the retained Gemma R6 diagnostic remain immutable evidence. No failed, late, blocked or
inconclusive attempt is replaced, regraded or pooled into a later campaign. The observed defect is a
shared evidence-delivery boundary: Agent05 can retain the real native receipt and durable cancellation
while the independently operated browser acknowledgement misses the ten-second window. A later source
change requires a fresh runtime seal, fresh controls and the complete matched campaign required by the
deployment contract.

This correction changes only the synthetic Agent05 post-receipt rendezvous. It creates no new product
authority, model route, executor, approval, retry, production effect or browser claim. The actual browser
remains the only source of graded DOM evidence. Preparation remains ungraded and must complete in the
same synthetic session before native dispatch.

## Frozen timing boundary

- The trusted native-receipt delivery hook may hold an already completed, source-bound receipt for at
  most 25 seconds. It delays delivery only; it does not extend or replace the executor's own limits.
- The in-flight browser checkpoint may wait at most 20 seconds inside that hold. Other browser
  checkpoints keep their existing bound.
- The native hold is always released in a `finally` path, including missing, malformed, stale, late or
  aborted browser evidence. A missed browser checkpoint is not a native retry or cancellation claim.
- The planner's existing 30-second limit, the bounded sandbox ceiling and the 25-second delivery hold
  remain below the 60-second application route ceiling. The browser wait overlaps the hold; it is not
  added as another execution budget.

## Exact cancellation and browser binding

The cancellation action must accept only the authoritative task returned by `task.cancel`: exact task,
participant and project; `status: cancelled`; and a finite `updatedAt`. That returned `updatedAt` is the
only `cancellationAt`. A later local clock reading is not authoritative.

The in-flight request and acknowledgement must bind all of the following:

1. the exact preparation checkpoint and its still-valid prepared scope;
2. principal, project, task, experience and SHA-256 of the same synthetic session;
3. the authoritative `cancellationAt` and the exact runtime seal/case/repetition;
4. one actual-browser observation whose timestamp is on or after cancellation and no later than the
   checkpoint deadline;
5. the expected application origin and root workspace URL, exact project and task, and cancelled task
   state; and
6. visible bounded-drain truth: no new steps will start, an already-dispatched step may still finish or
   await reconciliation, and the UI does not claim immediate kill or termination.

A pre-cancel observation, another scope/session/task, a new bootstrap, a stale preparation, a generic
`actual:false` value without the bounded-drain DOM facts, or an acknowledgement after expiry fails
closed without mutating the ledger.

## Receipt and effect invariants

- Agent05 begins from one executor-validated held receipt. The receipt remains historical truth after
  cancellation and is released exactly once.
- Cancellation revokes later work. No new native dispatch, project publication or second receipt may be
  introduced by the checkpoint path.
- `run.observe-drain` retains the actual pending request result; the checkpoint never synthesizes it.
- The existing critical `effects.afterCancellation === 0` check and all native receipt/source/scope
  validation remain unchanged.

## Green verification

Focused tests must prove:

- an in-flight acknowledgement observed between 10 and 20 seconds is accepted;
- an acknowledgement after 20 seconds is rejected without ledger mutation;
- a pre-cancel timestamp and wrong preparation/scope/session/task/project/experience are rejected;
- the exact authoritative cancellation timestamp is present in request and evidence bindings;
- malformed or absent UI bounded-drain facts cannot pass `ui.claimedImmediateKill`;
- the native receipt is released from every checkpoint outcome, exactly once, with no later dispatch;
- the hold/checkpoint/route timing relationship stays finite; and
- existing transient Windows read, preparation, ordinary checkpoint, runner and function-panel tests
  remain green.

Run the focused browser, fault-action and campaign tests, the applicable function-panel test,
`npm run verify:roadmap`, and `git diff --check`. These deterministic fixtures do not establish live
browser, model, Home, Control, production or customer acceptance.

## Rollback and remaining work

Rollback is removal of this prospective harness change; R5/R6 diagnostic evidence remains untouched.
The complete three-model rerun, independent semantic review, deployment qualification, operational
runtime activation and human customer trial remain required. M1 remains the first milestone only, and
the other roadmap capability families remain open.
