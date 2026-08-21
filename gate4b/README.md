# Gate 4B: learning-event history

Gate 4B defines and tests the next governed data-migration domain: the legacy E6 append-only
learning journal, including candidate events, outcome feedback, lifecycle history, approvals, and
approval batches. Approval history is physically and semantically part of the same chain, so it
cannot be split from the journal without losing exact lineage.

Gate 4B-I subsequently performed one approved aggregate-only owner inventory. It opened the protected
stores read-only under Matthew's Control identity and retained no protected value. No production data
was copied, no PostgreSQL target was initialized, and no approved knowledge, model, service, or cutover
was activated.

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

1. approve or reject an E6-only protected rehearsal against a disposable target;
2. leave the one unresolved E3 inbox record unchanged pending a separate decision;
3. defer E4 authority/device-vault redesign to Gate 5 and retire E5 migration because no store exists;
   and
4. defer all approved-knowledge projection and retrieval behavior to Gate 4C.

Run the synthetic suite with `npm run test:gate4b`.
