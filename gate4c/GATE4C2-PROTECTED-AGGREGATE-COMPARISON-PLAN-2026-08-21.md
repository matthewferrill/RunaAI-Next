# Gate 4C-2 protected aggregate comparison plan

Status: protected comparison passed; steward acceptance pending

## Purpose

Gate 4C-2 will check whether the Gate 4C projection reconstructs the same active approved-knowledge
count and scope-category totals as the legacy RunaAI learning journal. The authority is the complete
90-entry E6 journal previously accepted at Gate 4B. The comparison is evidence only: it creates no
migration target and activates no runtime behavior.

## Frozen boundary

The owner-authorized operation must run on `runa-control` as `RUNA-CONTROL\\Matthew`, against exact,
clean, pinned RunaAI and RunaAI-Next checkouts. Authority and source-pin checks occur before any DPAPI
or protected-store access. Protected journal records may exist only in process memory for the duration
of the comparison.

The run may:

- open the protected E6 journal through the existing owner-bound legacy adapter;
- construct a disposable Gate 4B target plan in memory with one-time random encryption and reference
  keys;
- build the accepted Gate 4C projection in memory;
- independently ask the legacy journal for its active approved-knowledge view; and
- retain only allowlisted counts, scope-category totals, equality flags, authority facts, and
  non-effect declarations.

The run may not retain or print lesson text, exclusions, rationale, record identifiers, keyed
references, journal paths, hashes, ciphertext, keys, or protected metadata. It may not write a target
database or protected copy, activate a model or answer lane, create embeddings or Qdrant records,
start a persistent service, change either source repository, or touch E3, E4, E5, or the device vault.

## Frozen green criteria

The protected comparison passes only when:

- host, owner identity, exact commits, exact branches, clean tracked state, and every accepted legacy
  source pin are verified before protected access;
- the complete E6 journal passes the existing integrity and authorization checks;
- the legacy active-approved count equals the Gate 4C projected count;
- legacy and projected counts match exactly for every allowlisted scope category;
- a second independent in-memory pass produces the same aggregate result;
- source-boundary measurements before and after the run are identical;
- disposable encryption material is random per pass and zeroed after use;
- retained output conforms to a strict aggregate-only schema and contains no disallowed fields or
  protected values;
- no target store or persistent service is created; and
- model context, general chat, guarded/local chat, workspace chat, learning actions, embeddings,
  reranking, and Qdrant all remain inactive.

Any mismatch or failed precondition fails closed before evidence is accepted. A failed run authorizes
diagnosis only, not source repair or migration.

## Validation and rollback

Synthetic tests must prove the allowlist, mismatch handling, repeatability checks, authority ordering,
source immutability check, key cleanup, and fail-closed behavior before the owner run. The focused and
full repository suites must remain green.

Rollback is deletion of the Gate 4C-2 comparison code and aggregate evidence from its isolated branch.
Because the protected operation is read-only and creates no target, rollback never changes the legacy
journal, the accepted Gate 4B plan, or the Gate 4C-1 projection contract.

## Approval gate

Successful evidence returns to the steward for a plain-language accept/reject decision. Acceptance may
merge only this comparison harness and aggregate evidence. It does not approve answer-lane wiring,
model-context activation, retained projection storage, Qdrant, embeddings, reranking, or migration of
any additional RunaAI subsystem.
