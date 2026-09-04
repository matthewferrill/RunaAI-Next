# Native PostgreSQL Gate 2 Candidate failure RCA — 2026-09-04

## Disposition

- Classification: actual PostgreSQL product SQL defect in candidate initialization; not a model failure and not three independent failures.
- Gate result: **STOPPED**. All three Candidate tests reached the disposable PostgreSQL service, then stopped at the same initialization statement before their scenario bodies could proceed.
- Error: PostgreSQL SQLSTATE `0A000`, `FOR UPDATE cannot be applied to the nullable side of an outer join`.
- Resume point: all three exact Candidate tests, once, after this source correction is committed, independently reviewed, and the exact wrapper pins are refreshed.
- Compatibility remains forbidden until the resumed Candidate stage and every cleanup witness are green.

## Evidence and blast radius

The three top-level Candidate tests each failed from `PostgresServerWorkspaceStore.initialize()` at the same statement in
`server-workspace/postgres.mjs`. Their durations and stacks show one shared setup defect rather than three feature
failures. The Node runner returned `1`, and the wrapper stopped without starting Compatibility.

The disposable PostgreSQL helper emitted one valid terminal receipt for PID `31576`: controlled stop requested, exit
code `0`, terminal exit confirmed, owned synthetic data removed, and `productionChanged=false`. The wrapper's final
witness found no Runa-owned PostgreSQL process and removed its temporary `node_modules` junction. Failure transcripts
were retained under the bounded Candidate artifact root for this RCA.

No model, browser, Control host, production service, customer data, or network model endpoint was exercised.

## Root cause

The migration query identifies nonterminal workspace rows that lack a matching operation-authority row by using a
`LEFT JOIN`. Its unqualified trailing `FOR UPDATE` asked PostgreSQL to lock every relation in the query, including the
nullable authority side of the outer join. PostgreSQL correctly rejects that lock shape because a missing authority row
does not exist to lock.

The migration only needs to lock the selected workspace rows before changing them. The query already names those rows as
`workspace_row`, but the lock clause did not restrict its target.

## Correction design

Change only the lock clause from unqualified `FOR UPDATE` to `FOR UPDATE OF workspace_row`. This preserves the required
transactional lock on every workspace row that may be migrated to `unknown`, while avoiding an impossible lock on the
nullable authority side. The join predicate, lifecycle filter, fail-closed migration, payload rewrite, revision change,
and outbox evidence remain unchanged.

No fixture expectation or test selection is relaxed. Because all three Candidate scenarios stopped in their shared
initialization path and none passed, the affected-stage resume must run the same exact three tests once. A failure stops
again for RCA; a green result permits a separate Compatibility review and authorization.

## Prevention

- Outer-join locking queries must name only the concrete relation whose rows are mutated.
- A deterministic source invariant inventories every `LEFT`, `RIGHT`, or `FULL JOIN` query that also uses a row lock,
  requires an explicit `OF` target, pins the two present queries to their concrete workspace aliases, and rejects each
  nullable-side alias.
- The corrected exact source must be parsed and independently reviewed before execution.
- Actual PostgreSQL remains the authority for SQL-dialect behavior; mock or parser-only evidence cannot grant this gate.
