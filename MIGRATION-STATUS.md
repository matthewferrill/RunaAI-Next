# RunaAI migration status

Status date: 2026-08-25. This is the living migration handoff for RunaAI-Next. Update it in the same
commit whenever a gate changes repository direction, authority, implementation status, safety
boundaries, verification state, or the next planned work.

## Repository identity and authority

| Repository or branch | Current role | Authority |
|---|---|---|
| Legacy `RunaAI` repository | Intact rollback system and behavior reference | Verified fallback; no longer selected-core write authority after Gate 6D close |
| `Runalab` repository | Completed stack-selection and evidence archive | Historical component evidence only; no new product implementation |
| RunaAI-Next `main` | Exact inherited RunaLab completion baseline | Stable integration target only after reviewed migration completion |
| RunaAI-Next `runa2/integration` | Accumulated accepted migration gates | Development integration; not production |
| Short-lived `runa2/*` gate branches | One approved, measured migration slice | Experimental until validated and approved |
| Control release `runaai-next-gate7a-lan-chat-code-2026-08-25-65b907b` | Running selected-core RunaAI application at the canonical LAN origin | Production authority for the exact selected read-only core and reviewed Chat/Code navigation; later product capabilities remain separately decision-gated |

The product name is RunaAI. `RunaAI-Next`, `runa2`, and similar labels are repository and branch
identifiers during migration, not product identities.

## Verified lineage

```text
RunaLab source commit: ec5e3466f6f937c8c610bdecf62a09c2491c7137
RunaAI legacy reference at bootstrap: 71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2
RunaAI-Next baseline tag: runalab-stack-baseline-2026-08-20
RunaAI-Next origin: https://github.com/matthewferrill/RunaAI-Next.git
```

`runalab` and `runaai-legacy` are configured as fetch-only remotes in the Omen bootstrap checkout.
Their histories are reference inputs. Never merge the unrelated legacy RunaAI history into this
repository and never push migration work into either source repository.

## Current status

- Repository lineage and source remotes are established.
- GitHub branch protection is active on `main` and `runa2/integration`: pull requests and resolved
  conversations are required; stale reviews are dismissed; admins are included; force-pushes and
  deletion are blocked. Required status checks remain unset until a real CI check exists.
- `main` remains at the exact RunaLab completion baseline. `runa2/integration` contains accepted work
  through the reconciled Gate 6D production release and post-cutover hardening.
- The completed laboratory evidence, seals, probes, stack bakeoff, model findings, architecture
  assessment, and conditional estimates are inherited.
- Gate 1 contains an isolated synthetic-only implementation of the smallest ordinary read-only
  chat/research path. Its approved code-review remediation and refreshed evidence were accepted by the
  steward on 2026-08-21 and merged into `runa2/integration` as `7107ead`. It is development evidence,
  not an authority for production behavior.
- The one approved Gate 4A aggregate inventory opened only the named project/chat roots and decrypted
  chat records in memory under Matthew's Control identity. It emitted no protected value and copied,
  converted, imported, or migrated no record.
- No model has been downloaded.
- Gate 6D activated the exact private Control production path for the selected core. No model was
  downloaded, no provider credential was introduced, and no external spending path was activated.
  Candidate PostgreSQL, Keycloak, OpenFGA, Node, and Caddy are retained; only private Caddy TLS is
  exposed, while the other candidate listeners remain loopback-bound.
- Gate 7A's canonical LAN origin is active at `https://runa.bridgebuildersai.com`. The Porkbun A record
  resolves to Control's private address, the ordinary WebPKI certificate is trusted from Omen, Caddy is
  the only new LAN-facing service on TCP 443, and every backend remains loopback-bound. Keycloak now
  advertises the same-origin `/auth` issuer and `runa.bridgebuildersai.com` RP ID. The session cookie is
  host-only, `Secure`, `HttpOnly`, and explicitly `SameSite=Lax`; off-LAN ingress remains disabled.
- The exact active release is `runaai-next-gate7a-lan-chat-code-2026-08-25-65b907b`, commit
  `65b907b30fc58dcc1aac46edb8dce773018371d3`, artifact digest
  `bb02e17fa50f602ce255f0bb5a6d95b295190259acc3c4549f2494251f4657d2`, and manifest digest
  `ee24e7f36c468ae87e223f8ae9a6971449479e99bfe085c13959297e1a30b5df`. Authority is active,
  cutover is closed, all four dependencies are ready, and the 29,506-file artifact is verified. The
  exact Gate 7C predecessor is retained for rollback; configuration digest, identity, legacy, and
  protected product data are unchanged. The exact commit suite passes 406/406.
- Gate 7A is not closed. Canonical-origin owner passkey sign-in has completed and the protected
  `matthew-owner` path remains passkey-only. The steward approved a separate ordinary-user model:
  invitation-only enrollment, an individual username/password, verified-email recovery, and an
  optional passkey for ordinary chat. Public self-registration remains disabled. The local
  implementation uses a separate exact password-only Keycloak client, separate encrypted sessions,
  owner-role password denial, an exact automatically reversible application successor, and short-lived
  rollback-safe invitations. Focused Gate 7A validation is 67/67. The separate client and password route
  reconcile exactly, the owner client is unchanged, and selected-core authority/protected data remain
  unchanged. SMTP, the first ordinary invitation, password setup, ordinary sign-in, and the initial
  conversational UI are active. A second PC, a phone, off-LAN ingress, and certificate renewal remain
  separate checks.

- Gate 7B is now frozen by
  `gate7b/GATE7B-CUSTOMER-JOURNEY-SCOPE-AND-GREEN-CRITERIA-2026-08-24.md`. It replaces symptom-by-symptom
  chat repair with one login-to-logout acceptance unit covering sustained ordinary chat, safe provider
  results, retries, continuity, all internal read-only answer lanes, and truthful workspace/code limits.
  No new effect, source picker, web research, code execution, learning activation, protected-owner
  capability, or off-LAN ingress is included.
- Gate 7B's source correction now passes 393/393 repository tests and all 11 checks in the executable
  login-to-logout synthetic customer journey. The already-running Control private model passed all
  five aggregate checks for cold/warm plain chat, evidence-bearing research, evidence-bearing workspace,
  exact model identity, deterministic role routing, and citation mode. Ordinary chat no longer requires
  model-generated JSON; incomplete model results are typed, not recorded as completed turns, and receive
  a customer-safe retry path. The bounded deadline chain is 60 seconds application, 65 seconds browser
  and provider proxy, and 70 seconds public application proxy. The rollback-protected application/Caddy
  successor is active. Omen live acceptance proved ordinary password sign-in, session entry, ten sustained
  customer turns, general model conversation, honest live-lookup refusal, and continued recovery after
  the prior failures. It also exposed two presentation defects: `.mjs` was served as generic binary data,
  preventing Edge from running the page, and typed audit labels were appended to otherwise valid customer
  prose. Both are corrected in the Gate 7B exact release. The steward's exact-release recheck returned the
  correct square root of pi without an audit label and the live-weather limitation without Gate terminology.
  Gate 7B is complete.
- Gate 7C is frozen by
  `gate7c/GATE7C-UI-SHELL-SCOPE-AND-GREEN-CRITERIA-2026-08-24.md` and implemented on the isolated
  `codex/gate7c-ui-shell` review branch at `1490a9b`. The presentation-only slice restores the familiar
  RunaAI three-column workspace around the existing ordinary chat: independent empty left and right
  expansion areas, the central transcript and composer, warm Dawn styling, and no labels, feature
  wiring, persistence, or data access. Gate 7C passes 5/5 focused checks, Gate 6B
  passes 32/32, Gate 7B passes 17/17, and the full repository suite passes 398/398. Disposable
  loopback visual checks passed at wide desktop, constrained desktop, and phone widths after correcting
  mobile grid placement. The exact rollback-protected successor is now active on Control as the release
  named above; its configuration digest is unchanged, owner proof and both login routes reconciled, and
  its predecessor remains retained. Full evidence is in
  `gate7c/GATE7C-UI-SHELL-RESULTS-2026-08-24.md`. The steward accepted the proportions and visual
  direction before Gate 7D added the first rail capability.
- The steward accepted Gate 7C's overall visual direction and requested the first left-rail capability.
  Gate 7D is frozen and implemented on the dependent `codex/gate7d-chat-code-navigation` branch.
  It replaces the generic ordinary-member label with a bounded initials avatar and signed-in display
  name, and adds separate Chat and Code navigation areas. Each area has its own New action, encrypted
  participant-scoped projects, durable chat-record list, and independent in-memory selection state.
  PostgreSQL remains the only record authority; the browser gains no local catalog. Code is a distinct
  deterministic conversational role with no repository, file, terminal, execution, network, learning,
  or protected-record capability. Focused validation passes 8/8, the full repository suite passes
  406/406, `git diff --check` passes, and desktop/phone visual checks passed against a disposable
  loopback preview. Source commits are `27fa026` for frozen criteria, `7b9b3bb` for implementation,
  `3ddaee0` for source evidence, `fa1ac32` for rollback-window live validation, and `65b907b` for exact
  successor launcher binding. The corrected exact release is active on Control. Authority, protected
  data, identity, Caddy configuration, network exposure, model configuration, and legacy RunaAI remain
  unchanged. The retained Gate 7C release is the automatic application rollback target. Full evidence
  is in `gate7d/GATE7D-CHAT-CODE-NAVIGATION-RESULTS-2026-08-24.md`; the remaining Gate 7D decision is
  ordinary-user live review followed by a separate merge decision.
- Gate 7D's first exact activation attempt failed closed because its staged launcher was still bound to
  Gate 7C while its manifest named Gate 7D. Artifact verification rejected the mismatch and the guarded
  operator automatically restored the exact Gate 7C release and readiness state. The corrected operator
  now rejects a predecessor-bound launcher before creating release or rollback paths. The second attempt
  used a newly generated successor-bound launcher, activated the exact commit and artifact, reconciled
  owner and ordinary login routes, and validated every required live HTML and controller marker before
  reporting success. No protected or private values were retained in the evidence.
- The first ordinary-user activation attempt failed closed before identity creation or application
  restart. RCA: Windows PowerShell 5.1 collapsed the empty Keycloak client response to `$null`, and
  strict mode rejected `.Count`. Normalized reconciliation then proved zero ordinary clients, zero
  ordinary flows, no generated secret, unchanged registration/username policy, and the exact prior
  application release. The operator now array-wraps empty and single-item API results before counting;
  focused and full validation remain green before retry.
- The second attempt reached the successor and preserved selected-core readiness, then failed its final
  route probe because the operator expected HTTP 302 while the tested application contract uses HTTP
  303 for browser sign-in redirects. Automatic rollback restored the exact predecessor and removed the
  attempt-created ordinary client, flow, and secret. The probe now requires 303; application behavior
  is unchanged.
- The third attempt proved the ordinary password route initialized, then failed closed because the
  successor's owner route required the completed owner proof to be bound to that exact immutable
  release. The proof correctly remained predecessor-bound, and the deployment omitted the audited
  completed-owner rebind that earlier canonical activation already required. A wrapped Windows
  PowerShell HTTP exception obscured the safe component error. Automatic rollback restored the exact
  predecessor and removed the attempt-created client, flow, and secret. The corrected deployment now
  rebinds only the completed owner proof, retains the prior proof, changes no authority or protected
  product data, is idempotent for an exact retry, and safely unwraps nested HTTP exceptions. Focused
  Gate 7A validation is 67/67 and the full suite is 370/370.
- The fourth attempt reached the successor and failed closed before owner-proof mutation because the
  successor's stricter configuration parser rejected the older predecessor configuration, which
  correctly predates the ordinary-client block. Automatic rollback restored the exact predecessor and
  removed the attempt-created client, flow, and secret. The rebind operator now validates each config
  with the parser shipped by its own immutable release while still comparing the exact shared authority,
  database, key, and canonical-origin bindings. Native Node stderr is captured without letting Windows
  PowerShell convert a safe structured error into an early terminating error.
- The first interactive Porkbun enrollment attempt failed closed with no credential retained. RCA: a
  clean Windows PowerShell 5.1 process had not loaded `System.Security`, so the DPAPI `ProtectedData`
  type was unavailable. A secret-free owner probe proved DPAPI and restricted-directory writes healthy.
  Enrollment and preflight now load the assembly explicitly before DPAPI use, and unexpected enrollment
  failures report only a safe stage-specific code.
- The remediated Control-local Porkbun enrollment passed under `RUNA-CONTROL\Matthew`; the credential is
  retained only as DPAPI CurrentUser data in the existing ACL-restricted candidate secrets root. The
  authenticated read-only preflight passed for `bridgebuildersai.com` and confirmed zero existing
  `runa` A/AAAA/CNAME records at that time. No private value was retained in evidence. The wildcard
  certificate was subsequently staged, validated, and activated without exposing its private value.
- No migration gate is approved merely by this bootstrap.
- Bootstrap documentation and clean-clone validation were reviewed and merged into
  `runa2/integration` as `94ba860`.
- Gate 0 contract/evidence freeze was approved by the steward on 2026-08-20 for integration through
  PR #2. The steward separately approved Gate 1 implementation on 2026-08-20.
- Gate 1 prerequisites are complete: exact Node 22.22.0 is installed and green, Node 22.23.2 is
  rejected by the sealed latency gate, and the low npm advisory has an explicit synthetic-slice-only
  disposition.
- Gate 1 implementation was explicitly approved and built on `runa2/gate-1-read-only-slice`. The
  remediated deterministic suite passes 24/24 and the disposable real-stack integration passes 25/25
  with clean shutdown. The full repository suite passes 38/38, 10/10 seals and all 12 pinned legacy
  suites remain green, and Qwen3 Coder passes 12/12 refreshed live synthetic acceptance runs. On 2026-08-20 the steward approved
  a Gate 1 scope amendment deferring Qwen3.6 deliberate review and the existing live BGE endpoint;
  neither is silently replaced or credited. The steward subsequently accepted the regenerated Gate 1
  evidence. Protected review then found total-deadline, concurrent-idempotency, and post-window-32
  reranker gaps. The steward approved the narrow remediation on 2026-08-21; it completed with green
  refreshed evidence on 2026-08-21, which the steward accepted the same day. The steward separately
  approved the protected merge, completed as `7107ead` on 2026-08-21. The source branch remains
  available.
- Gate 2 planning and implementation are isolated on `runa2/gate-2-read-only-continuity` from
  `7107ead`. The steward approved Gate 2A on 2026-08-21. The bounded synthetic implementation now
  passes all 34 frozen corpus cases and 21/21 disposable selected-stack integration checks with clean
  shutdown and Gate-2-only rollback. Gate 2 regression review exposed an intermittent Gate 1 Qdrant
  timeout-label race; the steward approved a narrow remediation on 2026-08-21. The refreshed Gate 1
  deterministic suite passes 26/26, Gate 1 integration passes 25/25, and full Gate 0 verification
  passes 48/48 plus 10/10 seals. Timeout and genuine dependency loss are now deterministically
  distinguished. The steward accepted Gate 2B evidence and separately approved Gate 2C on
  2026-08-21. The protected merge completed as `4c4767f`, preserving the reviewed Gate 2 commits and
  source branch. Live-model validation was not run and remains separately decision-gated.
- Gate 3 was explicitly approved and implemented on `runa2/gate-3-governed-action` from integration
  head `93cc44e`. The bounded slice has one action only: changing the synthetic verified participant's
  default intelligence level in an owned managed-project context. Its 26/26 contract suite and 16/16
  disposable PostgreSQL/LangGraph integration checks pass, including response-loss resume, direct and
  concurrent replay, atomic failure rollback, stale-revision denial, one deed/one receipt/outbox, and a
  separately governed rollback from `High` to `Medium`. The full 74/74 Node profile, 10/10 seals,
  12/12 pinned legacy suites, and Gate 1/2 integration regressions remain green. The steward accepted
  the evidence and separately approved the protected merge, completed as `0680cfb` on 2026-08-21.
  The source branch remains available; this is not production authorization.
- Gate 4A is isolated on `runa2/gate-4a-project-chat-plan` from `0680cfb`. The steward approved Gate
  4A-1 on 2026-08-21. The synthetic project/chat migration at `1f5f8be` implements the typed
  `runa_core` authority, immutable `runa_migration` ledger, application AES-256-GCM envelopes,
  external keyed reconciliation, content-free tombstones, idempotent/restart-safe imports, scoped
  reads, and Gate-4A-only rollback. All 19/19 frozen Gate 4A cases, 16/16 disposable PostgreSQL
  integration checks, and the full 93/93 Node profile pass. Gate 1, 2, and 3 disposable integration
  regressions pass 25/25, 21/21, and 16/16 respectively; Gate 0 passes with 10/10 seals and all 12
  pinned legacy suites. The aggregate-only owner inventory tool is implemented and fails closed on
  authority mismatch. RUNA-CONTROL's clean production checkout is at `b4db040`, while live GitHub
  `main` was observed at the rewritten `71ce985` history. All ten Gate 4A legacy source selections are
  content-equivalent after `utf8-lf` canonicalization; the inventory now verifies those pins, bound
  to `b4db040`, before protected roots can open. The approved owner-context execution passed on
  RUNA-CONTROL: 25 readable unassigned chats, 75 turns, zero projects or project-memory records, zero
  unreadable/relationship findings, deterministic second pass, and no disallowed output. No record
  was exported, copied, converted, imported, repaired, or migrated during inventory. The steward then
  approved Gate 4A-2, and the Control-local protected rehearsal at `04bfb7d` preserved all 25 chats and
  75 turns with identical whole-domain logical digests, one committed run, 100 ledger items, atomic
  failure rollback, idempotent restart/replay, owner-bound DPAPI key recovery, scoped-read denial, and
  no private value in retained evidence or target/log scans. The source remained byte-exact. The
  temporary target schemas, data, key, backup, runtime, listener, and root were removed. On 2026-08-21
  the steward accepted the Gate 4A-2 evidence and separately approved the Gate 4A protected merge into
  `runa2/integration`. The protected merge completed as `90572a0`, preserving the reviewed Gate 4A
  commits and source branch. Post-merge verification passed the full 93/93 Node profile, Gate 1–4
  disposable integration regressions, 10/10 seals, and all 12 pinned legacy suites. No production
  adapter or cutover is authorized.
- Gate 4B planning is isolated on `runa2/gate-4b-learning-events-plan` from accepted integration head
  `9b0d4a4`. The steward approved synthetic contract work and a protected aggregate-inventory design
  on 2026-08-21. The branch preserves the complete E6 append-only learning-event and approval-history
  chain in authenticated envelopes, enforces append-only successors and retry safety, and keeps all
  approved-knowledge projection and retrieval disabled. Its frozen corpus contains 20 synthetic
  cases. The steward approved Gate 4B-I on 2026-08-21; its fail-closed Control runner adds five
  synthetic checks for exact owner/host/commit/branch/source-pin authority, two-pass determinism, and
  reconstructed allowlisted output. The one approved Control owner inventory passed on 2026-08-21:
  90 healthy E6 entries contain 63 learning events, 10 lifecycle entries, and 63 approval decisions in
  17 batches; 53 lessons are active and 10 corrected, with zero unreadable, integrity, or lineage
  findings. One readable E3 inbox record remains unresolved; E4 has two authority records but no
  review transactions/capsules; E5 is absent; and the device vault remains owner-bound and unchanged.
  No protected value was retained and no data was copied or migrated. The steward then approved the
  E6-only Gate 4B-R rehearsal. At `4ee5e93`, the complete 90-entry journal was re-encrypted into
  disposable loopback PostgreSQL, read back in exact order, and removed. Source and target logical
  digests matched; transaction rollback, concurrent replay, changed-run refusal, restart retry,
  encrypted typed storage, and private-value scans passed. E3, E4, E5, the device vault, and every
  protected source byte remained unchanged. The temporary schemas, database, key, backup, runtime,
  listener, Control root, and Omen staging root were deleted. Focused Gate 4B tests pass 25/25 and the
  full repository suite passes 118/118. The steward accepted the evidence and approved the protected
  development merge on 2026-08-21. The merge completed as `61d364b`, preserving the reviewed commits
  and source branch. It does not authorize a retained migration, learning activation, Gate 4C, or
  production cutover.
- The steward selected projection-first Gate 4C-1 on 2026-08-21. The isolated branch
  `runa2/gate-4c-approved-knowledge-projection` reconstructs active approved knowledge only from an
  authenticated accepted Gate 4B chain, requires explicit participant/project/capability scope before
  deterministic bounded relevance, uses keyed provenance, and denies stale or lifecycle-due
  projections. Curriculum catalogs remain inactive candidate templates. Its frozen corpus passes
  28/28, the full Node suite passes 146/146, and Gate 0 plus Gate 1-4 disposable regressions are green.
  No protected data was opened; model-context activation, answer-lane wiring, persistent projection,
  Qdrant, embeddings, BGE, and production routing remain disabled. The steward accepted Gate 4C-1A
  and approved its development merge on 2026-08-21. The merge completed as `d203cc7`, preserving the
  reviewed commits and source branch.
- Gate 4C-2's explicitly authorized Control comparison reconstructed the complete E6 active boundary
  independently in legacy RunaAI and the Gate 4C projection. Both produced 53 active lessons with
  exact scope parity: 1 personal, 5 project, 16 capability, and 31 global. No protected content or
  identifier was retained, both Control repositories remained unchanged, the temporary dependency
  copy was removed, and the full Node suite passed 152/152. The steward accepted and merged the
  comparison-only development evidence into `runa2/integration` as `4ed6a52` on 2026-08-21. It did
  not activate answer lanes, persist a projection, or authorize a derived index.
- The accelerated synthetic closeout contract for Gate 4C-3A, Gate 4D, and Gate 4E was frozen from
  accepted integration head `4ed6a52` on `runa2/gate-4-closeout-synthetic`. It preserves the standing
  no-protected-data/no-network/no-persistent-service boundary and stops on any hard safety failure.
- The accelerated synthetic closeout was accepted and merged into `runa2/integration` as `2c38dd5`
  on 2026-08-21. Gate 4C-3A supplies scoped synthetic approved knowledge through
  every read-only lane as non-authoritative advisory context; Gate 4D proves the one-setting
  compatibility boundary and retires/defer-dispositions the legacy provider surface; Gate 4E records
  a current skip for a separate approved-knowledge index, with semantic remeasurement triggers. The
  full 167/167 Node suite, 10/10 seals, 12/12 pinned legacy suites, and disposable Gate 1–4 integration
  regressions are green. No protected data, model endpoint, persistent service, or production route
  was opened or changed. The reviewed source branch remains available.
- Gate 5 planning is isolated on `runa2/gate-5-operations-security` from accepted integration head
  `2c38dd5`. Its frozen synthetic train preserves Runa's household authority policy while replacing
  Windows-bound target authentication/session plumbing with Keycloak OIDC, OpenFGA enforcement,
  one-time capabilities, private Caddy transport, secret references, allowlisted telemetry, and
  authoritative PostgreSQL recovery. Protected E3/E4/device-vault access, production identity,
  non-loopback networking, retained services, and cutover remain separately blocked.
- Gate 5's synthetic implementation and local review are complete. The focused suite passes 40/40,
  the full Node suite passes 207/207, Gate 0 passes 10/10 seals and 12/12 pinned legacy suites, and
  disposable Gate 1-5 integrations are green with clean shutdown. The existing disposable Keycloak
  and OpenFGA bakeoff also passed from an isolated tool copy. No protected store, owner credential,
  production secret, non-loopback listener, retained service, or production route was opened. E3
  remains deferred; E4/device-vault ciphertext will not be copied and requires later witnessed
  re-enrolment; E5 is absent. The steward accepted Gate 5 and its protected merge completed as
  `a986419` on 2026-08-21. The source branch remains available. The merge accepts the application
  contracts and disposable evidence; it is not proof that a production target is deployed.
- Gate 6 planning is isolated on `runa2/gate-6-selected-core-cutover` from accepted integration head
  `a986419`. The steward approved proceeding under the production boundary on 2026-08-21. The frozen
  Gate 6 contract limits promotion to the three read-only lanes, project/chat/setting continuity, the
  complete E6 chain and scoped approved-knowledge projection, one governed setting action, and the
  Gate 5 security boundary. E3 remains deferred; E4 credentials are re-enrolled rather than migrated;
  E5 is absent; device-vault/DPAPI/session/private-key ciphertext is not copied; the separate approved-
  knowledge vector index and broader legacy surfaces remain Gate 7 decisions. Gate 6 begins with an
  executable fail-closed release/cutover rehearsal because the repository currently contains
  selected-core libraries and harnesses, not a production application entry point or steward UI.
- Gate 6A's executable release/readiness/cutover boundary is green locally. Its focused suite passes
  25/25; the full repository run passes 232/232; Gate 0 passes 10/10 seals and all 12 pinned legacy
  suites; and disposable Gate 1-6 integrations are green with every component stopped. The Gate 6
  PostgreSQL rehearsal survives restart and response loss, refuses mismatched live identity without
  advancing state, closes only after the frozen observation window, and proves target-session-aware
  rollback to legacy. Retained evidence is aggregate-only. A read-only Control inventory found the
  live legacy runtime clean and commit-aligned at `b4db040`. At that Gate 6A observation, the clean
  RunaAI-Next verification checkout was still at `4ed6a52` with no Gate 6, dependency tree, release
  entry point, or persistent selected-stack service. That was the hard blocker Gate 6B subsequently
  closed; no production traffic or protected data changed during the Gate 6A inventory.
- Gate 6B's exact release-composition and parallel-candidate criteria are frozen on
  `runa2/gate-6b-release-composition` from accepted integration commit `2b15ef1`. The release must
  wire `runa_core`, `runa_learning`, the selected setting/action receipts, Gate 5 security, and Gate 6
  authority into one fail-closed Node 22.22.0 entry point. It may run on Control only as an isolated
  empty shadow candidate; protected data, owner credentials, selected-write freeze, and traffic
  promotion remain Gate 6C/6D boundaries.
- Gate 6B is green and complete, including the accepted host-restart criterion. The exact running
  release is
  `runaai-next-selected-core-2026-08-21-77f3017` (`77f3017`). Control now runs candidate-owned
  PostgreSQL 18.6, Keycloak 26.7.2, OpenFGA 1.18.3, Node 22.22.0, and Caddy 2.11.4 with only the exact
  private Caddy bind exposed and every other candidate listener on loopback. The live artifact's
  29,380 files verify; all dependency, service-restart, shadow-denial, and encrypted distinct-target
  restore checks are green. The full suite passes 252/252, the focused suite 19/19, and the disposable
  Gate 6B and Gate 6 integrations pass 11/11 and 10/10. Legacy Control remains reachable, clean, and
  commit-aligned at `b4db040` on its original loopback listeners. No protected data, owner credential,
  legacy-write freeze, traffic change, or promotion occurred. Recurring protected-data backup and a
  recurring protected-data backup remains deferred until before Gate 6C import. The owner-approved
  Control reboot passed: all five candidate tasks started at boot, the exact candidate returned after
  its 29,380-file cold scan within the ten-minute allowance, and legacy returned after Matthew's login
  at the exact pre-restart commit. Pre/post schema, counts, and complete logical authority digests match
  for the application, Keycloak, and OpenFGA databases. Gate 6B is closed without importing protected
  data or changing authority.
- Gate 6C preparation was merged to accepted integration as `ff15c61`. Its frozen train binds the
  exact four selected domains, new target owner
  ceremony, recurring encrypted backup, bounded selected-write freeze, aggregate owner preflight,
  memory-only retained delta, exact reconciliation, abort cleanup, and promotion-ready handoff. The
  setting value and selected action-receipt count remain unknown until an authorized aggregate-only
  preflight. Non-protected implementation may proceed, but owner enrollment, protected-store access,
  legacy write freeze, retained import, and traffic promotion remain blocked until the coordinated
  maintenance window.
- Gate 6C's first non-protected preparation tranche is green. Its focused suite passes 27/27, the
  full Node suite 280/280, Gate 0 and all disposable Gate 1-6C integrations are green, and every
  disposable service stopped. The tranche implements exact authority contracts, the owner-ceremony
  state machine, encrypted backup/scheduled restore tooling, a fail-closed selected setting/action
  inventory, four-domain PostgreSQL staging, exact reconciliation, restart/replay, and target-only
  rollback. The exact merged release `runaai-next-gate6c-shadow-2026-08-22-ff15c61` now runs on
  Control at commit `ff15c618`, verified artifact `fff3c379`, and verified configuration `f8db543c`.
  Its browser entry point is green and stopped at `verify-recovery-authority`; selected data and target
  users remain empty. It opened no protected store and changed no legacy service, ACL, credential,
  retained protected row, traffic, or authority. Legacy has no reliable selective maintenance switch;
  the prepared safe default is a reversible whole-state write deny that preserves reads and requires a
  named maintenance-window decision before activation. The current hard boundary is the witnessed
  recovery-authority and owner passkey ceremony; synthetic evidence or an admin token cannot
  substitute for witnessed owner sign-in, step-up, revocation, and recovery.
- Gate 6C target-owner and backup readiness is now complete on Control. The exact running release is
  `runaai-next-gate6c-readiness-2026-08-22-669139e` at commit `669139e`, artifact `d8a39de1`, and
  configuration `c0980e45`. The witnessed ceremony is complete at revision 7 with two distinct
  passwordless credentials. The SYSTEM-owned recurring backup passed under that release, and
  generation `20260822T0843051927477Z` restored all three databases into distinct disposable targets
  that were then destroyed. The read-only freeze preflight passed, but no freeze is active. The live
  readiness result is deliberately `ownerCredentialEnrolled=true` and `authority=shadow`; cutover is
  still `planned` revision zero, protected data is not imported, production traffic is unchanged, and
  legacy remains clean at `b4db040`. Owner completion is not candidate promotion.
- The steward explicitly authorized the protected Gate 6C/6D maintenance window on 2026-08-22. The
  bounded operator is implemented with exact-pinned promotion-candidate deployment, read-only
  preflight, whole-state freeze, two-pass four-domain capture, retained-row and approved-knowledge
  reconciliation, promotion/rollback, fresh passkey live validation, 120-sample one-hour observation,
  and verified freeze release. Synthetic and disposable verification is green at 293/293 overall,
  24/24 Gate 6B, and 36/36 Gate 6C; this entry does not claim the live window has run.
- The first exact promotion-candidate deployment failed closed on SQLSTATE `42P01` because readiness
  queried the Gate 6C run table before the protected-import schema existed. Automatic rollback restored
  the exact prior shadow release and backup action; live confirmation retained planned revision zero,
  legacy authority, no protected import, no traffic change, and no freeze marker. The bootstrap state
  now means “not imported,” while all other database errors still fail readiness closed.
- The first authorized protected attempt failed before any cutover transition. Target rollback kept
  legacy authority; ACL restoration succeeded, but marker finalization initially failed because two
  audit properties were absent. Bounded recovery finalized the marker as `released` and confirmed zero
  deny rules, no import, no traffic change, and planned revision zero. The corrected design archives a
  released lease before a distinct retry, inserts audit fields explicitly, runs operator prerequisites
  before freeze activation, and emits a safe step-specific failure code.
- Gate 6D is complete and closed. Exact release
  `runaai-next-gate6d-promotion-2026-08-22-a886754` at `a886754` is authoritative for the selected
  core on Control. The four approved domains reconciled exactly with 102 project/chat records, 90 E6
  entries, one selected setting, zero selected action receipts, and 53 active approved-knowledge
  lessons. A fresh owner passkey session, all three representative read-only lanes, the governed
  setting change and rollback, target-session revocation, 120/120 samples over 60 minutes, 14 freeze
  checks, and final reconciliation passed. Cutover closed, the freeze was released with reason
  `gate6-closed`, and legacy remains healthy and tracked-clean at `b4db040` as the rollback system.
  Matthew's exact Caddy root is trusted only in `CurrentUser\Root`; Windows-native chain validation
  reaches the private HTTPS entry point with status 200 and no certificate bypass. Full verification
  passes 298/298 and the combined Gate 6B/6C focused suites pass 65/65. Details are in
  `gate6c/GATE6D-CUTOVER-RESULTS-2026-08-22.md`.

## Bootstrap findings

- The inherited Node suite passes **14/14** in the repository-owner context. The sandbox-only first run
  could not create `probes/results/_payloads` in the newly added checkout and reset its localhost stub;
  the exact owner-context rerun passed.
- All **10/10** current seal verifiers pass in this fresh Windows clone.
- Clean-clone validation found four seal verifiers hashing raw checkout bytes while the repository's
  existing `seal-file.mjs` helper canonicalized Git's LF/CRLF transport difference. The four verifiers
  now use that helper. No sealed preregistration, runner, result, seal hash, or adjudication changed.
- `npm ci --cache .npm-cache` installed the committed lockfile: 336 packages, one low-severity audit
  advisory, and an engine warning because installed `posthog-node@5.49.1` requests Node `^20.20.0` or
  `>=22.22.0` while Omen currently provides Node `22.21.0`. Do not run `npm audit fix` or change the
  runtime implicitly. Gate 0 must select a supported Node patch and explicitly disposition the advisory.

## Selected foundation

- Mastra plus AI SDK/OpenAI-compatible application/provider boundary;
- LangGraph JS with PostgreSQL checkpointing;
- PostgreSQL as authoritative records, idempotency, outbox, and postcondition store;
- Nomic embeddings, Qdrant derived vectors, and existing BGE with explicit overlapping windows;
- Caddy as outer transport and timeout boundary;
- OpenTelemetry with allowlisted/redacted attributes;
- deterministic application routing across the selected model roster; and
- one-time scoped capabilities for governed effects; and
- Keycloak and OpenFGA only after functional/data parity.

This list selects infrastructure. It does not replace Runa's identity, constitution, authority,
consent-first learning, typed knowledge, project/participant scope, provenance, honest uncertainty,
plain-language steward experience, or governed action pathway.

## Gate tracker

| Gate | Scope | Status | Approval required to start |
|---|---|---|---|
| Bootstrap | Establish repository lineage, remotes, branches, instructions, and status | Complete | Reviewed and merged as `94ba860` |
| 0 | Freeze contracts, parity corpus, data inventory, redaction policy, and green thresholds | Complete | Approved by steward 2026-08-20; PR #2 accepted for integration |
| 1 | Smallest disposable read-only chat/research slice | Complete; accepted and merged as `7107ead` | Complete |
| 2 | All three read-only answer lanes plus chat/project/settings continuity | Complete; evidence accepted and merged as `4c4767f` | Complete |
| 3 | One reversible governed idempotent action | Complete; accepted and merged as `0680cfb` | Complete |
| 4 | Governed data migration, one domain at a time | Complete; accepted and merged as `2c38dd5`; legacy unchanged | Complete |
| 5 | Operations, private transport, authentication/authorization, recovery | Complete; accepted and merged as `a986419` | Complete |
| 6 | Selected-core production cutover and rollback window | Complete and closed; exact selected-core release is authoritative, observation green, freeze released, legacy rollback healthy | Complete |
| 7A | Multi-device access foundation | Canonical LAN origin, owner passkey path, SMTP/invitation, separate ordinary password client, and Omen customer acceptance active | Representative clients, certificate renewal, and off-LAN boundary remain |
| 7B | Complete customer journey through the selected read-only stack | Complete; production sign-in, sustained chat, safe presentation, exact-release recheck, and rollback evidence green | Approved by steward 2026-08-24; completed 2026-08-24 |
| 7C | First user-interface shell | Scope and green criteria frozen; implementation isolated on `codex/gate7c-ui-shell` | Steward review required before merge or deployment |
| 7D+ | Deferred product extensions | Not started; capability inventory and prioritization follow the shell review | New baseline and separate decision per extension group |

## Bootstrap validation

Before closing bootstrap:

1. Confirm `main`, `runa2/integration`, and the baseline tag resolve to `ec5e346` before documentation.
2. Confirm `runalab/main` resolves to `ec5e346` and `runaai-legacy/main` resolves to `71ce985`.
3. Confirm source remotes have disabled push URLs.
4. Run the inherited 14 Node tests and all 10 current seal verifiers. **Complete: 14/14 and 10/10.**
5. Run `git diff --check` for the bootstrap documentation. **Complete before staging.**
6. Stage explicit paths, commit on `runa2/bootstrap`, and push only to RunaAI-Next origin.
7. Review the bootstrap branch before merging it into `runa2/integration`.

## Gate 0 evidence

`gate0/` freezes the proposed Gate 1 request/response contract, 18-case synthetic parity corpus,
seven exact deterministic sample outputs, legacy source/test hashes, 12-suite focused profile,
data-inventory command contract, trace allowlist, 24-hour synthetic retention, and hard green
thresholds. The Gate 0 verifier passes 14/14 inherited Node tests, 10/10 seal verifiers, and 12/12
focused legacy suites in the repository-owner context.

The full legacy portable verifier ran 128 applicable checks: 127 passed and one action-executor test
failed because the sandbox identity cannot read `C:\Users\matth\.config\git\ignore`; Git's warning
text entered an assertion that expected an empty change list. Owner DPAPI and configured-provider checks
were correctly skipped, and live approved-library provenance was explicitly not checked because no
application service was started. This is recorded as an environment limitation, not as guarded-lane
or Gate 1 parity evidence.

The Gate 1 prerequisite batch installed exact Node 22.22.0 and reran the full Gate 0 verifier green.
Node 22.23.2 was tested and rejected because its sealed stub average repeatedly measured 12.54–14.70
ms; installed Node 22.22.0 measured 0.66–0.78 ms. The repository now pins the accepted patch.

The npm result is two low dependency entries for one underlying uncontrolled-resource-consumption
advisory, `GHSA-866g-f22w-33x8` / `CVE-2026-8769`, through
`@mastra/core@1.59.0 -> @ai-sdk/provider-utils-v5@3.0.30`. GitHub lists no first patched version and
the newest published 3.x observed during disposition was 3.0.32, within the advertised affected range.
The risk is temporarily accepted only for Gate 1's disposable synthetic boundary with hard time,
byte, abort, and retry controls. It continues to block production and widened network/provider scope.
No dependency was changed during the prerequisite disposition. Full evidence is in
`gate0/GATE1-PREREQUISITES-2026-08-20.md`.

## Next operation

Open `https://runa.bridgebuildersai.com`, sign in through the ordinary username/password path, and review
Gate 7C's active workspace shell. Evaluate only the three-column proportions, warm visual direction,
independent collapse behavior, central chat/composer usability, and narrow-screen panel treatment. If the
visual foundation is accepted, merge `codex/gate7c-ui-shell` into `runa2/integration`; otherwise adjust or
roll back the presentation release. Do not name or wire a product capability into either rail yet.

Gate 6 remains closed and selected-core production authority remains active at the exact release named
above. Gate 7A follow-on checks for a second PC, phone, certificate renewal, and separately reviewed
off-LAN ingress remain independent of the Gate 7C presentation branch. E3, E4/device-vault recovery,
the separate approved-knowledge vector index, Qwen3.6 deliberate review, the existing live BGE
endpoint, and broader legacy capabilities also remain separately deferred.
