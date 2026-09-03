# M1-S2B1 server-workspace materialization criteria — 2026-09-03

Status: corrected prospective criteria freeze; fresh independent design review required before implementation

Roadmap revision/digest retrieved before selection: `2026-08-28.1` / `6a8380d9e9e2f3eb07b7e51c77cda174c5541c0abbb07875dd5537627560cfd1`

Milestone/capability scope: M1-S2B1; bounded C03/C06/C08/C15/C16 subsets

First independent review disposition: NO-GO, P0=0/P1=7. No implementation or actual operation followed it. This
revision closes those findings prospectively; it earns no acceptance credit until a fresh review returns P0=0/P1=0.

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
  manifest/file inspection and disconnect for this slice.
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

Each child is created suspended under a unique AppContainer security identifier and Windows Job Object. The parent
sets the full ACL, mitigations, CPU/memory/process/time limits, handle list and network capability before resume.
Only three anonymous-pipe handles are inherited: request, response and a one-use 256-bit HMAC key. Frames are
length-prefixed canonical JSON, at most 1 MiB, sequence exactly 1, and bind request id, nonce, payload length/digest
and HMAC. Any extra frame, inherited handle, child/grandchild process, malformed frame or post-terminal survivor is
fatal. The complete allowed process tree is coordinator -> one materializer and, for Git only, one ingress broker;
neither child may spawn a descendant. The HMAC handle and request pipe close immediately after the one request.

The release manifest freezes the executable/runtime/DLL/module hashes and this exact access table:

| Principal/process | Filesystem | Network | Environment/handles |
|---|---|---|---|
| Control authority process | PostgreSQL authority and protected workspace parent; no source contents in logs | existing application routes only | existing service environment; no child handle inheritance |
| coordinator service identity | traverse/create/rename/delete exact opaque child names under protected parent; read pinned release; no participant/profile/Home/deployment trees | deny all | `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `PATH` containing only pinned runtime directory; three explicit pipe handles only |
| unique materializer AppContainer | read pinned materializer/runtime modules; read/write/delete its exact ingress and staging identities; no parent listing, final root, sibling, application, database, profile, credential or Home access | deny all | same five-name environment with owned temp; request/response/HMAC pipes only |
| unique ingress AppContainer | read pinned ingress/runtime modules and certificate trust required by the sealed host; no ingress/staging/final/database/application/profile/credential/Home access | outbound TCP only through the owned connector; all other API calls denied by policy and audited | same five-name environment with empty proxy variables; request/response/HMAC pipes only |

The coordinator, materializer, ingress broker, runtime, loaded native DLLs and application-owned modules are each
verified against the release manifest before resume and re-observed from OS process/module inventory before terminal
acceptance. A module outside the exact set, an unverified trust-store path, or a process after Job termination fails
the attempt. The AppContainer profiles, ACL entries, temp roots, pipe handles and jobs are removed only after zero
processes and exact owned identity are proven.

The snapshot adapter uses the same network-denied materializer but no ingress broker. Both adapters publish only
after exact manifest verification. The authoritative manifest and lifecycle remain in protected PostgreSQL/broker
state outside source content. An uncertain outcome is observed and reconciled, never blindly rerun.

## Frozen model-independent schemas

The closed capability set is `m1-s2b1-materialization-2026-09-03.1`, file
`server-workspace/m1-s2b1-capability-set.json`, canonical-JSON SHA-256
`268da8ecb04683cb8f82fd4a98ac04a4ed6c5ffaa590b4fca31c8407664b62cb`. Participant operations are exactly
`source.connect-public-git`, `source.connect-folder-snapshot`, `workspace.materialize`, `workspace.list-files`,
`workspace.read-text` and `source.disconnect`. Internal-only operations are exactly `workspace.reconcile` and
`workspace.cleanup`. The set grants no effect, model invocation, project execution, repository mutation or remote
publication. Requests with any other capability version/digest or operation fail before durable intent.

The executable strict schemas and cross-field invariants are in
`server-workspace/materialization-contracts.mjs`; their deterministic contract tests are
`server-workspace/materialization-contracts.test.mjs`. These checks are a criteria freeze and receive no
actual-system acceptance credit. All objects reject unknown keys, non-canonical encodings, duplicate/unordered paths
and invalid UTC timestamps. Client/model input never supplies participant, project, environment, capability version,
workspace path, worker identity or endpoint.

### `runa-workspace-source-selection/v1`

Server-owned record:

- `sourceId`, `projectId`, `participantId`, `environmentId`
- `sourceKind`: `git-public-https` or `browser-folder-snapshot`
- `displayName`
- Git only: exact configured `repositoryHttpsUrl`, `requestedRef`, endpoint policy id
- lifecycle: `known|configured|connected|tested|enabled|revoked|failed`
- `capabilitySetVersion`, creation/update/revoke timestamps and revision

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
- `credentialsPresent:false`, `privateValuesIncluded:false`, `modelInvoked:false`, `effects:[]`

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
| `configured|connected|tested|enabled` | explicit disconnect with no live workspace | `disconnected` |
| `configured|connected|tested|enabled` | expiry | `expired` |
| any nonterminal | authority revocation | `revoked` |
| any nonterminal | determinate operation failure | `failed` |
| any nonterminal | effect/process state cannot be proven | `unknown` |
| `disconnected|expired|revoked|failed|unknown` | owned artifacts remain | `cleanup-pending` |
| `cleanup-pending` | exact owned cleanup verified | predecessor terminal state with cleanup-complete marker |

There is no transition out of `revoked`. Reconnect from `disconnected`, recovery from `failed`, or replacement of an
`unknown` record creates a new revision/source instance only after reconciliation; it never reactivates stale
authority.

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

- Maximum 2,000 regular files, 64 MiB total materialized bytes and 4 MiB per file.
- Maximum normalized relative path: 1,024 UTF-8 bytes, 64 segments, 255 UTF-8 bytes per segment.
- File-tree response: 2,000 entries; individual text read: 256 KiB; combined response: 512 KiB.
- Git resolution/fetch/materialization: 120 seconds; folder upload: 120 seconds; cleanup/reconciliation: 30 seconds.
- One in-flight materialization per source/project and two per participant; excess returns bounded busy status.
- Ready workspace expires after 30 minutes in this first proof. Expiry prevents new reads and enters cleanup.

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
   request if any answer is loopback, unspecified, link-local, private/unique-local, carrier-grade NAT, multicast,
   reserved, benchmark/documentation or a configured cloud-metadata destination;
2. records the complete answer set digest, chooses one allowed IP, injects that address into the socket connection,
   and uses only the configured hostname for TLS SNI, certificate verification and the HTTP `Host` header;
3. prevents a library from performing a second resolution or opening a socket directly; only the broker's sealed
   connector owns `dns.lookup`/`net.connect`/`tls.connect`, and the materializer Job has deny-all network;
4. admits exactly `GET /<sealed-repository>.git/info/refs?service=git-upload-pack` and
   `POST /<sealed-repository>.git/git-upload-pack`; methods, paths, queries, content types and response status/types
   outside the smart-HTTP contract fail closed;
5. bounds request bytes, response headers, each response body, aggregate bytes, connection count, idle time and
   120-second absolute deadline; it neither logs nor retains source bodies.

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
  `runa-browser-folder-upload-manifest/v1` JSON body, maximum 512 KiB, creates an unexpired upload session;
- `PUT /api/project-sources/folder-snapshots/{uploadId}/files/{ordinal}` with
  `application/octet-stream`, `Content-Length <= 1,048,576`, exact `Upload-Offset`, `Upload-Chunk-Sha256` and
  monotonically increasing zero-based chunk ordinal writes one create-only declared range;
- `POST /api/project-sources/folder-snapshots/{uploadId}/finalize` with the exact manifest digest and zero other
  fields closes the session; and
- `DELETE /api/project-sources/folder-snapshots/{uploadId}` cancels it and begins exact owned cleanup.

At most four 1 MiB chunks are permitted per 4 MiB file. A repeated chunk is idempotent only when upload id, file
ordinal, chunk ordinal, offset, length and digest all match the already retained bytes; any mismatch conflicts and
closes the session. Missing/out-of-order/overlapping ranges, extra bytes/files, expired/finalized/cancelled sessions,
digest mismatch, replay under another session, or disconnect during finalize cannot publish a workspace.

The server independently revalidates names, counts, sizes, paths, types and hashes before atomic publication.
Folder entries and any picker-reported non-file item are excluded. Names that imply devices, ADS or path aliases,
hidden secret-pattern files and unsupported media are rejected or excluded according to the frozen profile and shown
before final confirmation. Local symlink/reparse/hardlink identity is not claimed because the browser does not expose
it; Control still rejects reparse points and existing/hardlinked destinations in its own staging root.
The acceptance fixture contains only generated non-private text files and one intentionally excluded safe marker.

## Windows publication and reconciliation

All candidate roots are siblings on one fixed NTFS volume beneath one administrator-created protected parent.
Participants, the web process and children cannot create or rename entries in that parent. The coordinator opens the
parent no-follow, records its volume serial and file id, and creates opaque ingress, staging and final names with
create-new semantics while holding their handles. The expected final name must be absent; an existing final name is
`unknown/publication-name-conflict`, never replaced, merged or deleted.

PostgreSQL commits `intent-recorded` before the coordinator creates any child or directory. During staging, every
file is opened relative to the held root, written, reopened no-follow, identity/hash checked and flushed with
`FlushFileBuffers`; directory metadata and the manifest are flushed before publication. The authority manifest is
stored outside the content root and binds every file identity/digest plus the parent/staging/final identities.

Publication uses a pinned native helper around `MoveFileExW` with `MOVEFILE_WRITE_THROUGH` and without
`MOVEFILE_REPLACE_EXISTING`; the helper accepts only the already verified sibling staging/final paths under the held
parent. Immediately afterward the coordinator reopens the final name no-follow, proves same volume and expected file
id, rechecks absence of staging plus every manifest/file digest, and only then performs the
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
  the operation carries the original binding/idempotency key and does not signal a process directly.
- **Timeout:** the sealed public source fixture includes a separately owned HTTPS test endpoint whose TLS and response
  bytes are real but whose upload-pack response intentionally stalls beyond the 120-second absolute deadline. It is
  preclassified as a public test endpoint and cannot share production/private addresses. This fault scenario is
  separate from the successful Git source and receives no repository-quality credit.
- **Broker loss after publication:** an external Control test owner watches the protected durable state until
  `published-pending-db`, then terminates the exact candidate coordinator Job. No source byte, endpoint result or
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
