# Gate 7A certificate staging results

Date: 2026-08-22

The one-shot Control owner operation passed. Porkbun's managed wildcard certificate was retrieved in
memory, its PEM boundaries and `*.bridgebuildersai.com` SAN were verified, and its remaining lifetime
was 34 complete days at validation time. The chain and private key are retained only beneath the
existing ACL-restricted candidate secrets root. No certificate or private key content entered Git,
chat, logs, or retained evidence.

The operation created no DNS record, opened no listener, changed no firewall or Keycloak setting,
restarted no service, and changed no production route. Its allowlisted aggregate is retained at
`evidence/CONTROL-CERTIFICATE-STAGING-RESULTS.json`.

The current release projection now separates the browser-visible issuer from Keycloak's loopback-only
backchannel, binds the one exact `/session/callback`, and permits only an exact successor to the closed
promoted release. This is build preparation, not live activation.

Validation is green at 41/41 focused Gate 7A checks and 340/340 repository checks.
