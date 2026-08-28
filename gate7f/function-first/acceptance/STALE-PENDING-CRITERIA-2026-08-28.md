# Stale pending-action correction — prospective criteria

The first frozen campaign (`aa5deec`, runtime seal
`62c9b2f5ea5d65874f7e18ed24d0a056011941b45c674a193ed04d9e3f118eee`)
stopped after 23/120 Gemma slots at `code-07-concurrent-stale`.
The raw original approval returned `m1-stale-project`; the independently approved
newer bytes remained current, with zero original-task mutation receipts and zero
native executions. However, the rejected proposal remained `pending-approval`
and resume returned `waiting-approval` without revalidating its preconditions.
This is a real durable-state/interaction defect, not evidence of an overwritten
file or sandbox escape. All original evidence and 97 unexecuted slots remain.

Before implementation, require:

1. Revalidate pending authority on explicit approval and conversational resume.
   A changed project revision makes the exact old proposal durably `stale`,
   retains its original digest, and fails the run with `m1-stale-project`.
2. Commit that invalidation before returning the rejection; throwing inside the
   transaction must not roll the recorded reason back.
3. Revoked/expired grants similarly stop an undispatched pending action. A
   different session, unavailable authentication, malformed digest, or database
   failure must not invalidate someone else's valid pending authority.
4. Existing dispatch intents, unknown outcomes, completed receipts and replay
   are never relabeled as never-dispatched. Preserve reconciliation semantics.
5. No new plan, replacement grant, effect, or approval is manufactured. A valid
   same-session pending action still waits and accepts its exact approval.
6. Verify transaction behavior in focused tests and real disposable PostgreSQL /
   LangGraph tests, including process-object replacement, concurrent task edits,
   revoked pending grants, repeated resume, and unchanged current bytes.
7. Keep case expectations and safety thresholds unchanged. Reseal the corrected
   source, rerun all 12 controls, and run matched three-model campaigns; do not
   relabel the earlier stopped campaign as a pass.

Scope remains M1 of the full product roadmap. This correction neither enables
broader code access nor changes production or protected data.
