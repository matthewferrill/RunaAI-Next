# M1-S2B server-managed workspace architecture — 2026-09-03

Status: steward-approved product correction; implementation and actual-system acceptance remain open  
Decision date: 2026-09-03  
Decision-input roadmap revision/digest: `2026-08-28.1` / `0e87173ebabfd8759adee4dd66f65a1964430c102bb62311fe0d462f601c262c`  
Milestone/capability scope: M1-S2B; bounded C03/C06/C07/C08/C12/C15/C16 subsets

## Decision

Runa's primary Code path uses a Control-orchestrated, server-managed workspace. The browser is the user
interface, Control owns identity/authority/durable task state, Home performs model inference only, and an
isolated execution worker clones or materializes the selected project away from the end-user device.

The Omen companion and its sealed `C:\` prerequisite transition are removed from the primary Code critical
path. The prior Omen work remains immutable historical evidence for a possible future fully local execution
mode; it is neither executed nor silently relabelled as server-worker acceptance.

An end-user device hosts no code worker for an ordinary remote-Git workflow. A small per-user local-folder
bridge is optional only when a user deliberately connects content that exists solely on that device. The bridge
may transfer versioned files and apply an approved patch, but it cannot execute model-authored code or Git,
hold Control/model credentials, or broaden access beyond selected roots. Therefore it does not require the
Omen AppContainer system-drive transition.

## Corrected topology

```text
browser
  |
  v
Control application and authority -----> Home Gemma inference
  |
  v
isolated execution broker/worker
  |
  +---- governed Git ingress/egress
  +---- disposable or retained project workspace
  +---- bounded commands/tests and exact receipts
```

The worker may initially run on Control hardware, but never in the Control web/database process or under its
credential-bearing identity. It must have a separate low-privilege identity, workspace root, process/job
boundary and credential broker. It receives no PostgreSQL, Keycloak, OpenFGA, model-control, deployment or
long-lived Git secret. A separate execution host can later implement the same worker contract without changing
the product authority model.

Home remains model-only. Untrusted repository code must not share Home's model-runtime identity, writable model
paths, GPU-management authority or inference-control credentials. A future Home-hosted worker would require a
separate VM-level boundary and independent qualification; it is not part of this decision.

## Customer workflows

### Source-adapter boundary

The worker is not hard-coded to Git. Git is the first materializer, while a normalized source-adapter contract
allows Perforce, Subversion, TFVC, Mercurial, local/file/archive snapshots, cloud drives, SSH/SFTP folders and
governed data/artifact inputs to produce the same version-bound workspace manifest. Each adapter retains native
terms and writeback semantics; work-management connectors are context rather than workspace authority, and remote
development environments are execution backends rather than project sources. The initial register, common lifecycle,
security invariants and delivery order are in
`M1-S2B-PROJECT-SOURCE-ADAPTER-REGISTER-2026-09-03.md`.

### Remote Git repository — primary Code path

1. The user connects a supported Git provider and selects an exact repository/ref.
2. Control issues a single bounded materialization request. A credential broker supplies a short-lived,
   repository-scoped token only to the ingress operation.
3. The worker creates a new owned workspace, clones/fetches without hooks, user/global config, credential
   helpers, external filters, submodules or LFS unless each later capability is explicitly enabled, and verifies
   the resolved commit.
4. Network access ends before model-authored code or project tests run. Execution uses the accepted isolation
   provider with only the workspace and pinned runtimes granted.
5. Runa presents files, branch/base identity, proposed diff, command/test receipts and artifacts in the browser.
6. Commit and push are separate governed effects. Egress uses a new short-lived token and exact repository/ref;
   a read connection never implies write authority.

### One-time local-folder snapshot — no local installation

While the browser page is open, an explicitly selected folder may be captured through the supported browser
file/directory picker. Runa previews the selected scope and exclusions, hashes the accepted files, uploads a
bounded snapshot, and materializes it in a server workspace. The browser cannot provide persistent background
access or silent writeback. Results return as downloads or a patch.

### Persistently connected local folder — optional per-user bridge

The signed local bridge runs as the signed-in user with no elevation. It keeps only selected-root locators and
its device key under CurrentUser protection, rejects reparse/path escapes, produces bounded path/size/hash
manifests, and transfers only user-approved snapshots/deltas. It has no arbitrary process, shell, Git, model,
database or deployment surface.

Writeback is a separate exact proposal. The bridge rechecks root identity and every affected base hash, applies
only approved in-root changes atomically, and stops on concurrent change instead of overwriting. Disconnect and
revoke end new access immediately; offline local cleanup is reported honestly and reconciled on reconnect.

### Local folder that is also a Git repository

Runa separates repository identity from the local working copy:

- For a clean repository with an accessible remote, the server worker clones the exact remote commit. The local
  device supplies no source payload beyond explicitly approved identity metadata.
- For local uncommitted work, the bridge transfers an exact bounded patch or selected changed-file snapshot over
  the named base commit. Untracked files require explicit selection. Ignored files and common secret files remain
  excluded by default.
- Runa does not copy the local `.git` directory, hooks, credential helpers or machine-specific configuration.
- If no remote is available, the first release treats the project as a versioned file snapshot and returns a
  patch. A sanitized history/bundle transfer is future separately qualified scope.
- Results either become an approved server-side branch/commit or an approved local patch application. Runa never
  silently performs both, and any dirty/stale destination stops for reconciliation.

### Fully local/private execution — deferred optional mode

If source must never leave the user's device, Runa needs a qualified local execution worker or a self-hosted
Control/worker deployment. That optional mode may reuse the historical Omen isolation work after a new product
decision and fresh acceptance. Its installation and machine changes are not prerequisites for normal Git coding.

## Reusable Control foundation and unproved expansion

Gate 7E already proves an active Control-side MXC/QuickJS executor for one harmless JavaScript source with a
deny-all network policy, bounded time/memory/output, isolated UI and a typed execution receipt. Control's host
prerequisites were previously prepared and accepted. This is reusable infrastructure, not evidence that the
broader server-managed repository worker is complete.

The project worker is a side-by-side, newly versioned executor/profile rather than an in-place widening of Gate 7E.
Gate 7E relies on both QuickJS's deliberately tiny guest surface and MXC host containment; its acceptance grants no
repository filesystem, native tool, multi-process, package, Git or project-test authority. The new profile must
independently prove every admitted runtime and process boundary before routing, and rollback leaves the existing
harmless-JavaScript profile unchanged.

Still unproved and required here are repository credential brokering; clone/fetch containment; exact workspace
ownership and cleanup; multi-file reads/writes; declared runtime/test commands; project-config, hook/filter,
submodule and LFS denial; concurrency; cancellation; restart reconciliation; retained workspace lifecycle;
diff/commit/push effects; quotas; and the complete browser journey.

## Minimum model-independent contracts

- `runa-workspace-materialization-request/v1`: participant/project/task, connection id, repository id, immutable
  requested ref or snapshot digest, mode, limits and capability-set version.
- `runa-workspace-manifest/v1`: opaque workspace id, source kind, resolved commit/snapshot digest, bounded file
  manifest digest, worker release, isolation provider/tier, creation/expiry and state.
- `runa-workspace-operation-request/v1`: workspace id, exact allowlisted operation and arguments, base version,
  grant id, deadline and idempotency key.
- `runa-workspace-operation-receipt/v1`: outcome, process/output/effect/diff/artifact digests, resolved workspace
  version, limits, worker identity/release, start/end and cleanup/reconciliation state.
- `runa-local-snapshot-manifest/v1` and `runa-local-writeback-proposal/v1`: selected root id, safe relative paths,
  base/result hashes, exclusions, device signature, approval and conflict state; never an absolute path sent as
  authority.

PostgreSQL owns connection, workspace, grant, task, receipt, revocation and reconciliation state. LangGraph owns
durable workflow checkpoints. The worker filesystem is execution material, not an independent durable authority.

## Frozen security and failure rules

1. Control authenticates and authorizes every materialization, operation and effect; prompts and repository
   content convey no authority.
2. Clone/fetch network admission and code-execution network denial are separate phases. A Git token never enters
   the execution environment, logs, model context, receipt or retained workspace.
3. A user-supplied Git URL is not a network allowlist. Ingress accepts only a provider-resolved repository id or
   an exact administrator-approved endpoint. It pins scheme/host/port, disables cross-origin redirects, resolves
   every connection attempt, rejects loopback/link-local/private/reserved/metadata addresses and DNS rebinding,
   applies outbound proxy/firewall policy, and records only safe endpoint classifications. SSH host keys are pinned;
   no interactive trust-on-first-use is allowed.
4. Only Runa-created roots under the configured worker workspace parent are admitted. Exact no-follow identity,
   path containment, reparse/hardlink policy, quota and cleanup checks run before and after each operation.
   Each workspace has a unique low-privilege execution identity or equivalently proven kernel boundary; one task
   cannot enumerate, read, signal, attach to, reuse handles from or retain processes in another workspace.
5. Model-authored shell strings are not accepted. The first implementation exposes only prospectively frozen
   operation types and argument arrays with pinned executables/runtimes.
6. The server derives participant, project, environment, connection and workspace binding from authenticated
   authority records, never from model/browser-supplied copies. The repository capability set receives a new exact
   version; existing `m1-javascript` grants cannot authorize materialization, file access, Git, writeback or egress.
7. Unknown effects remain unknown and block retry until reconciled. Timeout/cancel kills the complete owned process
   tree, preserves evidence and never reports completion from model text.
8. A worker crash, Control restart, duplicate request, credential failure, repository drift, local-file conflict,
   network loss, quota violation or cleanup failure has an explicit terminal/pending state and bounded recovery.
9. Any actual-system method failure stops this acceptance gate for retained RCA and corrected design before one
   affected-scope retry. No mock or model output can substitute for a real filesystem/process/Git/browser result.

## Prospective implementation order

1. Freeze and independently review the server workspace, Git ingress and receipt schemas plus threat model.
2. Implement disposable public-repository materialization and read-only inspection on the Control worker boundary.
3. Add private-repository credential brokering with read-only scope and revoke/restart tests.
4. Build a side-by-side, newly versioned project executor/profile for the declared multi-file JavaScript test
   envelope with no network. Reuse reviewed primitives, but do not widen or inherit Gate 7E acceptance.
5. Add governed file changes, exact diff, tests and undo; then local commit and separately approved push.
6. Implement one-time browser snapshot import. Keep the persistent local bridge and fully local execution as
   separate optional slices unless customer acceptance proves they are required sooner.
7. Keep the normalized source-adapter interface stable and prove that one non-Git snapshot adapter can materialize
   without Git fields or authority. Do not implement speculative external providers for acceptance counts.
8. Run deterministic tests, actual Control worker/Git proofs, actual browser journeys and independent review before
   exposing the customer route.

## Explicit exclusions

This decision does not activate a Git provider, create or use credentials, clone a repository, broaden the active
Gate 7E executor, start a service, change Control/Home/Omen, invoke a model, run an Omen ACL transition, or change
production routing. GitHub PRs/CI/deployment, arbitrary shell/package installation, general languages, submodules,
LFS, live local-folder sync, fully local execution and multi-tenant commercial hosting remain separately governed.

## Rollback and preservation

The active Control release and database remain the predecessor. A candidate server-worker release is added beside
it and receives no route until exact acceptance. Rollback disables new materialization, reconciles or expires owned
workspaces and tokens, preserves user-created branches/artifacts/records, and restores the predecessor without
deleting remote or local user work. The unexecuted Omen transition stays inactive; no rollback is needed there.
