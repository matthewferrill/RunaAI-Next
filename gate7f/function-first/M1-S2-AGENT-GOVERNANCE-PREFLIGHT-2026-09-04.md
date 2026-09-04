# M1-S2 Agent-governance preflight — 2026-09-04

## Result

The contextual Agent governance implementation is **GO** at P0=0/P1=0 after fresh independent review.

Agent remains a governed task state inside Code, not a separate top-level experience. Every consequential Agent action consumes a task-scoped authority digest inside the same authoritative transaction before its first write. The digest covers the task, project, grants, proposals, intents and runs. Agent run start/resume reserve the active window under that compare-and-set boundary and internal work uses server-only exact run/window authority. Once an Agent run exists, raw mutation/resume surfaces fail closed.

The browser projection exposes only authoritative, same-transaction approvable proposals and revocable grants. Ask-every-time proposals remain pending until exact approval. Explicit revocation invalidates the grant before effect, and stale rendered authority cannot create, revoke, propose, approve, execute or resume.

The first independent review stopped the implementation at P1=2 because a browser read-then-mutate path remained susceptible to a time-of-check/time-of-use race and the projection had removed truthful ask-every-time approval/revocation controls. Those findings were corrected before this review.

## Verification

- Focused deterministic tests: 54/54 passed.
- Eleven JavaScript syntax checks passed.
- Scoped diff validation passed.
- Adversarial interleaving produced zero records, adapter effects, planner calls, workflow calls or active windows.
- Fresh independent review: GO, P0=0/P1=0.

No DOM/browser, PostgreSQL, model, Control, production or customer operation ran. These deterministic checks are preflight evidence only.

## Next boundary

The separate browser fixture may now be updated and reviewed. Real-PostgreSQL concurrency and an actual browser journey remain independent acceptance gates.
