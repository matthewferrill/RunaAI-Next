# Gate 7A multi-device access scope and green criteria

Status: approved corrective access foundation; identity section amended by the steward, 2026-08-23

## Requirement authority

Multi-device access is an original Runa requirement, not a new expansion discovered after Gate 6.
Legacy Decision 0079 explicitly made Omen the first remote seat, additional PCs the next phase,
separate household principals a later phase, and phones a future stable-HTTPS-origin phase. H2 already
modeled multiple credentials per person across desktop, laptop, phone, and recovery key. Its recorded
limitation was the `localhost` origin, not product intent.

Gate 6 correctly proved the selected-core backend, protected-data reconciliation, target identity,
authorization, rollback, and private TLS on Control. It incorrectly allowed the Control-local
commissioning origin to stand in for the permanent client topology. The correction must happen before
the user-facing conversational UI is built.

## Product topology to preserve

```text
authorized PC / phone browser
             |
  one permanent trusted HTTPS origin
             |
 bounded ingress; no public database or model listener
             |
 Caddy + RunaAI + Keycloak + OpenFGA on RUNA-CONTROL
             |
 PostgreSQL authority on Control
             |
 private Control-to-Home inference only
```

- RUNA-CONTROL remains the single application, identity, governance, and authoritative-data host.
- RUNA-HOME remains private inference infrastructure and is never a user sign-in surface.
- Omen is the steward's ordinary client and development seat, not a required runtime host.
- A user must not need RDP, SSH, a raw IP address, a browser exception, or manual private-CA
  installation for ordinary use.
- Each person has an individual principal, credentials, sessions, roles, project relationships, and
  revocation boundary. A device is not a person and a shared owner account is prohibited.

## Canonical browser origin

1. Production has one permanent DNS hostname owned by the steward and served on standard HTTPS port
   443. `localhost`, loopback addresses, raw IP addresses, dynamic hostnames, and non-standard ports
   are forbidden in browser-visible production URLs.
2. The certificate chains to an ordinary browser trust root. A private CA that must be installed on
   every client does not satisfy the multi-device gate.
3. Keycloak is published under the same canonical origin at `/auth`; its browser-visible issuer is
   `https://<canonical-host>/auth/realms/runaai-next`. The Keycloak service itself stays loopback-bound.
4. The WebAuthn relying-party ID equals the canonical hostname. Redirect URIs, web origins, cookies,
   PKCE state, CSRF origin checks, and passkey ceremonies bind only to that canonical origin.
5. The current `https://192.168.50.169:9761` route remains a bounded operator/rollback path during the
   transition. It is not advertised as the permanent user route.

## Network and exposure boundary

- Caddy is the only browser-facing Control service. RunaAI, Keycloak, OpenFGA, PostgreSQL, model
  proxies, management ports, and diagnostic listeners remain loopback-only.
- LAN acceptance may precede off-LAN activation, but it must use the final hostname and RP ID so
  adding remote ingress does not invalidate credentials.
- Off-LAN ingress must reach Caddy through a reviewed authenticated connector, private overlay, or
  equivalent bounded edge. Direct router port-forwarding to Control is not the default design.
- Selecting an edge or tunnel provider is also a privacy decision because it may process encrypted
  transport metadata or terminate TLS. No provider is selected silently by this contract.
- Home inference is reachable from Control only. No browser, edge, or remote client receives a route
  to Home or a raw model endpoint.

## Identity, passkey, and session boundary

- Public self-registration is disabled. The owner creates a single-use, expiring invitation for each
  new person. The invitation is delivered to a verified email address and expires after ten minutes.
- The invited person chooses an individual username and password in Keycloak and can use that ordinary
  credential from any supported browser. Verified email is the password-reset recovery boundary.
- An ordinary user may add and use a passkey, but a passkey is not required for ordinary chat or
  research. Password sessions and passkey sessions remain distinguishable identity evidence.
- The protected `matthew-owner` identity is not the ordinary test identity and cannot use the ordinary
  password client. Owner and administrator access remains user-verified-passkey-only.
- Each person may hold multiple passkeys. Platform-bound, synced, hardware, and cross-device passkeys
  are accepted only when Keycloak reports a discoverable credential with user verification.
- Matthew's normal first credential is enrolled from Omen after the canonical origin exists. At least
  one independent recovery credential must not depend on Omen.
- Using an unregistered PC may use the person's username/password or a phone/hardware cross-device
  passkey; it must not require copying a private key or sharing an account.
- Ordinary chat uses a bounded authenticated session. Role changes, lesson approval, recovery,
  credential management, security-policy changes, and governed effects require a fresh passkey
  step-up under the existing authority rules.
- Browser sessions use opaque host-only `Secure`, `HttpOnly`, `SameSite=Lax` cookies. Session records
  remain encrypted in PostgreSQL, expire, support per-session and per-credential revocation, and fail
  closed when Keycloak or OpenFGA is unavailable.
- A user's fingerprint, face, PIN, passkey private key, provider-vault secret, or recovery material is
  never received, logged, migrated, or stored by RunaAI.

## Gate 7A implementation tranches

### 7A-1 — contract and synthetic foundation

- Parse and validate the canonical origin, external issuer, RP ID, certificate mode, ingress mode,
  listener boundary, registration policy, passkey policy, session policy, and representative clients.
- Reject Control-local commissioning values when they are presented as permanent production values.
- Generate privacy-safe readiness output and a deterministic acceptance plan.
- Use no network, protected store, persistent service, domain, credential, or production configuration.

### 7A-2 — canonical LAN origin

- Requires the steward-controlled hostname and DNS/certificate method.
- Run the new origin beside the existing Gate 6 operator path. Do not rewrite the running release or
  delete its credentials.
- Configure external Keycloak hostname/relative path, exact client redirects/origins, Caddy routing,
  and the production RP ID.
- Enroll new canonical-origin credentials rather than copying or rewriting existing credentials.

### 7A-3 — representative clients and off-LAN boundary

- Prove Omen on LAN, another Windows PC, a phone, Omen off LAN, and a phone off LAN using the same
  hostname and identity authority.
- Add remote ingress only after its security, privacy, availability, logging, recovery, and cost
  disposition is reviewed.
- Keep the current Gate 6 route until every mandatory client and rollback check passes.

## Mandatory representative matrix

The sealed machine-readable matrix is `fixtures/client-matrix.json`. Every case must prove:

1. standard browser HTTPS succeeds without a warning or private-root installation;
2. neither navigation nor OIDC redirects expose `localhost`, loopback, a raw IP, or port 9762;
3. an ordinary household principal signs in with a username/password while owner administration uses
   a user-verified passkey;
4. the session survives ordinary navigation and expires/revokes correctly;
5. project/participant scope is enforced by OpenFGA before protected application work;
6. logout and credential revocation invalidate the intended sessions without affecting another user;
7. a fresh step-up is required for a governed action; and
8. no Control management, database, authorization, or Home model listener becomes client-reachable.

## Synthetic green criteria

- The complete client-access contract accepts one exact canonical configuration and is deterministic.
- Loopback, raw-IP, HTTP, non-443, private-CA, direct-port-forward, public-registration, shared-principal,
  browser-visible internal issuer, RP mismatch, wildcard redirect, insecure cookie, missing recovery,
  missing step-up, public backend listener, and public Home route cases fail closed with typed errors.
- Readiness output contains only allowlisted configuration facts and no hostname-account secrets,
  credential identifiers, tokens, cookies, certificate private values, or protected content.
- The full existing suite remains green. Gate 7A adds no dependency and starts no service.

## Live green criteria

- The canonical hostname and certificate method are documented, steward-controlled, renewable, and
  recoverable without exposing Control administrative services.
- Omen and a second representative device complete ordinary username/password sign-in without Control
  console access; optional passkey sign-in remains available.
- A distinct non-owner user proves separate identity, project scope, session, and revocation.
- A phone completes the same-origin ordinary sign-in flow without a client certificate or private CA.
- One off-LAN PC/phone flow passes through the reviewed remote boundary without changing RP ID.
- Loss of ingress, Keycloak, OpenFGA, PostgreSQL, or Home fails visibly and does not grant authority.
- Existing selected-core counts/digests, backups, authority generation, and legacy rollback health remain
  unchanged.

## Rollback

Gate 7A is additive until accepted. Disable the canonical route, revoke only credentials/sessions
created under it, restore the previous candidate configuration, and continue using the exact Gate 6
operator path. Do not reverse-migrate protected data, delete the Gate 6 realm, or alter legacy stores.

## Decisions that block live deployment, not synthetic work

1. The steward-controlled permanent hostname.
2. The DNS provider and certificate issuance/renewal method.
3. The off-LAN ingress choice and its privacy/cost disposition.
4. A working Keycloak SMTP sender for invitation delivery, verified-email confirmation, and password
   recovery.
5. The first non-owner participant and project-scope acceptance fixture.

No domain, DNS, certificate, edge-provider, firewall, credential, or production change is authorized
merely because the Gate 7A synthetic contract is implemented.
