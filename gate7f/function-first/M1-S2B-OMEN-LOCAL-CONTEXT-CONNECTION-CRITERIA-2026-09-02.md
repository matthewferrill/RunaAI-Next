# M1-S2B Omen local-folder and local-Git read-only criteria — 2026-09-02

Status: the first startup amendment is published in `44ead36`. Later exact-byte implementation reviews
stopped actual execution at P0=0/P1=8, P0=0/P1=5 and two successive P0=0/P1=2 reviews. The latest enabled-drain
and late-event proof corrections became independently green and were committed in `11fa6c1`. The affected
actual Windows proof then stopped at DPAPI state publication because the helper used a .NET overload absent
from pinned Windows PowerShell 5.1. The root cause and finite correction are recorded in
`M1-S2B-ACTUAL-WINDOWS-FAILURE-RCA-2026-09-02.md`. The correction passes 14/14 focused checks, syntax,
PowerShell parsing and its updated release pin, and independent review returned GO with P0=0/P1=0. After
commit `0b4e1d4`, the one affected proof stopped at the same stage. The completed RCA found that the clean
pinned PowerShell process had not loaded the DPAPI assembly; the overload defect was real but latent. The
amended explicit assembly-load and typed-error correction initially received P0=0/P1=1 because its helper
was accidentally inside the C# here-string. No actual proof ran. The placement is corrected, and exact
embedded-C# compilation plus six syntax checks, 15/15 focused checks, PowerShell parsing, the updated
release pin and a read-only pinned-host DPAPI assembly probe pass. It remains
non-executable. Fresh exact-byte independent review returned GO with P0=0/P1=0; a source commit remains
mandatory before actual execution.

## Slice selection record

- Selection date and source commit: 2026-09-02 / `4851818`.
- Roadmap revision and SHA-256: `2026-08-28.1` /
  `d4f1d1a10db991a101f7ade37af19022fdc92a4d792e944a3ad56edc8ae9d23f`.
- Milestone and capability subsets: M1 product-foundation pull-forward; C02 project context, C03 explicit
  local text files, C06 repository orientation, C08 local Git observation, C15 usable connection/file
  surfaces, and C16 the exact Omen ordinary-user seat.
- Baseline: M1-S2A is independently green at `4851818`; the application can truthfully show connection
  state but no local connector is enabled. Legacy Decisions 0069 and 0071 prove useful bounded folder
  reading and Git observation in the old localhost application. They do not prove the new
  Omen-browser -> Control-application architecture.
- Accepted dependencies: ordinary Omen sessions, exact-origin Control APIs, PostgreSQL
  participant/project authority, the single-canvas shell, Windows CurrentUser protection and installed
  Git whose absolute path/version/SHA-256 are release-pinned. No Omen-compatible network-denied Git
  process profile is accepted yet: building and proving the new `runa-omen-git-readonly/v1` MXC
  ProcessContainer policy is included slice work. Gate 7E's Control-host profile is evidence to inspect,
  not an inherited acceptance claim. Home/model availability is not needed because this slice is
  model-independent.

## Architectural decision

Control must not pretend that an Omen path is locally readable. A narrow Omen companion is the only
component that opens local folders or invokes local Git. It binds loopback only and runs as the signed-in
Windows user. The Control-hosted browser UI relays bounded requests and results; Control never mounts an
Omen drive and the companion never receives a Control database credential, model credential, session
cookie, Git credential, or protected Runa record.

Authority is deliberately split without creating two competing product stores:

1. Omen keeps the absolute root locator and a device signing key under Windows CurrentUser DPAPI. This is
   local capability custody, because the path has meaning only on that device.
2. PostgreSQL on Control is authoritative for participant, project, device, connection lifecycle, allowed
   read operations, revocation, request idempotency and accepted receipt digests. It stores no absolute
   Omen path.
3. Before every read, the browser asks Control for a one-use capability. Control authenticates the
   ordinary session and checks the active participant/project/device/connection/root binding before it
   signs a maximum-30-second capability containing issuer, audience device id, companion boot epoch,
   browser-instance public key and its thumbprint, participant pseudonym, project id, connection id, root
   id, operation, canonical argument digest, capability-set version, issued/expiry times and a 32-byte nonce.
   The companion verifies the token and browser proof, then directly redeems the nonce over pinned Control
   HTTPS using its device signature. PostgreSQL atomically records redemption against current lifecycle
   and capability-set version before the companion opens a handle or starts Git. The companion has no
   offline-read mode; Control-unreachable means no read.
4. Redemption is the authorization linearization point. A revoke transaction that commits first rejects
   redemption and reads nothing; a redemption that commits first is one already-authorized in-flight
   operation, which revoke visibly drains before reporting completion. No new redemption can commit after
   revocation. Control persists nonce consumption and the in-flight deadline across companion and Control
   restarts.
5. After the operation, the companion directly sends Control an idempotent completion containing the
   redemption id, outcome, argument/result digests, root/device ids, timestamps and companion signature.
   Control verifies it and atomically closes the in-flight redemption. The browser may display content only
   after Control returns `completion-accepted` for that exact result digest.
6. Revocation requested while Omen is offline immediately blocks new redemption at Control. Local DPAPI
   cleanup may be pending, but a retained local root can no longer authorize a read or produce a
   Control-accepted receipt.

The companion generates its own Ed25519 key under CurrentUser DPAPI. Enrollment binds its public key and
release digest to one ordinary participant after a Control challenge and proof-of-possession signature.
Control's separate capability-issuer public key is pinned in the signed companion release. Rotation uses
a bounded two-key overlap recorded in PostgreSQL; replacement requires a fresh ordinary session, a new
challenge and visible local confirmation. Disabling or revoking either device key or issuer key is
immediate. Private keys never cross hosts or enter logs. Each companion start creates a random 256-bit
boot epoch, registers it with a device-key signature, and invalidates the previous epoch before `/status`
becomes ready. Each Edge browser profile creates a non-exportable WebCrypto Ed25519 instance key in
IndexedDB; its public-key thumbprint is registered to the authenticated session/device. Reload and browser
restart retain that key, while another profile/browser lacks it and cannot use the grant. Clearing browser
storage requires visible re-registration. Every local request signs its request id, arguments digest and
companion nonce with this browser key.

The production companion uses HTTPS on the fixed IPv4 endpoint `https://127.0.0.1:43117/runa-local/v1`;
an independently staged candidate uses port 43118. It never binds `0.0.0.0`, IPv6, a LAN address or a
hostname. The certificate has only the loopback IP SAN, is installed in the signed-in user's CurrentUser
trust store, and its private key is non-exportable CurrentUser material. Startup fails closed if the exact
port is occupied, the certificate/release digest is wrong or another listener answers. `/status` performs
exact `v1` negotiation. Edge Private Network Access preflight is answered only for the configured RunaAI
HTTPS origin, with `Access-Control-Allow-Private-Network: true`, the minimum methods/headers and
`Cache-Control: no-store`; no wildcard or reflected origin is emitted. Actual Edge acceptance must prove
this transport. If the installed Edge policy blocks it, the slice stops for a new reviewed transport
design rather than falling back to HTTP.

The companion accepts only that exact origin, exact `127.0.0.1:<port>` Host and a fresh in-memory
anti-replay nonce. A webpage cannot submit an
arbitrary path: the production add flow accepts only a short-lived candidate created by the companion's
native Windows folder picker, followed by a visible preview and explicit confirmation.

Exact companion ceilings are: eight roots; 80 display-name characters; 1,024 canonical-path characters;
16 pending picker candidates; 120-second picker/candidate lifetime; 64 KiB request body; two concurrent
requests; 15-second operation deadline; 512 KiB response body; 1,024 consumed capability nonces retained
for five minutes; and ten seconds permitted clock skew. Preview is limited to depth 8, 2,000 files, 1,000
directories, 20 secret-name warnings, five seconds and 64 KiB. Tree view is depth 4, 500 entries, five
seconds and 128 KiB. One text read accepts a 256 KiB regular file but returns at most 64 KiB/400 lines.
Git returns at most 40 commits, 500 changed paths and 256 KiB within 15 seconds. Crossing a ceiling
returns a typed truncated/denied result and never silently widens it.

## Included customer behavior

1. The `+` menu, Files and artifacts view, and Connections view can open **Add local folder** only when a
   compatible Omen companion is actually reachable.
2. The native picker creates a short-lived preview containing display name, bounded file/folder counts,
   truncation, repository detection, and secret-looking-name warnings. Whole drives, the Windows user
   home, system/protected folders, missing/non-directory paths, symlinks/reparse roots and overlapping or
   nested grants are refused before confirmation.
3. Confirmation binds at most eight roots to the signed-in participant, selected project and exact Omen
   device. Scope is `bounded-text-read` plus `local-git-observe` only when a repository is detected.
4. Files exposes an allowlisted tree and bounded UTF-8 text preview. It rejects traversal, absolute or
   alternate-device paths, symlink/junction/reparse escape, protected names, secret/key/config credential
   files, binary/invalid UTF-8 content, unsupported types, oversize files and stale/revoked connections.
5. A repository view exposes branch/status, bounded recent log, branches, sanitized remotes, diffstat and
   one hexadecimal commit summary. Each display names the exact root, operation and read-only receipt.
6. Test connection performs a fresh signed Omen read and advances lifecycle only through
   `known -> configured -> connected -> tested -> enabled`. Project use is separately visible.
7. Disconnect removes current availability without widening another scope. Revoke immediately disables
   Control acceptance, attempts local-root removal, reports pending local cleanup honestly if Omen is
   offline, and is retry-safe.
8. The user can reconnect the same device after browser reload without re-entering a path. A different
   browser, participant, project or Omen device cannot inherit the grant.

## Git execution boundary

Every directory/file operation opens a Windows handle without following a reparse point, derives the
volume identity, file id and final path from that handle, and rechecks the same-root ancestry immediately
before reading. Alternate data streams, NT device/extended/UNC paths, trailing-dot/space aliases,
case/8.3 aliases, changed reparse targets and any regular file with more than one hard link are refused.
The actual race proof replaces a permitted entry between selection and open and requires denial; a
pre-open `realpath` check alone is not acceptance.

The companion invokes one manifest-pinned absolute `git.exe` by SHA-256 with argument arrays, no custom or
inherited environment and a closed operation table. Reachable
operations are only status, log, diffstat, branches, sanitized remotes and show-one-commit. Commit ids are
plain hexadecimal. Git runs with optional locks, prompts, pagers, credential helpers, maintenance,
filesystem monitors, external diffs and text conversion disabled. Remote URLs are reduced to a
credential-free host/repository display before leaving Omen.

`.git` must be a real in-root directory; `.git` indirection files, linked worktrees, submodule traversal,
object alternates, replace objects, promisor/partial-clone lazy fetch and repository config includes are
refused. Repository config is parsed first and refused if it names an executable
helper/filter/fsmonitor/external diff, include or outside-root object store. The pinned Git command prefix
is exactly `--no-optional-locks --no-replace-objects --no-lazy-fetch --no-pager`, followed by literal
`-c` pairs for `core.hooksPath=NUL`, `credential.helper=`, `credential.interactive=false`, `core.askPass=`,
`core.fsmonitor=false`, `diff.external=`, `core.attributesFile=NUL`, `core.excludesFile=NUL`,
`interactive.diffFilter=`, `protocol.allow=never`, `maintenance.auto=false`, `gc.auto=0`,
`fetch.writeCommitGraph=false`, `core.untrackedCache=false`, `core.preloadIndex=false` and the exact
`safe.directory=<selected-root>` value. Diff/show additionally require `--no-ext-diff --no-textconv`.
System/global config may be parsed by Git because MXC cannot accept the environment variables that would
replace it. The exact Git-for-Windows system config and system attributes bytes are therefore release-pinned;
global attributes are disabled; and any repository `.gitattributes` or `.git/info/attributes` file is refused
before Git starts. This prevents a repository attribute from selecting the system/global LFS clean/process
filter. The exact later command-line values override every remaining executable, prompting, network,
conversion, maintenance and optional-write surface reachable by the closed read-only verbs.
Remote-capable verbs remain unreachable, so no credential or terminal prompt path exists. The child runs only in the new
manifest-bound `runa-omen-git-readonly/v1` network-denied Windows containment profile.
Status/log/branches/diff/show use NUL-delimited machine
formats; invalid UTF-8, unexpected fields, control characters, excessive paths or output overflow fail
closed rather than reaching the UI.

The new `runa-omen-git-readonly/v1` containment manifest pins MXC `0.8.0`, the generated policy bytes, the
absolute `git.exe` path/hash, release runtime files and the exact read-only selected-root grant. Its
AppContainer declares neither `internetClient` nor `privateNetworkClientServer`, receives no writable
path, inherited handle, stdin, custom/inherited environment or credential. `process.env` is omitted
because actual Omen MXC 0.8.0 rejects every non-empty custom environment before `CreateProcessW`; the
fixed Git command-line controls above replace the required safety effects without adding a launcher or
shell. The generated policy is normalized only for the per-operation container id, selected-root path and
fixed command line, then compared with an independently committed policy-template SHA-256 before spawn.
The actual Omen startup proof freezes both that template and each exact manifest. MXC enforces the 15-second process timeout;
the companion also bounds captured output and treats a missed terminal exit as failure. This slice does
not claim a ProcessContainer child-count or memory ceiling because MXC 0.8.0 exposes neither control.
Security instead depends on the fixed Git verbs and flags, closed executable-extension points, read-only
root/runtime grants and deny-all network containment. A pinned native guard holds both the validated root
and `.git` directory without delete sharing from final pre-spawn validation until Git terminates and its
result is revalidated; root or `.git` rename/replacement must fail during that window. A recursive Windows
mutation witness starts before the final manifest and must remain error-free and event-free through
result completion, so config, packed-ref, attribute or worktree mutation—including restore—is denied. Actual acceptance
inventories executable path and SHA-256 during both a deliberately long successful operation and a
proof-only blocking `git hash-object --stdin` operation that must be terminated by the same 15-second MXC
policy. Neither MXC nor Git may survive completion or timeout. Release acceptance also starts two fresh
actual companion processes, labeled first-run and post-restart. Each uses the same pinned containment
template for proof-only `git ls-remote` attempts to an owned loopback listener, an owned LAN listener and a
fixed public HTTPS target. Both owned listeners must receive zero connections and every contained attempt
must fail; no application route exposes either proof-only verb. An MXC warning, unsupported tier, policy drift, required broad ACL
change or inability to start pinned Git is a stopped actual-system failure; the design may not silently
reuse Gate 7E or run Git outside this profile.

Fetch, pull, push, clone, commit, add, checkout, switch, restore, reset, clean, rebase, merge, tag,
worktree mutation, submodule update, LFS network use, hooks, shell strings and model-supplied commands are
unreachable, not merely discouraged. The proof hashes the disposable working tree and `.git` directory
before and after every allowed operation and requires byte-for-byte equality.

## Explicit exclusions

- No model call, embedding, index build, automatic crawling, automatic context attachment or learning.
- No file write, rename, delete, execute, test, dependency install, Git mutation, remote access, GitHub,
  web research, publication, CI, deployment or administrative action.
- No upload/archive/document parser, image/PDF/Office interpretation, live sync or background watcher.
- No whole-drive, home-directory, network-share or Control/Home filesystem grant.
- This slice does not mark C02, C03, C06, C08, C15 or C16 complete or accepted.

Legacy Decision 0069's visible add/preview/remove and bounded-read behavior is ported with the stronger
distributed authorization above. Decision 0071's automatic chat consultation of Git history is explicitly
deferred to the Research/Code contextual-source slice. This slice displays user-requested observations
only; it does not attach file or Git content to a prompt. The old slash-command UI and localhost-app
authority are not ported.

`runa-local-protected-source/v1` is the frozen, case-insensitive protection policy for picker previews,
file trees and direct text reads. A path is denied when
any segment is `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, `.docker` or `.git`; when the basename is
`.env`, begins `.env.`, or equals `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `.netrc`, `_netrc`,
`.npmrc`, `.pypirc`, `credentials`, `credentials.json` or `secrets.json`; or when its extension is `.pem`,
`.key`, `.pfx`, `.p12`, `.keystore`, `.jks` or `.kdbx`. Preview reports only an aggregate denied-name
count. For every otherwise-permitted text file, the companion privately scans all bytes (maximum 256 KiB)
before returning any prefix and denies content matching a PEM/OpenSSH/PGP private-key header,
`AKIA[0-9A-Z]{16}`, `gh[pousr]_[A-Za-z0-9]{36,255}`,
`github_pat_[A-Za-z0-9_]{20,255}`, `sk-[A-Za-z0-9_-]{20,}`,
`xox[baprs]-[A-Za-z0-9-]{10,}`, or a line assigning `password`, `passwd`, `pwd`, `secret`,
`client_secret`, `api-key`, `api_key`, `access-token`, `access_token`, `refresh-token` or
`refresh_token` to a non-whitespace value of at least eight characters. Exact values `example`,
`changeme`, `<redacted>`, `REDACTED`, `${...}` and empty quoted values are negative exceptions. Policy
tests freeze case variants, start/end boundaries, every denied directory/name/extension/pattern, benign
prose and source identifiers, each exception, a secret after the 64 KiB display cutoff, and one-byte near
misses. A match returns only `protected-source-denied`; neither matching bytes nor pattern id leaves the
companion.

The `.git` rule has one narrow internal exception: the repository detector may check only that an in-root
`.git` directory exists, and the pinned contained `local-git-observe` operation may read its validated
metadata. `.git` entries and bytes never appear through picker, tree or text-preview APIs. No other
operation or process receives that exception.

## Model-independent wire contracts

- Control capability: `runa-local-read-capability/v1`, an opaque signed token carrying only the exact
  fields listed in the pre-read authorization rule above, including boot epoch, browser public key and its
  thumbprint.
- Companion request: `runa-omen-local-request/v1` with `requestId`, `connectionId`, `rootId`, `operation`,
  canonical bounded `arguments`, `controlCapability`, `companionNonce`, `bootEpoch`, `browserPublicKey`,
  `browserKeyThumbprint` and `browserProof`. The companion hashes the supplied public key, requires the
  token thumbprint to match, then verifies the proof.
- Control redemption: `runa-local-redemption/v1`, sent directly by the companion with capability id,
  request/argument digest, boot epoch, browser-key thumbprint, companion timestamp and device signature;
  its response is only an allowlisted redeemed/denied code plus redemption id and deadline.
- Control completion: `runa-local-completion/v1`, sent directly by the companion with redemption id,
  outcome code, argument/result digests, root/device ids, start/completion times and companion signature;
  duplicate identical submissions return the original decision and mismatched reuse is denied. Control's
  response is `completion-accepted`, `completion-rejected` or `completion-already-finalized` plus the exact
  result digest and no content.
- Companion success: `runa-omen-local-result/v1` with the same identifiers, structured allowlisted result,
  truncation/limit metadata and `receipt` containing release/device/capability ids, argument/result SHA-256,
  start/completion times and Ed25519 signature.
- Companion failure: `runa-omen-local-error/v1` with an allowlisted error code, retryable boolean,
  correlation id and no path/content/process detail.
- Control lifecycle: `runa-local-connection/v1` with participant/project/device/connection/root ids,
  capability-set version, lifecycle state, allowed operations, last-test time/result code, revocation and
  local-cleanup state, current boot epoch, registered browser-key thumbprints and in-flight redemption
  count. Absolute paths and retrieved content are forbidden fields.

The versioned parsers reject extra, missing, overlong or wrong-type fields. Request ids are idempotent and
bound to the canonical input digest; reuse with different input fails.

## Data destination and retention

Absolute paths and picker previews stay on Omen and may appear transiently in the local browser DOM so the
user can confirm scope; they never enter a Control request. Control and its logs/telemetry retain only safe
root labels, opaque ids, lifecycle fields, aggregate counts, timestamps, allowlisted error codes and
cryptographic digests. `exact root` in this contract always means root id plus safe label, not its path.

File content and Git output in this slice stay in companion response memory and the browser's current DOM
only. They are not sent to Control, a model, PostgreSQL, Qdrant, logs, telemetry, crash reports,
`localStorage`, IndexedDB or browser Cache API. Every response is `no-store`; navigation/reload clears it.
The DPAPI root locator and device key persist on Omen until local revoke/uninstall reconciliation. Control
connection metadata participates in the ordinary account export/delete lifecycle; source content does not
because it is never retained. Diagnostics contain counts/digests/codes only.

## Deterministic and actual-system acceptance

Acceptance evidence is layered; a mock cannot substitute for the named system:

1. Contract tests reject every invalid origin/Host/nonce, forged/replayed/expired capability or signature, wrong
   participant/project/device/root, stale request, lifecycle skip, unavailable companion and revoked
   connection before any read or Git process.
2. An owned disposable PostgreSQL instance proves device/connection registration, exact project scope,
   idempotency, concurrent revoke/use ordering, redemption/completion/restart, abandoned-deadline cleanup,
   pending-cleanup reconciliation and rollback-safe additive migration from the exact M1-S2A predecessor.
3. An actual Windows Omen proof creates an owned disposable folder and real Git repository, including
   protected names, binary/oversize files, hard links, aliases and reparse-race escape cases. A missing OS
   privilege is a retained environment blocker, not a skipped pass. It uses the real
   filesystem, CurrentUser DPAPI, the exact candidate HTTPS endpoint on port 43118 with its CurrentUser
   certificate/private-key path, and the pinned installed Git executable; confirms process and
   port cleanup; proves no bytes changed and no unowned path was read; and exercises hostile `.git` files,
   linked worktrees, alternates, replacement objects, partial-clone configuration, external helpers,
   case and available 8.3 aliases, empty files, a file-entry replacement race, malformed/control-character
   output and a network-denied promisor access. Shared native/helper byte changes make any older native-file
   proof historical until one affected-scope rerun passes.
4. The actual Omen Edge page performs once: companion discovery, native folder selection, preview,
   confirm, project binding, connection test, file-tree/read, Git status/log/diffstat, reload/reconnect,
   lost-browser completion suppression, disconnect and revoke. It also proves browser-profile key
   persistence across reload/restart and denial from a second Edge profile. Narrow-screen and keyboard
   operation are included. Folder selection is the only
   step that may require the user's physical choice; it occurs only after all automated gates are green.
5. The exact release artifact is independently reviewed P0/P1 before any Control candidate. The
   rollback-protected Control candidate then proves the browser/API/actual PostgreSQL path while the
   predecessor remains available. Production routing does not change until that evidence is green.

Any actual-system failure stops this slice. Retain the failed command, exact source/release, environment,
observed result and cleanup state; write RCA and correct the method or product before one affected-scope
retry. Do not rerun models, the full repository, or already-passed unrelated gates.

## Cancellation, reconciliation and recovery

Every state-changing request has an idempotency key. Closing the picker has no effect. A dropped preview
expires. An uncertain confirmation is reconciled against both the companion candidate/root list and the
Control connection record before retry. Read interruption performs no successor operation. If the browser
closes or navigates after redemption, the companion still submits completion directly to Control and
discards its content when no matching live page remains; a replacement page cannot retrieve it. If the
companion exits before completion, Control retains the redemption only until its 15-second operation
deadline plus ten-second clock skew, then atomically marks it `abandoned` and unblocks revoke. Companion
restart creates a new boot epoch and cannot complete or replay the predecessor's redemption. Concurrent
redemption/revocation follows the transactional linearization rule above: revoke wins if it commits first;
if redemption committed first, revoke waits no longer than that bounded deadline for completion or
abandonment, instructs any matching live browser page to clear the result, then reports completion.
Returned content is never accepted or retained after completed revocation.

The companion ships as immutable per-release directories under the signed-in user's local application
data. A small manifest-bound launcher selects one active release. Port 43118 holds the candidate while the
43117 predecessor remains usable; promotion changes the launcher binding only after both exact artifacts
pass. The CurrentUser certificate, scheduled launch entry, issuer-key set, DPAPI device/root store schema
and their owners are included in install/upgrade/rollback evidence. The new store reader is backward
compatible; a predecessor that cannot understand a later record must preserve it inert rather than erase
or reinterpret it.

Rollback switches the launcher to the exact predecessor, removes only slice-owned Control routes/records
and candidate registration, and reconciles candidate port/task/certificate state. It never deletes user
files or Git state. User-created connection records after candidate promotion are migrated forward or
retained inert for recovery; database rollback never restores an old snapshot over later user work.

## Remaining roadmap after this slice

Research/Code/artifact work surfaces and explicit source attachment remain next, followed by governed
local changes/tests/undo/local commit and bounded actual-system customer journeys. GitHub, live web,
cloud connectors, broad parsers/artifacts, skills, automation, parallel product agents, voice/media,
mobile and off-LAN access remain in their recorded later milestones.

## Source/result/commit/publication handoff

The criteria commit is recorded here before implementation. The implementation result must name its exact
source commit, Omen companion and Control release ids/digests, schema/capability-set versions, all
deterministic and actual-system commands with denominators, every stopped failure/RCA, independent review,
production status, rollback predecessor and next unaccepted capability. Criteria publication authorizes
implementation only; it does not activate the companion or alter Control production routing.
