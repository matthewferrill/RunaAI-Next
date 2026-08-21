# Gate 4C-1 approved-knowledge projection scope and green criteria

Status: approved for synthetic projection work; protected data and answer-lane activation not authorized

## Boundary

Gate 4C-1 derives the current approved-knowledge view from an accepted Gate 4B journal chain. The
journal remains authoritative. The projection is disposable, read-only, and reproducible; it cannot
append, approve, correct, expire, revoke, delete, or otherwise change learning history.

This slice stops before model use. It accepts only synthetic records in disposable memory or
PostgreSQL, applies explicit request scope before deterministic relevance selection, and returns a
typed advisory-context preview with provenance. It does not open protected stores, migrate real data,
call a model or provider, create embeddings or Qdrant records, start a persistent service, activate
learning, or alter any production route.

Curriculum definitions are versioned candidate templates only. They may be inspected and validated,
but this gate cannot import, approve, or activate them.

## Frozen green criteria

The synthetic contract must prove:

- the accepted journal manifest and complete ordered chain are validated before projection;
- active state is reconstructed from events, approvals, and lifecycle successors rather than trusted
  from a mutable snapshot;
- corrected, revoked, expired, deletion-due, deleted, held, unapproved, and superseded versions never
  enter the active projection;
- a changed journal head or reached lifecycle boundary invalidates the derived projection;
- every request supplies an explicit typed participant, project, and capability scope;
- personal knowledge fails closed without an exact verified participant match;
- project and capability knowledge fails closed when the applicable request dimension is undeclared
  or mismatched;
- evaluation, training-candidate, and session material never becomes durable advisory context;
- scope filtering occurs before relevance ranking and reports excluded counts without private values;
- selection is deterministic, bounded to six lessons and an estimated 1,200 tokens, suppresses weak
  one-term floods, and preserves must-not-apply exclusions;
- each selected lesson includes target-record provenance sufficient to trace it to the accepted journal
  without exposing private content in logs, public indexes, ledgers, or telemetry;
- the returned context is typed as advisory data and explicitly cannot grant tool, file, network,
  spending, worker, training, policy, identity, or other action authority;
- malformed, stale, unavailable, or inconsistent source state returns no selected context;
- the same projection and request contract is structurally suitable for general chat, guarded/local
  chat, and workspace comprehension, without wiring those lanes in this gate; and
- rollback removes only Gate 4C disposable projection state and leaves Gate 4B and legacy RunaAI
  unchanged.

## Explicit approval gates

- **Gate 4C-1A:** after synthetic evidence, accept or reject the projection contract.
- **Gate 4C-2:** separately approve any protected aggregate inventory or projection rehearsal.
- **Gate 4C-3:** separately approve answer-lane wiring and model-context use.
- **Gate 4E:** separately approve derived Qdrant/embedding/reranking work if measurement justifies it.

No approval carries forward automatically.
