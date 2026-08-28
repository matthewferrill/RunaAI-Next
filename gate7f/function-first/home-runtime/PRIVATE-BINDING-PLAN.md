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

Primary APIs: [Node22 TLS server client verification](https://nodejs.org/docs/latest-v22.x/api/tls.html)
and [Caddy upstream mutual TLS](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
