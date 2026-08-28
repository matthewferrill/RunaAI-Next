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

## Enrollment implementation and observed proof

`tls-enrollment.mjs` plus `tls-enrollment-cli.mjs` implement the four fixed host operations. The
standalone six-file package imports no model/profile code. Each host validates its own Node/OpenSSL
and all source hashes before work, and exact fixed paths keep the enrollment outside existing keys.
The Windows wrapper creates/validates only the approved new parent and enrollment directory. Every
OpenSSL call rechecks the restricted directory; existing keys, outputs and unknown files are refused.
No enrollment mode can activate a route, trust store, task, listener, model or runtime.

Eleven local tests passed: eight real OpenSSL generation/CSR/sign/import and rejection tests, complete
standalone-package import, exact source-set validation, and actual PowerShell5 syntax validation.
An initial native ACL fixture was invalid because its PowerShell import failure was nonterminating;
it was corrected to fail immediately. Omen then correctly refused setting Administrators as owner
because that process was not an elevated Windows administrator. Those attempts are not native passes.

The actual native proof ran on Control as its already-authorized administrative Matthew context,
entirely under a fresh `staging\\m1-home-tls-acl-proof-<id>` directory. It uses synthetic text, not an
actual credential. The first proof's six native checks passed, but the outer dispatcher incorrectly
read an unset LASTEXITCODE; both its retained result and failed outer output remain evidence. A new
proof used an explicit native PowerShell child for reliable exit propagation and exited0 at
2026-08-28T20:50:45.4106691Z. All six checks passed: restricted ACL, public-read drift refusal, hardlink
refusal, restored own ACL, existing-root refusal, and shared parent unchanged. No task, listener,
model or production configuration was created/changed. Both exact fixture trees remain recoverable.

This proves the actual Control ACL primitive, not Home enrollment, private-key transfer, a Caddy
handshake, or the native LM Studio transition. Those remain explicitly unactivated requirements.

The combined isolated Home-runtime regression after this implementation passed104/104, zero skips.
The separate atomic completion companion passed3/3; roadmap regression passed15/15. Native Control
ACL evidence is retained under `evidence/20260828-tls-acl-*` with original raw file hashes, not folded
into those local test counts.

## Executable two-host operator (not yet activated)

`tls-enrollment-operator.mjs` adds the bounded offline package and transport assembly. `Prepare`
creates a fresh local descriptor and separate six-file Home/Control packets. The descriptor pins the
operator itself; all dependent source bytes and both host-specific Node/OpenSSL digests are checked
again before any SSH dispatch. Home uses its observed Node22.22.1; Control uses the immutable release's
observed Node22.22.0. Those binaries are deliberately not substituted for one another.

The explicit actions are `UploadHome`, `UploadControl`, `HomeOffer`, `ControlRequest`, `HomeSign`, and
`ControlImport`, each taking the descriptor path and its complete raw SHA256. Upload creates only the
new exact staging root/code directory, protects them for SYSTEM/Administrators before writing source,
and verifies every source pin before any later Node import. The four enrollment operations follow the
public packet chain; they cannot select a different host, key path, shell operation, model or service.
Only strict, at-most32KB flat public CSR/certificate packets cross the hosts. Each successful envelope
is validated before its original raw response and public bytes are retained locally. Private keys are
generated and remain on the owning host. The existing native libraries independently verify the CSR
signature, issuer, certificate usages, names, and local private-key match.

All destinations are create-only. A failed/uncertain operation is not repeated automatically; inspect
its exact owning host's retained enrollment first. This operator has no delete, task, listener, model,
trust-store, runtime-setting or routing activation action. Enrollment and actual private-subtree writes
remain scheduled after the candidate campaigns; no live enrollment was executed for this change.

Seven focused tests passed, covering offline exact-byte packets, drift/hardlink refusal before SSH,
private/unknown/duplicate public-field refusal, exact operation order with retained raw public replies,
no replay, and parsing all six generated commands in actual Windows PowerShell5. The transport calls
are test doubles; their public packets come from real local OpenSSL enrollment. They do not prove a
cross-host deployment. Actual Control ACL proof remains the separately retained result above.

Full operator regression including this assembly passed111/111, zero skips, with Windows OS access.
The first restricted run passed110/111 and failed the pre-existing CIM task-settings check with
access denied; it was not treated as a pass or changed to a skip. The unchanged suite was rerun with
the required OS access. Roadmap regression passed15/15. No Home or Control TLS operation was dispatched.

Prospective transport hardening, before host enrollment: measure all six generated commands with
their UTF16 EncodedCommand expansion and the nested Home SSH wrapper. A command must fit below the
Windows8191-character command-processor limit; prefer an explicit6500-character outer ceiling. If the
inline form exceeds it, use a fixed small bootstrap whose literal expected SHA256 binds the complete
script sent over bounded stdin. Check exact envelope fields, encoding, size and script digest before
executing that trusted operator script. Pass the bounded public/source input separately in the same
envelope; do not stage or expose any private key. Test real PowerShell execution with a harmless
synthetic script through the same bootstrap, wrong hashes/fields/caps, and every actual operation's
outer command length. This is an operator transport correction, not a campaign/model source change.

The original inline commands were measured before any live dispatch: UploadHome12538 characters
(12585 with nested SSH), UploadControl12638, HomeOffer11370 (11417 nested), ControlRequest12502,
HomeSign12170 (12217 nested), and ControlImport11826. All exceed8191. The earlier parser/transport-
double tests did not prove the Windows remote command-processor path; this finding is retained and
must be corrected before enrollment, not relabeled as successful transport.

The corrected bootstrap is3630 characters for every operation,3677 with the nested Home SSH
command, and at most3933 including a conservative256-character outer-wrapper allowance. All are
below the6500 ceiling. A bounded two-line base64 stdin envelope carries the full script and its
public/source input; the literal SHA256 in the small bootstrap is checked before script execution.
No temporary remote script is installed. Wrong digests, extra fields, invalid encoding and excess
input are rejected. A real Windows cmd→PowerShell5 test initially exposed default-console Unicode
loss; the child now explicitly selects UTF8 output. That test and all nine focused tests then passed.

Actual read-only Omen→Control SSH transport at2026-08-28T21:20:51.345Z preserved the exact synthetic
UTF8 input/output through the shortened bootstrap, exited0, and made no enrollment/model/config/
task/listener changes. Its raw response and bound operator hash are retained in
`evidence/20260828-tls-transport-control.json` (SHA256
`d3551dd21eac64369e49acb61fe8271428267c8fb5e0c2e038a1cba0ccf830e0`).
The Home nested-hop proof is deferred to the between-model window. This proves transport mechanics,
not cross-host certificate enrollment or native runtime activation.

The complete isolated operator suite with this transport correction passed113/113, no skips,
using the required Windows OS access. The previously prepared local descriptor is retained but no
longer dispatchable because the operator hash changed; any actual enrollment will use a new packet.
