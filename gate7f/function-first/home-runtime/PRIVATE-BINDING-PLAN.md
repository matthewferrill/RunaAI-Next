# Prospective private Control → Home operator binding

2026-08-28, before implementation. This extends the existing operator criteria, not the sealed model
campaign. No certificate, credential, listener, settings file or host state is changed by this plan.

Use mutual TLS for the new Home operator endpoint. Home verifies both the private issuer and the exact
Control client certificate SHA256; Control verifies the private issuer and fixed Home server name.
The existing IP allowlist remains a second boundary, never authentication. No bearer secret, client
certificate, private key or TLS material is forwarded into LM Studio, prompt text, model metadata or
ordinary application logs. Keep TLS1.3 and require a fresh certificate check on every HTTP request;
disable session tickets to prevent a resumed session from hiding peer identity.

The standalone factory will require explicit key/certificate/CA and one pinned client fingerprint,
have no listen side effect, and reject requests without a verified client before reading their bodies
or inspecting the runtime. Tests generate disposable local certificates and exercise real handshakes:
correct identity, no certificate, untrusted issuer, trusted but different identity, invalid server trust,
expired identity, and exact request/reply byte preservation. These tests cannot establish Home deployment.

Production provisioning will generate private keys only on their owning machines: Home server/issuer
and Control client. Transfer only CSR/public certificate material. Persist secrets only in new dedicated
restricted subdirectories; verify ACLs and certificate pins without printing private values. Actual
port selection, Caddy configuration, certificate renewal and rollback will be sealed with the complete
operator package after campaigns and model-role selection. No direct LAN1234 bypass may remain while
the new application route is active; the native observer requires LM Studio loopback binding. Preserve
the old exact settings/routing bytes for rollback. Public access and user identity are unchanged.

A single profile supports one selected primary for all five roles. A mixed winner binding remains
blocked until serialized drain/swap and profile routing are built and tested; this binding does not
silently load extra primaries. The initial guard does not resolve the desktop-login boot dependency.

## Prospective BGE transport addition

Parent review2026-08-28 requires the same authenticated boundary to carry only the fixed BGE
`POST /rerank` and `GET /health` routes to the existing local8412 service. Preserve request/response bytes,
windowed batches of at most32 documents, top_n covering the whole batch, and the application10second
deadline inside a15second outer transport ceiling. Reject unsupported overrides and other BGE routes.
Exercise routing, limits, exact bytes, dependency failure and authenticated access in local tests.

Before deployment, inspect existing BGE consumers using metadata/source/config references only; do not
read private prompts or logs. Do not close/reconfigure8412 until its consumers and exact rollback are
understood. If it remains available for approved legacy consumers, say exactly that: the M1 route uses
TLS while the legacy listener still exists. Do not claim all Home endpoints are closed or authenticated.

Primary APIs: [Node22 TLS server client verification](https://nodejs.org/docs/latest-v22.x/api/tls.html)
and [Caddy upstream mutual TLS](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Prospective enrollment packet and paths

Root accepted the new exact Control subtree `C:\AI\RunaAI-Next-Candidate\m1-home-runtime-tls`.
The current Control Caddy task runs as SYSTEM, independently observed2026-08-28; enrollment/private
client material must be accessible only to SYSTEM and Administrators. Do not reuse the Gate7A server
keys or change ACLs on any existing candidate directory. Home issuer/server enrollment uses the new
dedicated sibling `C:\AI\RunaAI-Next-HomeRuntime-Enrollment`; installation may later copy only the
same-host server leaf key/cert and public CA into the new runtime TLS directory. The issuer key stays
in the enrollment subtree, never the LocalService-readable runtime TLS directory.

Use a new immutable enrollment ID, RSA3072 keys, SHA256 certificates, a private CA with pathlen0,
and90-day server/client leaves (CA730days). Server identity is `runa-home-m1.internal`; Control Caddy
must explicitly verify that name. No system-wide trust-store import is needed. Rotation is a new
enrollment and a successor config with retained prior material, not in-place key/cert overwrite.

Generate issuer/server keys only on Home; generate the client key/CSR only on Control. Home accepts
one exactly pinned public CSR with the fixed Control subject and correct RSA3072 key; sign only the
fixed clientAuth extension, never CSR-requested extensions. Public transfer packets have an exact
allowlist, no private-key fields, bounded PEM size, enrollment ID, hashes and explicit peer binding.
Control imports only the matching signed client certificate/CA, verifies its own local private-key
match and the expected issuer/server pins, then emits non-secret fingerprints. Generation and import
are create-only and leave failures recoverable. No enrollment command activates a listener or route.

Local proof must exercise real OpenSSL key/CSR/sign/import across two disposable directories, verify
the private keys never appear in the transfer packets, reject mismatched CSR/issuer/client keys and
extra packet fields, and refuse existing output paths. Actual SYSTEM ACL, installed OpenSSL pin,
cross-host transfer and Caddy/mTLS handshakes remain installed proof requirements. No live enrollment
or Home configuration change occurs while candidate model campaigns are running.
