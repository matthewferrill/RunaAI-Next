# Gate 7A multi-device access foundation

Gate 7A corrects the client-access boundary before the conversational UI is built. Control remains the
single authoritative application, identity, governance, and data host. Omen, other PCs, phones, and
approved off-LAN browsers are clients; Home remains private inference infrastructure.

The frozen contract is `GATE7A-SCOPE-AND-GREEN-CRITERIA-2026-08-22.md`. The representative client
matrix is `fixtures/client-matrix.json`. The executable policy is `access-policy.mjs`; its reserved,
non-production input is `fixtures/synthetic-policy.json`.

The current Gate 6 IP address, Control-local Keycloak issuer, CurrentUser private-CA trust, and owner
ceremony remain valid commissioning evidence. They are not the permanent user-access topology.

Gate 7A begins with configuration contracts and synthetic validation only. It does not change DNS,
open an off-LAN route, replace the running release, enroll a credential, or modify protected data.

The original synthetic foundation is green:

- its 24 fail-closed policy and matrix checks pass;
- `npm run verify:gate7a:synthetic` emits deterministic, privacy-safe readiness evidence; and
- its completion baseline passed the full repository suite at 322/322.

The retained aggregate result is `evidence/SYNTHETIC-RESULTS.json`; interpretation and remaining live
decisions are recorded in `GATE7A-SYNTHETIC-RESULTS-2026-08-22.md`. The reserved hostname
`runa.example.com` is a test fixture, not a live hostname selection.

The steward subsequently selected `runa.bridgebuildersai.com` as the permanent browser hostname.
`GATE7A-LIVE-HOSTNAME-DECISION-2026-08-22.md` records the exact origin, issuer, WebAuthn RP ID,
callback, current Porkbun DNS state, and LAN-first recommendation. `fixtures/selected-hostname.json`
is a non-secret, non-activating decision projection: it explicitly records that DNS, certificate,
off-LAN ingress, and production remain unchanged. With the four hostname-decision checks included,
the current focused Gate 7A suite passes 28/28 and the full repository suite passes 326/326. The exact
non-secret readiness output is retained in `evidence/HOSTNAME-DECISION-RESULTS.json`.

`GATE7A-PORKBUN-CREDENTIAL-PREP-2026-08-22.md` describes the Control-local secret enrollment and
read-only API preflight prepared for the next interactive step. The scripts accept credentials only
through hidden prompts under Matthew's Control identity, retain them only as DPAPI CurrentUser data,
and cannot change DNS or open the certificate bundle. The current focused Gate 7A suite passes 32/32
and the full repository suite passes 330/330.
