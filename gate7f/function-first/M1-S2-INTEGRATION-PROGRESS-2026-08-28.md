# M1-S2 integration progress — not milestone completion

The 2026-08-28 standing authorization and full roadmap remain in force. Continue until the complete
bounded customer journey is ready for the human trial; an internal test/commit is not a stopping gate.

## Implemented and verified so far

- Server-authoritative owned conversation context, per-thread revision concurrency, same-request retry,
  and harmless writing/code routing. Foreign scope is checked before provider/retrieval/cache use.
- Encrypted PostgreSQL source sections, exact project/source/content revision filtering in Qdrant,
  Nomic-compatible embedding and explicit-window BGE adapter wiring. Index repair reloads the retained
  immutable source and does not need the user to re-enter private text. HTTP success alone cannot mark
  an unsuccessful Qdrant operation ready.
- PostgreSQL-owned encrypted tasks, grants, proposals, plans, receipts and uncertain-effect recovery;
  LangGraph checkpoints; real immutable Windows files and the unchanged MXC/QuickJS executor.
- A disabled-by-default versioned M1 release feature and five explicit model-role bindings. Its request
  controls are release-digest-bound and applied at the transport layer, not by a textual prompt. No
  legacy release configuration silently enables tools, review, another model, or another permission.
- Authenticated ordinary-user HTTP surface with origin/marker/session/owned-project checks. Runtime
  dispatch and publication recheck the actual session and ownership; logout or restart cannot preserve
  an old in-memory permission. Grants remain scoped to the exact session and capability-set digest.

Focused source/surface checks passed 29/29. Planner/provider compatibility and request-control checks
passed 42/42. Actual HTTP authority checks passed 6/6. The source/PostgreSQL integration initially
passed 11 checks; its additional index-repair revision checks are included in the continuing rerun.

Task component verification is in `tasks/RESULTS-2026-08-28.md`; actual Control proof is retained in
`tasks/CONTROL-NATIVE-RESULTS-2026-08-28.json`. The latter passed 6/6: actual inspect/fail/edit/pass/restore,
hard process crash and single reconciliation, cancellation with retained execution evidence, absent
host/network interfaces and escape rejection, infinite-loop timeout, and excessive-output rejection.
The owned runtime, PostgreSQL and staging were removed; production Node/ACL/PostgreSQL and source
checkout were unchanged. This is execution evidence, not a model-generated prediction.

## Integration failure retained and corrected

The first two local real-Qdrant runs failed during collection creation with HTTP 500:
`Gridstore IO error: The system cannot find the path specified. (os error 3)`.
They used the deeply nested Codex worktree for native storage. Repeating the same code and dependencies
with a short owned temporary storage parent passed all 7 checks. This supports a Windows/native storage
path-depth cause; it does not establish a universal maximum path length for Qdrant.

The passing run used real PostgreSQL 18 and Qdrant 1.19.0, but embedding/reranking HTTP test doubles.
It verifies exact scope/revision filtering, acknowledgement, idempotency, canonical store isolation and
transport composition. It is explicitly **not** Nomic/BGE model proof. Both failed runs and the passing
run stopped and removed their own disposable services/data. Existing collections were never deleted.

## Integrated verification checkpoint (2026-08-28, 12:08 EDT)

At integration commit `4818e7f`, the complete default suite ran 947 checks: 908 passed,
39 explicitly skipped database-dependent checks, zero failures. The 39 task/contract/
PostgreSQL/LangGraph checks were then run with the owned loopback PostgreSQL and all passed,
with zero skips. `conversation-evidence-postgres.mjs` passed 17/17, including actual
application -> Gate2 -> PostgreSQL -> reopened Chat and Code review answers. Metadata is
stamped and schema-validated before persistence. Fabricated execution evidence is not saved.
The encrypted v2 reply cache has no plaintext fallback; old release rows remain untouched.

An overly broad local test invocation also selected the native MXC integration tests without
their dedicated runtime staging. It failed closed (`unavailable`, including the expected
`output-limited` assertion), not as a successful execution. Do not treat the repository root
as a prepared MXC runtime or relax host ACLs to make that invocation pass. The dedicated,
isolated Control runner remains the authoritative 6/6 native proof and will be rerun through
the actual acceptance host with its own prepared runtime.

The in-app browser is available to the integration agent. The loopback-only `ui-fixture.mjs`
serves the shipped complete interface with clearly labelled in-memory synthetic responses;
it has no credentials, model, database or execution adapter and expires after 15 minutes.
Observed in the real browser: separate Chat/Code navigation, reopening saved citations,
an unavailable index retaining its source and becoming selectable only after explicit retry,
and reopening a saved task without inheriting permission to execute. This is UI plumbing
evidence, not an authenticated live-stack/model success claim. The separate agent's 13/13
isolated browser checks remain described in `M1-S2-UI-AND-PRIVATE-EVIDENCE-RESULTS.md`.
The same browser verified fresh profile selection before showing exact-action approval,
revocation removing that approval, and mode-specific descriptions distinguishing drafts,
selected-source research/review and real governed disposable work. No console warnings or
errors were observed. The three-pane desktop layout was inspected visually without document
horizontal overflow. The temporary tab was closed. The owned PostgreSQL lifecycle finished
and verified stop/removal of its own data; no production stores were removed.

The prospective acceptance bundle is now committed: 40 distinct tasks (eight in each of the
five functions), three repetitions per candidate across all three models = 360 planned task
attempts, plus 12 separate product controls. Cases, failures and denominators are retained;
an unsupported harness action blocks rather than silently passing. Code and Agent use their
distinct bound roles. Runtime/budget sealing and actual scored inference are not yet complete.

To test those diverse projects without weakening the application surface, composition accepts
an optional **trusted constructor-only** fixture resolver and fixed host-suite registry. It is
not a release-JSON option, browser field or model tool. `project.prepare` still accepts no body
parameters, authenticates and checks scope before resolving a fixture, and passes the same
contained adapter validation. The production default remains the calculator exercise. The
13 surface checks pass, including forged fixture/suite input and foreign ownership denial.

Latest integrated rerun after mode descriptions and auxiliary integrity checks: **955 tests,
916 passed, zero failed, 39 database skips** (those task/database checks were separately run
above). The real PostgreSQL/Qdrant integration rerun passed **7/7**, with complete owned
service/data cleanup and HTTP auxiliary doubles clearly identified. Its first launch was
blocked at PostgreSQL startup inside the tool sandbox; the authorized unsandboxed rerun
succeeded. This is not being attributed to a model or rewritten as an initial success.

`OPERATOR-SMOKE.md` specifies the separate unscored actual-Mastra readiness check. Its
authoring tests prove request shapes and no-suffix transport using doubles; live results
must be recorded separately after exact runtime/resource sealing. No acceptance case is
used in that smoke, and the model/provider budgets have not been increased.

## Still in progress

Real Nomic/BGE composition; bounded live-model readiness and matched three-model functional attempts;
and the exact rollback-protected candidate/customer trial. The long-document budget and actual model
request controls must be selected from the separate readiness evidence, not inferred from HTTP 200.

Production remains `runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc` at the start-of-turn verified
baseline. This development increment does not change Control production routing, protected records,
owner credentials or the remaining 17-family roadmap. M1 remains in progress.
