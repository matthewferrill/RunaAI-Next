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

0. Before deciding or proposing any next slice, run `node roadmap/read-next-slice.mjs` and read its
   complete planning context, `PRODUCT-ROADMAP.md`, `roadmap/CURRENT-SLICE.md`, and `MIGRATION-STATUS.md`.
   Use `roadmap/SLICE-TEMPLATE.md`; record the printed roadmap digest and capability IDs. Milestone 1
   is the first delivery only, never a replacement for the remaining 17-family roadmap. A previous
   gate's exclusions do not retire a future capability. Run `npm run verify:roadmap` before committing
   a changed plan or handoff. This dated roadmap supersedes older next-step/sequencing prose, not
   historical evidence, product security, or the selected-stack contracts.

1. Use a separate worktree or clone per agent. Never run Codex and Claude in the same checkout.
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
