# Gate 7A LAN activation projection

Date: 2026-08-22

## Prepared exact successor

The non-live projection is bound to the current Control predecessor manifest
`4167a8268295f8e973486e197845a2c1d3ac3efb0c5af632ae704d371f0f7343` and produces:

- canonical origin `https://runa.bridgebuildersai.com`;
- public issuer `https://runa.bridgebuildersai.com/auth/realms/runaai-next`;
- loopback backchannel `http://127.0.0.1:9762/realms/runaai-next`;
- WebAuthn RP ID `runa.bridgebuildersai.com`;
- exact callback `https://runa.bridgebuildersai.com/session/callback`;
- Caddy configuration digest `e0115df25338380b1979b17468a607083532b538209122cb1026b1ceb726a97d`;
- Keycloak configuration digest `6450c4c8af95643b896c8cdf0f0e0d3a462ad0912a2b06ab0a48266d5814304b`; and
- release configuration digest `6285874fc4ecc26bcee7e86079ed41f3a2c12b51ac719181f339f7cc2956cf22`.

The projection retains the current protected-data generation, PostgreSQL, OpenFGA, Control-to-Home
provider route, selected-core authority, and legacy rollback system. It does not copy, rewrite, or
reconcile protected data.

## Live transaction requiring explicit authority

The bounded live transaction will create only the absent Porkbun `runa` A record targeting
`192.168.50.169`, add a Private/LocalSubnet-only Windows firewall rule for TCP 443, add a Caddy 443
listener while retaining the existing 9761 listener, change Keycloak's external hostname and both
WebAuthn RP policies, bind the client to the exact origin/callback, activate the immutable successor
release, and restart only Application, Caddy, and Keycloak.

Before the first change it will retain exact copies of the current candidate/release configuration,
Caddyfile, task launchers, and the affected Keycloak realm/client representations under the restricted
Control secrets boundary. Every validation is fail-closed. On failure it will restore those exact
files and Keycloak representations, remove only the new firewall rule and new DNS record, restart the
previous front ends, and verify the existing 9761 route. PostgreSQL, OpenFGA, Home, protected tables,
the legacy repository, and off-LAN ingress remain untouched.

The steward explicitly authorized the synthetic contract's `SameSite=Lax` session policy together
with this exact LAN activation. The cookie remains host-only, `Secure`, and `HttpOnly`; Lax permits it
on top-level cross-site navigation while state-changing routes remain POST-only and exact-Origin
checked. The live transaction verifies that the ordinary callback emits this exact policy.
