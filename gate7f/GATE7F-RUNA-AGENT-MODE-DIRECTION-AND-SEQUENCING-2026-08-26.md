# Gate 7F direction: conversational Runa Agent Mode

Date: 2026-08-26
Status: product direction accepted; implementation scope not yet authorized

> Historical status/sequence above and below describe 2026-08-26. The steward's 2026-08-28 direction
> supersedes the next-work order and supplies M1 implementation authorization: retrieve
> `../PRODUCT-ROADMAP.md` and `../roadmap/CURRENT-SLICE.md` with `node roadmap/read-next-slice.mjs`.
> Real disposable functions now precede model-role selection; all three primary models remain in scope.
> Milestone 1 is not the complete product. Preserve this document as the original decision record.

## Direction

RunaAI will grow from separate conversational Chat and bounded Code drafting into a conversational
project agent. A user should be able to explain an outcome in ordinary language, let Runa plan and carry
out the permitted work, inspect what changed, and continue the same conversation. The intended experience
is comparable in shape to contemporary coding agents, while retaining Runa's identity, participant and
project isolation, explicit authority, honest execution status, auditability, and rollback discipline.

This direction does not turn the model into an authority. The application owns identity, capability
selection, approval state, effect classification, executor access, receipts, and rollback. A model may
propose a plan or tool call; it cannot approve itself, expand a capability, manufacture an execution
receipt, or change an approval profile.

Gate 7E remains the truthful first execution primitive: one harmless JavaScript request, explicitly run
inside a fixed sandbox, with a source-bound receipt. Gate 7F will extend the same truth boundary rather
than replace it.

## Intended customer experience

Within a selected Code project, the user can:

1. describe work conversationally;
2. review Runa's short plan when a plan is useful;
3. see which files, commands, tests, Git operations, network calls, or external actions are proposed;
4. approve or deny according to a selected approval profile;
5. let Runa perform only the capabilities that profile permits inside the selected project boundary;
6. see live progress and truthful tool results rather than model-predicted results;
7. inspect a concise change summary, test results, execution receipts, and rollback point; and
8. continue naturally with corrections or follow-up work in the same conversation.

Ordinary Chat remains a conversational lane and does not silently inherit project executors. Code and
Agent Mode use separate project/workspace authority. Owner, administrator, security, recovery, learning,
and other protected RunaAI actions remain distinct from ordinary project work.

## Approval profiles

The product should offer understandable profiles backed by deterministic policy:

| Profile | Customer meaning | Initial authority |
|---|---|---|
| Read only / Never execute | Discuss, inspect, explain, and draft without changing anything | Reads explicitly attached or project-authorized content only |
| Ask every time | Present each effect for approval | No effect runs until the exact proposed capability and arguments are approved |
| Safe autopilot | Continue without interruption for preapproved, reversible project work | Bounded project reads/writes and selected tests only; exact initial capability set must be separately ratified |
| Full project autopilot | Carry out all capabilities allowed for this project and session | Broader project-local authority, never an unbounded machine or account grant |
| Custom | User selects allowed capability groups | Exact deterministic combination of the approved capability registry |

An approval prompt should support **allow once**, **allow for this session**, **always allow this exact
capability in this project**, **deny once**, and **always deny this capability in this project**.
"Always" must still bind the participant, project, capability, argument constraints, effect class, and
revocation rule. It must not mean unrestricted access to the machine, network, credentials, accounts,
other projects, Runa's protected records, or future capability types.

The default launch profile should be **Ask every time**. Safe autopilot becomes an ordinary option only
after its exact capability set, containment, rollback, and user-facing wording pass their own gate.
Destructive, irreversible, credential-bearing, spending, deployment, public-network, identity, recovery,
and protected-Runa actions remain denied or separately governed until each receives its own tested policy.

## Required architecture

Agent Mode requires model-independent components before broad execution can be enabled:

- a durable project workspace with explicit participant and project ownership;
- a typed capability registry describing inputs, outputs, effects, limits, and required approval class;
- a deterministic policy engine that resolves the selected profile and current authority;
- an orchestration loop that can plan, call tools, observe results, recover, and stop;
- isolated executors for file, command, test, and later capability groups;
- exact time, process, output, filesystem, network, and secret boundaries per executor;
- immutable execution receipts that only the executor can produce;
- a preview/diff surface and recoverable rollback point before retained project changes;
- durable conversation and task state that survives sign-out, restart, retry, and duplicate delivery;
- observability that reports safe typed events without retaining private content or credentials; and
- an evaluator that did not build the behavior under test for acceptance of consequential gates.

The existing propose -> preview -> approve -> execute -> record pathway remains the governing pattern.
Approval profiles reduce repetitive prompts only by supplying previously granted, precisely scoped
authority; they do not bypass that pathway.

## Sequencing decision

Three sequences were considered.

| Sequence | Advantages | Costs and risks |
|---|---|---|
| Build broad Agent Mode before Gemma burn-in | Fastest visible feature progress; immediately exercises real workflows | Risks fitting the orchestration loop to the incumbent model, mixes model failures with executor failures, and could pressure the project to activate capabilities before model behavior is understood |
| Finish Gemma burn-in before any Agent Mode work | Establishes a stronger conversational baseline first; may reduce prompt and planner rework | Tests a model without the real workload it must perform, delays deterministic work that is needed regardless of model, and can select a good chat model that is a poor agent |
| Build the inert foundation, then burn in Gemma on it before activation | Separates deterministic safety from probabilistic model behavior, creates a realistic evaluation harness, avoids idle time, and preserves the existing broad-Code hold | Requires discipline to keep real effects disabled during the foundation and model-evaluation stages |

**Decision: use the third sequence.**

Build the model-independent foundation first, using synthetic or disposable workspaces and inert/read-only
tools. Then run the separately reviewed Gemma candidate and the incumbent model through both the existing
chat/research matrix and agent-specific tasks on that foundation. Select the model only from retained
evidence. Broad Agent Mode activation follows that selection; it does not precede it.

This is not a decision to delay Gemma until the entire product is wired. It is a decision to give the
Gemma bake-off a realistic agent harness while preventing either candidate from receiving production
project authority during evaluation.

## Decision-gated stages

### 7F-0 — Contracts and inert foundation

Entry: this direction is accepted and the current Gate 7E release remains healthy.

Work: freeze the workspace, capability, approval-profile, receipt, audit, rollback, and continuity
contracts; implement them only against synthetic/disposable state and inert or read-only tools.

Validation: authority cannot originate in prompts or model output; cross-project access denies; restart,
retry, duplicate, cancel, timeout, and rollback tests pass; no production project effect is possible.

Gate: review the contracts and synthetic evidence before any model receives an effectful project tool.

### 7F-1 — Gemma and incumbent agent burn-in

Entry: the inert harness is sealed, reproducible, and has no production authority. The exact Gemma
artifact, terms, runtime configuration, hardware fit, evaluation corpus, and stop rules are separately
preregistered before download or execution.

Work: compare Gemma and the incumbent role models on general conversation plus agent-specific planning,
current-turn relevance, exact tool arguments, approval escalation, denial handling, stop behavior,
correction, long-task continuity, code quality, and refusal to claim unperformed work.

Validation: retained runs meet fixed quality, latency, resource, and safety thresholds. A model miss
cannot be hidden by the policy layer, and a policy denial is not counted as model success.

Gate: select or reject each model role from the evidence. No model switch or production tool activation
is implied by completing the bake-off.

### 7F-2 — Disposable project execution

Entry: a model role is selected and the exact first effectful capability set is approved.

Work: enable bounded file edits and selected tests in a disposable project/worktree with previews,
receipts, output limits, no secrets, no external network, and automatic rollback.

Validation: complete realistic tasks, recover from model and executor failures, prove no cross-project
access, and independently verify the resulting files and tests.

Gate: review customer experience and technical evidence before any retained real project is eligible.

### 7F-3 — Retained project work

Entry: disposable execution is accepted and a backup/rollback contract exists for retained projects.

Work: enable the approved project-local capabilities and approval profiles for an invited test user.

Validation: fresh sign-in through task completion, sign-out/sign-in continuation, concurrent-change
handling, exact receipts, rollback, and an independent repository review all pass.

Gate: approve the exact ordinary-use profile and project classes. Broader capability groups remain
separate.

### 7F-4 — Capability expansion

Network access, package installation, Git publication, deployment, background work, credentials,
spending, destructive operations, and protected RunaAI administration are separate capability groups.
Each requires its own contract, containment, validation, default approval behavior, recovery path, and
activation decision. Approval of one group never grants another.

## What this direction does and does not approve

This record approves the Agent Mode product direction and the foundation-before-burn-in-before-activation
sequence. It authorizes documentation of the next gate; it does not by itself authorize implementation,
model download, model switch, persistent service changes, networking, production project access, broader
executors, deployment, protected-data access, branch merge, or push.
