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

The owner enrollment and read-only Porkbun preflight subsequently passed. Their privacy-safe aggregate
is `evidence/CONTROL-PORKBUN-CREDENTIAL-READINESS.json`.
`GATE7A-CERTIFICATE-STAGING-PREP-2026-08-22.md` defines the next bounded step: retrieve and validate the
Porkbun-managed wildcard bundle into the existing protected Control secrets root without changing DNS,
listeners, identity, or production. With the four certificate-staging checks included, the current
focused Gate 7A suite passes 36/36 and the full repository suite passes 334/334.

Certificate staging subsequently passed with 34 complete days remaining and no live change. The
privacy-safe aggregate and interpretation are retained in
`evidence/CONTROL-CERTIFICATE-STAGING-RESULTS.json` and
`GATE7A-CERTIFICATE-STAGING-RESULTS-2026-08-22.md`.

`GATE7A-LAN-ACTIVATION-PROJECTION-2026-08-22.md` records the exact immutable successor and bounded
rollback transaction. Canonical browser/backchannel separation, one exact session callback, and
closed-cutover successor binding are green at 41/41 focused Gate 7A checks and 340/340 full checks.
The steward subsequently authorized the bounded LAN transaction and `SameSite=Lax` session policy.
`control/Invoke-ControlLanActivation.ps1` performs the exact preflight, DNS, firewall, Caddy,
Keycloak, immutable-release, and browser-route checks with automatic restoration of the recorded
predecessor on failure. The transaction passed on 2026-08-23 and remains active at
`https://runa.bridgebuildersai.com`. Its aggregate evidence and fail-closed remediation record are in
`evidence/CONTROL-LAN-ACTIVATION-RESULTS.json` and
`GATE7A-LAN-ACTIVATION-RESULTS-2026-08-23.md`. The current focused Gate 7A suite passes 52/52 and the
full repository suite passes 351/351.
`build-lan-projection.mjs --output <new-directory> --release-id <exact-id>` also emits the two
deterministic Control launchers so the staged release path and Keycloak arguments are reviewed and
hash-pinned rather than composed during the live transaction.

Canonical LAN activation completed Gate 7A-2's ingress foundation. The owner subsequently completed
canonical-origin passkey sign-in without weakening the protected owner client.

The steward amended the ordinary-user model on 2026-08-23. `matthew-owner` remains a separate,
passkey-only administrative identity. Invited household and external users instead choose an
individual username and password, may add a passkey optionally, and use verified email for password
recovery. Public self-registration remains disabled. The frozen amendment and rollback boundary are
in `GATE7A-USER-ACCESS-MODEL-DECISION-2026-08-23.md`; the deterministic v2 result is retained in
`evidence/USER-ACCESS-MODEL-SYNTHETIC-RESULTS.json`.

The implementation uses a separate password-only `runaai-next-user` Keycloak client, a separate
encrypted ordinary-session store and cookie, and owner-role denial on the password path. Owner-bound
Control operators create or remove only that client and flow, deploy an exact immutable application
successor with exact predecessor rollback, enroll/apply SMTP configuration with DPAPI CurrentUser
protection, and issue one short-lived invitation with rollback of the newly created user, principal,
and isolated chat relation. The focused Gate 7A suite passes 66/66 and the full repository suite passes
368/368. No live identity, SMTP, application release, or user was changed by this repository work.

Control's Keycloak currently has no SMTP sender configured, so the first distinct ordinary-user
invitation and verified-email password recovery cannot yet be accepted live. The selected test is a
separate personal-email account for Matthew; its only initial authorization is the isolated personal
chat relation. The personal email itself must be supplied only to the hidden/owner-bound invitation
operator and must not enter Git, retained evidence, or chat. Off-LAN ingress, a second PC, a phone,
certificate-renewal automation, and the finished conversational UI remain subsequent checks.

The first Control activation attempt on 2026-08-23 stopped before identity creation or application
restart because Windows PowerShell 5.1 collapsed an empty Keycloak client response to `$null` and the
operator attempted to read its `Count` property under strict mode. Normalized reconciliation proved
zero ordinary clients, zero ordinary flows, no generated secret, unchanged realm policy, and the exact
prior application release. The operator now array-wraps both empty and single-item client/flow results;
the focused and full suites remain green before retry.

The second attempt reached the corrected successor and preserved selected-core readiness, but its final
operator probe expected HTTP 302 while the reviewed application contract intentionally returns HTTP
303 for every browser sign-in redirect. The exact predecessor and identity state were restored, and no
ordinary client, flow, or secret remained. The probe now requires the application's tested 303 status
without changing the application behavior.
