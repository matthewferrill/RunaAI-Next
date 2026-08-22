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

The synthetic foundation is green:

- `npm run test:gate7a` passes 24/24 fail-closed policy and matrix checks;
- `npm run verify:gate7a:synthetic` emits deterministic, privacy-safe readiness evidence; and
- the full repository suite passes 322/322.

The retained aggregate result is `evidence/SYNTHETIC-RESULTS.json`; interpretation and remaining live
decisions are recorded in `GATE7A-SYNTHETIC-RESULTS-2026-08-22.md`. The reserved hostname
`runa.example.com` is a test fixture, not a live hostname selection.
