# Gate 7A ordinary-user access model decision

Status: steward approved, implemented locally, live activation pending

## Decision

The owner and ordinary-user authentication experiences are deliberately separate:

1. The owner sends one single-use invitation per person.
2. The invited person chooses an individual username and password.
3. That person can sign in from any supported PC through the canonical RunaAI hostname.
4. A passkey is encouraged and supported but optional for ordinary chat and research.
5. A fresh user-verified passkey remains mandatory for owners, administrators, security and recovery
   changes, learning approval or alteration, Runa behavior changes, and other protected work.
6. Verified email provides password-reset recovery.
7. Public self-registration remains disabled; external users use the same invitation path.

Matthew's acceptance fixture will be a distinct `adult-member` principal, not `matthew-owner`. The
owner identity and its passkey-only Keycloak client remain unchanged.

## Implementation boundary

- `runaai-next` remains the passkey-only owner/protected client with `amr=["webauthn"]`.
- `runaai-next-user` is a separate confidential client with an exact password-only browser flow,
  exact callback, PKCE, no direct grant, and `amr=["pwd"]`.
- The application verifies both audiences through their own client credentials. It does not decode an
  unverified token to decide which client to trust.
- Owner and ordinary sessions use different host-only, `Secure`, `HttpOnly`, `SameSite=Lax` cookies and
  different encrypted PostgreSQL records. Presenting both cookies fails closed.
- Password login is permitted only for `adult-member`, `minor-member`, and `guest`. Steward roles cannot
  fall back to the ordinary password client.
- The first personal fixture receives only the `chat_ephemeral` OpenFGA relationship. It receives no
  owner, learning, workspace, settings, recovery, or governance authority.
- Invitation email, username, tokens, client secrets, passwords, and recovery values are excluded from
  retained evidence. Keycloak necessarily retains the invited email as protected identity data.

## Invitation and recovery

Keycloak, not RunaAI, collects the username and password. The invitation requires `VERIFY_EMAIL`,
`UPDATE_PROFILE`, and `UPDATE_PASSWORD`, expires after ten minutes, and is sent only after the product
principal and one chat-only relationship are transactionally prepared. A failed send removes the new
Keycloak user, product principal, and relationship.

Control currently has no SMTP sender configured. The repository includes owner-bound DPAPI enrollment,
exact realm application, and rollback tooling, but no sender configuration will be guessed. Live
invitation and password-recovery acceptance remain blocked on the steward's email-provider settings.

## Acceptance

- Invitation link is single use and expires as configured.
- The invitee chooses a username/password and verifies the named email.
- Ordinary login succeeds from Omen without a passkey or Control access.
- Optional passkey login succeeds if the ordinary user adds one.
- The ordinary account cannot access Matthew's selected data, workspace evidence, learning controls,
  settings approval, owner ceremony, or administration.
- Logout and provider revocation invalidate only the intended user session.
- Forgotten-password recovery reaches the verified email and invalidates the old password path.
- `matthew-owner` remains passkey-only and unchanged.

## Rollback

Before acceptance, disable the ordinary routes and restore the exact predecessor application release;
delete only the newly created ordinary client, flow, generated client-secret file, test principal, test
relationship, and test Keycloak user. Do not change the owner client, owner credentials, selected-core
authority, protected product records, or legacy RunaAI.
