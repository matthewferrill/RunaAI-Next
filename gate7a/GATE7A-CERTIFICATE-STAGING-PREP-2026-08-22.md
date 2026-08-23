# Gate 7A certificate staging preparation

Date: 2026-08-22

The steward completed Control-local Porkbun enrollment after the documented DPAPI load remediation.
The retained credential is DPAPI CurrentUser-bound to `RUNA-CONTROL\Matthew`; neither value entered
chat, Git, logs, or evidence.

The authenticated read-only preflight passed. It proved domain access for `bridgebuildersai.com` and
confirmed the selected `runa` A/AAAA/CNAME record remains absent. It did not open the SSL bundle or
change DNS. Its allowlisted aggregate is retained at
`evidence/CONTROL-PORKBUN-CREDENTIAL-READINESS.json`.

`control/Stage-ControlPorkbunCertificate.ps1` prepares the next bounded step. It can run only in the
same owner context, unseals the enrolled credential in memory, and calls only Porkbun's current HTTPS
GET endpoint for the domain's SSL bundle. Before protected retention it validates certificate and key
PEM boundaries, the `*.bridgebuildersai.com` subject alternative name, current validity, and at least
14 remaining days. It stores only the chain, private key, and non-secret metadata beneath the existing
ACL-restricted candidate secrets root. It refuses overwrite and removes only its newly created staging
directory on failure.

Certificate staging does not create DNS, change a listener, alter Keycloak or WebAuthn, enroll a
credential, route traffic, or change production.

The staging tool's four fail-closed checks pass. The focused Gate 7A suite is 36/36 and the full
repository suite is 334/334. These results validate the prepared tool; they do not claim the protected
certificate bundle has been retrieved.
