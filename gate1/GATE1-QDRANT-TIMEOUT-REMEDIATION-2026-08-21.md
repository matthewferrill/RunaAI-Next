# Gate 1 Qdrant timeout-classification remediation — 2026-08-21

Status: the steward approved this narrow remediation on 2026-08-21 after Gate 2 regression review.
Implementation and refreshed synthetic evidence were accepted under Gate 2B and merged into
`runa2/integration` with Gate 2 as `4c4767f` after separate Gate 2C approval.

## Layman summary

The request deadline and the Qdrant HTTP deadline were set to nearly the same instant. Usually the
outer request timer fired first and produced the correct `timeout` result. In one integration run,
Node's HTTP timer fired first and returned `TimeoutError` with numeric DOM exception code `23`. Gate 1
recognized only its own `request-timeout` code, so it mislabeled the bounded timeout as
`dependency-unavailable`.

The deadline still stopped the work, no model ran, no partial answer was delivered, and no data or
authority boundary was crossed. The defect was failure classification and test/monitoring stability.

## Root cause and reproduction

- Original observation: the first Gate 1 regression passed 24/25 integration checks; slow retrieval
  completed in 161 ms with `dependency-unavailable` and unavailable code `23`. The immediate unchanged
  rerun passed 25/25.
- Exact equal-deadline stress: 50/50 local synthetic repetitions returned the intended typed timeout,
  showing the losing timer order is uncommon under current scheduling.
- Causal reproduction: moving only the adapter timeout 20 ms ahead of the total request deadline
  reproduced the wrong classification 10/10 times.
- Direct adapter capture identified `{ name: "TimeoutError", code: 23, message: "The operation was
  aborted due to timeout" }`.

This establishes a low-frequency timer-order race with a deterministic error-normalization gap, not a
data, provider, model, Qdrant-content, or environment-configuration defect.

## Approved change

Only `QdrantDerivedIndex` HTTP requests are changed. The adapter now retains the exact
`AbortSignal.timeout` it created. If and only if that signal is aborted and `fetch` returns
`TimeoutError`, the adapter converts it to Gate 1's existing typed `request-timeout` error. Every other
error is rethrown unchanged.

The change does not alter deadline values, retries, provider calls, retrieval queries, ranking,
project scope, citations, storage, telemetry allowlists, effects, or network exposure.

## Regression evidence

- Gate 1 deterministic suite: 26/26 passed, including two new cases:
  - an inner Qdrant HTTP timeout must produce the typed timeout result; and
  - connection refusal must remain `dependency-unavailable`, not timeout.
- Gate 1 disposable selected-stack integration: 25/25 passed; the original slow-retrieval scenario
  reports the required timeout and all services stopped.
- Gate 2 frozen corpus: all 34 cases passed.
- Gate 2 disposable selected-stack integration: 21/21 passed; rollback and all service shutdowns
  remained clean.
- Full Gate 0 verification: 48/48 Node tests and 10/10 seals passed.

No live model, protected data, real project data, non-loopback listener, or persistent service was
used. Refreshed machine-readable integration evidence is retained under `gate1/evidence/` and
`gate2/evidence/`.
