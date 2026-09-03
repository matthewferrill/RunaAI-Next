# M1-S2B1 server-workspace materialization criteria — 2026-09-03

Status: second corrected prospective criteria; fresh independent design review required before implementation

Roadmap revision/digest retrieved before selection: `2026-08-28.1` / `6a8380d9e9e2f3eb07b7e51c77cda174c5541c0abbb07875dd5537627560cfd1`

Milestone/capability scope: M1-S2B1; bounded C03/C06/C08/C15/C16 subsets

The initial draft review and sealed corrected-criteria review each returned NO-GO at P0=0/P1=7. The latter reviewed
exact commit `ec0b885` and is retained in `M1-S2B1-SEALED-CRITERIA-INDEPENDENT-REVIEW-2026-09-03.md`. No dependency,
implementation or actual operation followed either review. This second correction earns no acceptance credit until a
fresh review returns P0=0/P1=0.

## Outcome and reason this is next

Prove that Control can materialize two real project-source types into an owned, version-bound server workspace:

1. one exact allowlisted public HTTPS Git repository at an immutable commit; and
2. one non-Git folder snapshot captured through the actual browser application.

The customer can connect either source, inspect its exact file tree and bounded text files, see native source/version,
limits, exclusions, lifecycle and errors, and disconnect it. The browser PC does not execute code. Home is not used
for materialization. Omen unavailability does not impair the Git journey.

This first layer isolates source resolution, hostile-tree handling, network admission, workspace publication,
durable authority and browser presentation before private credentials or model-authored execution are introduced.
It is an actual-system checkpoint inside one continuous Code implementation, not a releasable public-only product.

## Baseline and reusable evidence

- `M1-S2B-SERVER-MANAGED-WORKSPACE-ARCHITECTURE-2026-09-03.md` and
  `M1-S2B-PROJECT-SOURCE-ADAPTER-REGISTER-2026-09-03.md` are the accepted direction.
- `M1-S2B-SERVER-MANAGED-WORKSPACE-INDEPENDENT-REVIEW-2026-09-03.md` returned architecture-publication GO,
  P0=0/P1=0, while explicitly withholding implementation and actual-system acceptance.
- Gate 7E supplies reviewed process-start, deadline/output and typed-receipt patterns only. Its harmless QuickJS
  profile and grant are not widened or credited here.
- The disposable project adapter supplies binding, immutable revision, CAS, no-follow path and integrity patterns;
  its synthetic fixture is not this materializer and cannot satisfy actual acceptance.
- PostgreSQL remains task/connection/workspace/receipt authority; LangGraph remains workflow-checkpoint authority.

Not proved: public Git egress, server workspace materialization, source-neutral manifests, browser folder capture,
cross-workspace storage isolation, actual Control cleanup, provider credentials, project execution or Git effects.

## Included behavior

- A new source/workspace capability-set version that grants only connection creation, materialization, bounded
  manifest/file inspection, cancellation and disconnect for this slice.
- One manifest-configured public HTTPS Git endpoint/repository/ref selected through an authority-owned source id.
- Exact immutable commit resolution followed by safe blob materialization into a separate content root.
- One bounded non-Git browser folder snapshot with exact file manifest and snapshot digest.
- Durable connection/workspace lifecycle and idempotent materialization/reconciliation.
- File tree and bounded UTF-8 text inspection through the actual application.
- Explicit exclusions, partial/unavailable status, expiry, disconnect and cleanup presentation.
- Actual Control Git/snapshot proofs and actual ordinary-browser journey after deterministic/adversarial checks.

## Excluded behavior

- Private/provider-authenticated repositories; OAuth/GitHub App tokens; credentials; SSH; self-hosted endpoints;
  redirects; submodules; LFS; partial clone; sparse checkout; tags as mutable authority; or multiple repositories.
- Model calls, model scoring, Agent planning, project commands/tests, native project execution, package managers,
  arbitrary shell, file changes, diff, undo, commit, push, pull request, CI or deployment.
- Persistent local-folder bridge, local writeback, automatic filesystem watching, network shares, cloud drives,
  Perforce, Subversion, TFVC, Mercurial or remote execution environments.
- Production route change, protected/private project data, real user repositories, Omen ACL/companion work, Control
  release activation or customer-release claims.

## Trust and process topology

The Control web/application process authenticates the participant and records the operation intent in PostgreSQL
before any filesystem or child-process effect. It sends one closed operation to a separately versioned coordinator.
The coordinator receives only a server-derived participant/project/environment/source binding and owns no Keycloak,
OpenFGA, Home/model, deployment or provider credential.

Public Git uses two separately contained processes, never native `git.exe`:

1. The **materializer worker** owns only its create-new ingress object root, create-new staging root and read-only
   pinned release bytes. Its AppContainer/job has deny-all network, a clean environment and no Control application,
   database, credential, Home, sibling workspace or user-profile access.
2. The **HTTPS ingress broker** owns network but no workspace, ingress object root, PostgreSQL, application data or
   credential access. It implements the only connect API. It resolves, classifies, selects and pins an allowed IP,
   opens TLS with the configured SNI/Host, disables redirects/proxies and admits only the two frozen Git smart-HTTP
   request shapes. Response bodies are bounded before crossing the pipe.

The materializer uses security-reviewed, exact-pinned `isomorphic-git` release bytes with its HTTP interface replaced
by the ingress-broker pipe. The package version, tarball SHA-512, unpacked release digest and dependency set must be
independently reviewed and entered into the release manifest before installation. Version must be at least 1.38.7,
which includes the upstream NTFS alternate-data-stream path fix; the proposed version is 1.41.0 but remains unpinned
until that package review. No dependency download or implementation occurs under this criteria revision.

The Control authority creates one **operation Job Object** with kill-on-close and active-process limit three, then
creates the coordinator, materializer and optional ingress broker suspended under distinct, unique AppContainer SIDs.
It sets mitigations, resource limits, DACLs and the exact inherited handle list before resume. No operation process
may spawn a descendant. Broker-loss acceptance terminates this exact operation Job; terminal acceptance requires the
Job's active-process count to reach zero.

Coordinator control IPC and Git streaming IPC are separate:

- Each Control/coordinator, coordinator/materializer and coordinator/broker control channel has request, response and
  one-use 256-bit HMAC-secret handles. The request side admits exactly one canonical operation or cancel frame,
  sequence 1, then EOF. The response side admits exactly one receipt or terminal frame, sequence 1, then EOF. Each
  payload is at most 1 MiB.
- Git adds two unidirectional anonymous pipes: materializer-to-broker request stream and broker-to-materializer
  response stream. `runa-materialization-pipe-frame/v2` admits strictly increasing per-direction sequences and exactly
  two request ordinals. Ordinal 0 is GET info/refs; ordinal 1 is POST git-upload-pack. Open/body/end frames are HMAC
  authenticated over the canonical header and exact body bytes. Each body frame is at most 1 MiB; aggregate request
  bodies are at most 2 MiB and response bodies at most 96 MiB, with at most 128 frames in either direction. A broker
  terminal frame after response 1 and then EOF is mandatory. Missing, duplicate, reordered, post-terminal,
  wrong-direction or over-limit frames are fatal.
- Control generates one additional random 256-bit Git-stream HMAC key and sends the same key once through each
  child's separate authenticated control bootstrap. The coordinator never receives that key. Both workers zeroize it
  after the terminal/EOF boundary, and neither may persist or log it.
- The materializer inherits five handles for Git: its control request/response/secret plus Git request-write and
  response-read. The broker inherits five: its control request/response/secret plus Git request-read and
  response-write. The coordinator has the matching control endpoints but never receives source bodies. Secret and
  write handles close at their specified terminal boundary; every unexpected inherited handle is fatal.

The release manifest freezes the executable/runtime/DLL/module hashes and this exact access table:

| Principal/process | Filesystem | Network | Environment/handles |
|---|---|---|---|
| Control authority process | PostgreSQL authority and protected workspace parent; creates exact opaque roots and performs final publication; no source contents in logs | existing application routes only | existing service environment; passes only explicit handles |
| unique operation coordinator AppContainer | read pinned coordinator/runtime; no parent path/list right and no sibling; only inherited operation-root handles and object DACL rights | deny all | `SystemRoot`, `WINDIR`, owned `TEMP`/`TMP`, pinned-runtime-only `PATH`; control pipe handles only |
| unique materializer AppContainer | read pinned materializer/runtime; inherited ingress/staging handles with exact data/write/append/attributes/delete/synchronize rights; no path-based parent traverse/list, final, sibling, application, database, profile, credential or Home access | deny all | same five-name environment; control handles plus the two Git stream handles only |
| unique ingress AppContainer | read pinned ingress/runtime modules and read-only machine trust store required by the sealed host; no operation root, ingress, staging, final, database, application, profile, credential or Home access | outbound TCP only through the owned connector; all other connect paths fail closed and are audited | same five-name environment with empty proxy variables; control handles plus the two Git stream handles only |

The protected parent DACL is non-inheriting and grants full control only to SYSTEM, Administrators and the Control
authority service SID. Each create-new operation object has a protected object-specific DACL granting its unique SID
only `FILE_READ_DATA`, `FILE_WRITE_DATA`, `FILE_APPEND_DATA`, `FILE_READ_ATTRIBUTES`,
`FILE_WRITE_ATTRIBUTES`, `FILE_LIST_DIRECTORY`, `FILE_TRAVERSE`, `DELETE` and `SYNCHRONIZE`; it grants neither
`WRITE_DAC`, `WRITE_OWNER` nor access to the parent or another operation object. The authority passes held handles,
not parent paths. Final workspaces remove the operation ACE and receive a new read-only project-service ACE only after
publication. Actual isolation proves both same-user/cross-project and cross-user operation SIDs receive access denied
when opening a known sibling by path or handle duplication.

The coordinator, materializer, ingress broker, runtime, loaded native DLLs and application-owned modules are each
verified against the release manifest before resume and re-observed from OS process/module inventory before terminal
acceptance. A module outside the exact set, an unverified trust-store path, or a process after Job termination fails
the attempt. The AppContainer profiles, ACL entries, temp roots, pipe handles and jobs are removed only after zero
processes and exact owned identity are proven.

The snapshot adapter uses the same network-denied materializer but no ingress broker. Both adapters return a signed
publication proposal to the Control authority, which independently verifies the held staging identity and exact
manifest before performing the non-replacing rename. The authoritative manifest and lifecycle remain in protected
PostgreSQL/application state outside source content. An uncertain outcome is observed and reconciled, never blindly
rerun.

## Frozen model-independent schemas

The closed capability set is `m1-s2b1-materialization-2026-09-03.1`, file
`server-workspace/m1-s2b1-capability-set.json`, canonical-JSON SHA-256
`001ff34d840293fb7de17a76b518b29bf68755b5f230cf386de96a51288b0aea`. Participant operations are exactly
`source.connect-public-git`, `source.connect-folder-snapshot`, `workspace.materialize`, `workspace.list-files`,
`workspace.read-text`, `workspace.cancel` and `source.disconnect`. Internal-only operations are exactly
`workspace.reconcile` and `workspace.cleanup`. Its only effects are source-record/upload-session creation, workspace
materialization/cancel/cleanup and source disconnect. It grants no model invocation, project execution, repository
mutation or remote publication. Requests with any other capability version/digest or operation fail before durable
intent.

The materialization/inspection policy is `server-workspace/m1-s2b1-materialization-policy.json`, canonical-JSON
SHA-256 `8c53b2213f5a090101106064f30e2055762898127578a86f89aa7b3c6ed6ef72`. The public network policy is
`server-workspace/m1-s2b1-network-policy.json`, canonical-JSON SHA-256
`f898215b4a02d2f76c5686f0fec27f6fcf081c5beed4fdbdb4b84d8148914e3f`. These artifacts freeze all numeric limits,
secret-pattern exclusions, text extension classification, denied IPv4/IPv6 CIDRs, metadata addresses, redirects,
proxies and DNS/socket/header/body/frame limits. Changing either digest creates a new policy version and requires new
criteria/review; it cannot silently widen an existing capability.

The executable strict schemas and cross-field invariants are in
`server-workspace/materialization-contracts.mjs`; their deterministic contract tests are
`server-workspace/materialization-contracts.test.mjs`. These checks are a criteria freeze and receive no
actual-system acceptance credit. Admission functions compare raw bytes with their canonical serialization before
schema parsing, which rejects whitespace variants, duplicate keys, BOM/NUL and noncanonical encodings. They require
real round-trippable millisecond UTC instants; compare capability/policy/binding digests to authority values; recompute
file-set/upload/payload digests and HMACs; and reject unknown keys or duplicate/unordered/colliding paths. Client/model
input never supplies participant, project, environment, capability version, workspace path, worker identity or
endpoint.

### `runa-workspace-source-selection/v1`

Server-owned record:

- `sourceId`, `projectId`, `participantId`, `environmentId`
- `sourceKind`: `git-public-https` or `browser-folder-snapshot`
- `displayName`
- Git only: exact configured `repositoryHttpsUrl`, `requestedRef`, endpoint policy id/digest
- lifecycle: `known|configured|connected|tested|enabled|disconnected|expired|revoked|failed|unknown`
- independent cleanup state: `not-required|pending|complete|indeterminate`
- exact capability version/digest, creation/update/revoke timestamps and revision

The browser uses only `sourceId` after selection. Raw URLs are not accepted from conversation/model operations.

### `runa-workspace-materialization-request/v1`

- server-issued `requestId`, `idempotencyKey`, `sourceId`, `taskId`
- server-derived participant/project/environment binding digest
- expected source-record revision and exact capability-set version
- Git: requested configured ref; snapshot: upload session id and completed upload-manifest digest
- limits profile id and absolute deadline

### `runa-workspace-manifest/v1`

- opaque `workspaceId`, source/binding digests and `sourceKind`
- `nativeVersionKind`: `git-commit` or `content-snapshot`
- exact lowercase SHA-1/SHA-256 Git object id as reported by the pinned Git format, or SHA-256 snapshot id
- ordered safe relative file entries: path, byte count, SHA-256 and media classification
- file-set digest, exclusion/rejection counts and `complete` boolean
- adapter, Git/runtime and broker release/pin digests
- workspace lifecycle, created/expiry timestamps and limits profile

Git hash algorithm is recorded rather than assumed. A SHA-1 object id is never presented as a content-integrity
hash; every materialized file and complete file set has SHA-256 integrity.

### `runa-workspace-materialization-receipt/v1`

- request/source/workspace/task ids, source kind and binding/capability digests
- `outcome`: `ready|rejected|failed|timed-out|cancelled|unknown|cleanup-pending`
- source/native version and before/staging/final manifest digests where applicable
- network policy result, process/job result, bytes/files/duration and limit observations
- publication, database and cleanup states
- allowlisted error code, retryability only after reconciliation, worker/release identity and timestamps
- `credentialsPresent:false`, `privateValuesIncluded:false`, `modelInvoked:false`, and an exact ordered subset of
  `workspace-materialize|workspace-cancel|workspace-cleanup` consistent with outcome

Receipt outcomes are closed as follows:

| Outcome | Required publication/database/process/cleanup state | Retry |
|---|---|---|
| `ready` | published-acknowledged / ready-recorded / stopped / complete; workspace and final digest present; no error | never |
| `rejected` | no publication; terminal-recorded; stopped or not-started; cleanup complete/not-required; error present | only a new corrected request |
| `failed` | no publication or proven absent; terminal-recorded; stopped; cleanup complete; error present | only after reconciliation proves absence |
| `timed-out` or `cancelled` | same as failed; the receipt records the distinct cause | only after reconciliation proves absence |
| `unknown` | any effect/process/database state is indeterminate or child stop is unconfirmed; error present | prohibited until reconciled |
| `cleanup-pending` | no usable ready workspace; cleanup is pending; error present | prohibited until cleanup and reconciliation finish |

## Closed lifecycle transitions

No generic status write is allowed. Every transition is an optimistic PostgreSQL compare-and-swap over binding,
record revision, capability digest and predecessor state.

| Source predecessor | Operation/event | Source successor |
|---|---|---|
| absent | owner records allowlisted source definition | `known` |
| `known` | participant connects source to project | `configured` |
| `configured` | endpoint/upload session validates | `connected` |
| `connected` | one complete materialization verifies | `tested` |
| `tested` | participant enables inspection | `enabled` |
| `configured|connected|tested|enabled` | explicit disconnect | `disconnected`, cleanup state pending/complete |
| `configured|connected|tested|enabled` | expiry | `expired`, cleanup state pending/complete |
| any nonterminal | authority revocation | `revoked`, cleanup state pending/complete/indeterminate |
| any nonterminal | determinate operation failure | `failed`, cleanup state pending/complete |
| any nonterminal | effect/process state cannot be proven | `unknown`, cleanup state indeterminate |
| any terminal lifecycle | exact owned cleanup verified | lifecycle unchanged, cleanup state `complete` |

Source lifecycle and cleanup state are independent columns in one CAS record; cleanup never changes the terminal
lifecycle. There is no transition out of `revoked`. Reconnect from `disconnected`, recovery from `failed`, or
replacement of an `unknown` record creates a new revision/source instance only after reconciliation; it never
reactivates stale authority.

| Workspace predecessor | Operation/event | Workspace successor |
|---|---|---|
| `absent` | PostgreSQL intent/outbox commit | `intent-recorded` |
| `intent-recorded` | contained children and create-new staging identities verified | `staging` |
| `staging` | durable manifest verified and final rename completed | `published-pending-db` |
| `published-pending-db` | final reopen/identity/digest checks plus PostgreSQL CAS | `ready` |
| `intent-recorded|staging` | determinate cancel/timeout/failure and cleanup complete | `cancelled|failed` |
| `ready` | expiry or source disconnect/revoke | `expired` |
| any nonterminal | process/filesystem/database outcome indeterminate | `unknown` |
| `cancelled|failed|expired|unknown` | exact owned artifact cannot yet be removed | `cleanup-pending` |
| `cancelled|failed|expired|cleanup-pending` | exact owned absence proved and terminal receipt retained | `removed` |

`ready` is impossible before both filesystem publication and PostgreSQL acknowledgement. Reads accept only `ready`;
all other states fail closed. `unknown` can move only through `workspace.reconcile`, whose result is ready,
cleanup-pending or removed; materialize is not a legal successor.

## Exact first limits

The authoritative values are the two frozen policy JSON artifacts and their digests above; prose below is a readable
summary and cannot override them.

- Maximum 2,000 regular files, 64 MiB total materialized bytes and 4 MiB per file.
- Maximum normalized relative path: 1,024 UTF-8 bytes, 64 segments, 255 UTF-8 bytes per segment.
- File-tree response: 2,000 entries; individual text read: 256 KiB; combined response: 512 KiB.
- Git resolution/fetch/materialization: 120 seconds; folder upload: 120 seconds; cleanup/reconciliation: 30 seconds.
- One in-flight materialization per source/project and two per participant; excess returns bounded busy status.
- Ready workspace expires after 30 minutes in this first proof. Expiry prevents new reads and enters cleanup.
- DNS is limited to 16 total A/AAAA answers and 3 seconds. Git is limited to two connections, 10-second idle time,
  16 KiB request headers, 32 KiB response headers, 2 MiB aggregate request bodies, 96 MiB aggregate response bodies,
  1 MiB IPC frames, 128 frames per direction and the existing 120-second absolute deadline.

Exceeding any source limit rejects the complete materialization. The product may list safe counts/reasons, but does
not publish a partial workspace as ready.

## Public HTTPS Git materialization

Before the actual proof, one small public repository URL, exact ref and expected commit are sealed in a source
manifest. It must contain no private/protected/user data and be stable for the retained evidence window.

The application resolves only the authority-owned `sourceId`; a user/model-provided URL cannot become an endpoint.
The endpoint record permits lowercase `https`, port 443 and one exact ASCII host/repository path. It rejects userinfo,
fragments, ambiguous percent encodings, Unicode/IDN aliases, query text outside the frozen service query and
non-canonical paths. Redirect status is terminal and a proxy is never read from process or Git configuration.

The ingress broker is the owned enforcing connect layer. For every socket it:

1. resolves A and AAAA records through the configured OS resolver, normalizes every answer, and rejects the complete
   request if any answer falls in a CIDR or metadata address in the exact frozen network-policy artifact. IPv4-mapped
   IPv6 is decoded and classified as IPv4; zone identifiers, noncanonical numeric forms and more than 16 answers are
   rejected. The policy file, not a runtime registry lookup or prose category, is the acceptance oracle;
2. records the complete answer set digest, chooses one allowed IP, injects that address into the socket connection,
   and uses only the configured hostname for TLS SNI, certificate verification and the HTTP `Host` header;
3. prevents a library from performing a second resolution or opening a socket directly; only the broker's sealed
   connector owns `dns.lookup`/`net.connect`/`tls.connect`, and the materializer Job has deny-all network;
4. admits exactly `GET /<sealed-repository>.git/info/refs?service=git-upload-pack` and
   `POST /<sealed-repository>.git/git-upload-pack`; methods, paths, queries, content types and response status/types
   outside the smart-HTTP contract fail closed;
5. enforces the exact policy-file limits for DNS, two connections, request/response headers, aggregate bodies,
   individual frames, idle time and the 120-second absolute deadline; it streams frames and neither spools, logs nor
   retains source bodies.

The classifier consumes the resolver's binary address, never reparses a hostname or URL. It compares the first
prefix-length bits in network byte order against every frozen CIDR; an IPv4-mapped address is first reduced to its
last 32 bits and checked against IPv4. Any parse/family/prefix ambiguity, zero answers or one denied member rejects
the whole answer set. One allowed binary address is selected once and reused for both smart-HTTP connections; TLS
uses the original sealed ASCII hostname. The actual oracle logs only family, policy digest, answer-set digest,
selected-address digest and allow/deny result—not the source body.

The materializer's exact-pinned Git library consumes only that bounded pipe transport. It has no native Git binary,
credential helper, prompt, hook, external protocol, file protocol, filter, LFS, submodule or project-command path.
Git object storage and materialized content use separate roots; neither is `.git` or inside the other. The
materializer fetches the configured ref without tags, resolves one commit, verifies the sealed expected commit,
walks objects without checkout/archive extraction, and rejects symlink, gitlink/submodule, device or unsupported
object types. Every output path rejects `.git` case/Unicode variants, NTFS ADS including `::$INDEX_ALLOCATION`,
reserved/device names, trailing dot/space aliases, absolute/traversal paths, duplicate/case/normalization collisions,
reparse points and existing destinations. Files are opened create-new beneath the held staging identity and their
bytes and aggregate manifest are SHA-256 checked. The separate Git object root is removed before `ready`.

No credential exists in the public proof. Git stdout/stderr is bounded and classified; source file contents and
host paths do not enter logs or retained failure receipts.

Actual acceptance must retain connect-layer observations proving all materializer connection attempts were denied,
all ingress-broker connections matched the sealed endpoint/address/path set, and zero forbidden destination socket
was opened. A DNS answer change, alternate address, proxy variable, redirect or second host fails the single attempt;
it is never followed and never scored as a repository/model failure.

## Browser folder snapshot

The ordinary signed-in user chooses a disposable synthetic folder through the actual application. The browser
creates an upload manifest from files explicitly returned by the supported picker; it does not send an absolute
path as authority. The UI previews name, file count, total bytes, exclusions and the fact that this is a one-time
copy with no background access or automatic writeback.

The browser cannot reliably observe original Windows hardlink identity, junction/reparse identity, device identity or
all local filesystem races. The product must not claim that it did. It labels this a **browser-supplied snapshot**;
server-side no-follow/create-new controls protect the Control workspace, while unobservable origin identity remains
a stated limitation. Persistent local folders require the later local bridge.

The upload API is same-origin only and has no CORS allowance. It requires the ordinary HttpOnly, Secure,
SameSite=Strict session cookie, an exact session-bound CSRF header and `Sec-Fetch-Site: same-origin`. Every mutating
request rejects browser/model-supplied participant/project/environment/capability fields. The endpoints are closed:

- `POST /api/project-sources/folder-snapshots` with one strict
  `runa-browser-folder-upload-session-request/v1` body containing only display name and declared counts creates the
  server-owned source/upload ids and returns `runa-browser-folder-upload-session/v1`, expiry and exact limits
  profile/digest;
- `PUT /api/project-sources/folder-snapshots/{uploadId}/manifest` accepts one strict canonical
  `runa-browser-folder-upload-manifest/v1` body, maximum 512 KiB, with ordered included entries, ordered exclusions
  and no server id/binding/digest. The server compares declared session totals, applies the frozen exclusion/media
  policy, computes the canonical manifest digest and returns the server-owned manifest record;
- `PUT /api/project-sources/folder-snapshots/{uploadId}/files/{ordinal}` with
  `application/octet-stream`, `Content-Length <= 1,048,576`, exact `Upload-Offset`, `Upload-Chunk-Sha256` and
  monotonically increasing zero-based chunk ordinal writes one create-only declared range;
- `POST /api/project-sources/folder-snapshots/{uploadId}/finalize` accepts only the server-returned manifest digest
  and closes the session; and
- `DELETE /api/project-sources/folder-snapshots/{uploadId}` cancels it and begins exact owned cleanup.

The server issues every upload/source id; the client never supplies one during creation. Zero-byte files require zero
chunks; otherwise the exact chunk count is `ceil(fileBytes / 1 MiB)`, at most four. Included and excluded paths are
strictly ordered/unique under Windows identity, cannot overlap and must equal the picker preview counts. The complete
secret-basename/prefix/suffix exclusions and UTF-8 text-extension list are frozen in the materialization-policy file.
The server NFC-normalizes and invariant-case-folds only for comparison, takes the last path segment as basename, and
excludes when that basename equals a listed basename, starts with a listed prefix or ends with a listed suffix. It
classifies UTF-8 text only when the final extension equals a listed extension and the bytes pass strict UTF-8 decode
without BOM/NUL; everything else remains binary and cannot be opened as text.

A repeated chunk is idempotent only when upload id, file
ordinal, chunk ordinal, offset, length and digest all match the already retained bytes; any mismatch conflicts and
closes the session. Missing/out-of-order/overlapping ranges, extra bytes/files, expired/finalized/cancelled sessions,
file or canonical manifest-digest mismatch, replay under another session, or disconnect during finalize cannot
publish a workspace.

The server independently revalidates names, counts, sizes, paths, types and hashes before atomic publication.
Folder entries and any picker-reported non-file item are excluded. Names that imply devices, ADS or path aliases,
hidden secret-pattern files and unsupported media are rejected or excluded according to the frozen profile and shown
before final confirmation. Local symlink/reparse/hardlink identity is not claimed because the browser does not expose
it; Control still rejects reparse points and existing/hardlinked destinations in its own staging root.
The acceptance fixture contains only generated non-private text files and one intentionally excluded safe marker.

## Windows publication and reconciliation

All candidate roots are siblings on one fixed NTFS volume beneath one administrator-created protected parent.
Participants and operation processes cannot create or rename entries in that parent. The Control authority opens the
parent no-follow, records its volume serial and file id, creates opaque ingress/staging objects with create-new
semantics and derives an opaque final name bound in PostgreSQL while holding the created handles. It applies the
object-specific operation DACL before passing only ingress/staging handles. The final name must remain absent until
publication; an existing final name is
`unknown/publication-name-conflict`, never replaced, merged or deleted.

PostgreSQL commits `intent-recorded` before the coordinator creates any child or directory. During staging, every
file is opened relative to the held root, written, reopened no-follow, identity/hash checked and flushed with
`FlushFileBuffers`; directory metadata and the manifest are flushed before publication. The authority manifest is
stored outside the content root and binds every file identity/digest plus the parent/staging/final identities.

Publication uses the Control authority's pinned native helper around `MoveFileExW` with `MOVEFILE_WRITE_THROUGH` and
without `MOVEFILE_REPLACE_EXISTING`; the helper accepts only the already verified sibling staging/final paths under
the held parent. Immediately afterward the authority reopens the final name no-follow, proves same volume and
expected file id, rechecks absence of staging plus every manifest/file digest, and only then performs the
`published-pending-db -> ready` PostgreSQL CAS. If the exact host cannot prove this behavior, B1 stops before actual
proof. No source-controlled or source-writable manifest is accepted as authority.

Reconciliation is phase-exact and idempotent:

| Durable PostgreSQL state | Filesystem observation | Reconciler action |
|---|---|---|
| no intent | any candidate-like name | quarantine for operator review; do not infer ownership or delete |
| `intent-recorded|staging` | exact staging identity, no final | stop children, verify ownership manifest, remove exact staging/ingress, record terminal |
| `intent-recorded|staging` | final exists or identity differs | record `unknown`; no delete or retry |
| `published-pending-db` | exact final identity/digest, no staging | complete ready CAS without rematerializing |
| `published-pending-db` | final absent and exact staging exists | record `unknown`; no rename/delete until reviewed |
| `published-pending-db` | identity/digest mismatch or both names | record `unknown`; no delete |
| `ready` | exact final identity/digest | preserve until expiry/disconnect; serve reads |
| `ready` | absent/mismatch | revoke reads and record `unknown`; no recreation |
| terminal cleanup state | exact retained identity and ownership manifest | remove only that identity, prove absence, record `removed` |
| terminal cleanup state | mismatch/unknown identity | retain and escalate; never delete by path alone |

Every process-loss point before terminal child receipt records `stop-unconfirmed/unknown` until the Job Object reports
zero processes and the exact filesystem/database relationship is reconciled. The same idempotency key cannot create a
new intent while any matching record is nonterminal, unknown or cleanup-pending.

## Workspace inspection

- The application lists only manifest entries and reads only the exact workspace/version/path binding.
- UTF-8 text classification is deterministic; invalid/binary or oversized content is not coerced or truncated as
  complete text.
- Every read rechecks participant/project/source/workspace lifecycle, expiry and current manifest digest.
- A user cannot supply an absolute path, sibling workspace id, another project source id or stale/revoked revision.
- File contents remain project context, not instructions or authority. No model is called in this slice.

## Deterministic and adversarial verification

Implementation cannot reach actual execution until source review and tests cover at least:

- exact schema acceptance plus missing/extra/wrong-type/oversize/non-canonical field rejection;
- forged participant/project/environment/source/task/capability/revision/deadline/idempotency bindings;
- raw URL, alternate scheme/port/userinfo/redirect, DNS rebind and every private/reserved IP class;
- Git prompt/credential/config/environment inheritance, protocol extension, hooks, filters, attributes, LFS,
  submodule/gitlink, symlink, tag/ref movement and unexpected object/tree types;
- Windows traversal, drive/UNC/device/ADS/reserved names, case and Unicode normalization collisions, long/deep paths,
  duplicate entries, reparse/hardlink replacement and staging/final identity changes;
- zero/limit/over-limit files/bytes/paths/output/time and partial/incomplete retrieval;
- request duplication with same/different bytes, concurrent source revision, same-participant/cross-project and
  cross-participant/cross-project workspaces, plus attempted sibling enumeration/read/rename/delete;
- cancellation/timeout before spawn, during DNS/fetch/blob write, before/after atomic publication and before/after
  database acknowledgement;
- broker crash/restart at every durable phase, unknown outcome reconciliation, cleanup failure/retention, expiry,
  revoke/disconnect and retry only after proven absence;
- token/secret sentinel absence from argv, environment, process metadata, workspace, logs, errors, receipts and
  model inputs even though the public proof uses no real token;
- candidate configuration with Home inference deliberately unavailable, and Omen unavailable, while Git/snapshot
  inspection remains truthful and functional; neither actual Home nor its routing is changed.

Test doubles may exercise deterministic branches during development but receive no acceptance credit. No result is
accepted without the actual Control processes, actual pinned Git/network/filesystem, actual PostgreSQL authority and
actual ordinary browser journeys below.

## Actual-system acceptance

After implementation source commit and independent P0/P1 review:

1. On Control, materialize the sealed public HTTPS repository once through the production broker. Verify exact
   commit, all expected file hashes, complete manifest, zero `.git`/credential/config/hook files, bounded network
   endpoint observations, ingress cleanup and ready workspace/database state.
2. Repeat the same idempotency key and prove no second fetch/publication; use a conflicting request and prove denial.
3. Materialize three isolated source fixtures concurrently: participant A/project 1, participant A/project 2 and
   participant B/project 3. Prove neither API nor held process/identity can enumerate/read/change a sibling, covering
   both same-participant/cross-project and cross-participant/cross-project boundaries.
4. Through the ordinary browser, connect the Git source, view exact source/commit/limits/state, open two expected
   text files, reject a forged/stale path, disconnect, observe cleanup and confirm Omen can be unavailable.
5. Through the ordinary browser, select the generated non-Git folder fixture, preview scope/exclusion, upload once,
   inspect exact files/snapshot digest, disconnect and observe cleanup. Browser automation may operate the actual
   file picker only against the owned disposable fixture; no mock DOM/network route counts.
6. Start the side-by-side candidate with its provider route set to the existing `inference-unavailable` state and
   prove source connection/inspection remains available while model-dependent action is truthfully unavailable.
   Actual Home services, leases, models and routing are not stopped or changed.
7. Exercise cancel, timeout, broker-loss-after-publication and cleanup-failure through the production paths and the
   frozen fault methods below; prove retained unknown/pending state, exact reconciliation and no blind duplicate.
8. Verify Control application/database/release credentials, Home control, other workspaces, production routing,
   protected data, remote repository and Omen remain unchanged.

Any actual failure stops the gate. Retain the exact failure and full RCA, correct the design/method, independently
review it, and resume only the affected fresh scenario. Do not restart the complete acceptance denominator or score
an infrastructure/method failure against Gemma.

### Frozen actual fault methods

These are external actions against ordinary candidate paths, not alternate implementations or mocked results:

- **Cancel:** call the same authenticated participant cancel endpoint after the durable `staging` state is observed;
  the closed `workspace.cancel` capability carries the original binding/idempotency key and does not signal a process
  directly.
- **Timeout:** create an ordinary browser-folder upload session, upload its first declared chunk, then send no
  successor request until the frozen 120-second server expiry. The ordinary expiry/cleanup/reconciliation path must
  produce the timed-out receipt. No second network endpoint, mock response or private destination is introduced.
- **Broker loss after publication:** an external Control test owner watches the protected durable state until
  `published-pending-db`, then terminates the exact operation Job defined in the process topology. No source byte,
  endpoint result or
  database row is injected or edited.
- **Cleanup failure:** an external test owner opens one candidate-owned disposable file without delete sharing before
  disconnect. The ordinary cleanup path must retain `cleanup-pending`; closing that exact handle permits the ordinary
  reconciler to finish. No ACL, production path or source manifest is altered.

Each method is implemented and independently source-reviewed before its first use, records its own source/release
hash and exact target identity, and is removed/closed during cleanup. If any method cannot establish the intended
state on actual Control, the scenario stops as a method failure and receives no product/model disposition.

## Required evidence and handoff

The result must name the criteria/source commits, all schema and capability-set versions, broker/Git/runtime hashes,
sealed public source/commit, exact commands and denominators, endpoint classifications, source/workspace/receipt
digests, PostgreSQL lifecycle, actual browser capture, cleanup proof, all failures/RCAs, independent review and
remaining exclusions. Private values and source contents beyond the synthetic/public fixture are prohibited.

Passing M1-S2B1 authorizes neither private repositories nor code execution. The next contiguous layers are private
read-only provider authorization, then the side-by-side multi-file project executor, governed changes/tests/undo,
local workspace commit and separately approved remote push.

## Rollback

The candidate materializer is side-by-side and receives no production route until acceptance. Rollback blocks new
materialization, revokes candidate source records, reconciles/cleans only candidate-owned workspaces and upload
sessions, preserves all remote/local sources and durable audit records, and returns the application to its exact
predecessor. It never runs or removes the deferred Omen transition.
