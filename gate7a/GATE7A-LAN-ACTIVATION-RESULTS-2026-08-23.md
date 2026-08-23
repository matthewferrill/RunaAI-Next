# Gate 7A LAN activation results

Date: 2026-08-23

## Outcome

The authorized Gate 7A canonical LAN transaction passed and remains active. RunaAI is available on
the LAN at `https://runa.bridgebuildersai.com` using the Porkbun-managed WebPKI certificate. The
browser-visible Keycloak issuer is
`https://runa.bridgebuildersai.com/auth/realms/runaai-next`, the WebAuthn RP ID is
`runa.bridgebuildersai.com`, and the ordinary session cookie policy is explicitly `SameSite=Lax`
while remaining host-only, `Secure`, and `HttpOnly`.

The active immutable release is `runaai-next-gate7a-lan-2026-08-23-fdf6e0a`, commit
`fdf6e0aedea92917ac3c00de2205311c3f94808a`, artifact digest
`cb3f9600f855099bdc94f67758990c428146a9c6d2f0dbd163e6021917f216c3`. Successful attempt
`gate7a-attempt-20260823-07` retained its exact predecessor snapshot under the restricted Control
secrets boundary and did not roll back.

## Independent verification

- Control reports the exact Gate 7A release, closed cutover phase, active authority, imported protected
  data, and the completed revision-7 owner ceremony.
- Only Caddy is newly client-facing: TCP 443 is bound to `192.168.50.169`. Application, Keycloak,
  OpenFGA, PostgreSQL, Keycloak management, and the Home proxy remain loopback-bound.
- The Windows firewall rule is enabled only for the Private profile, TCP 443, and `LocalSubnet`.
- The commissioning route at `https://192.168.50.169:9761` remains healthy for rollback/operations.
- Omen resolved the canonical hostname to `192.168.50.169`, reached canonical liveness without a
  certificate bypass, and observed the exact canonical Keycloak issuer. Google and Cloudflare public
  DNS-over-HTTPS resolvers independently returned the same private A record.
- The focused Gate 7A suite passes 52/52 and the full repository suite passes 351/351.

The aggregate machine-readable result is
`evidence/CONTROL-LAN-ACTIVATION-RESULTS.json`. It contains no credential, token, cookie, certificate
private value, protected content, or private evidence field.

## Fail-closed remediation record

Every unsuccessful activation either stopped before a live change or restored the recorded
predecessor, removed only the attempted DNS/firewall ingress, and left legacy RunaAI unchanged.

| Boundary found | Root cause | Durable correction |
|---|---|---|
| Release verification | A PowerShell continuation was missing before the Node verifier expression. | The verifier invocation is syntactically sealed and tested. |
| Porkbun create | Dry-run and apply used one idempotency key for different request bodies. Porkbun correctly rejected the mismatch. | Dry-run, apply, and delete use distinct attempt-scoped keys, consistent with Porkbun's [API documentation](https://porkbun.com/api/json/v3/documentation). |
| Successor authority | The first projection referenced the pre-promotion manifest rather than the closed Gate 6D promotion manifest. | Gate 7A is pinned to the exact promoted predecessor manifest `93f2c9b3...`. |
| Rollback retention | A failed successor manifest occupied the active destination path. | Failed successor manifests move into their attempt-scoped rollback evidence. |
| Keycloak URL reconciliation | Windows PowerShell treated one returned URL as a scalar string and the verifier indexed its first character. | Returned redirect/origin values are normalized to arrays before indexing. |
| Keycloak restart | The pre-restart admin token carried the old browser issuer. | Reconciliation obtains a fresh short-lived admin token after the canonical issuer is live. |
| Ordinary session start | The completed owner proof was intentionally bound to the predecessor immutable release; the Gate 7A row was pristine. | The existing audited completed-owner rebind copied only the completion proof to the exact successor binding, retained the prior ceremony, and changed neither authority nor production traffic. |

One rollback temporarily reported the restored Application task's Windows loader result `0xC0000142`.
The exact predecessor subsequently started, exposed port 9760, matched its release/commit/artifact pins,
and returned HTTP 200 on the commissioning route before any later attempt proceeded. No protected
store or legacy repository required repair.

## What remains

This completes the canonical LAN-origin activation portion of Gate 7A, not the whole multi-device
gate. Existing commissioning-origin passkeys must not be treated as canonical credentials. The next
interactive step is to enroll Matthew's first canonical-origin passkey from Omen and a separate
recovery credential, then prove ordinary sign-in, session navigation, logout/revocation, and governed
step-up. Do not delete the commissioning credentials until both canonical credentials are verified.

After owner acceptance, Gate 7A still requires a second representative PC, a distinct non-owner user,
a phone, and a separately reviewed off-LAN boundary. Off-LAN ingress remains disabled. Certificate
renewal also remains an operations decision because the retained Porkbun credential is DPAPI
CurrentUser-bound and must not be silently re-scoped to a service account.
