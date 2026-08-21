# Gate 4B synthetic results

Status: green for synthetic contract review; protected inventory not run

## Result

Gate 4B can preserve the exact ordered E6 learning-event and approval-history chain inside
authenticated application envelopes while enforcing append-only successors, atomic commit, and
idempotent replay. The target exposes no approved-knowledge projection or retrieval interface.

The source boundary remains unchanged. No protected learning store, DPAPI credential, device vault,
production record, persistent service, external network, model, or provider was opened or activated.

## Verification

| Check | Result |
|---|---:|
| Frozen Gate 4B synthetic corpus and owner-runner checks | 25/25 passed |
| Full Node regression profile | 118/118 passed |
| Gate 1 disposable integration | passed; 25 checks; all services stopped |
| Gate 2 disposable integration | passed; 21 checks; all services stopped |
| Gate 3 disposable integration | passed; 16 checks; PostgreSQL stopped |
| Gate 4A disposable integration | passed; 16 checks; PostgreSQL stopped |
| Gate 0 inherited seals | 10/10 passed |
| Gate 0 pinned legacy suites | 12/12 passed |
| Exact selected Node runtime | 22.22.0 |
| `git diff --check` | passed |

The focused privacy case plants private canaries in lessons, source locators, statements, task text,
evidence, outcome text, and approval rationale. None appears in the migration plan, relational index,
ledger-shaped records, or aggregate inventory output; the values exist only inside authenticated
ciphertext in the synthetic target.

## Preservation checks

- RunaAI-Next work began from accepted integration commit
  `9b0d4a48460b7ca0cb552831f826f94f0257929d` on isolated branch
  `runa2/gate-4b-learning-events-plan`.
- Omen legacy RunaAI remained on clean tracked `main` at
  `71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2`, aligned with `origin/main`.
- The existing ignored `.claude/settings.local.json` remains present and untouched.
- Disposable integration evidence files were restored after verification; they are not part of this
  change.

## What this evidence does not prove

It does not yet measure Control's current E6 records, establish E3/E4/E5/vault disposition, prove a real
PostgreSQL migration, activate approved knowledge, or authorize production migration/cutover. Those
are separately gated.

## Next decision

Gate 4B-I was subsequently approved. The fail-closed runner now passes five additional tests proving
two-pass determinism, output reconstruction, unknown-category denial, exact authority/pin checks, and
pre-access owner mismatch denial. Its one authorized Control execution subsequently passed; the
aggregate result is recorded in `GATE4B-I-OWNER-INVENTORY-RESULTS-2026-08-21.md`.
