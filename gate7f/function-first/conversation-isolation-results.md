# M1-S2 conversation isolation repair

Date: 2026-08-28. Parent criteria: `M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`.

## Finding and correction

A synthetic request through `SelectedCoreApplication` and `Gate2ReadOnlyService`
demonstrated that a caller could select another participant's project in the
ordinary Chat route. Authorization checked the ordinary personal capability, but
project ownership was checked only when saving the answer. The foreign project's
synthetic evidence reached the answer provider before that final save was denied.
No live participant records or production model were used to demonstrate this.

Authenticated answer requests now call `prepareAnswerContext` before retrieval,
provider invocation, or cached-answer delivery. The continuity store checks the
participant, project, thread, archive state, and Chat/Code experience. Missing or
unavailable authoritative context fails closed. PostgreSQL queries scope by the
authenticated participant before decrypting retained content. Final persistence
checks remain in place as a second boundary.

For signed-in requests, the application uses only the store's retained history;
browser-supplied history cannot replace it. History is bounded to twelve complete
user/assistant pairs, 8,000 characters per message, and 24,000 characters total.
The context includes an explicit truncation/omission count. Anonymous history stays
ephemeral and has no access to retained conversation stores.

## Evidence

The focused application, navigation, customer-journey, and context test run passed
56/56 tests. The standalone `conversation-postgres-integration.mjs` runner passed
all eleven checks using an owned temporary PostgreSQL database and synthetic
encrypted records:

- Browser history ignored for a new retained chat.
- Foreign project rejected before provider use.
- Same-owner wrong project rejected.
- Wrong Chat/Code experience rejected.
- Foreign thread rejected before provider use.
- Correct retained history after an actual database stop and restart.
- Exact repeated request did not invoke the provider again.
- Only two intended turns retained.
- Cached response denied after project archival.
- Database loss denied before provider use.
- Owned database stopped and temporary directory removed.

Run the focused checks with:

```powershell
node --test gate7f/function-first/conversation-context.test.mjs gate6b/gate6b.test.mjs gate7d/navigation.test.mjs gate7b/customer-journey.test.mjs
node gate7f/function-first/conversation-postgres-integration.mjs --pg-bin '<retained PostgreSQL bin directory>'
```

The second command creates its own synthetic database on an unused loopback port;
it does not accept an existing database URL, use production credentials, call a
model, or touch a private store. On Windows, replace the placeholder with the
actual retained PostgreSQL binary directory before running it.

## Not established by this repair

This is a pre-provider isolation and authoritative-context regression result, not
complete M1 acceptance, live model qualification, or deployment evidence. It does
not yet prove concurrent-turn revision handling, broader durable task recovery,
the selected research pipeline, review routing, or model response quality. Those
remain explicit M1-S2 work. Older evaluation/qualification seals were not changed.
