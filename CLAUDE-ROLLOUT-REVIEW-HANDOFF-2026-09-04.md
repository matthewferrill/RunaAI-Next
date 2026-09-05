# Runa 2.0 / RunaAI-Next: rollout history and independent review handoff

Prepared 2026-09-04 for Claude at the user's request. This is a review packet, not a claim that Claude
has reviewed or approved anything. Start read-only. Do not restart testing, change deployment, activate
models, inspect private data or discard work merely because a historical document instructs a next step.

## What the user wants checked

Review the entire rollout and remaining plan, not only the next small defect. Determine whether the work
is necessary, appropriately simple, designed for the real hardware/software and demonstrably moving toward
a usable RunaAI. Challenge unsupported assumptions and unnecessary custom infrastructure. Verify evidence
instead of accepting this agent's explanation as proof. The user reports severe time/credit waste and
wants established researched corrections, full causal analysis and no repeated broken-test loops.

The three current deliverables to review together are:

1. [Fix register](FIX-REGISTER.md): lookup-first process, six scoped retained corrections, official API sources,
   applicability/rollback limits and an explicitly custom SDK patch whose upstream-alternative search is unproven.
2. [Completion plan](roadmap/COMPLETION-PLAN-2026-09-04.md): ten steps through first human trial/release,
   actual topology, dependencies, parallel ownership, triage/RCA, acceptance and the M2-M5 destination.
3. This history and its evidence index. [MIGRATION-STATUS.md](MIGRATION-STATUS.md) retains the long rollout
   narrative; [CURRENT-SLICE.md](roadmap/CURRENT-SLICE.md) retains detailed attempts and superseding directions.

This is a phase-by-phase account with links to the full repository record, not a transcript of every message
or an independently reconstructed billing/incident ledger. Some raw attempt evidence lives outside Git at
locations identified in the result documents. Missing access/evidence must be reported, not inferred as a pass.

## Repository and preservation boundary

- Product name: RunaAI. Runa 2.0 is the migration/product direction; RunaAI-Next is the repository label.
- Review checkout: `D:\Projects\Runalab\runaai-next-native-control-host`.
- Branch at preparation: `codex/m1-native-control-host`; baseline HEAD `f1ee25b033414cf5e2b797daaea6dcddd2e92bdd`.
- Product remote: `https://github.com/matthewferrill/RunaAI-Next.git`.
- `D:\AI\Projects\RunaAI` is the preserved legacy reference; `D:\Projects\Runalab` is the lab,
  not interchangeable with this product checkout. Do not merge unrelated legacy history.
- Read `AGENTS.md`; inspect live Git state and current top-of-file directions before work. This packet's
  baseline will precede its own publication commit. Uncommitted work is not discarded or assumed verified.
- Historical protected data, credentials, DPAPI material and private conversation content are outside this
  review. Aggregate published evidence is sufficient for orientation; report if stronger proof is needed.

Preserved parallel worktree checkpoints (recheck before access or action):

| Checkout under `D:\Projects\Runalab` | Baseline | Disposition at preparation |
|---|---|---|
| `runaai-next-resource-corrective-v2` | `f1ee25b` | Published actual Control eligibility result |
| `runaai-next-deployment-supervisor-v2` | `8783643` | Retained actual supervisor prerequisite |
| `runaai-next-shell-boundary-builder` | `c622e3e` | Paused, uncommitted broad correction; 43 tracked modified files plus new files, no completed verification of the pending union |
| `runaai-next-native-worker-builder` | `4c85c01` | Paused, untracked runtime-key/probe draft; not actual key/service proof |
| `runaai-next-native-host-builder` | `40e1bde` | Separate Native construction checkpoint; do not infer it is integrated/released |
| `runaai-next-m1-gemma-primary` | `b99f8bf` | Earlier primary integration checkpoint |
| `runaai-next-agent-postgres` / `runaai-next-artifact-dom` | `58ca066` / `bf56905` | Retained Agent/Artifact evidence; no blanket current-browser acceptance |

Do not run Claude and Codex as writers in one checkout. The expanding shell/key lanes were paused for
scope/environment review; this handoff does not resume them. An independent review may inspect them read-only.

## Rollout chronology

Dates below are retained record dates, not a fresh service-health assertion. The original numbered Gates 1-6
and the later Native Gate 1-3 are different sequences; do not combine their completion counts.

### 1. Lab and selective-migration baseline: August 18-20

The original direction was to assemble established components, prove the stack, then migrate Runa-specific
behavior selectively. It was not a blanket rewrite of every legacy feature or a promise of commercial-AI
parity. Runa identity, consent-first learning, scoped knowledge, authority and honest evidence were retained.

The selected foundation includes Mastra/AI SDK, LangGraph JS, PostgreSQL authority, Qdrant/Nomic/windowed BGE,
Caddy, OpenTelemetry and the selected identity/policy components. The lab baseline is `ec5e346`; the product
repo starts from that history, with legacy used as a behavior/data reference rather than merged wholesale.
Bootstrap merged as `94ba860`; Gate 0 froze contracts and evidence. Sources: `STACK-BAKEOFF.md`,
`LAB-COMPLETION-REPORT-2026-08-20.md`, `RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md`, and migration status.

### 2. Selected-core implementation and migration: August 20-21

- Gate 1: small read-only answer path; actual selected-stack integration and live Qwen evidence within
  bounded inputs. Later deadline/idempotency/reranker corrections preceded acceptance (`7107ead`).
- Gate 2: scoped read-only lanes and project/chat/settings continuity; Qdrant timeout classification
  corrected. Accepted development merge `4c4767f`.
- Gate 3: one governed setting action with durable receipts, idempotency, restart and rollback;
  accepted development merge `0680cfb`, not unrestricted tools.
- Gate 4A: authorized aggregate inventory and protected rehearsal of project/chat data; preserved
  legacy bytes, exact reconciliation and disposable cleanup; accepted merge `90572a0`.
- Gate 4B: E6 learning/approval-history inventory and isolated migration rehearsal; accepted merge
  `61d364b`. This did not activate automatic learning or move device-bound credentials.
- Gate 4C: approved-knowledge projection and aggregate parity, then scoped advisory wiring and explicit
  settings/index disposition. Milestones include `d203cc7`, `4ed6a52`, `2c38dd5`.
- Gate 5: selected authentication, authorization, transport, recovery and operational contracts;
  accepted merge `a986419`. Disposable evidence was not yet a production deployment.

The early work contains synthetic/mock fixtures as well as real-stack and protected aggregate evidence.
Preserve and label these accurately; the user's later prohibition on mock acceptance does not rewrite history.
They have explicitly said not to conduct new RCA on retired mock failures.

### 3. First selected-core deployment and cutover: August 21-22

Gate 6A proved the bounded release/cutover state machine. Gate 6B assembled an actual Control shadow
application with PostgreSQL 18.6, Keycloak 26.7.2, OpenFGA 1.18.3, Node 22.22.0 and Caddy 2.11.4.
Recorded restart and distinct-target restore passed; shadow readiness was not production authority.

Gate 6C staged owner enrollment/recovery, encrypted backup and the authorized maintenance/import boundary.
Actual deployment/maintenance failures included readiness querying an absent import table and incomplete
freeze-marker finalization; rollback/recovery evidence is retained. Gate 6D cut over only the selected core
at `a886754`, reconciled the approved domains, passed the one-hour observation and released the write freeze.
Legacy remained the fallback. See [cutover results](gate6c/GATE6D-CUTOVER-RESULTS-2026-08-22.md).
Deferred protected domains and credential re-enrollment were not silently counted as migrated.

### 4. Access, usable chat and first UI: August 22-25

Gate 7A established canonical LAN access and separate ordinary-user/owner authentication. Recorded actual
operator defects included PowerShell empty-array coercion, 302-versus-303 expectations, predecessor-bound
owner proof, release-specific configuration parsing and missing `System.Security` assembly loading.
The eventual accepted access did not establish phone/off-LAN/certificate-renewal completion.

Gate 7B proved ordinary login-to-logout chat and safe failure presentation; actual UI found incorrect `.mjs`
content type and internal audit labels in answers. Gate 7C supplied the initial three-column shell.
Gate 7D added participant-scoped Chat/Code projects/history and corrected routing, failed-turn retention,
session refresh and a verifier that treated stale conversation arithmetic as current authority.
Source/runtime/browser evidence accepted Gate 7D (`3d95e50` integration); a launcher mismatch had earlier
triggered rollback. These were mixed application/model-integration/operator issues, not one model score.

### 5. Harmless code execution and Agent foundation: August 25-27

Gate 7E added actual bounded JavaScript execution with explicit draft/run/result distinctions. It did not
enable arbitrary repositories, terminals, packages or network. The accepted Control release is recorded as
`runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc`; no new live-health verification is claimed by this packet.

Gate 7F-0 added an inert governed Agent foundation. Gate 7F-1 then preregistered Home-only Gemma/Coder
comparisons. Initial capture stopped at token limits and exposed grader/contract limitations; v2 supplied
the full schema and completed the denominator, but did not qualify a whole model role.
The later two-model qualification retained 256 requests per model plus independent grading and lifecycle
evidence. Neither candidate met every complete-role criterion at that time.

### 6. Function-first roadmap and repeated campaigns: August 28-31

The user required the full 17-family destination to remain visible while M1 delivered five useful functions.
Model roles became independently routed by the application, with Gemma, Qwen3 Coder and Qwen3.6 assessed
under frozen contracts. Shared implementation included durable tasks, approvals, context, research, review,
project adapters and Home/Control lifecycle controls. Early R1-R6 variants, R6J, R9 and R10 are preserved in
the result/index records below; their names can be reused at different nested levels, so use exact run IDs.

Repeated problems included harness readiness, model residency, timing, source/runtime sealing, provider
response limits, missing/ambiguous contracts, browser checkpoints and operator publication. Genuine model
quality problems also existed. A failure snapshot is not synonymous with a model error or an independent round.

R6J completed a three-model evaluation; only Gemma Chat and Code reached its role threshold. R9/R10 did
not qualify all five functions. R11 corrected application mechanics but its diagnostic capture was made
ineligible by operator timing. R12 included the Qwen remaining-13 continuation: failed r33/r34 attempts
were retained, r37 completed the missing identities, and a documented equivalence decision permitted the
107+13 composition instead of replaying the valid prefix. Review remained incomplete after R12.

### 7. R13/R14, R15 method failures and halt: August 31-September 2

R13 completed all 360 model attempts, 12 controls and independent review. It supplies the retained Gemma
Chat/Research/Code/Agent qualifications. R14 addressed Review and completed its denominator, but no Review
route reached its frozen threshold. R14 results remain historical and immutable, not a reason to discard R13.

The proposed R15 correction then encountered repeated zero-model method stops: LF/CRLF pins, archive counts,
validator-owned transient paths, overlapping timeout windows, watchers misclassifying temporary security
changes, JSON date coercion, property order, relay exhaustion, stale browser handoffs and unavailable clipboard
commands. Extensive local tests did not prove the actual operator/browser workflow. The method was halted;
the rejected draft was preserved at `ae69d6e` then removed from the active tip by revert `7445d00`.

[The halt/cost RCA](gate7f/function-first/M1-S2-R15-CAMPAIGN-HALT-AND-COST-RCA-2026-09-02.md)
records a historical minimum of **30 fault-invalid snapshots / 1,579 recorded attempts**, including
**1,369 discarded or qualification-ineligible attempts**, 139 salvaged and 71 then paused. It separately
records at least 1,768 proven provider calls plus 138 early outputs without exact call totals, five additional
zero-model publication preflights, and later zero-model stops. These are **different units**, not additive
all-time failure totals. Do not present 30 as today's complete incident count or charge those dispositions
to model quality. The user-reported weeks of credits/days lost are recorded impact, not audited billing.

### 8. Focused actual Gemma Review and primary selection: September 2

The user rejected more mock-driven campaign loops and approved eight actual Review cases over
Omen -> Control -> Home. Gemma's answers were semantically correct 8/8. The application contract still
had ambiguity around `correct` and citation ordering; the final unconditional `accept`/`revise` contract
retains original accepted content/citations under application control. Final actual checker evidence passed
8/8 without the nullable-field problem. Exact model cleanup and GPU restoration were recorded.

The five-function decision combines that bounded Review evidence with R13: Chat 24/24, Research 23/24,
Code 24/24, Agent 24/24. **Gemma selection is complete for those contracts.** It is not a whole-product
qualification, and no new model comparison campaign is presently required. Challenger Research/Code/Review
models were deliberately tabled until the primary product works.

### 9. Product/UX rebaseline and topology correction: September 2-3

The user wanted usable functionality rather than a test dashboard or copies of competing AIs. The agreed
layout is one work canvas, collapsible rails, a compact Add control, contextual Chat/Code/Research tasks,
Agent as task state and Review tied to exact source/artifact/diff context. Conversation lifecycle, real
settings, meaningful connections, system status and inspectable outputs became the product baseline.

An initial Omen-local folder/Git companion path exposed actual PowerShell/.NET overload and assembly
compatibility failures, watcher errors, unavailable WMI methods, MXC loader/cwd/permission problems and
root-ACL prerequisites. Repeated reviewed corrections did not yield a completed Code workflow. Alternatives
were assessed; then the user clarified the desired topology and approved server-managed workspaces.

The September 3 decision supersedes that primary Omen-local path: Control orchestrates isolated server
workspaces, Home serves models, and Omen is the browser seat. Public Git plus a non-Git snapshot are the
first source adapters; persistent local-folder transport and local execution remain separate. **Do not
resume the old C-drive ACL transition as the next task.**

Server-workspace criteria underwent several independent stops and corrections around network boundaries,
streaming, identity, Windows path handling, deadlines and ownership. Three review-dispatch HTTP 404s
were infrastructure stops before any verdict, not product or model failures. Later actual reviews resumed.
The scoped Git library, broker/materializer, lifecycle store and presentation work advanced, but local
contract success did not prove an actual integrated server worker or customer journey.

### 10. Integration, Native gaps and current stop: September 4

Agent PostgreSQL and Artifact DOM/source/HTTP work reached retained checkpoints (`58ca066`, `bf56905`),
combined in primary `b99f8bf`, then integrated with Native history by `6709a0f` and successors.

Native Gate 1 found one product parser defect and broken source-text assertions. Corrected affected checks
passed; prior passes were retained. Native Gate 2 passed actual disposable PostgreSQL Candidate 3/3 and
Compatibility 1/1 after one SQL locking defect and three pre-execution method stops were recorded/corrected.
These gates are not the original migration Gates 1/2.

Native Gate 3 was not executable as first described: operational interfaces, ownership transport,
compiler/release verification, activation and runtime key custody were incomplete. The record split it
into G3-A through G3-F. Further actual method stops used the wrong shell executable/module environment,
misattributed unrelated PostgreSQL processes, selected Omen inputs for a Control-design proof, and reached
sandbox readiness before the intended resource-ownership assertion. `parent-01` through `parent-03` remain
method/eligibility failures; no model failed.

The separately isolated Control eligibility stage exposed parent/child ACL provisioning, progress-on-stderr,
SDK diagnostic import, cwd portability and pin-generation defects. Exact corrected `e309435` passed once,
with exit 0, zero stderr, valid acknowledgement, zero owned surviving processes and scratch removed;
the result was published through `f1ee25b`. It closes only that prerequisite.

Four open shared families remain: process/tree lifetime and cleanup; one consumer preflight contract;
aggregate cleanup across active callers; and enrolled shell plus exact PostgreSQL/Qdrant/watchdog identity.
Runtime-key/service work is not proven; the prospective drafts remain paused. Browser, Candidate release
and first human acceptance are still ahead, not completed by the eligibility pass.

### 11. Current corrective direction and this packet

The user challenged shallow RCA, lack of official version-specific research, scope growth, repeated
testing mistakes and misleading progress/ETA. Current edits add lookup-first fix reuse, distinguish
custom/proposed/verified fixes, expand upstream causal analysis and publish the remaining delivery plan.
This is documentation and review preparation; **it does not itself fix the remaining executable code**.
No claim is made that every past correction was researched before implementation. The SDK custom patch
is a concrete case where the retained evidence does not establish prior exhaustion of upstream options.

## Previous user requirements the review must preserve

- Build for the real Omen/Control/Home hardware, OS, runtime versions and identities. PowerShell 5.1
  means its .NET Framework surface, not assumed PowerShell 7 APIs. Check relevant official documentation.
- Prefer established supported solutions and applicable proved code; custom mechanisms are last resort.
  Keep a searchable fix record and consult it before reintroducing a known cause.
- Do not use mock results as actual system/model/browser/customer acceptance. No new RCA on retired
  mock-only failures; actual failures require full RCA and corrected design before affected-only resume.
- Investigate why a bad design entered the process and why verification missed it, not just the immediate
  exception. Inspect analogous active callers and fix shared causes without speculative scope expansion.
- Stop repeated broken-method campaigns. Preserve passed prefixes and exact evidence; resume only the
  affected stage. Do not label application/harness/timing failures as model failures.
- Use independent review and parallel isolated builders where genuine dependencies allow it; prevent
  drift, conflicting writers and loops. More agents are not a substitute for a sound execution method.
- Finish Gemma-primary product wiring/UI/settings/workflows before optional challenger-model expansion.
  Research/Code/Review challengers are desirable later; another Chat/Agent backup is not currently required.
- Maintain current progress at milestones. Concise updates only; no unsupported ETA/count/progress claims.
  Credit cost primarily concerns assistant effort and lost user time, not the local models' purchase price.
- Continue normal authorized non-destructive implementation, documentation and milestone commit/push
  without repeated permission questions; involve the user for genuine presence, decisions and human testing.
  Product security, protected-data and destructive-action boundaries remain in force.
- Provide the complete plan through human testing and the broader destination, with triage/RCA rules.
  Do not shrink "completion" to a few internal prerequisites or promise every legacy feature is in scope.

## Questions Claude should answer independently

1. Is the remaining plan the shortest safe route to the approved user workflows? Identify any avoidable
   ceremony, duplicated component, speculative hardening or artificial dependency, with concrete alternatives.
2. For every required Native/service/signing/shell mechanism, is there a documented standard implementation
   that satisfies the actual requirement? Does custom code have a justified gap, or merely an asserted one?
3. Which defects are still in active product paths versus retired harnesses/deferred Omen work? Does the
   pending broad shell batch actually need every changed file before M1, and what is safe to separate?
4. Do real executable/runtime/account facts agree with the implementation and test commands? Audit entire
   launch/acquisition/ownership/evidence/cleanup chains, not only a helper signature or source regex.
5. Do the key/service and release requirements have a constructible dependency order? A derived service SID,
   static review or public key is not installed-service/private-key custody evidence. Reject circular gates.
6. Are Research/Review semantics and retained model qualification preserved? Identify precisely which changed
   model-facing contracts, if any, invalidate evidence. Do not propose an indiscriminate model rerun.
7. Are success claims supported by actual source, database, browser, release and customer evidence separately?
   Which status documents still misleadingly say "current", "next" or "unpublished" about historical state?
8. Is the RCA deep enough and falsifiable? Look specifically for recurring classes such as System.Security
   loading, runtime/cwd mismatch and duplicated publication algorithms appearing again after earlier fixes.
9. Does the test plan distinguish expected negative controls, unexpected actual failures, infrastructure
   stops, review findings, model errors and unknown outcomes? Are pause/resume and no-blind-retry real controls?
10. Reconcile historical cost/failure counts only if requested and supported: unique incidents, failed
    snapshots, model requests, provider calls and discarded attempts are different denominators. The historical
    minimum above is not an all-time count. Flag gaps rather than manufacture totals from filenames.

## Requested review output

Return a concise verdict on readiness to proceed, then prioritized findings with file/line or exact evidence
links; observed facts versus inference; affected user workflow; established remedy and installed-version
source; minimal change and verification; and what work can continue independently. List explicit unresolved
questions/evidence gaps. Give a corrected dependency order if needed, not another framework or a full rewrite.
Review the new completion plan and register as proposals too; do not treat their existence as process compliance.
No production/model/browser operation is necessary simply to produce this review.

## Evidence navigation

Packet checks: local Node `v22.22.0` ran the repository's roadmap retrieval check and 15/15 roadmap
consistency tests successfully; `git diff --check` passed; all 152 inline local links across this packet,
the fix register and completion plan resolved. These are documentation checks, not application/model acceptance
or independent review. The resulting planning digest is
`4ffdd265af2aeee45537a0cb308ce6a6f2e71761e6cd113a6f67822d45ff076c`.

The following filename index was generated from the current repository for retained assessments, decisions,
results, failures and RCAs. It is an index, not 142 separate failures and not an assertion that all listed
documents are current instructions. Follow result links to original immutable attempt IDs/raw evidence.
Use Git history for prior versions and rejected/reverted source; no evidence is erased by this summary.

- [LAB-COMPLETION-REPORT-2026-08-20.md](LAB-COMPLETION-REPORT-2026-08-20.md)
- [MODEL-ROLE-MATRIX-FINDINGS.md](MODEL-ROLE-MATRIX-FINDINGS.md)
- [MODEL-ROLE-MATRIX-PREREGISTRATION.md](MODEL-ROLE-MATRIX-PREREGISTRATION.md)
- [RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md](RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md)
- [RUNA-PORT-ESTIMATE-2026-08-20.md](RUNA-PORT-ESTIMATE-2026-08-20.md)
- [STACK-BAKEOFF-PREREGISTRATION.md](STACK-BAKEOFF-PREREGISTRATION.md)
- [STACK-BAKEOFF.md](STACK-BAKEOFF.md)
- [gate1/GATE1-RESULTS-2026-08-20.md](gate1/GATE1-RESULTS-2026-08-20.md)
- [gate2/BASELINE-RESULTS-2026-08-21.md](gate2/BASELINE-RESULTS-2026-08-21.md)
- [gate2/GATE2-RESULTS-2026-08-21.md](gate2/GATE2-RESULTS-2026-08-21.md)
- [gate3/GATE3-RESULTS-2026-08-21.md](gate3/GATE3-RESULTS-2026-08-21.md)
- [gate4/GATE4-SYNTHETIC-CLOSEOUT-RESULTS-2026-08-21.md](gate4/GATE4-SYNTHETIC-CLOSEOUT-RESULTS-2026-08-21.md)
- [gate4/GATE4A-1-SYNTHETIC-RESULTS-2026-08-21.md](gate4/GATE4A-1-SYNTHETIC-RESULTS-2026-08-21.md)
- [gate4/GATE4A-2-PROTECTED-REHEARSAL-RESULTS-2026-08-21.md](gate4/GATE4A-2-PROTECTED-REHEARSAL-RESULTS-2026-08-21.md)
- [gate4b/GATE4B-I-OWNER-INVENTORY-RESULTS-2026-08-21.md](gate4b/GATE4B-I-OWNER-INVENTORY-RESULTS-2026-08-21.md)
- [gate4b/GATE4B-R-PROTECTED-REHEARSAL-RESULTS-2026-08-21.md](gate4b/GATE4B-R-PROTECTED-REHEARSAL-RESULTS-2026-08-21.md)
- [gate4b/GATE4B-SYNTHETIC-RESULTS-2026-08-21.md](gate4b/GATE4B-SYNTHETIC-RESULTS-2026-08-21.md)
- [gate4c/GATE4C1-SYNTHETIC-RESULTS-2026-08-21.md](gate4c/GATE4C1-SYNTHETIC-RESULTS-2026-08-21.md)
- [gate4c/GATE4C2-PROTECTED-AGGREGATE-COMPARISON-RESULTS-2026-08-21.md](gate4c/GATE4C2-PROTECTED-AGGREGATE-COMPARISON-RESULTS-2026-08-21.md)
- [gate5/GATE5-RESULTS-2026-08-21.md](gate5/GATE5-RESULTS-2026-08-21.md)
- [gate6/GATE6A-RESULTS-2026-08-21.md](gate6/GATE6A-RESULTS-2026-08-21.md)
- [gate6b/GATE6B-RESULTS-2026-08-21.md](gate6b/GATE6B-RESULTS-2026-08-21.md)
- [gate6c/GATE6C-OWNER-AND-BACKUP-RESULTS-2026-08-22.md](gate6c/GATE6C-OWNER-AND-BACKUP-RESULTS-2026-08-22.md)
- [gate6c/GATE6C-PREPARATION-RESULTS-2026-08-21.md](gate6c/GATE6C-PREPARATION-RESULTS-2026-08-21.md)
- [gate6c/GATE6D-CUTOVER-RESULTS-2026-08-22.md](gate6c/GATE6D-CUTOVER-RESULTS-2026-08-22.md)
- [gate7a/GATE7A-CERTIFICATE-STAGING-RESULTS-2026-08-22.md](gate7a/GATE7A-CERTIFICATE-STAGING-RESULTS-2026-08-22.md)
- [gate7a/GATE7A-LAN-ACTIVATION-RESULTS-2026-08-23.md](gate7a/GATE7A-LAN-ACTIVATION-RESULTS-2026-08-23.md)
- [gate7a/GATE7A-LIVE-HOSTNAME-DECISION-2026-08-22.md](gate7a/GATE7A-LIVE-HOSTNAME-DECISION-2026-08-22.md)
- [gate7a/GATE7A-ORDINARY-ACCESS-ACTIVATION-RESULTS-2026-08-23.md](gate7a/GATE7A-ORDINARY-ACCESS-ACTIVATION-RESULTS-2026-08-23.md)
- [gate7a/GATE7A-SYNTHETIC-RESULTS-2026-08-22.md](gate7a/GATE7A-SYNTHETIC-RESULTS-2026-08-22.md)
- [gate7a/GATE7A-USER-ACCESS-MODEL-DECISION-2026-08-23.md](gate7a/GATE7A-USER-ACCESS-MODEL-DECISION-2026-08-23.md)
- [gate7b/GATE7B-CUSTOMER-JOURNEY-RESULTS-2026-08-24.md](gate7b/GATE7B-CUSTOMER-JOURNEY-RESULTS-2026-08-24.md)
- [gate7c/GATE7C-UI-SHELL-RESULTS-2026-08-24.md](gate7c/GATE7C-UI-SHELL-RESULTS-2026-08-24.md)
- [gate7d/GATE7D-CHAT-CODE-NAVIGATION-RESULTS-2026-08-24.md](gate7d/GATE7D-CHAT-CODE-NAVIGATION-RESULTS-2026-08-24.md)
- [gate7d/GATE7D-END-TO-END-FLOW-CORRECTION-RESULTS-2026-08-25.md](gate7d/GATE7D-END-TO-END-FLOW-CORRECTION-RESULTS-2026-08-25.md)
- [gate7e/GATE7E-CONTROL-REPAIR-AND-ACTIVATION-RESULTS-2026-08-26.md](gate7e/GATE7E-CONTROL-REPAIR-AND-ACTIVATION-RESULTS-2026-08-26.md)
- [gate7e/GATE7E-CONTROL-STARTUP-RCA-AND-GREEN-CRITERIA-2026-08-25.md](gate7e/GATE7E-CONTROL-STARTUP-RCA-AND-GREEN-CRITERIA-2026-08-25.md)
- [gate7e/GATE7E-EXECUTION-TRUTH-AND-HARMLESS-JAVASCRIPT-RESULTS-2026-08-25.md](gate7e/GATE7E-EXECUTION-TRUTH-AND-HARMLESS-JAVASCRIPT-RESULTS-2026-08-25.md)
- [gate7f/GATE7F-QUALIFICATION-RESULTS-2026-08-27.md](gate7f/GATE7F-QUALIFICATION-RESULTS-2026-08-27.md)
- [gate7f/GATE7F0-INERT-AGENT-FOUNDATION-RESULTS-2026-08-26.md](gate7f/GATE7F0-INERT-AGENT-FOUNDATION-RESULTS-2026-08-26.md)
- [gate7f/GATE7F1-HOME-BURNIN-RESULTS-2026-08-27.md](gate7f/GATE7F1-HOME-BURNIN-RESULTS-2026-08-27.md)
- [gate7f/GATE7F1-OFFLINE-PREREGISTRATION-RESULTS-2026-08-26.md](gate7f/GATE7F1-OFFLINE-PREREGISTRATION-RESULTS-2026-08-26.md)
- [gate7f/GATE7F1-V2-HOME-RERUN-RESULTS-2026-08-27.md](gate7f/GATE7F1-V2-HOME-RERUN-RESULTS-2026-08-27.md)
- [gate7f/function-first/ACTUAL-ADAPTER-RESULTS-2026-08-28.md](gate7f/function-first/ACTUAL-ADAPTER-RESULTS-2026-08-28.md)
- [gate7f/function-first/APPROVAL-PLANNING-RESULTS-2026-08-28.md](gate7f/function-first/APPROVAL-PLANNING-RESULTS-2026-08-28.md)
- [gate7f/function-first/EVIDENCE-WIRE-CONTRACT-RESULTS-2026-08-28.md](gate7f/function-first/EVIDENCE-WIRE-CONTRACT-RESULTS-2026-08-28.md)
- [gate7f/function-first/M1-LOCAL-SUITE-PORTABILITY-RESULTS-2026-08-28.md](gate7f/function-first/M1-LOCAL-SUITE-PORTABILITY-RESULTS-2026-08-28.md)
- [gate7f/function-first/M1-S1-MODEL-ROLE-CONTRACT.md](gate7f/function-first/M1-S1-MODEL-ROLE-CONTRACT.md)
- [gate7f/function-first/M1-S1-RESULTS-2026-08-28.md](gate7f/function-first/M1-S1-RESULTS-2026-08-28.md)
- [gate7f/function-first/M1-S2-ACTUAL-REVIEW-READINESS-RCA-2026-09-02.md](gate7f/function-first/M1-S2-ACTUAL-REVIEW-READINESS-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2-ARTIFACT-DOM-BROAD-SUITE-METHOD-RCA-2026-09-04.md](gate7f/function-first/M1-S2-ARTIFACT-DOM-BROAD-SUITE-METHOD-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2-CAMPAIGN-HARNESS-RCA-AND-CONTINUITY-CORRECTION-2026-09-01.md](gate7f/function-first/M1-S2-CAMPAIGN-HARNESS-RCA-AND-CONTINUITY-CORRECTION-2026-09-01.md)
- [gate7f/function-first/M1-S2-FIVE-FUNCTION-MODEL-QUALIFICATION-DECISION-2026-09-02.md](gate7f/function-first/M1-S2-FIVE-FUNCTION-MODEL-QUALIFICATION-DECISION-2026-09-02.md)
- [gate7f/function-first/M1-S2-FOCUSED-REVIEW-SCOPE-RCA-2026-09-02.md](gate7f/function-first/M1-S2-FOCUSED-REVIEW-SCOPE-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-RESULTS-2026-09-02.md](gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-RESULTS-2026-09-02.md)
- [gate7f/function-first/M1-S2-GEMMA-SIMPLIFIED-CHECKER-RCA-2026-09-02.md](gate7f/function-first/M1-S2-GEMMA-SIMPLIFIED-CHECKER-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md](gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md)
- [gate7f/function-first/M1-S2-R11-CORRECTION-IMPLEMENTATION-RESULTS-2026-08-30.md](gate7f/function-first/M1-S2-R11-CORRECTION-IMPLEMENTATION-RESULTS-2026-08-30.md)
- [gate7f/function-first/M1-S2-R11-DIAGNOSTIC-CAMPAIGN-RESULTS-2026-08-31.md](gate7f/function-first/M1-S2-R11-DIAGNOSTIC-CAMPAIGN-RESULTS-2026-08-31.md)
- [gate7f/function-first/M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md](gate7f/function-first/M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md)
- [gate7f/function-first/M1-S2-R12-QWEN-EQUIVALENCE-COMPOSITION-DECISION-2026-08-31.md](gate7f/function-first/M1-S2-R12-QWEN-EQUIVALENCE-COMPOSITION-DECISION-2026-08-31.md)
- [gate7f/function-first/M1-S2-R13-CORRECTION-IMPLEMENTATION-RESULTS-2026-08-31.md](gate7f/function-first/M1-S2-R13-CORRECTION-IMPLEMENTATION-RESULTS-2026-08-31.md)
- [gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md](gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md)
- [gate7f/function-first/M1-S2-R14-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md](gate7f/function-first/M1-S2-R14-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md)
- [gate7f/function-first/M1-S2-R15-CAMPAIGN-HALT-AND-COST-RCA-2026-09-02.md](gate7f/function-first/M1-S2-R15-CAMPAIGN-HALT-AND-COST-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2-R15-CORRECTION-IMPLEMENTATION-RESULTS-2026-09-01.md](gate7f/function-first/M1-S2-R15-CORRECTION-IMPLEMENTATION-RESULTS-2026-09-01.md)
- [gate7f/function-first/M1-S2-R6J-THREE-MODEL-RESULTS-2026-08-30.md](gate7f/function-first/M1-S2-R6J-THREE-MODEL-RESULTS-2026-08-30.md)
- [gate7f/function-first/M1-S2-R9-THREE-MODEL-RESULTS-2026-08-30.md](gate7f/function-first/M1-S2-R9-THREE-MODEL-RESULTS-2026-08-30.md)
- [gate7f/function-first/M1-S2-UI-AND-PRIVATE-EVIDENCE-RESULTS.md](gate7f/function-first/M1-S2-UI-AND-PRIVATE-EVIDENCE-RESULTS.md)
- [gate7f/function-first/M1-S2-WORKSPACE-BASELINE-IMPLEMENTATION-RESULTS-2026-09-02.md](gate7f/function-first/M1-S2-WORKSPACE-BASELINE-IMPLEMENTATION-RESULTS-2026-09-02.md)
- [gate7f/function-first/M1-S2A-CONVERSATION-SETTINGS-SYSTEM-RESULTS-2026-09-02.md](gate7f/function-first/M1-S2A-CONVERSATION-SETTINGS-SYSTEM-RESULTS-2026-09-02.md)
- [gate7f/function-first/M1-S2B-ACTUAL-GIT-WITNESS-FAILURE-RCA-2026-09-03.md](gate7f/function-first/M1-S2B-ACTUAL-GIT-WITNESS-FAILURE-RCA-2026-09-03.md)
- [gate7f/function-first/M1-S2B-ACTUAL-OMEN-FILES-ATTEMPT-1-RCA-2026-09-02.md](gate7f/function-first/M1-S2B-ACTUAL-OMEN-FILES-ATTEMPT-1-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2B-ACTUAL-OMEN-GIT-ATTEMPT-1-RCA-2026-09-02.md](gate7f/function-first/M1-S2B-ACTUAL-OMEN-GIT-ATTEMPT-1-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2B-ACTUAL-POSTGRES-ATTEMPT-1-RCA-2026-09-02.md](gate7f/function-first/M1-S2B-ACTUAL-POSTGRES-ATTEMPT-1-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2B-ACTUAL-WINDOWS-FAILURE-RCA-2026-09-02.md](gate7f/function-first/M1-S2B-ACTUAL-WINDOWS-FAILURE-RCA-2026-09-02.md)
- [gate7f/function-first/M1-S2B-GIT-IMPLEMENTATION-REVIEW-STOP-2026-09-02.md](gate7f/function-first/M1-S2B-GIT-IMPLEMENTATION-REVIEW-STOP-2026-09-02.md)
- [gate7f/function-first/M1-S2B-OMEN-ISOLATION-ALTERNATIVES-ASSESSMENT-2026-09-03.md](gate7f/function-first/M1-S2B-OMEN-ISOLATION-ALTERNATIVES-ASSESSMENT-2026-09-03.md)
- [gate7f/function-first/M1-S2B1-CONTROL-MXC-ELIGIBILITY-STAGING-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-CONTROL-MXC-ELIGIBILITY-STAGING-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-CORRECTED-CRITERIA-REVIEW-INFRASTRUCTURE-STOP-2026-09-03.md](gate7f/function-first/M1-S2B1-CORRECTED-CRITERIA-REVIEW-INFRASTRUCTURE-STOP-2026-09-03.md)
- [gate7f/function-first/M1-S2B1-IMPLEMENTATION-PREFLIGHT-RCA-2026-09-03.md](gate7f/function-first/M1-S2B1-IMPLEMENTATION-PREFLIGHT-RCA-2026-09-03.md)
- [gate7f/function-first/M1-S2B1-NATIVE-DETERMINISTIC-GATE1-FAILURE-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-DETERMINISTIC-GATE1-FAILURE-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-GATE3-ACTIVATION-TEST-METHOD-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-GATE3-ACTIVATION-TEST-METHOD-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-GATE3-PREFLIGHT-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-GATE3-PREFLIGHT-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-GATE3-PRODUCTION-RESOURCE-OWNERSHIP-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-GATE3-PRODUCTION-RESOURCE-OWNERSHIP-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-GATE3-PROOF-LAUNCH-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-GATE3-PROOF-LAUNCH-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-GATE3-RESOURCE-PROOF-ELIGIBILITY-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-GATE3-RESOURCE-PROOF-ELIGIBILITY-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-CANDIDATE-FAILURE-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-CANDIDATE-FAILURE-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-COMPATIBILITY-PREFLIGHT-FAILURE-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-COMPATIBILITY-PREFLIGHT-FAILURE-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-PREFLIGHT-FAILURE-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-PREFLIGHT-FAILURE-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-RESULTS-2026-09-04.md](gate7f/function-first/M1-S2B1-NATIVE-POSTGRES-GATE2-RESULTS-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-POSTGRES-LIFECYCLE-ACTUAL-RUN-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-POSTGRES-LIFECYCLE-ACTUAL-RUN-RCA-2026-09-04.md)
- [gate7f/function-first/M1-S2B1-SUPERVISOR-PREFLIGHT-AND-DEADLINE-RCA-2026-09-04.md](gate7f/function-first/M1-S2B1-SUPERVISOR-PREFLIGHT-AND-DEADLINE-RCA-2026-09-04.md)
- [gate7f/function-first/MODEL-ROLES.md](gate7f/function-first/MODEL-ROLES.md)
- [gate7f/function-first/READ-ONLY-EXPLANATION-RESULTS-2026-08-28.md](gate7f/function-first/READ-ONLY-EXPLANATION-RESULTS-2026-08-28.md)
- [gate7f/function-first/REPAIR-PHASE-RESULTS-2026-08-28.md](gate7f/function-first/REPAIR-PHASE-RESULTS-2026-08-28.md)
- [gate7f/function-first/REQUEST-COVERAGE-RESULTS-2026-08-28.md](gate7f/function-first/REQUEST-COVERAGE-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/CONDITIONAL-EVIDENCE-RESULTS-2026-08-28.md](gate7f/function-first/acceptance/CONDITIONAL-EVIDENCE-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/CONTROL-EXACT-REGRESSION-RUNNER-RESULTS-2026-08-29.md](gate7f/function-first/acceptance/CONTROL-EXACT-REGRESSION-RUNNER-RESULTS-2026-08-29.md)
- [gate7f/function-first/acceptance/FROZEN-BYTE-EXPORT-RESULTS-2026-08-28.md](gate7f/function-first/acceptance/FROZEN-BYTE-EXPORT-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/GEMMA-R6-DIAGNOSTIC-AND-BROWSER-ACK-RCA-2026-08-29.md](gate7f/function-first/acceptance/GEMMA-R6-DIAGNOSTIC-AND-BROWSER-ACK-RCA-2026-08-29.md)
- [gate7f/function-first/acceptance/HEALTH-CAPTURE-RESULTS-2026-08-28.md](gate7f/function-first/acceptance/HEALTH-CAPTURE-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/OPERATOR-INFLIGHT-ACK-RCA-2026-08-29.md](gate7f/function-first/acceptance/OPERATOR-INFLIGHT-ACK-RCA-2026-08-29.md)
- [gate7f/function-first/acceptance/R4B-CONTROL-REGRESSION-RESULTS-2026-08-28.md](gate7f/function-first/acceptance/R4B-CONTROL-REGRESSION-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/R4B-CONTROLS-RESULTS-2026-08-28.md](gate7f/function-first/acceptance/R4B-CONTROLS-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/R5-INDEPENDENT-SEMANTIC-RESULTS-2026-08-29.md](gate7f/function-first/acceptance/R5-INDEPENDENT-SEMANTIC-RESULTS-2026-08-29.md)
- [gate7f/function-first/acceptance/R5-RUNTIME-SEAL-BUILDER-RESULTS-2026-08-29.md](gate7f/function-first/acceptance/R5-RUNTIME-SEAL-BUILDER-RESULTS-2026-08-29.md)
- [gate7f/function-first/acceptance/R6-INDEPENDENT-SEMANTIC-CONTRACT-RESULTS-2026-08-29.md](gate7f/function-first/acceptance/R6-INDEPENDENT-SEMANTIC-CONTRACT-RESULTS-2026-08-29.md)
- [gate7f/function-first/acceptance/STALE-PENDING-RESULTS-2026-08-28.md](gate7f/function-first/acceptance/STALE-PENDING-RESULTS-2026-08-28.md)
- [gate7f/function-first/acceptance/STOPPED-CODER-R3-FINDING-2026-08-28.md](gate7f/function-first/acceptance/STOPPED-CODER-R3-FINDING-2026-08-28.md)
- [gate7f/function-first/acceptance/STOPPED-CODER-R3-INDEPENDENT-REVIEW-2026-08-28.md](gate7f/function-first/acceptance/STOPPED-CODER-R3-INDEPENDENT-REVIEW-2026-08-28.md)
- [gate7f/function-first/acceptance/STOPPED-GEMMA-INDEPENDENT-REVIEW-2026-08-28.md](gate7f/function-first/acceptance/STOPPED-GEMMA-INDEPENDENT-REVIEW-2026-08-28.md)
- [gate7f/function-first/acceptance/STOPPED-GEMMA-R2-INDEPENDENT-REVIEW-2026-08-28.md](gate7f/function-first/acceptance/STOPPED-GEMMA-R2-INDEPENDENT-REVIEW-2026-08-28.md)
- [gate7f/function-first/control/QUIESCENCE-PRECEDENCE-AND-PENDING-RESTORE-RESULTS-2026-08-28.md](gate7f/function-first/control/QUIESCENCE-PRECEDENCE-AND-PENDING-RESTORE-RESULTS-2026-08-28.md)
- [gate7f/function-first/control/QUIESCENCE-RESULTS-2026-08-28.md](gate7f/function-first/control/QUIESCENCE-RESULTS-2026-08-28.md)
- [gate7f/function-first/control/deployment/LEGACY-COMPATIBILITY-RESULTS.md](gate7f/function-first/control/deployment/LEGACY-COMPATIBILITY-RESULTS.md)
- [gate7f/function-first/control/deployment/OWNER-TRANSACTION-RESULTS.md](gate7f/function-first/control/deployment/OWNER-TRANSACTION-RESULTS.md)
- [gate7f/function-first/control/deployment/SOURCE-BYTE-EXPORT-RESULTS.md](gate7f/function-first/control/deployment/SOURCE-BYTE-EXPORT-RESULTS.md)
- [gate7f/function-first/control/deployment/SUPERVISOR-RESULTS.md](gate7f/function-first/control/deployment/SUPERVISOR-RESULTS.md)
- [gate7f/function-first/control/deployment/WIRE-RESULTS.md](gate7f/function-first/control/deployment/WIRE-RESULTS.md)
- [gate7f/function-first/control/qdrant/CONTROL-LIFECYCLE-RESULTS-2026-08-28.md](gate7f/function-first/control/qdrant/CONTROL-LIFECYCLE-RESULTS-2026-08-28.md)
- [gate7f/function-first/control/qdrant/TEST-PORTABILITY-RESULTS-2026-08-28.md](gate7f/function-first/control/qdrant/TEST-PORTABILITY-RESULTS-2026-08-28.md)
- [gate7f/function-first/conversation-isolation-results.md](gate7f/function-first/conversation-isolation-results.md)
- [gate7f/function-first/conversation-revision-results.md](gate7f/function-first/conversation-revision-results.md)
- [gate7f/function-first/conversation-routing-results.md](gate7f/function-first/conversation-routing-results.md)
- [gate7f/function-first/home-runtime/ATOMIC-REPLACEMENT-ACL-RESULTS-2026-08-28.md](gate7f/function-first/home-runtime/ATOMIC-REPLACEMENT-ACL-RESULTS-2026-08-28.md)
- [gate7f/function-first/home-runtime/BODY-TIMEOUT-RESPONSE-RESULTS.md](gate7f/function-first/home-runtime/BODY-TIMEOUT-RESPONSE-RESULTS.md)
- [gate7f/function-first/home-runtime/HEADLESS-FALLBACK-ASSESSMENT-20260828.md](gate7f/function-first/home-runtime/HEADLESS-FALLBACK-ASSESSMENT-20260828.md)
- [gate7f/function-first/home-runtime/NATIVE-MUTATION-JOURNAL-RESULTS.md](gate7f/function-first/home-runtime/NATIVE-MUTATION-JOURNAL-RESULTS.md)
- [gate7f/function-first/home-runtime/NATIVE-PROCESSING-PROOF-RESULTS-2026-08-29.md](gate7f/function-first/home-runtime/NATIVE-PROCESSING-PROOF-RESULTS-2026-08-29.md)
- [gate7f/function-first/home-runtime/REQUEST-INGRESS-DRAIN-RESULTS.md](gate7f/function-first/home-runtime/REQUEST-INGRESS-DRAIN-RESULTS.md)
- [gate7f/function-first/home-runtime/evidence/20260828-OWNER-STATUS-RESULTS.md](gate7f/function-first/home-runtime/evidence/20260828-OWNER-STATUS-RESULTS.md)
- [gate7f/function-first/readiness/CAMPAIGN-METADATA-TRANSPORT-RESULTS-2026-08-28.md](gate7f/function-first/readiness/CAMPAIGN-METADATA-TRANSPORT-RESULTS-2026-08-28.md)
- [gate7f/function-first/readiness/R6-CAMPAIGN-LIFECYCLE-RESULTS-2026-08-29.md](gate7f/function-first/readiness/R6-CAMPAIGN-LIFECYCLE-RESULTS-2026-08-29.md)
- [gate7f/function-first/readiness/RESULTS-2026-08-28.md](gate7f/function-first/readiness/RESULTS-2026-08-28.md)
- [gate7f/function-first/readiness/SMOKE-LEASE-RESULTS-2026-08-28.md](gate7f/function-first/readiness/SMOKE-LEASE-RESULTS-2026-08-28.md)
- [gate7f/function-first/tasks/RECEIPT-SCOPE-CORRECTION-EXACT-RESULTS-2026-08-28.md](gate7f/function-first/tasks/RECEIPT-SCOPE-CORRECTION-EXACT-RESULTS-2026-08-28.md)
- [gate7f/function-first/tasks/RECEIPT-SCOPE-CORRECTION-RESULTS-2026-08-28.md](gate7f/function-first/tasks/RECEIPT-SCOPE-CORRECTION-RESULTS-2026-08-28.md)
- [gate7f/function-first/tasks/RESULTS-2026-08-28.md](gate7f/function-first/tasks/RESULTS-2026-08-28.md)
- [gate7f/qualification/reporting/README.md](gate7f/qualification/reporting/README.md)
- [gate7f/qualification/results/INTEGRATION-FLOW-REVIEW.md](gate7f/qualification/results/INTEGRATION-FLOW-REVIEW.md)
- [gate7f/qualification/review/FINAL-REPORTING-REVIEW-2026-08-27.md](gate7f/qualification/review/FINAL-REPORTING-REVIEW-2026-08-27.md)
