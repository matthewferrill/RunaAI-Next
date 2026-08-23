# Gate 7A Porkbun credential preparation

Date: 2026-08-22

The approved hostname is authoritative on Porkbun. The next live prerequisite is a scoped Porkbun API
key, but neither key may be pasted into chat, committed, printed, or stored in plaintext.

`control/Set-ControlPorkbunCredential.ps1` therefore accepts both values through hidden interactive
prompts only on `RUNA-CONTROL\Matthew`. It validates the current Porkbun `pk1_`/`sk1_` formats, protects
the payload with DPAPI CurrentUser, writes it inside the already ACL-restricted candidate `secrets`
directory, verifies the encrypted round trip, clears mutable buffers, and emits only an allowlisted
aggregate. It performs no network call and refuses to overwrite an existing enrollment.

`control/Test-ControlPorkbunCredential.ps1` unseals the credential only in the same owner context. It
uses Porkbun's current official HTTPS GET endpoints for authenticated ping and DNS retrieval, confirms
domain access and the continued absence of the selected `runa` host record, and emits only aggregate
readiness. It does not open the SSL-bundle endpoint and cannot create, edit, or delete DNS.

The scripts are preparation only. They do not enable Porkbun API access for the domain, create the API
key, change DNS, retrieve a certificate, install a key, alter a listener, enroll a passkey, or modify
production.

PowerShell syntax validation passes. After the assembly-load remediation, the four credential-boundary
tests pass, bringing the focused Gate 7A suite to 32/32 and the full repository suite to 330/330.

## First interactive attempt RCA

The first Control enrollment attempt failed closed before retaining a credential. A clean Windows
PowerShell 5.1 child process did not automatically load the `System.Security` assembly, so the
`ProtectedData` type could not be resolved. A separate secret-free owner-context probe proved DPAPI
CurrentUser round trip and restricted-directory write access were healthy, and confirmed the target
credential file remained absent.

Both enrollment and preflight now load `System.Security` explicitly before any DPAPI use. Enrollment
does so before prompting for either key and emits a stage-specific safe error if an unexpected failure
recurs. No API key or secret from the failed attempt was retained.
