# Gate 7F-0: inert Agent Mode foundation

Date: 2026-08-26
Branch: `codex/gate7f-agent-foundation`
Base: `dd8e154ce60bfaa6aba3521b8b206121a0b1d166`
Status: implementation authorized by the steward on 2026-08-26

## Purpose

Gate 7F-0 builds the model-independent control plane needed for conversational Runa Agent Mode before
any model receives a real project effect. It generalizes the already-proved Runa action pathway into
participant-, project-, task-, session-, capability-, environment-, and approval-profile-scoped
contracts.

The implementation is intentionally useful as an architecture and evaluation harness but inert with
respect to the real machine. It operates only on synthetic in-memory workspaces. It cannot open a real
file, start a process, invoke Git, call a model, use a network, access a credential, change production,
or write protected product data.

## Preserved Runa behavior

Gate 7F-0 preserves these established properties rather than inventing a second authority system:

- propose -> preview -> approve -> execute -> record;
- model output may stage a typed proposal but cannot approve or execute it;
- retrieved content and tool output cannot originate authority;
- approval belongs to an authenticated participant and binds the exact proposal digest;
- project and participant scope is checked before content is returned or an effect is staged;
- stale state refuses instead of overwriting unseen work;
- duplicate delivery cannot create a second deed;
- rollback is a second governed proposal, not an administrator bypass;
- receipts come only from an executor result, never from model text; and
- an approval profile supplies narrowly scoped prior authority; it does not bypass the action pathway.

## Accepted implementation

### Task contract

An Agent Mode task binds:

- authenticated participant;
- project;
- session;
- selected approval profile;
- synthetic environment identity;
- user-originated objective digest; and
- active, completed, or cancelled lifecycle.

The task owns its profile. A model proposal cannot select or alter the profile, participant, project,
session, environment, or capability registry.

### Initial capability registry

The registry is code, closed by default, and contains only synthetic capabilities:

| Capability | Risk class | Synthetic behavior |
|---|---|---|
| `workspace.inspect` | observe | Return one bounded synthetic text file and a digest without mutation |
| `workspace.preview-change` | draft | Produce exact before/after metadata and a bounded preview without mutation |
| `workspace.apply-synthetic-change` | reversible local change | Change one bounded text file in the in-memory project only |
| `workspace.restore-synthetic-change` | reversible local change | Restore one prior synthetic change through a second governed proposal |
| `workspace.verify-synthetic` | observe | Compare current synthetic state with exact expected path/digest assertions |

Shell, arbitrary commands, real filesystem, package installation, Git, network, deployment, secrets,
protected RunaAI administration, learning approval, and every unknown capability are absent from the
registry and deny by default.

### Approval profiles

The foundation implements the profile semantics without granting production authority:

- `read-only`: observe and draft capabilities may run; every effect denies.
- `ask-every-time`: observe and draft may run; each reversible effect requires exact user approval.
- `safe-autopilot`: only registry-marked automatic synthetic reversible effects may run without a new
  prompt.
- `full-project-autopilot`: every capability currently registered for that exact synthetic project may
  run; absent capability groups remain impossible.
- `custom`: only the exact allowed capability set is reachable, and only the exact automatic subset may
  run without a new prompt.

The policy result is one of `deny`, `approval-required`, or `automatic`. Deterministic code produces the
result. The model cannot supply it.

### Remembered choices

An explicit user approval or denial may be remembered for:

- this proposal only;
- this exact capability in this session; or
- this exact capability in this project.

Remembered authority is bound to participant, project, capability, environment, and scope. Deny wins
over allow. Revocation is immediate. A remembered choice cannot authorize a capability absent from the
registry or widen its arguments.

### Synthetic repository and executor

The foundation uses repository interfaces with an in-memory adapter. The adapter may export and restore
a synthetic snapshot so restart, retry, idempotency, and continuity can be tested. It is not a production
durability decision; PostgreSQL remains the selected target authority and LangGraph remains the selected
workflow checkpoint authority.

The executor accepts only `environmentKind: synthetic-memory`. It has no filesystem, subprocess, Git,
network, secret, provider, or product-store dependency. Its public receipts retain hashes, revisions,
bounded result metadata, approval basis, and rollback linkage but do not retain synthetic file content.
Private rollback state stays inside the synthetic repository adapter.

### Orchestration boundary

The application service owns the only automatic path:

1. validate the model- or user-originated capability request;
2. stage an exact preview and bind current state;
3. obtain the deterministic policy result;
4. return a pending proposal when approval is required;
5. execute directly only when application policy returns `automatic`;
6. accept manual execution only from an exact authenticated approval; and
7. record one receipt or a typed terminal failure.

There is no public "trust me" or caller-selected automatic-execution flag.

## Explicit exclusions

Gate 7F-0 does not:

- add Agent Mode to the browser UI;
- connect Chat or Code conversations to a real tool;
- call or switch a model;
- download Gemma or any other artifact;
- read or modify a real repository or filesystem path;
- start a shell, process, container, service, server, or background job;
- use a network or package manager;
- add PostgreSQL schema, LangGraph production graphs, Keycloak, or OpenFGA state;
- access protected, migrated, identity, learning, credential, or owner data;
- change the active Control release or its rollback predecessor;
- activate an approval profile for a customer; or
- authorize Gate 7F-1, a merge, a push, or production activation.

Cloudflare's Sandbox SDK guidance was reviewed for lifecycle and cleanup patterns, but it is not adopted
by this gate. The approved RunaAI estate is local/Windows and already has a measured MXC/QuickJS boundary;
adding a cloud container service would introduce networking, another runtime authority, and a stack
change without a failed gate that requires it.

## Hard green criteria

### Contract and authority

1. Schemas are strict, versioned, bounded, and reject extra fields, unknown capabilities, unknown
   profiles, malformed identifiers, oversized text, and caller-supplied authority results or receipts.
2. Unverified participants cannot create, inspect, approve, deny, revoke, execute, or resume a task.
3. A participant cannot access another participant's project, task, proposal, grant, denial, receipt, or
   rollback state.
4. Model output may stage only within the task's existing scope. Retrieved content and tool output cannot
   stage. No content can approve, deny, change profiles, create grants, or fabricate a receipt.
5. Project, session, environment, capability, arguments, preview state, expiry, and rollback linkage are
   included in the proposal digest.

### Policy and approval profiles

6. Every initial profile produces the fixed result described above for every registered risk class.
7. Unknown capabilities and capabilities outside a custom allowlist deny before executor access.
8. Manual approval binds the verified participant and exact proposal digest and is single-use.
9. Session/project allow and deny choices bind exact scope, deny overrides allow, and revocation takes
   effect before the next proposal.
10. Neither safe nor full autopilot can escape the synthetic environment or enable an absent capability.

### Execution, receipts, and rollback

11. No mutation occurs before an automatic policy decision or exact manual approval.
12. Stale workspace revision or content digest refuses without mutation or receipt.
13. A successful effect produces one deed and one public receipt. Duplicate, concurrent, restart, and
    delivery-retry paths return the same receipt without a second deed.
14. Failures before effect create no receipt; simulated failure after effect but before record restores
    the exact prior synthetic state.
15. Public receipts contain no file content, objective text, private rollback snapshot, or model output.
16. Rollback is a second proposal and receipt bound to the forward receipt. It refuses if current state no
    longer matches the recorded forward postcondition.

### Continuity, audit, and containment

17. A synthetic snapshot/restart preserves task lifecycle, proposals, grants/denials, receipts,
    idempotency, private rollback state, and workspace revision exactly.
18. Cancelled or completed tasks cannot stage or execute new work.
19. Audit output contains only allowlisted counts, types, risk classes, policy results, and pseudonymous
    identifiers; it contains no objective or file content.
20. Gate 7F production modules import no filesystem, child-process, network, Git, model/provider, browser,
    Keycloak, OpenFGA, DPAPI, or Control deployment module.
21. The focused suite, full repository suite, and `git diff --check` pass. The active Control release and
    both source/reference repositories remain unchanged.

## Stop conditions

Stop before continuing if any test can make a real machine effect, if model/retrieved/tool content creates
authority, if an approval or receipt can cross participant/project/environment scope, if a duplicate can
repeat a deed, if rollback can overwrite changed state, if public evidence retains content, or if the
implementation requires a model download, network, persistent service, protected data, or production
change.

## Review boundary

The steward's 2026-08-26 direction authorizes design, implementation, tests, documentation, and local Git
commits for Gate 7F-0. It does not authorize a model download, network or persistent-service activation,
protected-data access, production deployment, merge, or push. Those remain separate boundaries under the
repository instructions.
