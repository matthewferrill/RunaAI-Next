# Security gates

Status: opt-in validation profile. These gates are deliberately absent from ordinary development,
build, and test commands.

Current decision: Keycloak 26.7.2 and OpenFGA 1.18.3 pass their sealed portable component gates. The
Keycloak/OpenFGA/PostgreSQL one-time capability boundary passes the integrated Fray 4 matrix 120/120.
No tested prompt-injection classifier passed the fixed activation gate, so none is enabled. Governed
tools rely on authority, not classifier output. Retrieval answers require a typed feature-specific
grounding contract; generic free-form retrieval denies.

Final-order rerun: after all development-stack and model work, the sealed portable security harness
ran from `2026-08-20T20:44:30.705Z` to `2026-08-20T20:44:51.420Z`. Keycloak token/expiry/revocation,
OpenFGA authorization/revocation/failure, and the combined matrix all passed. All lab processes were
then stopped by the harness; ordinary development remains security-service-free.

## Activation profiles

| Profile | Services | Failure behavior | Intended use |
|---|---|---|---|
| `dev` | None required | Security integration is not invoked | Fast local composition and porting work |
| `integration-security` | Keycloak, OpenFGA, content gate, trace redaction | Every protected operation fails closed | Explicit adversarial security runs |
| `release` | Production OIDC, OpenFGA, TLS endpoint identity, content gate, trace redaction, secret scan | Any failed or unavailable gate blocks release | Promotion only |

No security service is installed as a Windows service, opened on the LAN, added to a default package
script, or injected into the normal development path. Lab services bind to loopback and are stopped by
their harness.

## Boundaries and ownership

1. **Authentication — Keycloak OIDC.** Validate signature, issuer, audience, expiry, and subject.
   Offline JWT verification does not prove revocation; destructive operations additionally require an
   active-token check or sufficiently short token lifetime.
2. **Authorization — OpenFGA.** Decide `user / relation / object` after authentication. A denial,
   malformed response, timeout, or unavailable service is a denial. Authentication is never treated
   as authorization.
3. **Replay/idempotency — PostgreSQL application boundary.** Bearer tokens are replayable by design.
   Destructive operations require a unique action/effect key committed with the deed; a repeated key
   returns the prior outcome and cannot repeat the deed.
4. **Prompt/data boundary — capability and grounding contracts.** Retrieved content cannot mint a
   capability. Non-tool answers must compile typed facts and satisfy a deterministic grounded-output
   contract. Classifiers are optional defense in depth only after an independent fixed gate passes.
5. **Observability — OpenTelemetry.** Record decision identifiers and verdicts, never bearer tokens,
   client secrets, raw prompts, or private payloads.
6. **Endpoint identity — TLS plus pinned issuer/audience/model policy.** Loopback lab HTTP is only test
   transport and is not production evidence.

## Required release matrix

- Accept a correctly signed, unexpired token with the expected issuer, audience, and actor.
- Reject forged, expired, wrong-issuer, wrong-audience, wrong-actor, and missing tokens.
- Demonstrate the chosen revocation contract and document the offline-JWT limitation.
- Allow the intended OpenFGA tuple; deny wrong actor, object, and relation.
- Deny after tuple revocation and when OpenFGA is unavailable.
- Reject duplicate destructive action/effect keys without repeating the deed.
- Pass trace-redaction and secret-scan gates.
- Pass the capability mutation/failure matrix and the route-specific non-tool grounding matrix.
- Run the preregistered classifier calibration before enabling any classifier; no current candidate is enabled.

## Activation rule

Security integration may be enabled in a Runa port only after its explicit gate passes. Enabling a gate
must be a configuration change in the security/release profile, not a modification to the ordinary
development command. Production activation additionally requires private credentials, persistent
datastores, TLS, backup/restore, and operator runbooks; the portable loopback bake-off is not that
activation.
