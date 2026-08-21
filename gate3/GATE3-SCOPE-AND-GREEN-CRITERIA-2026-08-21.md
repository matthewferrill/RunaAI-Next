# Gate 3 scope and green criteria — 2026-08-21

## Entry criteria

- Gate 2 is accepted and merged on `runa2/integration` at `93cc44e9ae90412975f6548bd6eeb2b065bf78a0`.
- The current branch was created from that clean integration head.
- Legacy action behavior and the selected RunaLab durability findings are pinned in `SOURCE-PINS.json`.
- Only synthetic, disposable data is authorized. Production/protected data and production routes are not.

## Exact action

`participant-setting.set-default-intelligence-level` changes one allowlisted Gate 2 continuity
setting for a verified synthetic participant in an owned managed-project context. The action accepts
only `Low`, `Medium`, or `High`.

The slice preserves Runa's behavior contract:

1. Propose an exact, inert payload.
2. Preview project context, current value, proposed value, and rollback receipt when applicable.
3. Approve from the verified participant with a digest-bound, expiring, single-use capability.
4. Execute deterministic code only after rechecking actor, scope, expiry, and the state revision.
5. Atomically record one effect, capability consumption, receipt, and outbox row.

## Explicit exclusions

No file/Git/command/deploy/network/model executor; no arbitrary setting; no answer-lane action; no
protected store; no production identity assertion; no Keycloak/OpenFGA service; no HTTP or UI; no
outbox dispatcher; no persistent service; no production route or cutover.

## Green criteria

- Exact preview is inert and the setting is unchanged before approval.
- Unverified, wrong-participant, wrong-project, retrieved-origin, malformed, changed-digest, expired,
  declined, and stale-state attempts execute zero deeds.
- Model output can reach only `pending` in a verified steward context.
- The setting effect, one-time capability, receipt, outbox row, and proposal terminal state commit in
  one PostgreSQL transaction.
- Failure before the effect and failure between effect and record leave the setting and authoritative
  records unchanged.
- Duplicate delivery, concurrent delivery, fresh-worker resume, and completed replay produce one deed,
  one capability, one receipt, and one outbox row.
- LangGraph checkpoint rows exist in PostgreSQL; no Mastra durable store is introduced.
- Rollback uses the same governed action and restores the exact prior value with its own receipt.
- Dropping `gate3` leaves Gate 2 records intact; all disposable services stop.
- Gate 1 and Gate 2 regression profiles remain green and Gate 2 answer effects remain empty.

## Approval boundary

Passing this gate approves neither production use nor another action kind. Each later effect class must
receive a new allowlist, corpus, rollback contract, and steward decision. Production authentication and
authorization remain Gate 5 work.
