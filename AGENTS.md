# RunaAI-Next repository instructions

This repository is the isolated RunaAI migration and eventual product repository. Its product name is
RunaAI; `Next` is only a temporary repository and checkout label during migration.

## Repository authority

- `main` begins at the immutable RunaLab stack-selection baseline tagged
  `runalab-stack-baseline-2026-08-20`.
- `runa2/integration` is the migration integration branch.
- `runalab/main` is fetch-only laboratory evidence.
- `runaai-legacy/main` is fetch-only current-behavior reference.
- Gate 6D made the exact selected-core Control release named in `MIGRATION-STATUS.md` the production
  authority for that scope. Legacy RunaAI remains the intact rollback system and behavioral reference;
  it is not the selected-core write authority.
- Do not merge the unrelated RunaAI history into this repository. Port verified behavior and governed
  data contracts deliberately and record their disposition.

## Working method

### Environment and scope discipline (steward direction, 2026-09-04)

- Search [FIX-REGISTER.md](FIX-REGISTER.md) by cause, API and error before designing a correction; follow its
  linked evidence and check applicability to the actual host/version. Prefer a supported vendor fix/configuration
  or an applicable proved repository implementation. Research official version-specific documentation, release notes
  and known issues before inventing an alternative. A custom fix is a last resort: record which established options
  were checked, why they do not satisfy the observed requirement, its limits and removal/replacement condition.
  Do not describe local code as vendor-approved or a proposed fix as verified. Log actual corrections in the register
  with source, affected callers, verification, rollback and reuse limits; amend the same cause entry on recurrence.
- Before a correction, identify its actual execution host, executable, runtime/version, account, and relevant
  hardware or OS capability. Read the official documentation for those installed versions and the specific API
  being changed. Record the supporting link and observed facts in the existing correction record; memory and
  another host's successful check are not compatibility evidence.
- Control readback on 2026-09-04 observed Windows 11 Pro x64 build 26200, Windows PowerShell Desktop
  `5.1.26100.9168`, and release Node `v22.22.0`. Design PowerShell code for 5.1 and its .NET Framework API surface.
  Do not substitute PowerShell 7, ambient Node, or a new SDK/runtime without an explicit deployment decision.
  Recheck relevant facts before execution; this recorded baseline is not a permanent assumption.
- A shared correction must identify the observed defect and affected active callers. Do not turn an analogous-path
  search into a general framework rewrite. Freeze each batch's files, concrete acceptance condition, and link to the
  required user workflow before implementation; a newly proposed blocker requires evidence of that dependency.
- Reuse a suitable implementation already proved on the target system before creating another launcher, supervisor,
  signing service, or test framework. Keep one exclusive writer per worktree and preserve interrupted changes.
- Use inexpensive syntax and version checks early. Resource-consuming checks must use the target runtime and
  identity. A passing unit check or documentation review is not a completed user workflow. Preserve passed evidence
  and resume only the affected stage after an actual failure's correction and independent review.
- RCA must separate the observed failure, its technical cause, why that defect entered the design, and why the
  existing verification/review did not catch it. Support causal claims with retained evidence; mark inference and
  unknowns explicitly. Do not stop at "incorrect design", "operator error", or "missing test".
  For each upstream cause name the preventive change, its owner, and observable evidence of effectiveness. A passing
  repaired case closes that case only; it does not prove the process cause eliminated. Investigate analogous active
  paths, but expand implementation only for a confirmed shared cause or a demonstrated dependency of the workflow.

Official compatibility references: [Windows PowerShell 5.1 versus PowerShell 7](https://learn.microsoft.com/en-us/powershell/scripting/whats-new/differences-from-windows-powershell),
[Start-Process for 5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-5.1),
and [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

0. Before deciding or proposing any next slice, run `node roadmap/read-next-slice.mjs` and read its
   complete planning context, `PRODUCT-ROADMAP.md`, `roadmap/CURRENT-SLICE.md`, and `MIGRATION-STATUS.md`.
   Use `roadmap/SLICE-TEMPLATE.md`; record the printed roadmap digest and capability IDs. Milestone 1
   is the first delivery only, never a replacement for the remaining 17-family roadmap. A previous
   gate's exclusions do not retire a future capability. Run `npm run verify:roadmap` before committing
   a changed plan or handoff. This dated roadmap supersedes older next-step/sequencing prose, not
   historical evidence, product security, or the selected-stack contracts.

1. Use a separate worktree or clone per agent. Never run Codex and Claude in the same checkout.
   Before any dependency-bound import, test or build in a fresh worktree, prove its package lock is byte-identical to
   the reviewed dependency source and provision a worktree-local dependency tree. On Windows, an ignored
   `node_modules` junction may be used only after rejecting occupied or dangling targets and then verifying the
   created item is a `Junction` reparse point with one target resolving to that exact reviewed source. Never accept
   ambient parent-directory module resolution as test evidence. Reauthenticate and remove only the junction object
   after the bounded command; do not recursively delete or mutate its target. A lane-specific evidence record must
   freeze the dependency versions, lock hash, command and cleanup before execution.
   Before a resource-consuming integration or acceptance run, preflight every external witness command under the
   same operating-system identity. Do not depend on CIM/WMI or another privileged census unless that exact read-only
   query is already proven available. Prefer an owned PID plus start/path identity, or a fail-closed exact executable-
   root census, and keep unrelated processes outside that root out of the result. A witness-method failure must not
   cause a passed database, browser or model operation to be rerun; resume only the corrected evidence step.
   Every actual-system failure pauses its affected stage before retry. Its RCA must map the complete prerequisite,
   acquisition, ownership, observation and cleanup chain; search active analogous paths for the same failure shape;
   and correct the shared boundary when the defect is systemic. A narrow symptom patch cannot authorize resume while
   another active path retains the same cause. Preserve the failed result, independently review the corrected method,
   and resume only the affected stage on new exact bytes. Classify application, environment, operator, evidence and
   model failures separately; a method or prerequisite failure is never charged to a model.
2. Create a short-lived branch from `runa2/integration` for one approved migration gate.
3. Baseline the behavior before implementing it and commit the green criteria before the implementation.
4. Keep old and new adapters side by side until parity, restart, duplicate, dependency-loss, and rollback
   checks pass.
5. Merge a gate branch into `runa2/integration` only after verification and steward approval.
6. Merge `runa2/integration` into `main` only after the selected migration, protected-data ceremonies,
   release security, cutover rehearsal, and rollback proof are accepted.

## Safety boundaries

- Documentation or lab evidence is not authorization to implement a migration stage.
- Do not copy DPAPI, Windows Hello, credential, protected-store, or machine-local ciphertext.
- Do not download models, start persistent services, expose networking, spend money, or change production
  without separate approval.
  Approval may already be present in the current steward authorization: do not request it again for
  the same work. The 2026-08-28 authorization in `roadmap/CURRENT-SLICE.md` covers non-destructive M1
  implementation/testing/environment work and GitHub publication, with human involvement when actual
  presence/testing is needed. Unrelated capability activation is not implied by a roadmap entry.
- PostgreSQL owns authoritative product records; LangGraph owns durable workflow checkpoints; Qdrant is a
  rebuildable derived index. Mastra memory or snapshots must not become a second authority.
- Preserve Runa's constitution, authority rules, consent-first learning, typed knowledge, project and
  participant scope, provenance, honest uncertainty, and propose-preview-approve-execute-record pathway.
- A behavior change affecting answers is incomplete until every applicable lane is wired and executed:
  general chat, guarded/local chat, and workspace comprehension.

## Required migration references

Read these before proposing a gate:

- `PRODUCT-ROADMAP.md`, `roadmap/capabilities.json`, and `roadmap/CURRENT-SLICE.md` first;
- `RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md`
- `RUNA-PORT-ESTIMATE-2026-08-20.md`
- `LAB-COMPLETION-REPORT-2026-08-20.md`
- `STACK-BAKEOFF.md`
- `MODEL-ROLE-MATRIX-FINDINGS.md`

For behavior being ported, read the corresponding legacy RunaAI documentation, source, tests, decisions,
and current handoff directly from the fetch-only legacy remote or its preserved checkout. Previous status
is orientation only; verify branch, commit, working tree, and implementation claims live.

## Git discipline

- Inspect status and fetch before work. Preserve all existing changes.
- Stage explicit paths; never use broad staging for a mixed worktree.
- Never force-push, reset, clean, stash, rebase, or discard work unless the steward explicitly authorizes
  that exact operation.
- Before pushing, fetch and confirm the branch is not behind or diverged.
- Record verification commands and results in the gate handoff.

## RUNA-CONTROL access workflow

- Omen's established SSH configuration is `C:\Users\matth\.ssh\config`.
- For ordinary source and Git inspection, use `runa-control-codex`. This runs as
  `RUNA-CONTROL\codex-audit`; it cannot unseal Matthew's DPAPI CurrentUser data. When inspecting a
  Matthew-owned checkout, use a command-scoped override such as
  `git -c safe.directory=C:/AI/Projects/RunaAI ...`; do not persist a global exception.
- For an explicitly authorized owner-context operation, use
  `ssh -F C:\Users\matth\.ssh\config -o ClearAllForwardings=yes runa-control <command>`. This profile
  runs as `RUNA-CONTROL\Matthew` and supports command execution, including owner-bound DPAPI access.
- Attempt the appropriate established Control profile before asking the steward to copy commands or
  run PowerShell manually. Ask only when interactive presence, a new authorization, or a steward
  decision is genuinely required.
- Owner-context access is not blanket migration approval. Keep every command within the current gate,
  verify exact checkout/branch/commit/cleanliness first, fail closed on drift, and never print or copy
  protected values. Record the access identity, bounded command purpose, and safe result in the gate
  handoff.
