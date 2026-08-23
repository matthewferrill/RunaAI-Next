# Gate 7A ordinary-access activation results

Date: 2026-08-23

## Outcome

The separate invitation/password access foundation is active on Control. The immutable release is
`runaai-next-gate7a-lan-ordinary-2026-08-23-130457c`, commit
`130457c82e93ff25652b93e195743344ac30c59d`, artifact digest
`c0bea33b8af7536b088db908993a81d2e75f0b9803b04f32b544ca96ef803bd8`, with 29,488 verified
artifact files. The `runaai-next-user` client has one exact password-only browser flow. Public signup
remains disabled, and invitees choose their own username and password.

The protected `matthew-owner` client was not changed. Its completed passkey proof was copied through
the existing audited release-rebind transaction to the exact new immutable binding; the predecessor
proof was retained. The selected-core cutover remains closed at revision 10, authority remains active,
all four dependencies are ready, and protected selected data remains imported.

Omen independently reached the canonical origin with trusted TLS, received HTTP 200 for liveness and
the application root, and received the expected HTTP 303 redirects from both the ordinary-password and
owner-passkey routes without following either login. The exact-state identity verifier subsequently
reported the ordinary configuration already present and reconciled, with owner identity, legacy RunaAI,
and protected product data unchanged.

The aggregate machine-readable result is
`evidence/CONTROL-ORDINARY-ACCESS-ACTIVATION-RESULTS.json`. It contains no password, token, cookie,
email address, client secret, protected content, or private evidence field.

## Fail-closed attempts

Four attempts restored the exact predecessor and removed only their attempt-created ordinary client,
flow, and generated secret before the successful activation:

1. Windows PowerShell collapsed an empty Keycloak response to `$null`; reconciliation now normalizes
   empty and single-item responses before counting.
2. The deployment probe expected HTTP 302 while the application contract intentionally returns 303;
   the probe now matches the tested contract.
3. The completed owner proof remained predecessor-bound; deployment now performs the audited,
   idempotent completed-owner release rebind before route acceptance.
4. The successor parser rejected the older predecessor config because it correctly predates the
   ordinary-client block; each immutable config is now validated by the parser shipped with its own
   release.

Nested HTTP/native-process errors now cross the operator boundary only as safe structured error codes.
Failed extracted releases and rollback evidence remain separate from the successful exact release.

## What remains

Keycloak has no SMTP sender and no ordinary user has been created. Live acceptance therefore remains
blocked on an approved SMTP account and owner-entered SMTP username/application password. Both values
are collected interactively on Control and excluded from command history. After SMTP delivery is
proved, issue one short-lived invitation to Matthew's separate personal email, let the invitee choose
the username/password, and verify email, login, navigation, logout/revocation, password reset, denial of
owner/protected actions and data, and unchanged owner passkey administration. The personal email,
password, invitation token, SMTP password, and client secret must not enter Git, evidence, or chat.
