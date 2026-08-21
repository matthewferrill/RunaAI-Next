# Approved-knowledge projection contract

## Authority

The accepted Gate 4B journal chain is the only learning-history authority. Gate 4C reconstructs a
disposable view from that chain; neither the projection, a model prompt, a cache, nor a future Qdrant
index may become a second writable truth.

Before projection, every authenticated Gate 4B envelope is decrypted only within the private
application boundary and checked against its target row, ordered source chain, accepted manifest
HMAC, and source head. A mismatch denies the entire projection.

## Active-state reconstruction

The projection evaluates approvals, approval expiration/revocation, correction relationships,
lifecycle corrections, safe holds/releases, event expiry, deletion deadlines, and deletion at one
explicit time. An approved correction supersedes the prior approved lesson. Contradictory correction
lineage, malformed timestamps/actions, or duplicate active approvals fail closed.

The projection key is the accepted manifest HMAC. The next future approval or lifecycle boundary is
recorded as `nextReevaluationAt`. A changed manifest or reached boundary denies retrieval until the
projection is rebuilt.

## Request scope

Every request must explicitly declare all three dimensions:

- verified participant id or `null`;
- active project id or `null`; and
- an explicit capability-id array, which may be empty.

Scope is application/session state, never inferred from message text or a model. Personal, project,
and capability lessons require exact matches. Undeclared dimensions fail closed. Session,
evaluation, training-candidate, unknown, and id-less non-global scopes never enter advisory context.
Filtering occurs before relevance ranking.

## Selection and output

The synthetic selector preserves the measured legacy bounds: deterministic lexical relevance,
weak one-term matches capped to one lesson, at most six lessons, and an estimated 1,200-token budget.
Literal `mustNotApply` conditions suppress a lesson. A selected preview contains typed lesson text and
boundaries plus keyed event, integrity, and approval references. Raw legacy ids and unkeyed source
digests are not emitted in public status or provenance.

The context is advisory data only. It cannot authorize tools, files, networking, spending, workers,
training, policy changes, identity changes, writes, or ordinary-chat learning. In Gate 4C-1,
`modelContextAuthorized` remains false even when a preview is selected.

## Curricula

A curriculum catalog is a versioned set of candidate templates. Validation does not import, approve,
activate, or supply a lesson to a model. Any later staging or approval uses the governed learning
pathway and requires separate authorization.

## Rollback and later gates

Gate 4C-1 persists no projection, opens no protected source, and changes no answer lane. Rollback is
removal of the Gate 4C code/branch; Gate 4B and legacy RunaAI remain unchanged. A protected rehearsal,
answer-lane wiring, model use, and Gate 4E Qdrant/embedding/reranking are separate approval gates.
