# M1-S2A conversation, Settings and system-status implementation results — 2026-09-02

Status: implementation, local verification and independent P0/P1 review complete. Deployed Control
acceptance remains required before release or production routing.

## Bound scope

- Roadmap revision/digest: `2026-08-28.1` / `910d54e9120d67f8641cfa2e0f3a83433fb9b5ffbdd6fdbe92674a8a632bdd1a`.
- Branch: `codex/m1-gemma-primary`.
- Product predecessor: `f49db12`.
- Frozen criteria commit: `915eb2c`; Stop-display contract amendment: `ee5ef1c`.
- Criteria: `M1-S2A-CONVERSATION-SETTINGS-SYSTEM-CRITERIA-2026-09-02.md`.
- No model campaign, inference request, protected-data read, Control deployment or production routing
  change was performed by this implementation check.

## Implemented

1. The authenticated single-canvas workspace now exposes Search, Files and artifacts, Tasks,
   Connections, Settings and Archived conversation entry points without reinstating permanent function
   tabs.
2. Participant-scoped conversation management supports bounded title search, rename, archive,
   unarchive, deterministic branch, browser export and recoverable soft deletion. Deleted records are
   hidden from old and new navigation/read paths; no conversation turns are physically removed.
3. Branching creates a fresh encrypted chat/turn context. It takes a PostgreSQL share lock on the source,
   checks the exact retained revision and contiguous zero-based turn sequence, and commits the copy in one
   transaction. Rename/archive/unarchive/delete report success only after a one-row compare-and-set.
4. Settings has the accepted product information architecture. Theme, text size, density and reduced
   motion are directly editable low-risk preferences; the default intelligence level remains governed by
   the existing proposal/approval path. Values persist in the existing participant settings table.
5. The authenticated system view composes a fresh request-local browser observation with Control release,
   commit, authority and dependency state plus Home provider reachability/configured-model state. Home
   lease and residency remain `unknown` unless separately observed.
6. Local folders, Local Git, GitHub and Web research are visible only as honest lifecycle records. They
   expose no Connect, Enable or execution control in this slice.
7. Browser Stop hides progress while preserving the one original request. Send, navigation and right-rail
   work controls remain blocked until that request returns; a browser timeout or connectivity failure leaves
   successor work blocked rather than inventing provider cancellation or silently repeating the model call.

## Verification and failure accounting

- Focused product-foundation contracts: 12/12 passed after independent-review corrections.
- Cross-gate product subset (Gate 6B, ordinary access, customer journey, shell, navigation, Gate 7E and
  the new product tests): 91/91 passed after independent-review corrections.
- Roadmap retrieval and coverage: 15/15 passed after independent-review corrections.
- The owned disposable PostgreSQL proof passed 25/25 checks. It began with the exact predecessor
  `participant_settings` constraint, retained the existing governed value and revision, migrated the
  constraint, accepted the new preference value, exercised participant-scoped lifecycle/settings and
  branch/provenance behavior, restarted the database, proved fail-closed database loss, and removed its
  owned database. It changed no production data and made no model call.
- Rendered browser behavior checks used the current HTML/CSS/JavaScript with a synthetic local API only.
  They verified the main workspace, Settings, Systems, Connections and conversation actions; a delayed
  Settings response could not overwrite a newer Connections view; and Stop kept successor controls blocked
  until the same delayed answer returned. This is browser behavior evidence, not model, release or deployed
  actual-system acceptance evidence.
- The restricted full tracked run recorded 1,984 passes, four failures and 78 intentional environment
  skips. All four failures were in `control-exact-regression.test.mjs`: the restricted process could not
  set a disposable ACL or confirm termination of its disposable Windows process tree. The exact file was
  rerun once in the required unrestricted Windows context and passed 31/31, including all four failed
  cases. These were environment/method results, not application or model failures; the full suite was not
  blindly repeated.

The first independent review returned NO-GO with four P1 findings: stale asynchronous view rendering;
unreconciled Stop semantics; rename overwriting migration provenance; and insufficient PostgreSQL/browser
evidence. A second pass retained P1 findings for stale archived restore, a predecessor-schema migration gap,
and criteria/results text that no longer matched the corrected Stop design. Publication remained paused;
each correction passed the focused deterministic, browser-behavior and owned-database checks before the
final independent review. The final publication re-review returned GO with zero P0 and zero P1 findings;
it made no model call or production change.

Two browser-development defects were also found and corrected before publication: DOM dataset keys incorrectly
used hyphenated JavaScript property names, which stopped preference application after Theme; and select
construction could leave the first option visible instead of the persisted value. The repaired preview
showed all four saved values and a complete dataset. Long system identifiers also received bounded wrapping.

## Not yet accepted

- The actual Control database has not been changed or exercised by this source. The predecessor upgrade
  has passed only in the owned disposable database and remains part of the deployed Control acceptance.
- No exact committed release artifact has been built or deployed from this slice.
- No ordinary Omen browser has yet proved persisted settings, reload, branch/archive/delete recovery,
  exact live system status or rollback against the deployed candidate.
- Local folders, local Git, file ingestion, artifact creation, governed file changes, GitHub, web research,
  model comparison and the customer trial remain outside this checkpoint.

## Next gate

Commit and push the exact independently reviewed source, then use the rollback-protected successor path
for an actual Control candidate. Run the frozen ordinary-browser/database journeys once.
Any actual failure halts that gate for retained RCA and correction before a retry. After M1-S2A actual
acceptance, freeze and implement the authorized local-folder and local-Git read-only slice.
