# Prospective plan-reference correction — 2026-08-28

## Finding and boundary

The frozen `9556ed01f9dbabe8c93eea309e482aad60bf809f` comparison has not changed.
Qwen's Code 08 and Agent 08 first repetitions inserted an immediate
`project.restore` with a made-up future receipt ID into a request to **preserve**
an undo receipt. The service correctly rejected the nonexistent receipt, but
earlier permitted changes and tests had already run. The test harness later
performed its separate exact-owned restoration. That does not establish that
the model's original plan completed correctly.

This correction is application-wide, not a model-specific answer patch. It does
not change the frozen cases, scores, thresholds, budgets, or running model arms.
It requires a new source seal and fresh qualification before deployment.

## Acceptance criteria fixed before implementation

1. Before retaining a new plan or proposing its first action, validate every
   step's permitted paths/suites and all restore references against the current
   authoritative transaction. A known-invalid later reference must not allow
   earlier actions to start.
2. A restore may name only an actual scope-filtered receipt supplied to this
   planning attempt, with service-verified integrity, ownership, rollback target,
   current revision, and permitted changed paths. Never resolve a placeholder,
   guess an ID, or substitute the latest receipt for the model.
3. A restore referring to the current revision cannot follow an earlier planned
   revision mutation: that mutation would make the supplied receipt stale.
   Reject the whole plan before dispatch. Read-only steps and tests do not by
   themselves invalidate that reference.
4. A changed project snapshot or authority during planning must stop the plan
   before dispatch. Per-proposal authorization and stale-revision checks remain
   in force at execution; preflight is not execution permission.
5. Tell every planner, identically, that published edits automatically retain
   application-owned undo evidence. Keeping an undo option is not a request to
   execute restoration. Do not add immediate restoration unless requested and
   backed by a supplied, already-recorded receipt.
6. Preserve one provider attempt for this planning call, existing repair/action
   budgets, exact approval profiles, cancellation, restart, and receipt truth.
   Do not turn arbitrary model summaries into verified completion claims.

## Validation and rollback

Run real disposable-PostgreSQL orchestration tests with deterministic model and
executor fixtures: invented, foreign, corrupt, stale, out-of-grant, and
future-invalidated restore references; a valid owned restore with exact approval;
an ordinary edit/test that retains undo without restoring; and replay after a
rejected plan. Verify zero new proposals/effects for rejected plans. These tests
prove application behavior, not model compliance. Then run shared regression and
fresh actual-model qualification under a new seal.

This is additive validation and planner guidance, with no store rewrite or
production activation. Rollback is a reviewed code revert before deployment, or
the separately verified immutable-release rollback after deployment. Retain the
original diagnostic evidence either way.
