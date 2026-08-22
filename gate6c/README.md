# Gate 6C protected staging

Gate 6C prepares the exact owner ceremony, recurring encrypted backup, bounded selected-write freeze,
owner-context aggregate inventory, memory-only protected delta, reconciliation, and promotion-ready
handoff for the selected RunaAI core.

The frozen contract is
`GATE6C-SCOPE-AND-GREEN-CRITERIA-2026-08-21.md`. All implementation work begins with synthetic or
disposable data. Live owner enrollment, protected-store access, write freeze, retained import, and
promotion are deliberately absent until their explicit maintenance-window boundary.

`GATE6C-PREPARATION-RESULTS-2026-08-21.md` records the first green non-protected tranche.
`GATE6C-OWNER-AND-BACKUP-RESULTS-2026-08-22.md` records the completed target owner ceremony, current
encrypted backup/restore proof, and the explicit fact that the candidate remains shadow.
`CONTROL-MAINTENANCE-WINDOW.md` records the remaining protected Control sequence and the conservative
whole-state write-freeze finding.

The browser boundary uses authorization code plus PKCE, Keycloak application-initiated passkey
registration, exact product-owner binding, encrypted PostgreSQL sessions, opaque host cookies, and
online refresh/session revocation. The reviewed shadow release is now running, and the target owner
ceremony is complete. This establishes target identity readiness only: no protected record, legacy
write freeze, production route, or authority transition has occurred.

The exact migration domains are:

- `project-chat`;
- `learning-events`;
- `setting`; and
- `action-receipts`.

E3, E4, E5, device-vault data, legacy credentials, provider secrets, and the separate
approved-knowledge vector index are outside this gate.

Focused verification is `npm run test:gate6c`; the disposable PostgreSQL restart/replay/rollback
proof is `npm run verify:gate6c:integration`. Neither command opens a protected source.
