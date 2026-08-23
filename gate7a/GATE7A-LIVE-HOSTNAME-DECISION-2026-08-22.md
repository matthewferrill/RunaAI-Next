# Gate 7A live hostname decision

Date: 2026-08-22

## Accepted decision

The steward approved `runa.bridgebuildersai.com` as RunaAI's permanent browser hostname. The resulting
external security boundary is exact:

| Purpose | Selected value |
|---|---|
| Application origin | `https://runa.bridgebuildersai.com` |
| WebAuthn relying-party ID | `runa.bridgebuildersai.com` |
| Browser-visible identity issuer | `https://runa.bridgebuildersai.com/auth/realms/runaai-next` |
| OIDC callback | `https://runa.bridgebuildersai.com/session/callback` |

`bridgebuildersai.com/runaai` is explicitly rejected. A path would share the parent website's origin,
cookies, and WebAuthn boundary; it would not isolate RunaAI as its own application.

## Read-only discovery

Public DNS inspection on 2026-08-22 found that `bridgebuildersai.com` is authoritative on Porkbun's
four nameservers. The selected `runa` host has no current A or CNAME record. A bounded Control
inspection found Caddy 2.11.4 at the retained Gate 6D binary hash, with no Porkbun DNS provider module.
The current listener boundary remains unchanged: only Caddy is LAN-facing at
`192.168.50.169:9761`; application, Keycloak, OpenFGA, PostgreSQL, and supporting listeners remain
loopback-only.

No DNS, certificate, listener, identity, passkey, protected record, service, or production release was
changed by this decision.

The four hostname-decision checks pass, bringing the focused Gate 7A suite to 28/28 and the full
repository suite to 326/326. They reject an apex or path-based origin, bind the selected external
issuer/RP ID/callback together, and prevent hostname approval from being reported as live activation.
The exact aggregate readiness output is retained in `evidence/HOSTNAME-DECISION-RESULTS.json`.

## Recommended LAN-first activation

The smallest path to ordinary Omen access keeps off-LAN ingress disabled:

1. create `runa.bridgebuildersai.com` as a Porkbun A record targeting Control's existing private LAN
   address `192.168.50.169`;
2. retrieve Porkbun's managed, publicly trusted wildcard certificate bundle through a scoped Porkbun
   API credential;
3. protect the API credential and certificate private key in the established owner-bound Control
   context, and automate certificate refresh before activation;
4. stage Caddy on standard HTTPS port 443 with the selected hostname while leaving the Gate 6D listener
   available for rollback;
5. update the exact Keycloak external issuer, web origin, callback, and WebAuthn RP ID together;
6. re-enroll the owner's Omen passkey at the permanent origin, validate revocation and governed
   step-up, then remove only the superseded commissioning credential after proof; and
7. witness Omen direct access before considering another PC, phone, non-owner, or off-LAN ingress.

This transitional public DNS record contains a private RFC1918 address. It routes nowhere from the
public Internet and opens no router port. It may be blocked by a LAN resolver's DNS-rebinding defense;
that condition must fail closed during preflight rather than trigger a browser or certificate bypass.

## Remaining blockers

- A least-privilege Porkbun API key must be created for `bridgebuildersai.com`, restricted to Control's
  source address when Porkbun's controls permit. The key and secret must never enter Git, chat, retained
  evidence, command output, or an unprotected file.
- The off-LAN ingress/privacy model remains unselected and disabled.
- The first non-owner acceptance person and device remain unselected.

Hostname approval alone does not authorize any of those live changes. The checked-in projection keeps
`liveChangesAuthorized`, DNS activation, certificate installation, and off-LAN ingress false.
