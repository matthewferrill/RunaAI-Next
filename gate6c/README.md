# Gate 6C protected staging and Gate 6D cutover

Gate 6C prepares the exact owner ceremony, recurring encrypted backup, bounded selected-write freeze,
owner-context aggregate inventory, memory-only protected delta, reconciliation, and promotion-ready
handoff for the selected RunaAI core.

The frozen contract is
`GATE6C-SCOPE-AND-GREEN-CRITERIA-2026-08-21.md`. All implementation work begins with synthetic or
disposable data. Live owner enrollment, protected-store access, write freeze, retained import, and
promotion are deliberately absent until their explicit maintenance-window boundary.

`GATE6C-PREPARATION-RESULTS-2026-08-21.md` records the first green non-protected tranche.
`GATE6C-OWNER-AND-BACKUP-RESULTS-2026-08-22.md` records the completed target owner ceremony, current
encrypted backup/restore proof, and the pre-cutover fact that the candidate was still shadow at that
prerequisite checkpoint.
`CONTROL-MAINTENANCE-WINDOW.md` records the protected Control sequence and conservative whole-state
write-freeze finding. `GATE6D-CUTOVER-RESULTS-2026-08-22.md` records its completed production execution,
observation, close, TLS trust result, and current operating boundary.

The browser boundary uses authorization code plus PKCE, Keycloak application-initiated passkey
registration, exact product-owner binding, encrypted PostgreSQL sessions, opaque host cookies, and
online refresh/session revocation. The owner ceremony is complete and Gate 6D has promoted the exact
reviewed selected-core release. RunaAI-Next is authoritative for the selected core, the final
reconciliation and 60-minute observation passed, and the temporary legacy freeze is released. Legacy
remains intact as the verified rollback system.

The current browser root is an aggregate status surface, and the owner passkey page is the bounded
Gate 6D validation surface. The selected-core application routes are live, but a finished steward chat
interface is outside Gate 6 and has not been claimed by this cutover.

The exact migration domains are:

- `project-chat`;
- `learning-events`;
- `setting`; and
- `action-receipts`.

E3, E4, E5, device-vault data, legacy credentials, provider secrets, and the separate
approved-knowledge vector index are outside this gate.

Focused verification is `npm run test:gate6c`; the disposable PostgreSQL restart/replay/rollback
proof is `npm run verify:gate6c:integration`. Neither command opens a protected source.
