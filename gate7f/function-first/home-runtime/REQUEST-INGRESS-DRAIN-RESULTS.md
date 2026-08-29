# Request-ingress drain hardening results

Date: 2026-08-29

This result applies only to the prospective selected M1 private proxy and the
separate legacy compatibility adapter. No Home or Control listener, route,
model, credential, production configuration or live service was changed.

## Correction

- The selected proxy now obtains its existing privileged admission ticket
  after client/header checks but before awaiting the body. Its body reader is
  bound to both client/deadline cancellation and lifecycle ticket revocation.
  Validation still precedes upstream dispatch. Malformed complete bodies retain
  that counted ticket through denial, make zero upstream calls and release it in
  the same `finally` boundary.
- The legacy adapter now issues a single-use ingress lease before its server
  awaits a body. The durable close count includes that lease, so close cannot
  publish zero samples while an incomplete accepted body remains.
- The legacy binding pins `bodyMs` from 100 through 10,000 ms. On expiry the
  wire returns a bounded typed 408 with `Connection: close`, allows at most
  100 ms to flush, destroys the exact request and releases the ingress lease.
- Duplicate/released ingress use, disconnect, declared overflow, post-close
  dispatch and native upstream access from denied requests fail closed.

## Evidence

Focused local tests passed 47/47 with zero skips. They included:

- an actual ten-second selected incomplete-body 408;
- selected lifecycle revocation while the body was incomplete;
- actual disposable mutual-TLS legacy chat, embeddings and discovery;
- actual legacy disconnect and declared-overflow cleanup;
- actual legacy close racing an incomplete body and waiting for its 408/release;
- durable close/restore, unknown-result, hardlink and protocol regressions.

The broader Home-runtime suite passed 179/180 in the restricted environment.
The sole failure was the existing Windows ScheduledTasks CIM access check
(`New-ScheduledTaskSettingsSet: Access denied`); all transport/runtime tests in
that run passed. The already-retained elevated suite is separate evidence and
was not rewritten or reinterpreted by this change.

The managed five-scope validator's all-three-sample freshness hardening is an
independent companion change owned by the semantic reviewer. This commit does
not duplicate it. Both changes are required before a live transition package
can be sealed.

These tests prove bounded ingress accounting and transport cleanup only. They
do not confer model-quality qualification on the legacy request set and do not
authorize activation.
