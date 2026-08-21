# Gate 5 operations and security

This directory is the synthetic application contract for the selected release stack. It preserves
Runa's product-owned household authority while placing authentication, relationship enforcement,
one-time effects, private transport, secret references, telemetry, and recovery behind replaceable
adapters.

- `identity.mjs` keeps product policy authoritative and composes strict OIDC evidence with
  PostgreSQL principal binding and OpenFGA decisions.
- `capability.mjs` proves exact, expiring, revocable, single-use effect authority.
- `operations.mjs` validates private transport/model identity/secret references, redacts telemetry,
  and records dependency-loss behavior.
- `recovery.mjs` proves authenticated backup and distinct-target restore and freezes the Windows-bound
  re-enrolment disposition.
- `postgres.mjs` keeps product principal binding and restored authoritative records in PostgreSQL.
- `gate5.test.mjs` uses synthetic values only. It opens no protected store and starts no service.
- `run-integration.mjs` uses disposable loopback PostgreSQL and deletes its runtime after the check.

The existing `bakeoffs/security/run-security.mjs` remains the disposable loopback proof for real
Keycloak OIDC and OpenFGA behavior. Gate 5 may reuse it when the already-installed prerequisites are
available; its absence cannot be credited as a pass.
