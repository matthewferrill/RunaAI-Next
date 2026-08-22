# Gate 7A synthetic results

Date: 2026-08-22
Branch: `codex/gate-7a-multidevice-access`

## Result

The multi-device access foundation is green in synthetic validation. It encodes the permanent access
boundary before any live hostname, certificate, listener, ingress, account, credential, or protected
store is changed.

Gate 6 proved that the selected core and owner verification could operate privately on Control. Its
commissioning flow used a raw Control address, private CurrentUser certificate trust, and browser-visible
loopback identity behavior. Those choices were valid for witnessed commissioning but do not satisfy the
original client requirement in legacy Decision 0079 and H2: Matthew on Omen or another PC, distinct
users on their own PCs, phones, and eventual off-LAN browser access. Gate 7A treats the narrow Gate 6
client boundary as commissioning evidence rather than permanent architecture.

## Enforced boundary

- Control remains the only authoritative application, identity, governance, and data host.
- Home remains private inference infrastructure callable by Control, never by a user browser.
- Omen, other PCs, phones, and approved off-LAN devices are ordinary browser clients.
- One stable DNS hostname, public WebPKI trust, and standard HTTPS port 443 define the WebAuthn origin.
- Browser-visible Keycloak is same-origin under `/auth`; application, Keycloak, OpenFGA, and PostgreSQL
  remain loopback-only behind Caddy.
- Accounts are individual and invitation-only; public self-registration and shared identities fail
  closed.
- Platform, synced, and cross-device discoverable passkeys require user verification. The owner needs
  at least two credentials plus independent recovery.
- Browser sessions are opaque, encrypted in PostgreSQL, Secure, HttpOnly, host-only, SameSite=Lax, and
  online-revocable.
- Governed or protected work requires a fresh passkey step-up no older than 300 seconds and an OpenFGA
  authorization check.
- A direct router port forward and exposure of Control administration are rejected.

The five frozen acceptance cases cover owner access from Omen on LAN, a member on Windows on LAN, the
owner on a phone on LAN, the owner on a PC off-LAN, and a member on a phone off-LAN.

## Verification

| Check | Result |
|---|---|
| `npm run test:gate7a` | 24/24 passed |
| `npm run verify:gate7a:synthetic` | Passed; deterministic privacy-safe evidence emitted |
| `npm test` | 322/322 passed |
| Policy digest | `3aefce3ccecfc3b727135bab70ca0eb0dda6fc49fafbb4a89d0f3cbcc959018d` |
| Client matrix digest | `53780146692eb264b856a94a5d6716e688916c567db9153539bbcbb62069465a` |
| Acceptance plan digest | `d36ab2a13cde95cb1157d61be8f07d7db40c0f0974fc68375a84da19f92016fb` |

The retained aggregate result is `evidence/SYNTHETIC-RESULTS.json`. It contains no password, token,
cookie value, credential identifier, private key, private content, or protected record.

## What did not happen

No dependency was added. No service was started. No networking, DNS, certificate, ingress, credential,
protected store, or production release was changed. The running Gate 6D release and intact legacy
rollback system were not touched. `runa.example.com` is an IANA-reserved synthetic fixture and is not a
selected live hostname.

## Live deployment blockers

Live implementation cannot honestly begin until four inputs are selected:

1. the permanent steward-owned hostname;
2. its DNS and public-certificate issuance method;
3. the off-LAN ingress model and its privacy tradeoff; and
4. a non-owner acceptance principal and device for witnessed validation.

These are product and privacy decisions, not missing synthetic code. The next live plan must preserve
the final hostname from the first credential enrollment so passkeys do not need another origin-breaking
re-enrollment.
