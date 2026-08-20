# Security bake-off preregistration

Status: acceptance criteria fixed before the decision-grade rerun.

The diagnostic runs used to make the Windows launcher repeatable are not evidence. Only a run made
after this document is sealed may select the components.

## Scope

- Keycloak 26.7.2 with Temurin Java 21.0.12+8, loopback HTTP, ephemeral in-memory database.
- OpenFGA 1.18.3, loopback HTTP/gRPC, ephemeral in-memory database.
- No Windows service, firewall rule, LAN listener, repository package hook, or default development
  command may be added.
- Portable archives must retain their previously recorded official SHA-256 verification.

The ephemeral datastores are appropriate only for behavioral component selection. Production
activation additionally requires private credentials, TLS, persistent storage, backup/restore, and
operator runbooks.

## Keycloak identity matrix

Issue one RS256 access token with a two-second lifetime and a pinned issuer/audience. The valid case
must be accepted. Forged-payload/signature, wrong issuer, wrong audience, wrong actor, missing token,
and expired token cases must all be rejected. Signature, expiry, issuer, audience, and subject must
be independently checked.

Logout revocation must show `active=true` by introspection before logout and `active=false` after it.
The still-cryptographically-valid offline JWT after logout is an expected control: immediate
revocation for destructive operations therefore requires online introspection (or a comparably
strong active-session decision), not signature verification alone.

No username, password, client secret, or bearer token may be written to the result. Hashed issuer,
subject, and key identifiers are permitted.

## OpenFGA authorization matrix

Write one `user:alice / editor / document:release-plan` tuple. That exact check must allow. Wrong
actor, wrong object, and wrong relation must deny. Deleting the tuple must make the original check
deny. Stopping OpenFGA must make the application wrapper return denial rather than allow or hang.

## Acceptance

Both matrices and the revocation control must pass in one run. The result must say the ordinary
development profile was not modified, and no Keycloak, OpenFGA, or child Java process may remain
after the harness exits. Raw service logs are retained under the ignored run directory; the compact
secret-free verdict is retained in `probes/results/stack-bakeoff-security.json`.

Passing selects Keycloak for authentication and OpenFGA for resource authorization in the opt-in
security/release profiles. It does not activate either component, and it does not close the separate
prompt/data-boundary calibration gate.
