# Gate 4B-I owner inventory results

Status: passed; aggregate-only Control inventory complete

## Authority and safety

The owner-context run executed locally on Runa-Control under Matthew's identity. Before DPAPI or any
protected store opened, the runner verified:

- legacy RunaAI `main` was clean at `b4db04090d8f0df87234fab573b396e7824c5354`;
- RunaAI-Next was clean on `runa2/gate-4b-learning-events-plan` at
  `01449494e96c8bc5bd98c0aa3b9331cd69fc8774`; and
- all 12 selected legacy source pins matched.

An initial invocation supplied the wrong full RunaAI-Next commit and failed closed with
`inventory-next-authority-mismatch` before protected access. The corrected invocation performed the
one approved inventory. It completed two independent in-memory passes with identical aggregate output.

No record, ciphertext, credential, passphrase, identifier, digest, path, lesson, source, evidence,
task, outcome, or rationale was copied or retained. No store was written, repaired, compacted,
exported, or migrated. No model, provider, network service, target database, or persistent process was
started. Post-run checks found no writer lock, both repositories remained clean, and Control's
RunaAI-Next checkout was returned to `runa2/integration`.

## Aggregate result

| Domain | Result |
|---|---:|
| E6 journal entries | 90 |
| Learning events | 63 |
| Outcome-feedback entries | 0 |
| Lifecycle entries | 10 |
| Direct approval entries | 0 |
| Approval-batch entries | 17 |
| Approval decisions represented | 63 |
| Active approved lessons | 53 |
| Corrected lessons | 10 |
| Held lessons | 0 |
| Unreadable entries | 0 |
| Integrity findings | 0 |
| Unresolved E6 lineage | 0 |
| Encrypted journal bytes | 409,841 |
| Largest encrypted entry | 11,916 bytes |

Learning-event distribution:

| Dimension | Aggregate counts |
|---|---|
| Event type | 53 direct teaching; 10 user correction |
| Destination | 1 personal; 5 project; 18 capability; 39 global approved |
| Scope | 1 personal; 5 project; 18 capability; 39 global |

Older-store inventory:

| Store | Aggregate result | Gate 4B disposition |
|---|---|---|
| E3 inbox | Present; 1 record; 0 tombstones; readable | Unresolved; do not silently retire or merge |
| E4 review | Present; 2 authority records; 0 review transactions/capsules; readable | Security/authority history, not E6 learning content; defer to Gate 5 identity/recovery design |
| E5 grant | Not present | Nothing to migrate |
| Device vault | Present and readable under owner identity | Windows/DPAPI credential carrier; never copy; replace or redesign under Gate 5 |

The safe legacy API exposes resolved approval states but not protected approval action payloads.
Therefore the result truthfully reports action counts as unavailable rather than inferring them. Entry
kinds, total approval decisions, and current resolved states are complete and internally consistent.

## Assessment

The E6 journal is ready for a bounded protected rehearsal as one append-only domain. Its chain is
healthy, all current approved knowledge has exact preserved approval lineage, and its size is small.
The one E3 record is not evidence that it is duplicated or superseded by E6; aggregate counts cannot
answer that question.

Recommended next scope:

1. rehearse only the complete 90-entry E6 chain against a disposable target;
2. leave the E3 record unchanged and outside the target;
3. make E3 lineage/disposition a separate later decision if it is still needed; and
4. exclude E4 authority state, E5, and the device vault from Gate 4B migration.

## Next approval gate

Gate 4B-R would authorize one Control-local protected rehearsal of the E6 chain only. It would create
a scoped encrypted backup of the already encrypted source files, build a disposable PostgreSQL target,
import the 90 entries through authenticated application envelopes, verify exact order/digests/counts,
exercise failure/replay/rollback, scan retained evidence for private values, destroy the entire target,
and leave the legacy journal unchanged.

Gate 4B-R does not authorize E3 migration, production routing, approved-knowledge activation, cutover,
or persistent services.
