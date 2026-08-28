# M1-S2 auxiliary health capture correction — verified

Criteria were committed first at `80f42289c1472b6537a782c161497a3ec853861f`.
Implementation and smoke runner: `b3f4b42e297d7a0d6fc743a65c8b4440513fcec2`.
Roadmap digest remains `613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`;
M1-S2 is still incomplete and all 17 capability families remain.

## Correction and limits

The embedding capture now recognizes only bodyless, query-free `GET /models`,
and the reranker capture only bodyless, query-free `GET /health`. Successful
scored-mode reads forward the actual fixed upstream response, with a two-second
deadline, 64-KiB response cap, no redirects or forwarded browser credentials.
They cannot count as inference, retrieval, model-role or execution evidence.
Controls mode returns explicit unavailable health records without upstream contact.

Unknown routes, methods, request bodies, queries, absolute targets, aliases and
model-management commands still fail closed. The original POST model/role/request
seals and campaign containment-stop rules are unchanged. No frozen case, expected
answer, model prompt, denominator, score threshold, native runtime or task
authority changed.

The separate transport journal is bounded to 1,024 records and 8 MiB of retained
response bodies per transport. Further response bodies retain their exact hash
and size, not an invented response. Record overflow returns unavailable and is
counted. Close/drain exports the journal, including outside-attempt or late health
traffic, as ungraded diagnostics: `health-diagnostics.json` for a model campaign,
`healthDiagnostics` for controls. Completed attempt records are not modified.

A final size-hardening regression counts the retained response's **serialized
JSON bytes**, including escaping, against that same 8-MiB budget. Twenty-four
actual 64-KiB non-JSON HTTP responses demonstrated that live reads remain exact
while excess diagnostic bodies are omitted with their hashes/sizes retained.
The focused health suite passed **11/11** after this refinement. It changes only
diagnostic retention accounting, not health eligibility, inference or controls;
the earlier actual-browser/PG evidence below keeps its exact original source pin.

## Verification

- `node --test gate7f/function-first/acceptance/*.test.mjs`: 124 passed, zero
  failed, one existing PostgreSQL-dependent checkpoint test initially skipped.
- The same complete acceptance suite, with a newly owned loopback PostgreSQL
  instance: **125/125 passed, zero skips**. The database was stopped and only its
  disposable synthetic data removed. See
  [actual PG result](evidence/health-acceptance-pg-b3f4b42-2026-08-28.json).
- `npm run verify:roadmap`: **15/15 passed**; `git diff --check` passed.
- Focused tests include real loopback upstream GETs, exact-route negative cases,
  zero upstream calls in controls mode, redirect refusal, actual two-second
  timeout, stream-size limit, no model-role credit, exact subsequent inference,
  finite journals, drain/close and no late mutation of completed attempts.

## Actual Control application and browser smoke

Fresh owned stage:
`C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-0bfcf1a3abbe4fa897aaede2c931fee9`.
Source archive SHA-256:
`e800dc6c32d9f85ff8078f1fa42afeacf8e30e77270209cd9d6b75d5162dc4cd`.
All **1,360 extracted files** matched that archive. The linked immutable release
dependency artifact was independently verified across **30,036 files**, digest
`248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167`.
Actual package-lock, Node and Qdrant hashes are retained in the
[source/dependency proof](evidence/health-source-proof-b3f4b42-2026-08-28.json).

The unchanged shipped application, HTTP/session layer, real isolated PostgreSQL,
Qdrant, native sandbox preflight and browser assets were used. The synthetic
identity issuer is not a Keycloak qualification. All three model transports were
controls-mode: no Home contact or inference, and model-service health remained
honestly unavailable rather than synthesized healthy.

The parent operator observed the actual authenticated browser at
18:46:44.825Z, reloaded it, and observed it again at 18:47:06.884Z (**22.059 seconds**).
Both DOM observations showed `Synthetic ordinary tester`, `Chat with Runa` and
`Ready`, without the service-status-unavailable error. The acknowledgement is
bound to the exact smoke/source/host and retained with the server evidence.

This was actual initial-load and reload proof, **not an automatic browser timer
claim**: source inspection found no such timer. The smoke explicitly repeated
the real `/health/ready` endpoint every five seconds across the interval.

Result: **PASS**, 24 application status/health samples, **46 separate permitted
auxiliary health observations**, **zero provider calls and zero unexpected calls**.
Six subsequent wrong-route/method probes were all denied and retained separately
as expected negative controls. The immutable
[raw smoke result](evidence/health-app-smoke-b3f4b42-2026-08-28.json) has SHA-256
`7f87b768e7df85ac38331a7ebd1f33d786fca82075584cefaeb7be437f33229a`.

The smoke exited zero; cleanup confirmed owned PostgreSQL and Qdrant stopped,
owned runtime/synthetic data removed, and source/evidence preserved. The exact
owned loopback tunnel was closed. No production settings, stores, services,
model residency or routing changed.

## What this does not prove

This corrects the acceptance capture defect that caused the second Gemma campaign
to stop at Code08. It does not retroactively pass or regrade that campaign, prove
any model's functional qualification, or complete M1. All earlier raw records,
grades and unexecuted slots remain intact. The parent must integrate this source,
freeze a fresh common runtime seal, rerun the 12 controls and then execute fresh
three-model function attempts; the remaining product roadmap is unchanged.
