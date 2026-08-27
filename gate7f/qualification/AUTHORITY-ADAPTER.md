# Qualification-only task authority adapter

This synthetic adapter extends beside the frozen Gate 7F foundation. It imports the existing
foundation service, policy, memory repository and synthetic executor without changing their files.
It creates no actual files, executes no model-generated code, opens no network connections, and
does not change production or either model. Tests use synthetic in-memory projects and identities.

## Trust and scope

`createQualificationAuthority()` returns a trusted `application` port. Application code must obtain
the actor/session/project/environment from its authenticated server context, **not model output**.
Never expose this port, the grant issuer, test fault options or snapshots as model-callable tools.
This module is not an authentication service. Its in-memory snapshots are trusted synthetic test
fixtures, not a new durable authority; production persistence remains PostgreSQL/LangGraph.

An application-created grant binds the task, actor, project, session, synthetic environment, exact
relative paths, registered capabilities, exact typed-argument alternatives, expiry and revision.
The selected profile remains the existing foundation profile. Read-only denies mutations; manual
approval is still required by ask-every-time; preapproved profiles can perform matching operations
without unnecessary prompts. A remembered allow never overrides the grant's path/argument bounds.

The model receives only a bound proposal port. It cannot supply a new actor, origin label, grant,
approval, profile or receipt. Arguments are copied before queueing. At the actual synthetic effect
boundary the wrapper rechecks current grant revision/revocation/expiry, scope, exact request binding,
task binding, workspace revision, and the current existing policy. A remembered deny added after
staging therefore prevents an older pending approval from executing. All verification assertion paths
are checked; restore resolves and checks the actual same-grant receipt path rather than trusting a
path omitted from its arguments. An old port or pending proposal does not survive a grant revision.

**Bounded guarantee, not semantic intent recognition:** these grants accept only predeclared exact
argument alternatives. That closes the demonstrated synthetic case where untrusted tool text asks
for another file or unauthorized content. It does not prove that arbitrary model-generated source is
safe just because its path is allowed, nor that a deterministic checker understands all user intent.
General transformation grants, arbitrary codework, and real executors need their own design/tests.

## Integration API

```javascript
import { createQualificationAuthority } from './authority.mjs';

const app = createQualificationAuthority({ now: () => new Date() }).application;
app.seedProject({ projectId: 'project-a', participantId: 'member-a',
  files: { 'README.md': 'before' } });
const context = { actorId: 'member-a', projectId: 'project-a',
  sessionId: 'session-a', environmentId: 'qualification-a' };
const grant = app.createGrant({
  taskRequest: {
    schemaVersion: 'runa2-agent-task-create-request/v1', requestId: 'task-a',
    participant: { principalId: context.actorId, verified: true },
    project: { projectId: context.projectId }, session: { sessionId: context.sessionId },
    environment: { environmentId: context.environmentId, environmentKind: 'synthetic-memory' },
    profile: { id: 'safe-autopilot' }, objective: 'Set README.md to after.', origin: 'user-request',
  },
  allowedPaths: ['README.md'],
  rules: [{ capabilityId: 'workspace.apply-synthetic-change',
    exactArguments: [{ path: 'README.md', content: 'after' }] }],
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
});
const modelPort = app.bindModel({ ...context, grantId: grant.grantId, revision: grant.revision });
const outcome = await modelPort.propose({ requestId: 'turn-1', proposal: {
  capabilityId: 'workspace.apply-synthetic-change', arguments: { path: 'README.md', content: 'after' },
} });
const state = app.state({ context, grantId: grant.grantId, proposalId: outcome.proposal.proposalId });
```

`modelPort.propose` accepts only `{requestId, proposal: {capabilityId, arguments}}`. Results retain the
foundation shape `{proposal, receipt, delivery, replayed}`. Scope and malformed-request errors have
deterministic `qualification-*` codes; underlying execution/failure codes remain `agent-*`. An error
or denied proposal is an application-containment outcome, **not a passing model-quality answer**.

Additional application-only operations:

- `approve({context, grantId, revision, proposalId, proposalDigest})`: exact once-only approval.
- `reviseGrant({context, grantId, revision, allowedPaths, rules, expiresAt})`: explicit replacement;
  advances revision and invalidates old bindings. It may renew an expired but not revoked/cancelled
grant. New exact receipt arguments can be granted for a synthetic restore after a forward effect.
- `revokeGrant({context, grantId, revision})` and `cancel({context, grantId, revision})`: fail closed
  for old ports/pending approvals; cancellation also terminates the foundation task.
- `setPreference({context, grantId, revision, capabilityId, decision, scope})`: delegates existing
  remembered-policy behavior only for a granted capability; never expands its exact argument scope.
- `state({context, grantId, proposalId?})`: reads actual repository receipts, not supplied prose.
- `workspace({actorId, projectId})`, `auditSummary()`: trusted synthetic test observation only.
- `exportSyntheticSnapshot()`: refuses while the adapter has pending queued work; returns an in-memory
  snapshot accepted by `createQualificationAuthority({snapshot, now})` to test restart behavior.

Factory `testFaults` maps external request IDs to existing foundation fault flags
`failBeforeEffect`, `failAfterEffectBeforeRecord`, or `interruptAfterRecord`. It is test-only trusted
configuration, not model input. No filesystem or network persistence is introduced by any method.

## Honest continuation and validation

State projections report `pending-approval`, `recorded`, `verification-failed`, `failed`, `denied`,
`record-missing` or `record-invalid` as appropriate. `recorded` means an actual synthetic executor
receipt exists and validates against its bound proposal; it does not mean a separate verification
step passed. Failed verification receipts stay failed. A proposal marked executed without a valid
receipt never becomes an execution assertion. `receiptMatchesCurrentWorkspace` distinguishes a
historical receipt from the current workspace; a later rollback does not erase the forward receipt.
Workspace revision advances only from the grant's own verified effect receipt, once per receipt.
It never adopts the live workspace revision from another grant's intervening work during asynchronous
receipt delivery. A replay of an older own receipt likewise cannot regress the current grant revision.

Tests cover missing/forged grant references and authority fields, every bound identity dimension,
wrong paths and content, unknown operations, verification/restore scope, benign read-only/manual/
preapproved flows, current policy changes, exact replay, concurrent duplicates, cancellation, stale
revision, grant expiry/revocation, caller mutation, restart, before-effect failure, atomic rollback,
interrupted receipt delivery, historical/current receipt state, and missing/corrupted receipts.

Verification: `node --test gate7f/qualification/authority.test.mjs` — 33/33 tests passed on 2026-08-27.
`node --test --test-reporter=tap` — 545/545 passed (527 subtests) in the isolated authority worktree.
Independent review found the intervening-grant receipt-settlement race; a new test reproduced the
failure before the receipt-bound revision correction and passed afterward. Full-suite and final
independent-review results are recorded by the integrating root agent. No sealed v1/v2
file was modified. No remote host access, dependency installation, push or merge is performed here.

Checkout note: the fresh authority worktree materialized existing sealed files with CRLF while their
Git blobs are LF. The standalone v1 raw-byte verifier therefore reports five hash mismatches here;
all five hashes match after read-only LF normalization, and Git shows no sealed-source changes. That
is source-equivalence evidence, not a substitute raw-byte seal pass. The integrating agent must verify
the exact original seals in the preserved evaluation worktree before running or claiming acceptance.
