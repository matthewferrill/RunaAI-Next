# M1-S2 customer recovery and private evidence

Implementation/test record, 2026-08-28. This is part of the existing M1-S2 contract,
not a new milestone, model acceptance, deployment, or completion of the wider roadmap.

## Scope and integration

The implementation worktree starts at `6eabccec48856e924770410474c35bb805ed507b`.
Its four browser files and initial panel tests were copied from the root agent's
uncommitted M1 surface at root baseline `fe213a3e23f19f98e29126ddd14c7f96793ec107`.
Only those known initial versions should be replaced during integration; preserve
other root work. The backend M1 surface and task orchestrator are integrated separately.

- Saved task/run catalogs come from the authenticated project-scoped server. Opening,
  listing, or refreshing them is read-only. The UI does not restore execution permission.
- Continuing a reopened task requires an explicit profile choice and fresh grant.
  Old approvals cannot silently transfer to it. Standalone undo proposals can also
  reopen and be proposed again under the new grant.
- Exact captured task/run/proposal/grant/receipt IDs and scope/view generations prevent
  late callbacks from changing a newly selected task or project.
- Approval, revocation, cancellation, uncertain-action reconciliation, and undo are
  separate controls. Reconciliation observes an uncertain effect; it does not retry it.
  Undo proposes the exact current receipt through the same governed pathway.
- Code task and Guided task select the configured `code` and `agent` roles, respectively,
  with the same bounded capability grant. `run.start` receives `workflow` explicitly.
- Retained source indexing is retried with `{sourceId,contentSha256}`. A lost attachment
  response reuses its original request ID while the same draft remains selected.
- Incomplete/dependency-unavailable replies do not become local authoritative history.
  A revision-conflict reload reports success only after it actually loaded; both failure
  and success preserve the user's draft without automatically replaying it.

## Evidence and privacy

`conversation-evidence.mjs` retains bounded application-produced source references,
exact content hashes, retrieval/omission status, grounding, citation matching status,
completion metadata, and a non-execution stamp. It excludes duplicate source text,
model identifiers and model-written execution claims. New evidence is encrypted in
the existing private chat-turn envelope. Historical turns lacking metadata return
`evidence:null`; the UI explicitly says their historical evidence is unavailable.
Source references are not presented as proof that every model claim is correct.

The independently identified plaintext reply cache is fixed in
`PostgresRequestCoordinator`, not by hiding the visible answer. New cache entries go
only to `runa_runtime.route_responses_v2.response_envelope`, using the existing core
cipher. Authenticated context binds operation, request ID, actor, and the exact request
digest. Missing cipher, scope changes, envelope tampering and row-scope tampering fail
closed before inference is repeated.

`PostgresSelectedContinuityStore.initialize()` creates the new table non-destructively.
Every coordinator constructor now requires `{pool,cipher:coreCipher}`. The integration
composer and its test runner must pass that cipher. The old plaintext namespace remains
untouched for old-release rollback; the new coordinator neither writes nor trusts it.
This does **not** claim old plaintext cache rows have been remediated or deleted.
An old in-flight request is not silently promoted into the new cache namespace; a
conversation revision conflict must be reloaded and reviewed normally.

## Verification

- Full default suite on this implementation branch: **833/833**.
- Existing browser plugin reported no available browser. The committed explicit browser
  runner uses installed Playwright with an isolated headless Edge context; every URL is
  intercepted and unknown URLs are aborted. No live user session, model, external API,
  Home/Control service, persistent browser profile, or network server participates.
- `function-panel.browser.mjs`: **13/13**, real DOM interaction over the shipped panel and complete
  chat page. Covers reopen, exact approval, scope changes mid-request, explicit profile
  rebind/revoke, standalone undo recovery, Code/Guided selection, retained index retry,
  lost attachment response, cancellation/reconciliation/undo, safe source rendering,
  incomplete answers, and successful/failed conflict reload. This proves browser
  plumbing with synthetic APIs, not model or end-to-end production acceptance.
- `conversation-evidence-postgres.mjs`: **11/11** checks against the root-owned disposable
  synthetic PostgreSQL. Exact evidence survives adapter reopen; private metadata and
  replies are encrypted; historical missing evidence is explicit; foreign actors and
  altered request/envelope scope fail closed; cache hits do not call inference again.
  New fixture rows have UUID-scoped synthetic identities. No schema was dropped and
  the parent-owned PostgreSQL service was not stopped.
- Existing sealed model evaluation sources and their qualification evidence are unchanged.

Explicit browser command (paths point to already installed tooling):

```powershell
$env:RUNA_M1_PLAYWRIGHT_MODULE = '<installed playwright index.mjs>'
$env:RUNA_M1_BROWSER_EXECUTABLE = '<installed Chromium or Edge executable>'
node --test gate7f/function-first/function-panel.browser.mjs
```

The PostgreSQL runner requires `RUNA_M1_SYNTHETIC_DATABASE_URL` to name the explicitly
owned disposable `m1_synthetic@127.0.0.1:<port>/postgres` fixture. It refuses other hosts,
users, or databases. Parent-runner lifecycle cleanup owns those fixture records.

Remaining acceptance is integrated stack/model testing and, when ready, genuine human
customer testing. No production deployment or live model acceptance is asserted here.

## Integration correction: stamp before storage

The first constructed-response fixture proved encryption and readback but missed an
application ordering defect: Gate2 assigned `workspace` and `execution` **after**
calling the turn store. Real answers therefore would have retained null evidence.
This is corrected by assembling and schema-validating application-owned response
metadata before `recordAnswer`; only the persistence outcome and new revision are
assigned afterward. The UI and retained turn now receive identical evidence.

The expanded PostgreSQL proof is **17/17**, including actual
`SelectedCoreApplication -> Gate2ReadOnlyService -> PostgreSQL -> readChat` execution
for both Chat and Code review. It checks exact citations/evidence on reopen, no
fallback when review is disabled, and no retained evidence from fabricated execution
claims. All providers in these tests are deterministic synthetic adapters, not live
LLMs. A separate regression exercises pre-storage stamping across all six answer
lanes. The root's selected-source-required guard is preserved unchanged.
The full default suite after this correction is **834/834**.
