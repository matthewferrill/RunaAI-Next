# RunaAI product roadmap

Roadmap revision: 2026-08-28.1
Authority: steward direction in this task, reaffirmed 2026-08-28.
Status: accepted destination; Milestone 1 authorized for implementation, not completed.

## Read this before selecting the next slice

Run `node roadmap/read-next-slice.mjs`, then read the required references it names. This roadmap,
`roadmap/capabilities.json`, `roadmap/CURRENT-SLICE.md`, and `MIGRATION-STATUS.md` are the planning entry
point. Record the printed roadmap digest, milestone and capability IDs in each new slice contract.
Do not choose the next slice from an old gate's final paragraph alone. `AGENTS.md` makes this mandatory.
The retrieval check verifies references and coverage; it cannot prove that a human or agent understood
the documents. Review still has to check the proposed work against them.

## Destination, not a reduced substitute

Runa should support the practical work associated with a capable coding agent and general assistant:
understand an outcome, obtain authorized context, plan, use tools, inspect the actual result, correct
mistakes, and deliver useful work. She retains Runa's identity, scoped knowledge, consent-first learning,
honest uncertainty, household privacy and governed actions across model changes.

The five functions previously proposed (chat/continuity, approved-source research, bounded Code work,
conversational actions, deeper review) are **Milestone 1 only**. Completing them does not complete this
roadmap, retire other capabilities, prove full legacy parity, or establish Codex/Claude quality parity.
The steward explicitly accepted that distinction and authorized documentation/publication followed by
Milestone 1 implementation without repeated permission requests; human assistance is for actual user
testing or operations that genuinely require human presence.

Functional coverage, model task quality, product usability and operational reliability are separate
acceptance dimensions. Similar tools do not guarantee frontier-model reasoning quality. Claims must
identify the tested task, release, model/runtime and capability envelope, not say "full parity" from
a small benchmark. The target is a finite set of supported customer workflows, not every plugin or
feature ever shipped by another product.

## Fixed foundation and model scope

Keep the selected stack: Mastra/AI SDK; LangGraph JS/PostgreSQL durable orchestration; PostgreSQL record,
idempotency and outbox authority; Qdrant/Nomic/windowed BGE retrieval; Caddy/application deadlines;
OpenTelemetry; Keycloak/OpenFGA and application-owned capability policy. Do not reopen component
selection without a reproduced requirement failure. New capabilities may need standard executors,
libraries or integrations; that is not permission to replace this foundation or create another durable
source of truth.

Three primary model candidates are in the functional evaluation: **Gemma 4 26B A4B**, **Qwen3 Coder
30B-A3B**, and **Qwen3.6 27B MTP**. Qwen3.6's retained Gate 1 3/3 timeout finding needs diagnosis; it is
neither a fresh failure nor a reason to silently omit that candidate. The previous matched comparison
covered only Gemma and Qwen3 Coder, and neither passed a complete frozen role. Preserve that evidence.
The 4B fallback, embeddings and reranker are not new large-model competitors. Voice/vision/media may
need separate specialist artifacts later; text-model testing cannot establish those capabilities.

The retained R9 and later R10 function-first comparisons cover all three candidates
across all five M1 roles. Under R10's whole-application grading, Gemma and Coder
qualify only for Chat and Code; no candidate qualifies for Research, Agent or
Review, and no candidate qualifies as a whole. This does not authorize semantic-
only scoring, model self-selection, fallback pooling, production promotion or
removal of any function. R11 prospectively corrects the bounded application
mechanics exposed by R10, then repeats the full 360+12 denominator. Exact evidence
and criteria are in
`gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md` and
`gate7f/function-first/M1-S2-R11-CORRECTIVE-CRITERIA-2026-08-30.md`.

## Complete capability register

`roadmap/capabilities.json` is the machine-checked register. IDs are permanent. The starting states below
are based on repository evidence, not a fresh claim about live services. Every family remains on the
register until explicitly implemented and accepted or changed by a recorded steward decision.

| ID | Capability family | Required customer outcome | Starting boundary | Delivery |
|---|---|---|---|---|
| C01 | Conversation and writing | Chat, draft, rewrite, explain, plan, correct, find and continue earlier work | Basic chat/continuity has release evidence; comprehensive quality/search is incomplete | M1 core; M2 expansion |
| C02 | Context, memory and learning | Project instructions, retained context, inspect/correct/revoke approved knowledge without automatic learning | Selected continuity/approved projection exists; full knowledge UX and long-task context remain | M1 read-only context; M3 broader UX |
| C03 | Files and visual inputs | Attach, inspect and reference supported documents, spreadsheets, PDFs, images and screenshots | Explicit-source/text paths are partial; general ingestion/vision is not established | M1 explicit text; M2 files; M5 vision |
| C04 | Live and source-grounded research | Retrieve authorized material, search current sources, reconcile conflicts and cite evidence | Supplied-source evidence exists; live research is not delivered | M1 supplied sources; M2 live research |
| C05 | Documents, data and artifacts | Execute calculations/analysis and deliver usable reports, workbooks, slides, charts and files | Not established by chat or code-drafting tests | M2 |
| C06 | Real software development | Understand a repository, implement multi-file changes, debug/refactor and prove correctness in supported languages | Drafting and single JavaScript runs exist; real-project agent work remains | M1 disposable JS; M2 retained/multi-language |
| C07 | Execution and environments | Controlled commands/tests/builds, approved dependencies/processes and exact runtime results | Gate 7E harmless JS envelope only | M1 selected JS tests; M2 environments |
| C08 | Git and delivery | Worktrees, branches, diffs, commits, PRs/review/CI and governed deployment | Product Git/delivery capability not established | M2 local Git; M3 publication/delivery |
| C09 | Browser and application interaction | Navigate/interact, visually inspect and test a running application; later desktop interaction | Runa product browser/computer control not established | M2 browser; M5 desktop |
| C10 | Connected tools and services | Governed selected email/calendar/file/database/project-management tools through a common interface | General product connectors not established | M3 |
| C11 | Skills and reusable workflows | Discover and apply versioned project guidance and reusable specialist procedures | General user-facing skill lifecycle not established | M3 |
| C12 | Autonomous task completion | Plan/act/observe/correct; profiles, interruption, cancel/resume, exact receipts and undo | In-memory agent foundation exists; real durable task pipeline remains | M1 bounded workflow; M3 expansion |
| C13 | Parallel agents and independent review | Delegate isolated work, join results safely and review independently within compute budgets | Development-agent use is not a Runa product capability | M4 |
| C14 | Background and scheduled work | Durable jobs, schedules/events, monitoring, notifications and cancellation | Product scheduler/monitoring not established | M4 |
| C15 | Complete working interface | Code/diff/file/artifact previews, progress, approvals, recoverable failures and usable navigation | Chat/Code shell/navigation exist; full work surfaces remain | M1 task results; M2/M3 expansion |
| C16 | Multi-user and remote access | Isolated accounts/projects, cross-PC use, phone and secured off-LAN access | Selected LAN authentication exists; broader access is not complete | M1 regression; M5 access expansion |
| C17 | Voice and other media | Governed voice/vision workflows and explicitly selected media generation | Not proved by the text-only candidate artifact or existing model run | M5 |

## Milestones and dependency order

Milestones are delivery boundaries, not repeated owner-permission ceremonies. Parallel work is allowed
at stable interfaces in separate worktrees. One operator owns Home model residency. Dependencies may
advance alongside earlier milestones, but acceptance cannot be inherited from them.
Dependency IDs refer to the exact needed behavior and its evidence, not completion of an entire
capability family. For example, M1 may use accepted bounded C07 execution while broader environments
remain unfinished. Record the required subset so partial families do not create an artificial deadlock.

1. **M1 — First useful agent milestone.** Five functions in `roadmap/CURRENT-SLICE.md`: shared
   model-neutral implementation, actual disposable JS project work, deterministic controls, three-model
   functional evidence, application journey and a bounded customer trial. No claim of full roadmap close.
2. **M2 — Practical research, files and software work.** Broader file ingestion/artifact creation, live
   research, retained project workflows, declared language/runtime support, controlled environments,
   local Git, browser testing and the required work surfaces. Entry: M1's shared boundaries or equivalent
   tested prerequisites. Exit: real research/report and build/debug/browser-test journeys, with inspectable
   outputs and reversible project changes. Every new parser/executor gets its own limits and failure tests.
3. **M3 — Connected and personalized work.** Selected connectors, skills, richer approved-memory UX,
   governed external publication/CI/deployment and extended approval profiles. Entry: exact per-tool
   identity/data/egress/secret contracts. Exit: real authorized outcomes, least-privilege denial controls,
   revocation and recovery; read access never silently becomes send/publish authority.
4. **M4 — Delegated and persistent work.** Parallel workers, independent review, schedules, event-driven
   jobs and notifications. Entry: durable task/effect state, isolation and capacity policy. Exit: stop,
   restart, duplicate delivery, worker loss, conflict handling and notification tests on real workloads.
   PostgreSQL/LangGraph remain authoritative; adding a second scheduler/workflow service needs evidence.
5. **M5 — Access and modality expansion.** Phone/off-LAN access, voice/vision and selected desktop/media
   workflows. Entry: feature-specific transport/privacy/model/runtime requirements. Exit: supported-device
   customer tests, recovery, isolation and truthful modality claims. Do not require all of M4 before an
   independently safe phone UI improvement; record the actual prerequisite edges.

No milestone label authorizes all historical RunaAI modules, public self-signup, automatic learning,
unrestricted machine/account access, purchases, or unreviewed protected-data migration. The roadmap
keeps these distinctions visible rather than treating a hold as removal from the product destination.

## Acceptance and failure policy across every capability

- Test three layers separately: deterministic function behavior, model use of that function, and the
  actual user/application workflow. A model mock cannot pass live-model qualification. A CLI helper cannot
  pass the browser journey. An in-memory store cannot pass durable recovery. Presence is not completion.
- Use exact source/model/runtime pins and synthetic/non-private acceptance inputs. Retain all attempts,
  protocol failures, retries and repairs; log no production conversation, credential or protected content.
- Require zero unauthorized effects, cross-user/project leaks and fabricated verified execution claims.
  Policy rejection is containment, not model success. Preserve stale-state, revoked-grant and fake-receipt
  cases as regressions and include fresh scenarios for acceptance.
- Capture actual before/after files, supported citations, process exit/output and trusted receipts as
  appropriate. Independent checks must be able to falsify a success claim.
- Freeze role-specific success/latency/context/resource budgets before scored runs. Retain >=90%
  acceptable model task attempts and zero critical failures; exact scope/argument contracts and mandatory
  deterministic acceptance scenarios require 100%. Publish denominators, unique scenarios and repeats.
  Do not relax gates after seeing results or call a stronger failed candidate qualified.
- Test cancellation, timeout, duplicate delivery, process/restart loss, concurrent modification,
  dependency loss, unavailable model and rollback where applicable. Unknown outcomes stay unknown until
  reconciled; never retry an unverified effect blindly.
- Approval profiles grant exact bounded capabilities, not authority derived from a prompt, file, model
  response or remembered broad instruction. Re-check effective authority at execution, including revoke.
  Pin the approved capability-set version: adding an executor, connector or future capability must never
  expand an existing autopilot/always-allow grant. A model switch cannot change authority, consent or history.
- Fail closed on isolation loss, unexpected model identity, secret exposure, integrity mismatch or
  unowned resident models. Preserve running production and stop only the owned experiment.
- Define each capability's actor/scope, inputs/effects, denial/revocation, independent postconditions,
  retry/reconciliation, retention/export and deletion policy before activation. Bound archives/parsers,
  macros, external document references, browser redirects and connector egress. Worker/scheduled tasks
  inherit no more authority than their parent grant and re-check it at every effect.
- Include backup/restore, schema compatibility, dependency/model supply-chain pins, per-user quotas,
  fair scheduling, accessibility, context limits, redacted telemetry and degraded-mode UX in each
  applicable customer journey. Do not equate a daemon's health response with operational acceptance.
- Before retained rollout, prove the candidate's customer path and recovery; retain the predecessor.
  Rollback must preserve user work created after promotion, not restore an old database indiscriminately.

## Slice-selection and change control

Each next slice must name: roadmap revision/digest; milestone and capability IDs; baseline/evidence;
dependencies; exact included and excluded behaviors; model-independent interface; acceptance cases;
environment/data boundary; human-test need; rollback/recovery; and the remaining roadmap after completion.
Use `roadmap/SLICE-TEMPLATE.md`. Run the retrieval command before deciding, not after writing the plan.

Capability states are `partial`, `not-verified`, `implemented`, or `accepted`. Advancing a state requires
repository evidence; `accepted` additionally requires an exact release/customer evidence record. Never
delete a capability or mark it accepted solely because its first milestone passes. Reductions, retirement
or replacements need an explicit decision record; earlier states/evidence remain in Git history.

The current steward authorization covers design, implementation, testing, necessary non-destructive
environment work, documentation, commit and publication to `matthewferrill/RunaAI-Next`, and completion
of M1 without recurring permission questions. It does not override product/runtime security controls.
Ask for human help only when actual user judgment, authentication/physical presence or a truly external
blocker is needed. Never request secrets in chat. Avoid destructive operations on legacy or product data.

## Sources and current evidence

- `LAB-COMPLETION-REPORT-2026-08-20.md`, `STACK-BAKEOFF.md`, `MODEL-ROLE-MATRIX-FINDINGS.md`:
  inherited component decisions, not a complete product release.
- `MIGRATION-STATUS.md`, `gate7f/README.md`, `gate6b/composition.mjs`, `gate7e/contracts.mjs`:
  current source/release boundaries; verify live state before changing hosts.
- `gate7f/GATE7F-QUALIFICATION-RESULTS-2026-08-27.md`: preserved two-model results and limitations.
- Official capability references reviewed 2026-08-28: [Claude Code](https://code.claude.com/docs/en/how-claude-code-works),
  [extensibility](https://code.claude.com/docs/en/features-overview),
  [file creation](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude),
  [OpenAI desktop](https://learn.chatgpt.com/docs/app), [browser](https://learn.chatgpt.com/docs/browser),
  [scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app).
  These inform capability families; they are not a promise of identical commercial-product performance.
