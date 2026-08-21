# Gate 3 results — 2026-08-21

## Outcome

The bounded Gate 3 implementation is green and ready for steward review. It ports one reversible,
governed, idempotent action without widening Gate 2's read-only routes.

## Evidence

- Contract suite: **26/26 passed** with `node --test gate3/gate3.test.mjs`, including allowlisted,
  pseudonymized action telemetry.
- Disposable PostgreSQL/LangGraph integration: **16/16 checks passed**.
- Fresh-worker sequence: commit followed by simulated response loss, resume, workflow replay, direct
  replay, and concurrent replay all returned the same receipt with one deed.
- Forward action: `Medium → High`; governed rollback: `High → Medium`.
- Final authoritative counts before schema rollback: 2 executed proposals, 2 capabilities, 2 receipts,
  2 outbox rows, and 6 LangGraph checkpoint rows.
- Failure injection before the effect left `High` unchanged; injection after the database update but
  before record completion rolled the transaction back to `High`.
- A stale proposal was denied after the setting revision changed.
- A structurally valid but digest-mismatched stored proposal was denied before execution.
- All three injected/denied execution outcomes were retained as terminal failed proposals and
  PostgreSQL attempt records; execution successes remained represented by receipts.
- The harness dropped only `gate3`, retained Gate 2 and the restored `Medium` setting, then stopped
  PostgreSQL cleanly.
- Regression profiles passed: Gate 1 integration **25/25**, Gate 2 integration **21/21**, the full
  inherited Node profile **74/74**, all **10/10** seals, and all **12/12** pinned legacy focused suites.

Machine-readable evidence is in `evidence/STUB-INTEGRATION-RESULTS.json`.

## What this proves

The selected PostgreSQL/LangGraph pattern can preserve Runa's exact preview, explicit approval,
stale-state defense, deterministic effect, durable receipt, restart safety, and governed rollback for
one database effect. PostgreSQL, not workflow snapshots or model output, is effect authority.

## What remains unproved and inactive

The verified participant is synthetic; production Keycloak/OpenFGA and Windows-bound owner ceremonies
remain deferred. Outbox creation is proven, but delivery is intentionally absent. There is no HTTP/UI
surface, production data, persistent service, network/model call, or additional executor. This result is
not production approval and not permission to begin Gate 4.
