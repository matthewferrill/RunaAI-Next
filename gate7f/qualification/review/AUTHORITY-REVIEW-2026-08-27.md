# Independent authority implementation review

Reviewed final commit: `4b0c2ef0cf6eb7093a0c4b55379c03ec90e72dc3` in the clean isolated authority
worktree. Files: `authority.mjs`, `authority.test.mjs`, `AUTHORITY-ADAPTER.md` under
`gate7f/qualification/`. No review edits were made to those files.

## Outcome

No remaining blocking finding was identified within the **exact-argument, inert synthetic boundary**.
The earlier origin-laundering and stale-deny cases are covered by application-created grants and
effect-time checks. All **33/33** focused tests were independently rerun and passed.

This is not approval for real filesystem execution, arbitrary generated source, deployment, or an
authentication endpoint. The application port, grant issuance, test fault controls and snapshots must
remain trusted server/test operations. The documentation accurately preserves those limitations and
the PostgreSQL/LangGraph durable-authority direction.

## Additional defect found and resolved during review

The initial adapter settled a completed receipt by adopting the repository's *current* revision.
Asynchronous receipt delivery allowed a second newly issued grant to change that repository first.

Independent in-memory reproduction:

1. Submit grant A's permitted synthetic change.
2. Yield two JavaScript microtasks; A has changed the workspace to revision 2, but has not settled.
3. Issue grant B from revision 2 and submit its permitted change.
4. Await both operations. The workspace becomes revision 3.

Before correction, A also recorded expected revision 3, silently absorbing B's intervening state.
After correction, A adopts only its own valid effect receipt's revision 2 and becomes stale against
the actual revision 3. Subsequent A work must be reauthorized. The implementation agent retained this
exact failing-before/passing-after regression as a test.

Settlement now uses each valid effect receipt once (`settledReceiptId`). Another regression proves
that replaying an older receipt does not move the grant backward after a newer permitted own effect.
Receipt validation also binds capability/output kind, before-state digest and effect revision.

## Reviewed properties

- Participant/project/session/environment and task bindings originate at the application port.
- The model port accepts only request ID and typed proposal, copying arguments before queueing.
- Exact argument alternatives and every affected path are checked, including verification assertions
  and receipt-resolved restore paths.
- Current policy, grant revision/revocation/expiry, active task, exact proposal binding and workspace
  revision are checked at the actual synthetic effect boundary.
- Duplicate, restart, interruption and rollback tests preserve one deed/one receipt.
- State projections read real synthetic receipts; missing, invalid and failed-verification records
  cannot become successful execution solely because a proposal/model says so.

Remaining limits are explicit, not test failures: no arbitrary-intent recognition, no real executor,
no new durable store, no authentication implementation, and no safety proof for arbitrary content
inside a generally writable path. Exact predeclared arguments close the demonstrated bounded attack;
they do not establish unrestricted Agent Mode readiness.

All review reproduction and tests were offline and in memory. No Home/Control access, model call,
private record, or actual project file mutation was involved.
