# Gate 4B: learning-event history

Gate 4B defines and tests the next governed data-migration domain: the legacy E6 append-only
learning journal, including candidate events, outcome feedback, lifecycle history, approvals, and
approval batches. Approval history is physically and semantically part of the same chain, so it
cannot be split from the journal without losing exact lineage.

This branch is synthetic-only. It does not open a protected store, unseal a DPAPI credential, copy
production data, initialize PostgreSQL, activate approved knowledge, retrieve a lesson, call a model,
start a service, or authorize cutover.

## What is implemented

- strict source snapshot, journal-chain, digest, and backward-lineage validation;
- application AES-256-GCM envelopes for exact legacy journal entries;
- keyed, content-free relational indexes;
- append-only prefix enforcement, idempotency, atomic failure, and response-loss recovery;
- a 20-case synthetic parity corpus; and
- a fail-closed aggregate inventory runner approved under Gate 4B-I. It verifies Control, Matthew's
  identity, both exact clean commits, the migration branch, and every source pin before DPAPI or store
  access; performs two independent in-memory passes; and emits only a reconstructed allowlist.

## What remains decision-gated

1. run the approved Control-local aggregate inventory under Matthew's identity;
2. use its aggregate result to decide the disposition of E3 inbox, E4 review, E5 grants, and the
   device vault;
3. approve or reject a protected rehearsal against a disposable target; and
4. defer all approved-knowledge projection and retrieval behavior to Gate 4C.

Run the synthetic suite with `npm run test:gate4b`.
