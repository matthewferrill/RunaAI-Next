# Independent request-ingress and legacy-boundary review

Reviewer: `codex-independent-model-role-review-20260828`, acting as a fresh
independent reviewer and as the author of neither the frozen criteria nor the
reviewed implementation.

## Scope

The review started from integrated commit
`7f5533f06164cc86cf50641a40d7ef337bd01745`, with criteria commit `1ba2f54`,
ingress implementation commit `5e28faf`, and the selected-proxy response-flush
correction represented by `7f5533f` (equivalent change to `d628bfc`). It covered
the selected request boundary, the legacy compatibility boundary, lifecycle
revocation, fixed body deadlines, exact source/TLS/caller binding, the unchanged
M1 request guard, and durable close/restore recovery. No live service, route,
model, certificate, or production state was read or changed by this review.

## Finding and correction

The one-line response-flush correction is necessary and safe, but was not
sufficient on its own. If a client supplied another body chunk after the typed
408 began and before the bounded 100 ms close, the default async iterator could
destroy the request on abrupt loop exit. That could close the socket before the
response-flush interval elapsed. Reverting the one-line correction while the
new regression is present also deterministically fails because the outer catch
destroys the already-started response.

Both selected and legacy body readers now use
`req.iterator({destroyOnReturn:false})` when available. They explicitly destroy
the request on every non-timeout read failure. A body timeout whose typed reply
was accepted is instead closed only by its existing exact 100 ms timer. This
does not extend a deadline, accept a request field, add a retry, or alter the
request contract.

Two deterministic regressions inject a body chunk inside the flush window. They
prove that no upstream dispatch occurs, the counted request is released once,
the response is not destroyed early, and the exact request is destroyed at the
bounded close. The legacy regression exercises the same reader invariant with
the legacy typed-timeout callback.

## Boundary conclusions

- Selected admission is still acquired before body consumption and released in
  `finally`; lifecycle revocation still interrupts non-timeout reads
  immediately.
- The selected deadline remains the fixed `RUNTIME_LIMITS.bodyMs`; the legacy
  deadline remains the validated, digest-bound `limits.bodyMs`. Request data
  cannot override either value.
- The M1 scored guard in `home-runtime/contracts.mjs` is unchanged. Retained
  actual Mastra/Nomic/BGE request shapes and 23 synthetic wire projections
  continue through that guard without widening it.
- The legacy server still requires the exact TLS 1.3 peer certificate pin and
  source address before acquiring ingress, and dispatches only through its
  fixed adapter.
- Create-only/hash-linked journal recovery, unknown-effect fail closure, exact
  inverse receipt binding, and reverse-order restore are unchanged.
- Historical evidence and qualification claims are unchanged. This is an
  offline repository correction, not activation or production proof.

## Verification

Serial focused boundary set: **77/77 passed**.

```text
node --test --test-concurrency=1 gate7f/function-first/home-runtime/body-timeout.test.mjs gate7f/function-first/home-runtime/runtime.test.mjs gate7f/function-first/home-runtime/worker-controller.test.mjs gate7f/function-first/home-runtime/admission-broker.test.mjs gate7f/function-first/control/deployment/legacy-body-timeout.test.mjs gate7f/function-first/control/deployment/legacy-compatibility.test.mjs gate7f/function-first/control/deployment/legacy-wire.test.mjs gate7f/function-first/control/deployment/managed-callers.test.mjs
```

Exact TLS, source-pin, guard, and wire-shape set: **16/16 passed**.

```text
node --test --test-concurrency=1 gate7f/function-first/home-runtime/tls-proxy.test.mjs gate7f/function-first/home-runtime/wire-shapes.test.mjs gate7f/function-first/control/deployment/wire-fixture.test.mjs
```

The raw-byte pin for `home-runtime/proxy.mjs` is updated to
`f4c6f6f9fbf092633aaf1b2338ce53ab31e23a9f668545b12e161c3316703a18`;
the exact source-pin test passes with that byte sequence. `git diff --check`
also passes.
