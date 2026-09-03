# M1-S2 device and install readiness preflight

Date: 2026-09-03  
State: deterministic readiness evaluator green; no installer or device acceptance

This lane defines four distinct customer modes without turning a UI connection into execution authority:

- browser-only access uses the Control-hosted application and installs nothing on the viewing device;
- a one-time folder snapshot transfers selected bytes once and executes only in an isolated Control workspace;
- an optional persistent local-folder bridge is non-executing transport installed for the current user;
- fully local execution is a separate deferred mode with its own worker and isolation requirements.

The frozen manifest records exact component releases, hashes, publisher, privilege, reboot, network, enrollment and
rollback requirements. Production evaluation accepts only that deep-frozen manifest and binds its computed digest to
the authority-supplied digest. Alternate manifests are available only through an explicitly named test factory.
Trusted-signature evidence must identify the observed signer publisher and match the manifest pin. Required enrollment
must match Control's expected certificate digest, have bounded observation time and include a finite expiry safely
beyond the evaluation instant.

The initial 8/8 green draft was stopped by independent review at P1=3: production callers could inject a different
schema-valid manifest, signature evidence did not bind the signer identity, and enrollment accepted any certificate
digest with no required expiry. The correction added exact manifest authority, signer and enrollment bindings plus
adversarial coverage for reclassification, wrong publisher, unbound certificates and null or expired enrollment.

Affected checks pass 4/4 and the focused suite passes 12/12. Independent re-review reproduced both sets and returned
P0=0/P1=0. This is deterministic evaluator evidence only. No package was built or installed; no device was probed;
no privilege, reboot, enrollment, rollback, folder picker, browser, network, Control worker, local worker, production
change or model call occurred. Omen remains a browser/device endpoint, Control remains the primary workspace authority,
and Home remains model-only.
