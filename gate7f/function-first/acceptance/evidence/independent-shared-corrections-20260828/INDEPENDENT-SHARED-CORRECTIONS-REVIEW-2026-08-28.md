# Independent shared-corrections review — 2026-08-28

Reviewer: `codex-independent-model-role-review-20260828`, a fresh independent agent and author of neither the planner nor the model adapter.

This review reads exact committed objects. It does not change the frozen `9556ed0` baseline evidence or any grade, qualify a model, authorize production, or make a broader M1 or 17-family readiness claim.

## Finding: whole-plan receipt preflight needs one targeted correction

Criteria `f8a171479508a9cf56969ccea76b32ccd7abd78d`; implementation `5a1f0c2472ae8a4dba5cfcc6e6caf4eb6ff57be4`.

The new preflight correctly validates all proposed steps in a fresh authority transaction before retaining the plan. It reuses the service's receipt integrity, task/environment ownership, current-revision, rollback-target, changed-path, grant-path, and grant-suite enforcement. Invented, foreign, corrupt, stale, out-of-path, out-of-suite, future-invalidated, and project-drift cases stop before a new proposal or effect. Per-proposal authorization remains intact.

One receipt-supply filter is incomplete. `tasks/orchestrator.mjs` derives `permittedProposalIds` with a predicate that checks `proposal.arguments.path` and `proposal.arguments.suiteId`. A `project.restore` proposal has only `receiptId` in its arguments; its affected paths are stored separately in `proposal.restorePaths`. Consequently, a current receipt produced by restoration under a wider grant can be shown to a later narrower grant's planner even when those paths are outside the narrower grant.

This is not an execution or containment bypass: the fresh `service.resolveArguments` call recomputes changed paths and rejects an attempted restore before plan retention, proposal creation, or dispatch. It nevertheless misses the fixed criterion that receipts supplied to the planning attempt are scope-filtered.

Remediation: require every `proposal.restorePaths` entry to be inside the current grant when selecting receipts, while retaining the fresh service preflight. Add a real disposable-PostgreSQL regression that performs apply then restore under a wider grant, rebinds a narrower grant, confirms the restoration-produced receipt is absent from planner input, and confirms a guessed ID creates no proposal or effect.

Disposition: targeted correction required before treating the whole-plan criteria as fully met. Existing fail-closed effect behavior remains intact. Deterministic planner/executor fixtures do not prove actual-model compliance.

## No blocking finding: native evidence-output schema

Criteria `063354417c3ca0be93100ef62231dd85acee9b06`; implementation `801a8c3e6306417ff25446195e89c2ceade095f7`.

The implementation uses one static application-owned schema for evidence-bearing responses and leaves ordinary chat and Code answers plain. The same canonical wrapper is enforced at the Home request guard, while the application retains exact output-shape checks and downstream citation membership/hash checks. The structured-output option is per request; simultaneous evidence/plain tests show no format-state leakage. `maxRetries: 0` reaches the generation settings boundary.

I independently matched every retained artifact and source pin in the manifest to the corresponding Git blob. Retained evidence reports 79/79 application checks and 162/162 native checks. The final wire, application TAP, and native TAP hashes are respectively `2b83f61cb6579f824871608c26a0a20a5cbc9abad24e8168e1c4e8ac19066a55`, `efe53e2a1b44b9ffd3e0277e27fa22f9670c5ed442c0c672f2dd72ef75133e87`, and `e0e7910930239867d282d6ea0d1734a705b4db5d0b76333ca2fa4c09bc4cd530`. Before, after, and final 429/500 probes each record one HTTP request, so the correction does not rely on an unsupported claim that the old path retried.

Boundary: the upstream responses were synthetic and no models were called. This proves installed Mastra/SDK transport, strict rejection, cancellation, and cross-request isolation—not model grammar support, evidence truth, citation quality, or qualification.

## No blocking finding: shared request coverage

Criteria `c09137cee54bbc9caf7fc06c275f5f048b266ae5`; implementation `793ebc43757159a28551389fe7e669eca2a344c5`.

The four new instructions are generic, identical across candidates, and contain no evaluator case, expected answer, model-specific fact, scoring rule, or authority expansion. They preserve continuing user constraints, exact output framing, material requested details, and explicit unknowns while keeping current-request primacy and treating prior assistant/source text as non-authoritative.

The 12 actual SDK/HTTP paths span three candidate profiles and ordinary chat, guarded local chat, selected workspace evidence, and review. They verify one request, unchanged current message/history/source content, exact role/model/token/reasoning selection, no tools, evidence schema only on selected evidence, and denial of a safeguard-disable request before another provider call. I independently matched all retained artifact/source pins to their Git blobs. Retained evidence reports 91/91 with TAP SHA-256 `4045f2f6cc87e305f00525d2905b35042004bf9de9a6b6b853a9f6fbae9bd59a` and wire SHA-256 `6dac91199c38eec527378f1591a65f9954fde8eb742ebee2489c1d597084a68f`.

Boundary: synthetic text proves instruction transport only. It does not prove that any model follows the instructions or repairs the frozen baseline omissions. Fresh sealed qualification remains required.

## Independent triage of three full-suite failures at `b0267f0`

These classifications are diagnostic and do not waive a failed suite.

1. `control/deployment/watchdog.test.mjs` observation timeout: full-suite concurrency/test fragility is the leading classification, not a demonstrated safety defect. The test has a hard 10-second observation wait while native Node-to-host-to-PowerShell-to-C# work and 4–7-second synthetic deadlines compete with other native, Caddy, and CIM suites. The observed failure was fail-closed with no side effect. Remediation: run the native watchdog file serially (`node --test --test-concurrency=1`), observe the host-started state, then allow request deadline plus bounded settlement for the terminal observation. Do not weaken the safety assertions. Repeated isolated failure becomes a real availability defect.

2. `control/deployment/wire-fixture.mjs` `wire-source-drift` (`tls-proxy.mjs` working SHA-256 `9d5068…`, expected `1c063e…`): stale/shared-checkout byte provenance, not TLS behavior. Commit `1daed25` deliberately moved the pin from working CRLF bytes to canonical Git LF bytes and requires `-text`; the shared checkout predated that attribute state. Remediation: run exact-byte publication/wire tests only from a fresh clean worktree or archive at the tested commit and require Git blob, working file, and archive bytes all equal `1c063e…`. Do not add normalization or accept both hashes.

3. `home-runtime/runtime-installation.test.mjs` `New-ScheduledTaskSettingsSet: Access denied`: environment-permission integration plus test coupling, not a parser/file-helper defect. The PowerShell helper test constructs Task Scheduler CIM settings even though it creates no task; the same retained suite passed 156/156 under the intended elevated identity after initially recording 155/156 on Omen. Remediation: keep pure PS5/parser/file-helper checks deterministic with a disabled-settings fixture, and move actual Task Scheduler settings construction into an explicit integration check run under the intended installation identity. Until that integration passes in the deployment envelope, preserve it as missing environment proof rather than a code pass.
