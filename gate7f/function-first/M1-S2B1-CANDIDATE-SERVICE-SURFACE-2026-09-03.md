# M1-S2B1 candidate service/surface checkpoint

Date: 2026-09-03  
State: deterministic/local-integration green; actual Control/browser acceptance open

## Implemented boundary

- A candidate-only `ServerWorkspaceService` is composed only when trusted server configuration supplies the one
  selected public-Git source definition.
- `source.connect-public-git` accepts an exactly empty browser input. Repository URL, ref, expected commit,
  environment, identity, capability version, policies, timestamps, and filesystem paths remain server-owned.
- The existing authenticated `/api/m1/workspace` surface routes all seven frozen participant operation names before
  any task-orchestrator fallback. Code experience, current ordinary session/project scope, and separate
  `propose-workspace-action` authorization are required.
- Public-source connection is idempotent and stored through the encrypted PostgreSQL authority added in `2695a07`.
- Folder snapshot, materialize, list-files, read-text, cancel, and disconnect return exact unavailable states. In
  particular, unavailable materialization creates no workspace row or outbox intent.

## Verification

The focused set passes 31/31:

- 11 frozen materialization-contract checks;
- 4 local Git object/filesystem and broker-boundary checks;
- 1 real disposable PostgreSQL source/intent authority integration; and
- 15 surface routing, scope, session, and denial checks.

The independent standing checker returned PASS after confirming the complete operation map, trusted-config boundary,
effect authorization, absent-worker no-effect behavior, optional composition, and truthful unavailable states.

## Explicitly not proved

This checkpoint contains no HTTPS broker, Control worker/AppContainer/Job, protected Windows publication,
reconciliation, read/cleanup implementation, browser UI journey, production route, or model call. Recorder-based
surface tests are deterministic routing evidence only. The next increment must implement the real Control
broker/worker/publication path before any UI may imply that a workspace is ready.
