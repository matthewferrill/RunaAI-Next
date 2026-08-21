# Gate 4 — governed data migration

Gate 4 migrates governed product data one domain at a time. It does not grant blanket permission to
open or copy every legacy store. PostgreSQL becomes authoritative only after the applicable domain
has passed inventory, synthetic rehearsal, protected rehearsal, reconciliation, rollback, and steward
acceptance.

## Domain order

1. **Gate 4A — projects, durable chats, and project memory.** This is the smallest coherent domain
   because chat assignment and project memory depend on the managed-project boundary.
2. **Gate 4B — learning events and candidate lifecycle.** Separate approval required.
3. **Gate 4C — approved knowledge and curricula.** Separate approval required.
4. **Gate 4D — settings and intentionally retained provider metadata.** Secrets are never copied and
   require a later re-entry or re-sealing ceremony.
5. **Gate 4E — derived Qdrant indexes.** Rebuild only from accepted PostgreSQL source/lifecycle truth.

The order after Gate 4A may change by explicit steward decision. No later domain inherits approval
from an earlier one.

## Current boundary

Gate 4A-1 was approved by the steward on 2026-08-21. The synthetic migration implementation and its
disposable PostgreSQL evidence are green. The reviewed aggregate-only inventory tool is implemented,
and its authorized owner-context run on RUNA-CONTROL passed on 2026-08-21. It opened the three
approved roots and decrypted chat records only in memory to produce aggregate evidence: 25 readable
unassigned chats, 75 turns, no projects, no project memory, no integrity findings, and a deterministic
second pass. No protected value was emitted, exported, copied, converted, or imported. No production
route, persistent service, real target encryption key, or data cutover exists. Gate 4A-2 remains
separately bounded and completed green on 2026-08-21 as one Control-local protected rehearsal. Its
temporary target, backup, keys, runtime, and listener were removed. The steward accepted the evidence
and approved the protected development merge on 2026-08-21. Production migration remains unauthorized.

The Gate 4A package consists of:

- `GATE4A-PROJECT-CHAT-SCOPE-AND-GREEN-CRITERIA-2026-08-21.md` — authorization and stop rules;
- `GATE4A-2-PROTECTED-REHEARSAL-PLAN-2026-08-21.md` — the exact Control-local protected boundary;
- `GATE4A-2-PROTECTED-REHEARSAL-RESULTS-2026-08-21.md` — protected reconciliation and cleanup result;
- `PROJECT-CHAT-TARGET-CONTRACT.md` — canonical authority, schema, encryption, and legacy disposition;
- `OWNER-CONTEXT-INVENTORY-CONTRACT.md` — the bounded read-only inventory that must be reviewed before
  owner-context execution;
- `PARITY-CORPUS.json` — synthetic and protected-rehearsal acceptance cases; and
- `SOURCE-PINS.json` — exact legacy and integration evidence inputs;
- `run-owner-inventory.mjs` — fail-closed aggregate inventory entry point; and
- `evidence/OWNER-CONTEXT-INVENTORY-2026-08-21.json` — the allowlisted aggregate-only Control result;
- `evidence/PROTECTED-REHEARSAL-RESULTS-2026-08-21.json` — allowlisted aggregate protected evidence;
- `GATE4A-1-SYNTHETIC-RESULTS-2026-08-21.md` — implementation and verification evidence plus the
  owner-context result and next approval boundary.
