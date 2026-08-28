# M1-S2 retained-conversation revisions and retry

Date: 2026-08-28. Follows the isolation and routing results in this directory.

## Contract and behavior

`readChat.turnCount` is the retained conversation revision. A signed-in answer
request may supply `contextRevision` as a nonnegative safe integer. The application
checks that expectation against the authoritative context before uncached provider
work; it never treats a client revision or history as retained authority. Internal
answer requests always use the store's actual revision.

The answer response includes `contextRevision` for application-backed requests.
It advances by one only when a complete answer was retained. Incomplete answers
leave the revision unchanged. Exact completed request-id replays remain idempotent
even when their original expected revision has already advanced; ownership and
archive status are still checked before returning the cached result.

PostgreSQL saves use an authenticated per-thread transaction advisory lock, plus
the existing row lock. This also serializes the first turn when there is no chat
row to lock. A changed turn count rejects the stale answer with
`conversation-revision-conflict`; no later turn is overwritten. The customer
should reload the chat while retaining the unsent message, then choose to retry
against its current revision. A changed request body needs a fresh request id.

Transient read-only answer failures remain bound to the same actor and input but
may be retried under the original request id. A later completed response replaces
the failed cached response, and later exact retries return that completion without
another provider call. This rule is limited to the `answer` operation with an
application `not-executed` stamp and empty effects; it does not retry actions or
uncertain effect outcomes. Revision-bound requests do not use an inner stale
answer cache as conversation authority.

## Evidence

The focused context/revision/routing/application/navigation tests passed 68/68.
The full repository test command completed successfully.

The actual standalone disposable PostgreSQL runner passed 16/16 checks, extending
the prior eleven isolation/restart checks with:

- Two simultaneous first turns retained only one answer from their shared revision.
- Retrying the rejected answer used the now-current retained history.
- A stale client revision failed before provider invocation.
- An incomplete provider attempt followed by a same-id retry retained one completed
  turn only.
- The completed retry was idempotent on subsequent delivery.

The runner also independently read the retained rows, stopped and restarted the
owned database, verified database-loss behavior, then stopped and removed its
temporary database directory. No live models, production data, or other PostgreSQL
instances were used or changed.

```powershell
node --test gate7f/function-first/conversation-revision.test.mjs gate7f/function-first/conversation-routing.test.mjs gate7f/function-first/conversation-context.test.mjs gate6b/gate6b.test.mjs gate7d/navigation.test.mjs
node gate7f/function-first/conversation-postgres-integration.mjs --pg-bin '<retained PostgreSQL bin directory>'
node --test --test-reporter=dot
```

This is deterministic functional evidence. Customer browser integration, live
three-model qualification, and the other M1 functions are separate acceptance
requirements, not implied by this result.
