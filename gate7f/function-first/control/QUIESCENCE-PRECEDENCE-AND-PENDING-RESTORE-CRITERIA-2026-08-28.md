# Quiescence precedence and pending-restore correction

Prospective criteria, 2026-08-28. This is an operator-only correction to
`271193b`; no production activation, model call, campaign source/seal change or
historical regrade is included. M1-S2 / C12 C15 C16, roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
All 17 roadmap families remain tracked independently.

## Retained counterexamples

Independent review retained `independent-quiescence-review-271193b/` outside the
checkout, with original coordinator SHA256
`4b3ff070c684ae55a7b0a852c4e9bcc266405643a4d0c0b1b3dddbaa60a86221`
and reproduction-result SHA256
`6a4e2c3a72caef4281a0150c541f7ca7fa3eb3fa3a5f65142502daf1923ed2f7`.

1. Actual pinned Caddy 2.11.4 offline adaptation sorts an existing
   `handle /v1/chat/completions` before a named maintenance `path *` handle.
   Inserting that handle at the start of the file does not close that route.
2. A modeled restore request times out before committing. Read-back still sees
   the overlay; reconciliation incorrectly labels it admission-closed, and a
   zero-counter drain labels it quiescent. The same pending restore can later
   commit the original configuration and reopen admission. The existing phase
   alone loses the unresolved mutation's direction.

Previous simple-route/slow-request proofs remain valid only for their recorded
fixtures. They do not pass these counterexamples retroactively.

## Required implementation and evidence

- The selected site's maintenance handler must precede every original HTTP
  handler under Caddy's actual adaptation, including specific-path `handle`,
  `handle_path` and `route` constructs. Preserve the original handlers and their
  normal inner ordering, unrelated sites, authentication/static behavior and
  exact original bytes for rollback. Use one literal outer `route` with the
  maintenance response first and an inner normally sorted original-handler
  group. Reject unsupported/interleaved site-level grammar before effects.
- Persist each exact admin mutation's unique ID, admission/restore direction,
  expected ETag, source/target configuration digests and unresolved/terminal
  status before dispatch. A snapshot is not terminal evidence for an earlier
  request. No drain, rollback, second mutation or quiescent receipt while the
  same request is unresolved, even if either known configuration is visible.
- Reconciliation requires a terminal result bound to that exact mutation, or
  remains `needs-reconciliation`. A successful late restore can only finish
  exact restoration; it cannot become admission-closed. Missing terminal proof
  after a client timeout or process restart remains unknown, without a replay.
- Stale state and concurrent operator calls must not bypass an unresolved newer
  journal revision. Journal writes require atomic expected-revision comparison;
  a restarted coordinator re-reads the latest owned revision. This is an operator
  journal, not a new product-data authority. No old v1 state silently gains v2
  authority.
- Negative tests cover both directions, before/after-commit lost replies,
  delayed restore, mismatched terminal ID/digests, restart, stale-state drain,
  concurrent calls, failed persistence and a real rejection. Existing file/ETag
  drift, output/deadline bounds and counter checks must remain strict.
- Run new isolated actual Caddy proof with the specific provider route, real
  backend request counts, an in-flight request, preserved unrelated/auth/static
  routes, exact rollback and cleanup. Exercise a delayed real admin HTTP request
  with a retained terminal result separately from deterministic fault fixtures.
  An unobserved result cannot be inferred from a later configuration snapshot.

The coordinator still proves only selected Caddy-proxied requests, with
`homeQuiescenceProved: false`. Home LAN/local callers, runtime changes, TLS and
the existing successor deployment remain separately governed and unactivated.
