# Learning-event target contract

## Authority

The legacy E6 journal is the source authority until cutover. PostgreSQL will eventually hold the
authoritative Runa 2.0 records, but this Gate 4B branch supplies only a synthetic memory adapter. The
legacy event journal remains an immutable chain; approved knowledge is a later projection, not a
second writable truth.

## Target records

Each source entry becomes one `runa2-learning-journal-record/v1` row containing public sequence,
entry kind, source entry digest, prior source digest, a keyed target id, and one context-bound
AES-256-GCM envelope containing the exact legacy entry. One `runa2-learning-index-record/v1` row adds
only keyed relationships and low-risk enum/time metadata.

The target must never store a lesson, statement, evidence, task, source locator, rationale, outcome
text, person/project identifier, or approval identifier in plaintext indexes or migration ledgers.
Unkeyed legacy digests remain inside the private authoritative target boundary and must not be emitted
in ordinary logs or inventory evidence.

## Append-only and retry rules

- The first accepted snapshot names no predecessor.
- A successor names the exact accepted manifest and contains the entire accepted digest prefix.
- A shorter or changed prefix is rejected; lifecycle deletion remains a journal event and never causes
  the migration layer to delete history.
- Reusing a run id with identical content returns the committed result; changed content conflicts.
- Commit is atomic. A response-loss retry returns the existing result without duplicate records.

## Deliberate non-effects

Gate 4B does not expose approved-knowledge reads, evaluate current approval state, inject model
context, create Qdrant vectors, change model weights, or grant tool/network authority. Gate 4C must
reconstruct and validate the approved-knowledge projection from the preserved chain.
