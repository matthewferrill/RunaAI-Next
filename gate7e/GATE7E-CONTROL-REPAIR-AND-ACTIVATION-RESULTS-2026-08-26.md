# Gate 7E Control repair and activation results

Date: 2026-08-26
Branch: `codex/gate7e-control-environment-fix`
Active source commit: `747aabc03b291badf4f8a16743a7bd019d384451`

## Outcome

The production blocker is corrected and the exact Gate 7E successor is active on Control. Ordinary
verified members may explicitly run only the accepted harmless JavaScript envelope. A result is labelled
**Ran in sandbox** only after the pinned QuickJS, Node permission, and Microsoft MXC stack returns a typed,
source-bound execution receipt. Broader code work remains deferred.

The active immutable release is
`runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc`, with artifact digest
`248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167` and 30,036 artifact files.
Its configuration digest remains
`b1d1f9cb5e8524f8318fa428bfe0d107747b4996647f8f6111cba65746b75020`; the build contained neither
secrets nor protected product data.

Selected-core authority remains active, protected data remains imported, the cutover is closed, and
PostgreSQL, Keycloak, OpenFGA, the model provider, and the JavaScript sandbox all report ready. The exact
Gate 7D predecessor is retained by the deployment rollback snapshot. No legacy repository, protected
product data, identity policy, DNS, certificate, model, database schema, or broader Code authority changed.

## Root causes and corrections

The blocker was a chain of independent environment and validation defects rather than one sandbox defect.

1. MXC's released drive-root preparation could normalize descendant ACLs and had already stopped after
   adding only one of the two documented package-group tuples. The correction uses a repository-owned
   native target-only `SetFileSecurityW` operator. It adds or reconciles only the two non-inheriting
   metadata/read/traverse tuples and verifies owner, control flags, exact tuple counts, and sampled
   descendant DACL hashes. It never invokes released MXC prepare/unprepare, `Set-Acl`, or `icacls`.
2. The pinned Node runtime cannot initialize with MXC's Win32k kill switch (`0xC0000142`). The generated
   policy now permits Win32k startup compatibility while retaining container UI-object isolation,
   clipboard denial, input-injection denial, desktop/system-control denial, system-settings denial, and
   IME denial. QuickJS still exposes no GUI or host object.
3. The scheduled-task profile temp ancestry was not traversable by the selected AppContainer. Production
   now uses an application-owned `transient\javascript` root. Each request creates one private source
   directory and exact source file, grants only required read access, and removes the directory before any
   receipt returns.
4. The first activation reached a healthy Gate 7E application but the deployer rejected its browser
   controller because a UTF-8 em-dash marker was read by Windows PowerShell 5.1 using its legacy script
   encoding. Automatic rollback restored Gate 7D exactly. The validator now uses only exact ASCII code
   markers tied to the controller's real responsibilities. A fresh commit, release ID, artifact, manifest,
   and prepared release directory were built; the rejected artifact was never relabelled or reused.

## Target-only Control reconciliation

Every final path has exactly one `S-1-15-2-1` tuple and one `S-1-15-2-2` tuple, access mask
`0x00120088`, no inheritance or propagation, and zero conflicting tuples.

| Path role | Final control flags | Exact tuple pair | Conflicts |
| --- | ---: | ---: | ---: |
| System drive root | `0x9004` | 1 / 1 | 0 |
| `C:\AI` | `0x8004` | 1 / 1 | 0 |
| Candidate root | `0x8004` | 1 / 1 | 0 |
| Staging root | `0x8004` | 1 / 1 | 0 |
| Releases root | `0x8004` | 1 / 1 | 0 |
| Transient root | `0x8004` | 1 / 1 | 0 |
| JavaScript transient root | `0x8004` | 1 / 1 | 0 |
| Active immutable release root | `0x8004` | 1 / 1 | 0 |

Every repair transaction reported sampled descendant DACLs byte-stable, left the active application
unchanged, removed its one-use SYSTEM task, and retained no result file. The final audit found zero Gate 7E
repair tasks. The JavaScript transient root was empty after startup and post-activation execution proofs.

## Real execution evidence

The final SYSTEM-context proof used the active release's pinned Node `22.22.0` runtime and exact source
commit. It passed both stages through the real MXC AppContainer:

- startup returned exact typed stdout `runa2-sandbox-ready`;
- real arithmetic `115 + 25` returned exact stdout `140`;
- isolation tier was `appcontainer-dacl`;
- network was `deny-all`;
- filesystem access was limited to the read-only compact runtime and one private source directory;
- effects were empty; and
- the one-use task and temporary source/runtime directories were removed.

This is execution evidence, not a model prediction or a code comment.

## Verification summary

| Check | Result |
| --- | --- |
| Focused Gate 7E suite on Control | 18/18 passed before release construction |
| Complete suite before corrected build | 441/441 passed locally and on Control |
| Complete suite at corrected commit on Control | 441/441 passed |
| Complete suite with active release Node runtime | 441/441 passed |
| Real SYSTEM startup and arithmetic preflight | Passed; real execution, no effects |
| Immutable successor build | 30,036 files; artifact and manifest hash-pinned |
| Deployment rollback rehearsal | First activation rejected; exact Gate 7D predecessor restored |
| Corrected activation | Passed; application and Caddy changed together |
| Dependency health | PostgreSQL, Keycloak, OpenFGA, provider, sandbox all ready |
| Canonical public assets | Page, controller, execution helper all HTTP 200 |
| Public execution contract | Route, honest execution label, and no-partial-output markers present |
| Public customer landing | Active/ready; no browser console errors |
| Ordinary login route | Username/password Keycloak client with PKCE reached successfully |
| Owner proof and routes | Rebound to exact successor; owner route unchanged |
| Protected product data | Unchanged |
| Legacy checkout | Unchanged |

One local complete-suite run transiently missed only the stub provider's single-digit-millisecond
performance threshold under machine load (440/441). The same probe passed immediately in isolation and
the next complete run passed 441/441. It did not exercise or change Gate 7E behavior and was not accepted
as the final result.

## Activation sequence and rollback evidence

The first immutable candidate was
`runaai-next-gate7a-lan-gate7e-2026-08-26-2690aef` at
`2690aeffbfd1f63fc383340576ab7159d06195d0`. It reached the new application and sandbox health, then failed
the non-ASCII presentation marker with `gate7a-ordinary-deploy-gate7e-controller-invalid`. The deployer
restored release `runaai-next-gate7d-current-turn-2026-08-25-e10e3db`, commit
`e10e3db097d894d1f00b389921ceab0decaff24c`, artifact
`53cd635b046ea0b47ca4eaa2505104a28bc27982238f0a8a6033940d007a1e8d`, closed cutover, active authority,
protected import, and production traffic before correction continued.

The second activation used the corrected release and passed artifact identity, configuration boundary,
Caddy validation and reload, startup preflight, dependency health, owner-proof rebind, ordinary and owner
redirects, public page/controller/helper markers, and sandbox readiness. Its rollback snapshot is retained.

The rejected immutable release and its rollback evidence remain inactive for audit; neither is a valid
deployment source for later work.

## Remaining customer acceptance

Automated production validation is complete. The agent-controlled browser proved the landing page and
ordinary username/password route, but had no existing ordinary-user credential and the external Chrome
connection was unavailable. The last acceptance therefore requires the existing ordinary user to:

1. sign in normally at `https://runa.bridgebuildersai.com/`;
2. open **Code** and request one JavaScript block containing `console.log(115 + 25)`;
3. confirm the draft is labelled **Draft — not run** before execution;
4. select **Run in sandbox**; and
5. confirm the badge changes to **Ran in sandbox** and the exact output is `140`.

Any absent button, session loop, non-`140` output, dishonest label, or partial output is a failed customer
acceptance and must not be waived. It does not automatically roll back an otherwise healthy release; the
retained predecessor permits a deliberate rollback if the failure is reproduced as a release defect.

## Deferred scope

Network access, package installation, repository/project access, persistent execution files, terminal
behavior, Git operations, multi-file execution, broader executors, and their governance remain deferred.
Broader Code work remains on hold until after the separately reviewed Gemma bake-off and accepted burn-in.
