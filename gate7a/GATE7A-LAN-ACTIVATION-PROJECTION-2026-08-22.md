# Gate 7A LAN activation projection

Date: 2026-08-22

## Prepared exact successor

The non-live projection is bound to the exact closed Gate 6D promotion predecessor manifest
`93f2c9b3ddecec5f552308f973abd10005b9abd47e822baed7dc1427c8fc7b3b` and produces:

- canonical origin `https://runa.bridgebuildersai.com`;
- public issuer `https://runa.bridgebuildersai.com/auth/realms/runaai-next`;
- loopback backchannel `http://127.0.0.1:9762/realms/runaai-next`;
- WebAuthn RP ID `runa.bridgebuildersai.com`;
- exact callback `https://runa.bridgebuildersai.com/session/callback`;
- Caddy configuration digest `e0115df25338380b1979b17468a607083532b538209122cb1026b1ceb726a97d`;
- Keycloak configuration digest `6450c4c8af95643b896c8cdf0f0e0d3a462ad0912a2b06ab0a48266d5814304b`; and
- release configuration digest `a73a16f152482bf625492edfbf806d98daff05fa4944327235c056d3a7d2355f`.

The projection retains the current protected-data generation, PostgreSQL, OpenFGA, Control-to-Home
provider route, selected-core authority, and legacy rollback system. It does not copy, rewrite, or
reconcile protected data.

The live runtime and retained cutover binding were reverified immediately after the first guarded
activation rollback as the Gate 6D promotion release
`runaai-next-gate6d-promotion-2026-08-22-a886754`, manifest
`93f2c9b3ddecec5f552308f973abd10005b9abd47e822baed7dc1427c8fc7b3b`. The activation guard and
successor composition now use this one exact promoted predecessor digest. The earlier projection's
`4167a826...` value was the pre-promotion selected-core manifest and correctly failed closed when the
successor attempted to start against the already-closed promoted authority.

## Live transaction requiring explicit authority

The bounded live transaction will create only the absent Porkbun `runa` A record targeting
`192.168.50.169`, add a Private/LocalSubnet-only Windows firewall rule for TCP 443, add a Caddy 443
listener while retaining the existing 9761 listener, change Keycloak's external hostname and both
WebAuthn RP policies, bind the client to the exact origin/callback, activate the immutable successor
release, and restart only Application, Caddy, and Keycloak.

Before the first change it will retain exact copies of the current candidate/release configuration,
Caddyfile, task launchers, and the affected Keycloak realm/client representations under the restricted
Control secrets boundary in a release-specific rollback directory. Every validation is fail-closed. On failure it will restore those exact
files and Keycloak representations, remove only the new firewall rule and new DNS record, restart the
previous front ends, and verify the existing 9761 route. PostgreSQL, OpenFGA, Home, protected tables,
the legacy repository, and off-LAN ingress remain untouched.

The steward explicitly authorized the synthetic contract's `SameSite=Lax` session policy together
with this exact LAN activation. The cookie remains host-only, `Secure`, and `HttpOnly`; Lax permits it
on top-level cross-site navigation while state-changing routes remain POST-only and exact-Origin
checked. The live transaction verifies that the ordinary callback emits this exact policy.
