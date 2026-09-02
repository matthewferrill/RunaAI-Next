# RunaAI product foundation and UX baseline — 2026-09-02

Status: approved product direction and implementation baseline; not an implementation or acceptance claim.

This record captures the closest agreed expression of the steward's product vision so far. It combines
the current RunaAI-Next implementation, the reusable legacy RunaAI architecture, the accepted
Chat/Code/Research navigation direction, and the product-foundation gaps identified by comparing leading
AI workspaces. It supersedes any narrower implication that a five-role test shell by itself is a usable
RunaAI release.

## Product statement

RunaAI is a local-first, governed AI workspace for conversations, research, software work, projects,
sources, tools, outputs, and durable tasks. It should feel like one coherent application rather than five
model selectors. Models generate or reason inside the application; RunaAI owns identity, context,
authorization, tool access, evidence, execution, recovery, and presentation.

The initial useful release is not required to copy every feature of ChatGPT, Claude, Gemini, or Codex.
It must, however, include the shared foundation that makes those products useful: conversations, projects,
files, tools, outputs, settings, permissions, connections, task state, and honest recovery.

## Fixed product hierarchy

The permanent primary function row is:

```text
Chat  |  Code  |  Research
```

- **Chat** is the general conversation, writing, planning, explanation, and continuity surface.
- **Code** is the repository/project work surface. **Agent** is a governed task state inside Code when
  Runa plans or performs multi-step work; it is not a permanent fourth selector.
- **Research** is the source-controlled investigation surface. **Review** is contextual to selected
  sources, an artifact, or a code diff; it is not a permanent fifth selector.

This keeps the interface simple without removing any of the five qualified model functions. Function
routing is application-owned and normally automatic. Model and role selectors remain available only in
diagnostics or explicitly requested comparison workflows, not in the ordinary end-user layout.

## Shared application shell

### Top bar

- RunaAI identity and current signed-in profile.
- Compact actual-system summary, such as `Omen · Gemma · local` and a truthful Ready, Degraded, or
  Unavailable state.
- No implication that a service is healthy merely because the page loaded.

### Left navigation

1. New conversation or task.
2. Search and history.
3. Projects.
4. Files and artifacts.
5. Tasks.
6. Connections and, when implemented, skills.
7. Settings.

The selected project and its authorized root can appear as context, but machine paths must not become
global authority. Navigation should remain usable at reduced widths and collapse to a compact mobile form
without removing essential actions.

### Main workspace

- Chat, Code, and Research share one evenly spaced row.
- The active conversation or task transcript occupies the primary reading area.
- One unified composer supplies Add, Context, and Tools controls and shows the actual selected scope.
- Stop, retry, continue, and pending states appear only when meaningful to the current operation.
- A draft is visibly different from an executed action or a verified result.

### Contextual right panel

| Workspace state | Right-panel contents |
|---|---|
| Chat | Active project, attached files/sources, memory state, privacy boundary |
| Code | Working files, diff, tests, terminal/output, preview, contextual Review |
| Research | Editable plan, progress, selected sources, citations, conflicts, final report |
| Agent task | Plan, current step, approvals, effects, receipts, cancel, reconciliation, undo |
| Review | Findings tied to the exact selected source, artifact, or Git diff |

On narrower screens the panel moves below the workspace instead of becoming an unreadable third column.
It is contextual, not a permanent status drawer filled with unrelated controls.

## View contracts

### Chat

Chat must support new conversations, saved history, search, rename, archive/unarchive, delete, branch,
copy, retry, stop, export, and sign-out/sign-in recovery. A project attaches instructions, sources,
authorized connections, memory policy, recent outputs, and a permission summary. Chat history and approved
knowledge remain visibly distinct; temporary/incognito conversation is a first-class user choice.

### Code

Code begins with an explicitly selected local folder or repository. The customer-facing work surface must
show the file tree or working set, current branch/status, proposed diff, test/terminal output, errors, and
rendered preview where relevant. Read-only inspection is separate from a governed Agent task. Writes,
tests, local commits, GitHub publication, CI, and deployment are distinct capabilities and approval scopes.

The initial connection order is local folder, then local Git read-only inspection, then governed project
changes/tests, then local commits. GitHub connection and publication remain later, separately granted
effects. Until a real authorized project is attached, the product must say Code Chat or Sandbox rather
than implying a full coding agent.

### Research

Research must be honest about its source envelope. Supplied-source analysis may ship before live web
search, but the UI must name that limitation. A complete Research surface includes an editable plan,
source selection, progress, citations, conflict handling, saved report, and export. Live web retrieval is
added only when a provider is configured, its egress and retention are visible, and source evidence is
retained.

### Agent

Agent is a task lifecycle, not a model personality or top-level mode. It exposes proposed plan, current
step, exact approval boundary, execution receipts, cancellation, restart/duplicate reconciliation, and
bounded undo. Cancellation prevents successor work while reconciling any already-dispatched effect.
Unknown outcomes remain unknown until checked; they are not blindly retried.

### Review

Review is invoked against exact context: a research source set, document/artifact, or code diff. Findings
remain linked to that context. The simplified model-facing `accept`/`revise` contract is internal; the
application owns the richer accepted finding, citation, severity, and display schema. Review must not
degrade Research's already-qualified checker contract or become an ordinary global selector.

## Settings information architecture

Settings is a product capability with persistence, validation, migration, rollback, and acceptance—not a
collection of decorative controls. Its top-level organization is:

1. **General** — startup, default project, language, data locations, and basic behavior.
2. **Appearance and accessibility** — theme, text size, density, keyboard shortcuts, reduced motion,
   contrast, and responsive preferences.
3. **Account and privacy** — active sessions, sign out all, retention, export/delete, temporary chat,
   credential status, and plain-language data handling.
4. **Memory and personalization** — enable/disable, inspect, correct, revoke, project scope, and the
   distinction between history and approved knowledge.
5. **Models and routing** — Gemma as primary, embedding/reranker roles, automatic function routing,
   context limits, and explicit future comparison lanes.
6. **Systems** — actual Omen, Control, and Home reachability; application commit; model availability;
   queue/lease state; degraded-mode explanation; reconnect and retry.
7. **Connections** — accounts, local roots, scopes, tests, status, errors, revoke, and disconnect.
8. **Approvals** — ask-every-time, bounded profiles, current grants, expiration, revocation, receipts,
   and undo availability.
9. **Advanced diagnostics** — logs, versions, health details, exportable diagnostics, and recovery tools.

Ordinary users should not choose a model independently for every function. Gemma is the initial primary;
diagnostic overrides and future adversarial comparisons are explicit expert actions.

## Connections baseline

The first connection manager must support these rows even when some are not yet configured:

| Connection | Initial behavior | Later behavior |
|---|---|---|
| Local folders | User-selected authorized roots; visible read/write scope; remove/revoke | More parsers, indexing, visual inputs |
| Local Git | Repository selection, branch/status/diff, changed-file inspection | Governed commits and worktrees |
| GitHub | Not connected until authenticated; account and scopes visible | Issues, pull requests, review, CI, publication |
| Web research | Provider not configured until explicitly selected | Search, cited retrieval, retained source record |

Every connector follows the lifecycle `known -> configured -> connected -> tested -> enabled ->
use-approved`. Its row shows account or host, scopes, supported actions, destination of retrieved data,
project access, last test, current errors, and disconnect/revoke controls. Read access never silently
becomes send, write, publish, deploy, or administrative authority.

## Omen, Control, and Home presentation

- **Omen** is the user's interactive seat and shows the browser/client state.
- **Control** owns the selected application, durable records, governance, and production route.
- **Home** owns model execution and capacity/lease state.

The product displays these as actual dependencies, not generic green dots. If status cannot be verified,
the state is Unknown or Unavailable and no authority is inferred. A page-level failure, Control service
failure, relay failure, Home lease failure, model failure, and user-task failure are separate diagnoses.
Recovery guidance should tell the user what can still be done in degraded mode.

## Required product states

Each primary view and connection must design and test:

- ready, working, paused, and completed;
- empty and first-use;
- loading with cancellable work;
- permission required and permission revoked;
- dependency unavailable or disconnected;
- timed out with known no-effect, known effect, or unknown effect;
- recoverable application error distinct from model error;
- restart/resume and duplicate-delivery reconciliation;
- narrow-screen and keyboard-only use.

Errors are not acceptable as unexplained generic failures. Any failure in an actual-system acceptance run
halts that gate, retains evidence, receives an RCA and corrected design, and resumes at the failed gate
only after the method is verified. Mocks may support unit development but never qualify a model, system,
or customer workflow.

## Product-foundation rebaseline

Model selection is complete for the bounded five functions. No further LLM qualification campaign is
needed unless a qualified model artifact, inference setting, prompt, checker semantic, or frozen model
contract materially changes. The active product work is therefore re-ordered as follows:

1. **Finish the exact Gemma-primary application seam.** Preserve the Research checker, isolate the
   simplified Review checker, bind the five-role qualification record, and keep comparison models tabled.
2. **Complete the shell and conversation lifecycle.** Implement the shared navigation, three primary
   workspaces, project management, conversation operations, errors, recovery, and status.
3. **Build real Settings and system control.** Persist the defined settings and expose honest
   Omen/Control/Home, model, queue, lease, privacy, memory, approval, and diagnostic state.
4. **Add real context connections.** Implement uploaded files, authorized local folders, and local Git
   read-only first, with project assignment, test, revoke, and disconnect.
5. **Complete functional work surfaces.** Add Research plan/sources/citations/report, Code files/diff/tests,
   contextual Agent/Review, and artifact/output preview.
6. **Enable governed local changes.** Prove real project edits, tests, recovery, undo, and local commit as
   separately scoped effects. GitHub publication remains a later grant.
7. **Run actual-system acceptance.** Execute one small Omen -> Control -> Home customer journey for each
   supported workflow. This validates the exact application integration and does not repeat model
   qualification unless the model contract changed.
8. **Expand after the primary product works.** Resume optional challenger models, live web, GitHub/cloud
   connectors, richer artifacts, skills, automation, voice/media, mobile, and off-LAN access in their
   governed slices.

This is a bounded pull-forward of product-foundation subsets from C01, C02, C03, C04, C05, C06, C07,
C08, C10, C12, C15, and C16. It does not claim those entire capability families are implemented or
accepted, and it does not silently activate live web, cloud publication, unrestricted computer use,
scheduling, parallel agents, voice/media, or remote access.

## Acceptance boundary

The preview and this document establish design direction only. The product is not accepted until the
exact current release demonstrates, on Omen, Control, and Home:

- all three primary workspaces and both contextual functions route correctly;
- settings persist and recover;
- authorized local-folder and local-Git boundaries hold;
- Research and Code outputs are inspectable and attributable;
- approvals, receipts, cancellation, reconciliation, and undo are truthful;
- unavailable systems fail closed with usable recovery;
- the user completes the bounded ordinary-workflow trial.

Implementation, deterministic verification, shadow deployment, actual-system smoke, production routing,
and customer acceptance remain separate gates and must be reported separately.
