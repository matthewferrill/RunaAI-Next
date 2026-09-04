# M1-S2 actual ordinary-browser harness design — 2026-09-04

## Status and purpose

This is an execution-free design for the smallest actual ordinary-browser harness that can exercise the bounded
Artifact and Agent presentation through a real side-by-side Control HTTPS candidate. It does not authorize a package
change, dependency installation, browser launch, service start, database mutation, network operation, release change,
or acceptance run.

## Retained independent review STOP

The first independent review of this design returned `STOP P0=0/P1=5` before any package, import, test, browser,
service, database, network, release, commit or push action. It found that the draft did not constructibly bind the
side-by-side TLS/identity topology; did not freeze exact production-path seed and cleanup interfaces; did not provide
authoritative Edge descendant containment; permitted overbroad browser evidence during OIDC; and described foreign
records and download media-type proof beyond what the real UI/browser path could establish.

The corrections below address only those five findings. They remain execution-free and require a different fresh
exact-byte review before implementation or prerequisite selection begins.

The second independent review retained another `STOP P0=0/P1=4` before any package, import, test, browser, service,
database, network, release, commit or push action. It found that the corrected draft still assumed side-by-side values
that the strict production release-config schema cannot represent; did not provide a constructible no-model,
ordinary-session-bound Agent case; overstated the atomic Agent fence by including separately read plan/step display;
and combined one viable stale-conversation case with a missing-owner journey that the current UI cannot perform. The
corrections below retain that stop. They do not authorize implementation or execution and require a new independent
exact-byte review.

The third independent review retained `STOP P0=0/P1=2` before any package, import, test, browser, service, database,
network, release, commit or push action. It found that the no-model Agent prerequisite incorrectly claimed that the
ordinary session itself supplies `projectId`, and that the finite ledger described unsettled/reconciliation states that
the permitted no-model boundary cannot construct. The corrections below retain that stop, select the existing
browser-project-selector plus production reauthorization pattern, and exclude the unresolved-state case until a real
product lifecycle is separately accepted. They do not authorize implementation or execution and require another fresh
exact-byte review.

The fourth independent review retained `STOP P0=0/P1=2` before any package, import, test, browser, service, database,
network, release, commit or push action. It found that the no-model Agent prerequisite did not bind its selected Code
project to an already registered M1 task project, and that the missing-owner case incorrectly left a real visible
archive journey unexplored. The corrections below retain that stop, require exact reuse of the Artifact seed's already
registered Code project without a second materialization, and freeze a reversible two-page ordinary-session archive
journey. They do not authorize implementation or execution and require another fresh exact-byte review.

The fifth independent review retained `STOP P0=0/P1=1` before any package, import, test, browser, service, database,
network, release, commit or push action. It confirmed that the shared registered-project and visible archive/unarchive
lifecycle corrections are constructible, but found that the accepted Artifact UI sends `result.read` directly when a
retained preview control is activated. It therefore cannot yet provide the required missing-owner zero-read behavior
after another page archives the owner. The correction below retains that stop and makes the two-page case absent until
a separately reviewed server-authoritative pre-read revalidation change is landed. It does not authorize implementation
or execution and requires another fresh exact-byte review.

The existing browser-shaped and integration fixtures retain their current deterministic value but receive no actual
browser or server-authentication credit:

- `function-panel.browser.mjs` intercepts `**/*` and fulfills its HTML, modules, status, session and application API
  responses inside Playwright. It is intentionally not a site, session or service-path test.
- The Artifact and Agent DOM fixtures exercise shipped modules with deterministic test hosts, not an ordinary browser
  connected to Control.
- The Artifact PostgreSQL/HTTP fixture proves real disposable PostgreSQL plus loopback HTTP while supplying scripted
  ordinary-session credentials; it is not a browser or OIDC proof.
- The retained acceptance bootstrap creates a synthetic test session and explicitly is not an owner or production
  login. It cannot substitute for the ordinary OIDC route.

No current package or lock entry provides Playwright. Microsoft Edge presence noted by earlier inspection is only an
orientation fact: no Edge executable identity is frozen by this document.

## Preconditions and immutable inputs

One attempt may be designed only after all of these inputs are exact and independently reviewed:

1. Artifact DOM commit `b6ece37` and Agent PostgreSQL fixture commit `58ca066` have been integrated through reviewed,
   non-destructive landing onto the exact candidate source commit. Their already-passed deterministic and PostgreSQL
   operations are retained and are not replayed for credit.
2. A separately reviewed release-configuration compatibility gate and topology-selection record freeze every
   currently unknown resource required by the side-by-side candidate as specified below. A symbolic field, unsupported
   release-config value or missing selection is a STOP, not permission to use an existing selected hostname, proxy
   route, certificate, realm or client.
3. The candidate source, release manifest, public origin, release configuration, TLS certificate identity, ordinary
   OIDC issuer/client/callback binding, database identity and predecessor release identity are recorded by digest or
   exact immutable identifier. The callback is exactly `<selected candidate origin>/session/user/callback`.
4. The candidate runs side by side on Control behind its attempt-owned TLS proxy binding and is non-selected/non-
   production. The predecessor remains intact and servable. Starting, stopping or failing this candidate cannot
   promote it, replace selected routing, or mutate the predecessor.
5. The candidate exposes the shipped static application and actual `createCandidateHttpServer` /
   `createProductionComposition` paths. It must not be a test-only HTTP server or a composition with in-memory session,
   application, result, task or authority ports.
6. A disposable non-private participant, project set and database scope are exact. Seed canaries, expected public
   bytes, filenames, media types and SHA-256 digests are frozen before the run. Existing customer or production rows
   are out of scope. Within that set, the Agent project is exactly the Artifact Code project registered through the
   seed adapter's accepted `registerProject` call; its participant ID, project ID, environment ID, registration digest
   and materialized reference digest are frozen once and reused unchanged by the later ordinary-session Agent setup.
7. A single finite case ledger, attempt identifier, maximum duration, per-step deadlines, cleanup deadline and evidence
   root are frozen. The future executable fixture and its one command require exact-byte independent review before the
   first attempt.

Native Control-worker composition, repository materialization and effect execution remain separate stopped gates.
This browser harness must not use or qualify an unaccepted native composition. Agent cases below must not call
`proposal.execute`, `run.start` or `run.resume`; the current ordinary UI path therefore cannot construct their starting
state and remains blocked on the separately reviewed no-model bootstrap and approval-control split below. A later
accepted native composition may add its own prospectively frozen execution journey.

## Constructible side-by-side Control topology selection

This document does not invent a hostname, address, port, certificate, Caddy installation or Keycloak resource. Before
harness implementation, one topology-selection record must choose, verify and freeze all of the following together:

**Release-configuration compatibility prerequisite.** The current strict `gate6b/release-config.mjs` schema accepts a
loopback bind with a configurable port, but Gate 7A requires an HTTPS canonical origin with no explicit port, derives
the issuer at the fixed realm name `runaai-next`, fixes the ordinary client ID to `runaai-next-user`, fixes the
backchannel issuer to `http://127.0.0.1:9762/realms/runaai-next`, and exposes no application state/config/log-root
fields. A topology record may proceed only after exactly one of these mutually exclusive prerequisites receives its
own exact-byte independent GO and is landed into the frozen candidate source and release manifest:

- a separately gated production release-config schema/source change that represents only the necessary non-selected
  candidate origin, identity, dependency and owned-root values, with strict validation and deterministic negatives; or
- proof that a fully schema-compatible topology already exists whose every strict literal and accepted field points to
  unused, non-selected resources and whose process-derived roots cannot touch selected or predecessor resources.

The harness may not add unknown configuration keys, inject test-only composition options, override validated values
through environment state or repoint any selected/predecessor hostname, route, certificate, realm, client, database,
secret reference, process, directory or release pointer. The selected and predecessor resources remain byte- and
identity-unchanged. If neither prerequisite is true, side-by-side topology is unavailable and the lane stays stopped.

1. **Candidate application process.** Exact Control checkout/commit/release manifest, Node executable path/version/hash,
   `gate6b/server.mjs` entry point, release-config path/hash, operating-system identity, release-schema-supported
   candidate values, attempt-owned launcher/config/log roots, and a loopback-only HTTP bind address and currently free
   port. The topology must prove how every process-derived root is isolated; it may not pretend that a root is
   configurable when the accepted release schema or production composition does not expose it. The structured ready
   record must bind that PID, bind and release ID.
2. **Attempt-owned TLS proxy.** Exact Caddy executable absolute path, version, byte length and SHA-256; an attempt-owned
   Caddyfile/config/data/log root; an exact Control IP and non-selected TLS port; and one exact upstream to the
   candidate's loopback bind. The Caddy process, bind and files are owned by this attempt and are removed afterward.
   No selected Caddy service, configuration, listener, hostname route or release pointer is edited, stopped or reused.
3. **Certificate.** Exact attempt-owned certificate/key references, leaf DER SHA-256/thumbprint, issuer-chain digests,
   validity interval and SAN equal to the selected candidate hostname. Private-key bytes are never printed or retained;
   the selection proves their file ACL and deletes only the attempt-owned references during cleanup. A certificate
   warning, name mismatch or trust override is forbidden.
4. **Edge-only name mapping.** One distinct candidate hostname, Control destination IP and TLS port plus the exact
   Chromium host-resolver launch rule that maps only that hostname for the attempt-owned Edge profile. The system hosts
   file, DNS, selected hostname and selected routing remain unchanged. Direct IP navigation and certificate bypass
   flags are forbidden.
5. **Isolated ordinary identity.** One attempt-owned Keycloak realm, backend endpoint, realm name, issuer
   `<selected candidate origin>/auth/realms/<selected realm>`, confidential ordinary client ID/secret reference,
   allowed web origin and sole callback `<selected candidate origin>/session/user/callback`, plus one disposable user
   subject. Caddy routes only this candidate hostname's `/auth/*` to that exact Keycloak backend and all other paths to
   the exact candidate application upstream. The selected production realm/client is neither read for secrets nor
   changed. Realm/client/user creation, readback and deletion require a separately reviewed bounded administrator
   adapter and exact cleanup receipt.
6. **Authorization/dependency scope.** Exact disposable PostgreSQL identity, isolated OpenFGA store/model/tuples and
   exact non-production Qdrant/embedding/reranker endpoints needed by production composition. Their config references,
   health expectations and cleanup owners are frozen; the browser cases invoke no model. If an isolated dependency
   cannot be selected without changing a selected route or production record, the topology is unavailable and stops.

The selected public origin is the certificate hostname plus the selected non-default TLS port when applicable. Caddy,
candidate application and Edge wrapper each expose an owned PID/start/path identity and cannot share the selected
release's process or bind. The selection must prove both candidate reachability from Omen and unchanged selected
release reachability before it can receive source review. Until this record exists, the browser gate is blocked on an
infrastructure prerequisite rather than failed product behavior.

## Separate `playwright-core` package gate

The current `package.json` and `package-lock.json` contain no Playwright dependency. Before harness implementation, a
separate package-only gate must:

1. Select one exact `playwright-core` version after current registry/package provenance review. This design deliberately
   chooses no version. Version ranges, ambient global packages, `npx` resolution and a package selected at run time are
   forbidden.
2. Add only the exact `playwright-core` package and lock changes needed by the reviewed fixture. The lock entry's exact
   version, resolved source and integrity value, the complete lock-file SHA-256 and the source commit must be frozen.
3. Review the package as library-only browser control. Use `playwright-core`, not `playwright`, `@playwright/test` or a
   package that installs a bundled browser. Lifecycle scripts are disabled for provisioning, and browser-download
   environment guards remain enabled as defense in depth. Any attempted script or browser download is a STOP.
4. Provision the dependency source only with the reviewed lock and scripts disabled. After provisioning, prove the
   installed `playwright-core/package.json` name and exact version match the reviewed lock, and preserve an aggregate
   file inventory/digest adequate to detect drift. Package installation or download is not part of an acceptance run.
5. Receive fresh P0/P1 review and a source commit before any harness import, syntax check or execution. A missing package
   gate is a prerequisite STOP, not an application or browser failure.

## Lock-bound worktree-local dependency method

The future attempt must freeze absolute paths for an isolated acceptance worktree and one reviewed dependency-source
checkout. Before any dependency-bound import or command:

1. Prove the worktree commit and `package-lock.json` SHA-256 equal the reviewed harness/package gate, and prove the
   dependency source has the byte-identical lock. Record both resolved worktree identities.
2. Inspect `<acceptance worktree>/node_modules` with force semantics that reveal an occupied directory, file, valid
   reparse point or dangling link. Any existing object is a STOP; the method does not delete or repair it.
3. Reauthenticate the two resolved roots immediately before mutation. Create only a worktree-local Windows directory
   Junction whose sole target is the reviewed dependency source's `node_modules`.
4. Immediately inspect the created object with force semantics. Require `ReparsePoint`, `LinkType=Junction`, exactly one
   target, and an exact resolved-target identity equal to the reviewed dependency source. Then require
   `playwright-core/package.json` to match the frozen name/version and require Node resolution from the acceptance
   worktree to remain beneath that local Junction. Ambient parent-directory and global module resolution are forbidden.
5. If any construction or verification fails, run only the authenticated link-object cleanup described below and stop.
   Do not continue to import or execute the harness.
6. In a `finally` path, reauthenticate the worktree, Junction and sole target, remove only the Junction object without
   recursion, prove the link is absent, and prove the dependency target still exists with its frozen identity. Never
   remove or mutate the target tree. Aggregate suite, service, browser, database and Junction-cleanup failures without
   masking any of them.

## Fresh Microsoft Edge pin

No cached Edge observation authorizes a run. Immediately before each authorized attempt, under the same Omen operating-
system identity that will launch the browser, the preflight must resolve one absolute `msedge.exe` and freeze:

- the absolute canonical path;
- product and file version;
- exact byte length; and
- SHA-256 of the executable bytes.

The preflight must also require a valid Microsoft Authenticode signature without recording certificate-private data.
The harness passes the exact pinned path as its browser executable; PATH lookup, channel aliases and a Playwright-
managed browser are forbidden. Any path/version/length/hash/signature drift stops before launch and requires a new pin
plus fresh review. The run must not download, update or repair Edge.

## Process ownership and external witness

Process evidence is bounded to processes created by this attempt:

1. Under each host identity used by the run, first prove `Get-Process -Id $PID` against the current owned driver shell,
   then use the same identity and command shape for each recorded child PID. CIM/WMI, administrator-wide census and
   inference from a process name alone are forbidden.
2. Edge must launch through a separately implemented and independently reviewed Windows containment wrapper. The
   wrapper creates an attempt-owned Job Object (or an equivalent Windows kernel containment object with the same atomic
   guarantees), enables kill-on-close, forbids breakaway, creates the Edge root suspended, assigns it before first
   instruction, and only then resumes it. It returns the Job identity plus the exact root PID, creation time and pinned
   executable path. A plain `child_process.spawn` PID is insufficient.
3. The wrapper exposes an authoritative contained-process snapshot and terminal receipt directly from the owned Job;
   it does not use CIM/WMI or infer descendants from names. Every contained PID must resolve under the same identity
   with `Get-Process -Id`, and every observed attempt Edge process must be present in the Job snapshot. An omitted child,
   escaped/orphan process, pre-assignment exit, failed assignment, early root failure, inconsistent PID reuse, or
   nonzero contained process after close is a STOP.
4. Before an actual browser run, deterministic wrapper checks must cover child omission, attempted breakaway/orphan,
   assignment failure, root exit before ready, descendant exit ordering and Job-close termination. Those checks use a
   harmless owned helper, not Edge, and require separate review/authorization. Passing them proves only the wrapper.
5. Launch Edge from the pinned absolute path with the fresh attempt-owned profile and selected host-resolver mapping.
   Connect `playwright-core` only to that Job-contained Edge instance without importing cookies or profile state.
6. Launch the Control candidate and attempt-owned Caddy only through bounded reviewed wrappers that return their owned
   PIDs and structured ready records. Record PID, start time, executable path, candidate commit/release ID and configured
   bind identity. The Control witness runs under the same Control identity as each launcher and queries only those owned
   PIDs/roots.
7. Before cases begin, prove the predecessor is unchanged, the candidate is the only attempt-owned candidate, its HTTPS
   certificate and release/status responses match the frozen candidate, and no attempt-owned process predates the
   attempt.
8. At cleanup, request graceful browser, Caddy and candidate shutdown, wait within frozen deadlines, then close the Edge
   Job and use only the reviewed bounded termination method for surviving owned candidate/Caddy PIDs. Re-query every
   owned PID and require the Job's final process count to be zero. Unrelated Edge, Node, Caddy, Control or database
   processes are never killed or counted as owned.

## Real HTTPS and ordinary OIDC session boundary

The browser navigates the real candidate HTTPS origin. The harness must not use `page.route`, `route.fulfill`, request
interception, an in-memory/local test server, a synthetic acceptance bootstrap, cookie/header injection,
`storageState`, a reused browser profile, or direct invocation of shipped module handlers. UI actions must use the
rendered product controls.

From browser launch until ordinary OIDC has completed, request/response/console/page-error listeners, Playwright
tracing, HAR capture, video and screenshots are forbidden. The harness must not observe or retain an authorization
request, redirect, callback, issuer response or browser console event. After successful authentication, the only
network evidence permitted is an in-memory allowlisted projection with the exact shape `{ pathname, status }` for the
frozen candidate origin. It parses the URL, rejects a non-candidate origin, immediately discards the request/response
object, and retains neither query, fragment, userinfo, method, headers, body, cookies nor timing. No request/response or
console trace and no screenshot is taken anywhere in the run. Rendered public DOM assertions and user-visible actions
remain allowed after authentication.

The human completes the ordinary OIDC sign-in through `/session/user/start`, the real issuer and
`/session/user/callback`. Credentials, codes, tokens, verifiers, session cookies and browser-profile bytes never enter
the harness input, stdout or retained evidence. The server alone creates the Secure/HttpOnly ordinary session cookie.
Before functional cases, the browser must show the authenticated workspace and the candidate must return all of the
following through its real routes; only their filtered `{ pathname, status }` projections and already-public rendered
status fields may be retained:

- `/health/live`: live for the exact candidate;
- `/health/ready`: ready with exact dependencies;
- `/api/runtime/status`: running release/commit equal to the frozen candidate;
- `/api/readiness/status`: selected authority state expected by the side-by-side method;
- `/api/m1/capabilities`: M1 enabled; and
- `/api/session/status`: `authenticated=true`, `sessionType=ordinary`, with only the public profile projection.

An owner session, ambiguous owner-plus-ordinary cookies, a synthetic session, unexpected redirect, certificate warning,
status drift or non-ready dependency is a pre-case STOP. Authentication requiring human presence pauses at that explicit
gate; it does not authorize the harness to handle or retain the human's secret.

## Accepted service-path seeding

The repository does not yet contain one reviewed adapter that can provision and reconcile the isolated Keycloak,
OpenFGA, PostgreSQL, conversation and task state required by this actual-browser attempt. Therefore no browser run is
authorized until the separately implemented `gate7f/function-first/actual-browser-seed-adapter.mjs` and its
deterministic tests/evidence method receive exact-byte independent GO and are committed with the harness. That module
must export exactly `createActualBrowserSeedAdapter(options)` and the resulting object must expose only
`prepare(spec)`, `snapshot()`, `advanceConversation(spec)` and `cleanup()`. It is fixture infrastructure, receives no
product-acceptance credit and may use only the following frozen production paths:

1. **Disposable database and cipher.** `prepare` calls
   `gate7f/function-first/synthetic-postgres.mjs:startSyntheticPostgres({ toolRoot, artifactRoot })` with reviewed,
   exact absolute Control-local ordinary-directory roots owned by the attempt, then constructs `pg.Pool` with that
   returned connection string, `connectionTimeoutMillis: 2000`, `query_timeout: 8000` and the frozen unique
   `application_name`. It constructs the core cipher through `gate4/envelope.mjs:createEnvelopeCipher` from dedicated
   attempt-owned 32-byte encryption/HMAC secret references using the production key ID `runa-core-release-v1`. Those
   same references, never their bytes, may be supplied to the candidate only through the independently accepted
   release-configuration prerequisite above; the harness cannot append unsupported keys or override strict config.
   No selected database, production key or retained fixture database is allowed.
2. **Schema and identity.** The adapter constructs
   `gate4/adapters/postgres.mjs:PostgresGate4aStore({ pool })` and may call `initialize({ reset: true })` only against the
   just-created disposable cluster. It constructs `gate5/postgres.mjs:PostgresPrincipalStore({ pool })`, calls
   `initialize()`, and calls `seed(record)` once with the exact non-private `principalId`, isolated Keycloak `subject`,
   ordinary `role`, `ageClass`, active `status` and frozen record version. The Keycloak subject must be the exact
   `oidc_subject` later verified by the candidate's ordinary authenticator; an owner credential or synthetic session is
   forbidden.
3. **Conversation state.** The adapter constructs
   `gate6b/adapters/postgres-continuity.mjs:PostgresSelectedContinuityStore({ pool, cipher, now })`, calls
   `initialize()`, and uses only `createProject({ participantId, requestId, experience, displayName })` and
   `recordAnswer(request, response)`. Every `recordAnswer` request has the production shape
   `{ participant: { verified: true, principalId }, project: { projectId }, thread: { threadId }, requestId,
   contextRevision, experience, lane, message }`; its deterministic response must satisfy the already-approved
   Research/Review source, route, revision, time, report-companion and digest contract. Raw conversation SQL writes,
   copied envelopes and direct row patching are forbidden.
4. **Artifact task/result state.** The adapter constructs
   `gate7f/function-first/tasks/postgres.mjs:PostgresTaskStore({ pool, cipher })` and calls `initialize()`, constructs
   `gate7f/function-first/project/adapter.mjs:DisposableJavascriptProjectAdapter({ baseDirectory })` over one
   attempt-owned ordinary project directory, and constructs
   `gate7f/function-first/tasks/service.mjs:M1TaskService({ store, adapter, now, authorizeContext })`.
   `authorizeContext` accepts only the exact seed context `{ principalId, projectId, sessionId }`, where `principalId`
   and `projectId` equal the prepared records and `sessionId` is a unique seed-only value that is never installed into
   the browser. This offline context may prepare only the Artifact Code result cases; it cannot create or authorize an
   Agent task, grant, run or proposal. Its one accepted `registerProject` operation establishes the shared Code-project
   substrate that the later Agent setup may only read and reuse: the frozen participant ID, project ID, environment ID,
   registration digest and materialized reference digest must be identical. Offline ready result creation may call, in
   order, only `registerProject`, `createTask`, `createGrant`,
   `propose` and `execute` for the frozen deterministic `project.inspect` adapter operation; the non-ready result calls
   a final `propose` without execution. It may not call `PostgresTaskStore.save`, manufacture a receipt, invoke a model,
   or claim native Control-worker execution.
5. **Ordinary-session-bound no-model Agent prerequisite.** Before any Agent case is placed in the executable ledger, a
   separate source/configuration gate must add and independently approve one default-off candidate-only no-model Agent
   case boundary. Its rendered setup control is available only in the sealed non-selected acceptance candidate and only
   while the UI is displaying the one exact Agent project frozen in the attempt specification. This design selects the
   browser-project-selector option; it does not select or imply a new durable session-attempt-to-project mapping. The
   browser invokes that visible control after ordinary OIDC and supplies only that frozen Artifact Code `projectId` as a
   non-authoritative selector through the real `/api/m1/workspace` boundary. The server derives `principalId` and
   `sessionId` solely from the authenticated ordinary request and reauthorizes the supplied `projectId` through the
   production online-identity, owned-project and prepared-conversation-context checks before the first Agent write. A
   missing, different, stale, unowned or unprepared project selector fails before mutation. It then reads the existing
   M1 task project through the production task service and requires exact equality with the seed-frozen participant ID,
   project ID, environment ID, registration digest and materialized reference digest before the first Agent write. A
   missing, changed or additional task project fails before mutation. The Agent boundary may not call `project.prepare`,
   `registerProject`, `createEnvironment` or any other materialization/registration operation; no second project or
   filesystem effect is hidden in setup. The boundary accepts no principal/session/task/grant/run/proposal identifier
   from the browser or seed adapter. It creates one inert,
   contract-valid Agent task/run/grant and approval-required proposal bound to that reauthorized project and same
   session, using a narrowly reviewed application service and durable store implementation. It returns only opaque IDs
   needed to open the task through the ordinary saved-task UI. It may not call `run.start`, a planner/model/provider,
   `proposal.execute`, `run.resume`, a project effect, raw SQL, direct store-save escape hatch, or manufacture an intent,
   receipt, outbox/publication record or completion claim. The exact source interface, schemas, config flag, manifest
   binding, record invariants, cleanup and deterministic adversarial tests are a separate reviewed prerequisite; the
   setup boundary receives no browser or product-acceptance credit. No such setup operation exists in the current
   production surface, so all Agent cases remain absent until this selected option is implemented, independently
   reviewed and landed.

   The current visible `Approve this exact action` handler is also not eligible for this gate because after
   `proposal.approve` it immediately calls `run.resume` or `proposal.execute`. A separate exact-byte UI/service review
   must first split approval recording from continuation/effect execution so that this harness's Approve action sends
   exactly one `proposal.approve` and exposes no resume/execute control. Alternatively a separately authorized effect
   gate could prospectively test the combined path, but this document grants no such authority. Until the no-model
   bootstrap and approval-only control are both landed, the Agent journey is blocked and must be absent from the run.
6. **Candidate production read/auth path.** The candidate receives the same disposable database and core secret
   references only through the accepted, frozen release configuration and starts only through
   `gate6b/composition.mjs:createProductionComposition({ loadedConfig, releaseRoot })`, which constructs the production
   PostgreSQL stores, ordinary Keycloak verifier, `Gate5AuthorizationService`/`OpenFgaChecker`,
   `composeM1Functions`, Artifact result source ports and `M1FunctionSurface`. The read-only
   `createPostgresArtifactResultSourcePorts` is never used to seed. Browser Agent grant/approve/revoke mutations go only
   through the rendered UI and real `/api/m1/workspace`; the server derives the ordinary session context. No seed
   session ID is copied into a request.
7. **Missing administrator adapters.** `prepare` also calls exact, separately reviewed bounded administrator ports for
   creation/readback of the attempt-owned Keycloak realm/client/user and isolated OpenFGA store/model/tuples selected
   above. Because no such combined adapter is currently accepted in this repository, its concrete source module,
   constructor, credential-reference contract, methods, response schemas, finite deadlines and reciprocal deletion
   receipts are mandatory parts of the seed-adapter review. An ad hoc CLI, raw HTTP call or reuse of selected
   realm/store resources is forbidden.

`snapshot()` returns only the frozen relevant schema/table inventory, authoritative row counts, stable content digests
and non-private canary-presence booleans. It must prove that no Artifact/result/locator/retained-byte table or persisted
browser catalog exists. `advanceConversation(spec)` may use only the same continuity `recordAnswer` production method
to move a prepared visible conversation from its exact revision to the next exact revision; it exists solely for the
UI-reachable stale-control case and cannot patch a fence or envelope.

Foreign principal/project/chat/task/locator values are unique **absence canaries**. Their identifiers and plaintext
canaries are frozen but never inserted into PostgreSQL, Keycloak, OpenFGA, a URL or browser storage. `snapshot()` scans
all relevant persisted JSON/text values for them and requires zero occurrence before and after every case. Same-user
isolation uses two legitimate prepared projects owned by the disposable principal, not a fabricated foreign record.

`cleanup()` is one-use and always aggregates failures. It first takes and compares the final `snapshot()` against the
frozen expected inventory/count/digest/canary state, then calls the reviewed Keycloak/OpenFGA reciprocal deletion
methods, closes every pool, destroys the owned cipher, removes only the authenticated attempt-owned project directory,
and finally calls the exact `database.stop()` returned by `startSyntheticPostgres`. It requires
`{ stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false }`, absence of the database/project roots,
zero administrator resources and unchanged selected resources. It never issues raw cleanup SQL or deletes individual
production rows. A second call is rejected without repeating an external operation. Any state that cannot be generated
or reconciled through this frozen adapter stops for a new narrow review; there is no fallback to raw row edits, copied
ciphertext, browser-side setup, model output or an unaccepted native composition.

## Finite Artifact browser cases

Run each eligible case once in the frozen order through visible product controls and real `/api/m1/workspace` traffic.
The visible archive/unarchive lifecycle is retained as the future missing-owner case's reversible owner transition, but
that case is currently absent until the separately reviewed Artifact UI prerequisite below has landed:

1. **Chat Research and Review inventory.** Open the seeded Chat context and show its current Research and Review result
   descriptors. Verify strict owner/source/provenance/kind/format/media/route/order/ordinal projection and independent
   report-companion readiness. A missing, non-ready or mismatched companion remains visibly non-actionable.
2. **Ready read and inert preview.** Select one ready Research and one ready Review result. Verify the visible preview is
   inert even when bytes contain markup/script canaries; no DOM node, request, navigation or script effect is created
   from result content. Verify displayed source time, provenance, format and exact byte length.
3. **Exact download.** Use the user-visible download control. Compare browser download bytes, byte length, SHA-256,
   and suggested filename with the frozen values. Separately observe the rendered descriptor's media type and compare
   it with the frozen descriptor; do not claim that the browser download exposed or enforced a response media type
   unless a later reviewed UI contract makes that field observable. Revoke every object URL and remove every
   attempt-owned download in cleanup. A digest/base64/UTF-8/schema/read failure exposes no download control and no stale
   preview.
4. **Code result and non-ready state.** Open the seeded Code task and verify ready proposal/receipt result provenance,
   ordering, descriptor media type and exact filename/bytes/length/digest download as above. Verify a pending/non-ready
   result explains its state and has no read/download action.
5. **Isolation and persistence.** Switch among the two legitimate same-user projects/experiences only through the
   product UI. The foreign absence canaries never appear in a descriptor, preview, URL, private error or action. Reload
   the page and verify the same current context and exact ready results without reseeding or a result-side persisted
   copy.
6. **UI-reachable stale context.** Retain an already-rendered descriptor/control, call the reviewed seed adapter's
   `advanceConversation(spec)` (or perform the equivalent second ordinary UI action) to advance that same conversation
   through the production `recordAnswer` path, and then activate only the control that remained rendered on the same
   page. Do not reload first: reload obtains current context and is not a stale-control proof. The UI must surface the
   truthful conflict/refresh state and perform no read/download/mutation under the stale fence. `page.evaluate`, hidden
   direct API calls, invented URLs and inserted foreign records are forbidden.
7. **Missing owner through the real two-page archive lifecycle is conditional and currently absent.** Before this case
   enters an executable ledger, a separate exact-byte Artifact UI gate must change every retained ready-result preview
   action so it performs an authoritative `result.list` revalidation for the exact frozen owner before any companion or
   primary `result.read`. The admitted list must have the exact frozen owner revision and contain the same descriptor
   identity/revision/digest that the rendered control retained. A `result-owner-not-found` response, owner-revision
   mismatch, missing descriptor or changed descriptor must remove or disable every retained preview/download action,
   clear any prior preview, render only bounded missing/stale-owner copy, and issue zero `result.read` requests. A
   cross-tab notification may prompt revalidation but cannot replace or authorize the server-authoritative `result.list`
   check. The UI source, strict response admission, duplicate-activation behavior and missing/stale adversaries require
   separate review and deterministic proof; until that change is landed this case is excluded rather than failed.

   After that prerequisite lands, ordinary OIDC opens two pages in the same fresh attempt-owned Edge profile and
   Playwright browser context without copying, injecting or exposing the ordinary session cookie. In page A, select the
   prepared Chat project/conversation, open Files and artifacts, and retain one rendered ready result control plus its
   owner/revision display. In page B, navigate through the same candidate product UI, select that exact prepared project/
   conversation, and activate its visible `Archive` conversation action. Require the normal UI success state and the
   conversation's absence from the refreshed active catalog. Then, without navigating, reloading or going Back in page
   A, activate only its retained result control. Its mandatory `result.list` revalidation must receive the authoritative
   missing-owner response and produce the zero-read, non-actionable state above; the foreign absence canaries remain
   absent. The case never calls a hidden API, raw SQL, direct result deletion or a browser-supplied foreign identifier.
   After evidence is sealed, page B opens the rendered Archived conversations view and selects the same visible item,
   which uses the production `unarchive` action before reopening it. Require authoritative active-catalog and owner
   readback plus the frozen reconciled post-case snapshot before general cleanup. If archive, unarchive, the required
   revalidation or readback is not constructible through those exact visible controls, the case stops; deletion and a
   fixture-only owner-lifecycle adapter remain out of scope. This remains separate from the viable
   `advanceConversation` stale-revision case.

## Finite Agent browser cases

1. **Placement and default.** Chat exposes no Agent authority or mutation controls. Code presents Agent only as a
   contextual, default-off task mode; selecting Code retains Code precedence until the user explicitly selects Agent.
2. **Atomic authority versus non-atomic display.** Open the ordinary-session-bound no-model task and verify the UI acts
   only on the exact current `task.agent-fence` response. The atomic claim is limited to fields that response actually
   exposes: task ID/status, settled-or-blocked state, authority digest, pending-reconciliation/unsettled-proposal/
   unsettled-run counts, and the exact approvable-proposal and revocable-grant entries including their proposal/grant
   digests or revisions. Plan summaries, `planIndex`, `stepIndex`, indexed-step identity, run status and other task/run
   presentation come from separately composed reads. They may be shown as application records but are not part of the
   atomic authority claim and cannot authorize an action. Switching task/project/context invalidates the old authority
   controls before any mutation request.
3. **Ask every time.** With a settled task and an approval-required proposal, and only after the separately reviewed
   approval-only UI split has landed, verify one explicit user approval sends one exact CAS-bound
   `proposal.approve` request and updates the truthful state. It must send no `run.resume`, `proposal.execute`, effect or
   publication request; duplicate activation sends no second mutation. If approval remains coupled to resume/execute,
   the case is unavailable and stops before the control is activated unless a separate effect gate has been explicitly
   authorized.
4. **Revocation.** Revoke an active task-scoped grant through the visible control and verify the refreshed fence removes
   further approve/new-grant/continuation controls. A stale pre-revocation control produces zero effect and is replaced
   by current state.
5. **Unsettled and reconciliation is conditional and currently absent.** The no-model prerequisite above cannot create
   pending reconciliation, an unknown proposal or an active window and may not manufacture those records. This case may
   enter a future frozen ledger only after a separate exact-byte gate identifies and lands a real product lifecycle that
   creates the specific state through accepted production service transitions without a model, provider, project
   effect, raw SQL, direct store save, copied record, synthetic authority or an unaccepted native composition. That gate
   must freeze the exact reachable transition, session/project binding, expected durable records, zero-effect proof,
   cleanup/reconciliation method and deterministic adversaries. It receives no credit for direct fixture state creation.
   Until that prerequisite exists, this case is excluded rather than failed. If it later becomes eligible, verify no
   continuation, new grant, approval, repair, undo, `run.resume`, `run.start` or effect-execution control is actionable;
   reconciliation status remains truthful and this harness does not resolve or replay it.
6. **Session lifecycle.** Sign out through the product control and verify `/api/session/status` is unauthenticated and
   the workspace cannot act. Complete a second real ordinary OIDC sign-in, reopen the same disposable project/task and
   verify retained Artifact display plus session-scoped Agent authority rules. Reload once after reauthentication.

The Agent cases qualify browser presentation and authenticated governance wiring only. They do not qualify native
workspace composition, a model planner, effect execution, artifact production, release promotion or customer use.

## Evidence, reconciliation and cleanup

Evidence is public/aggregate only: attempt ID, source/release/config/lock hashes, Edge public executable pin, public TLS
identity, case IDs and outcomes, filtered `{ pathname, status }` projections, rendered public descriptor media type,
download filename/length/digest, owned PIDs and bounded timestamps. Request/response/console traces, screenshots, HAR,
video and browser profiles are never retained. No query, header, body, cookie, secret, token, credential, authorization
code, verifier, protected value, private row, raw ciphertext or full process command line is retained.

In one cleanup/reconciliation path, even after an earlier failure:

1. revoke the ordinary session through the product logout path and prove the browser is unauthenticated;
2. close Playwright, request graceful Edge exit, close the attempt-owned Job, delete only the fresh owned profile and
   owned download/evidence-temporary roots, and prove the Job process count and those roots are zero/absent;
3. gracefully stop the exact side-by-side candidate and Caddy, use bounded termination only for their still-live owned
   PIDs/roots, prove the candidate HTTPS endpoint is not servable, and prove the predecessor release/route/config
   remained unchanged;
4. call the seed adapter's one-use `cleanup()` once; require its final expected inventory/count/digest comparison, zero
   result-side persisted copies, zero absence-canary occurrences, exact Keycloak/OpenFGA absence receipts, closed pools,
   destroyed cipher and exact owned synthetic-database stop receipt;
5. prove no attempt-owned Keycloak/OpenFGA resource, database/helper/Caddy/candidate process or database/project/config/
   log root remains;
6. remove and verify only the worktree-local dependency Junction as specified above; and
7. aggregate request, assertion, browser, service, database, identity, authorization, process, filesystem and Junction
   cleanup failures so no
   primary or cleanup error masks another.

No candidate is promotable and no acceptance claim is publishable until release, database, session, filesystem,
process and dependency reconciliation are all exact zero/expected-baseline.

## Failure, stop, resume and no-replay rules

- The first package, pin, source, identity, witness, TLS, status, OIDC, seed, case or cleanup failure stops that exact
  gate. Preserve the attempt ledger and perform bounded cleanup; do not blindly retry.
- Record an RCA, correct the method prospectively, freeze new hashes and obtain fresh independent review before one
  bounded affected-scope resume.
- A passed database seed, OIDC session, browser case or service operation is not rerun merely because a later external
  witness or evidence check failed. Resume only the corrected evidence step when the preserved state and cleanup
  boundary make that possible; otherwise design a new non-duplicating case with explicit authority.
- Never reuse a session cookie, OIDC flow, browser profile, evidence nonce, object URL, candidate process, disposable
  database namespace or attempt ID. Never relabel a deterministic fixture, scripted session, direct API probe or
  manually inspected screenshot as completion of an unrun actual-browser case.
- Human sign-in is a genuine human-presence checkpoint. A timeout or cancellation there is recorded as an incomplete
  authentication prerequisite, not as an application pass or failure, unless the actual product route itself failed.

## Acceptance limit

If every gate above passes, the result may claim only one exact-commit, actual Microsoft Edge, ordinary-OIDC,
side-by-side Control HTTPS browser proof for the listed Artifact and Agent presentation/governance cases. It still does
not prove model quality, native Control-worker composition, arbitrary repository execution, artifact creation, broader
C03/C05 formats, production promotion, customer acceptance, or completion of M1.
