# M1-S2A conversation, Settings and system-status criteria — 2026-09-02

Status: frozen implementation and acceptance criteria; implementation is not claimed by this record.

## Planning identity

- Roadmap revision: `2026-08-28.1`.
- Retrieved roadmap digest: `910d54e9120d67f8641cfa2e0f3a83433fb9b5ffbdd6fdbe92674a8a632bdd1a`.
- Milestone and slice: M1 / M1-S2A.
- Capability subsets: C01 conversation and writing, C02 context and memory, C12 task state,
  C15 complete working interface and C16 actual-system status.
- Predecessor: the single-canvas Gemma-primary workspace checkpoint at `f49db12`.

## Customer outcome

An ordinary signed-in user can manage the lifecycle of a conversation, open a real Settings surface,
and see an honest Omen -> Control -> Home status explanation without leaving the primary RunaAI canvas.
The application must distinguish implemented controls from planned connections and must never infer
device, model, lease or authority health from the page merely loading.

## Included behavior

1. Conversation history supports bounded search, rename, archive, unarchive, recoverable delete,
   branch, export, retry and cancellation of an in-flight browser request. Every mutation is scoped to
   the authenticated participant and exact Chat or Code experience. Delete is a soft deletion that old
   releases also hide; no turn or receipt is physically removed in this slice.
2. The left rail exposes Search, Projects, Files and artifacts, Tasks, Connections and Settings inside
   the same workspace. Unimplemented views say exactly what is unavailable and do not advertise an
   executable connector or task.
3. Settings has the accepted information architecture: General; Appearance and accessibility;
   Account and privacy; Memory and personalization; Models and routing; Systems; Connections;
   Approvals; Advanced diagnostics. Only allowlisted low-risk preferences are editable in this slice.
   Fixed or unavailable capabilities render as status, not interactive decoration.
4. Editable preferences persist in PostgreSQL for the authenticated participant and are validated on
   both client and server. The initial allowlist is theme, text size, density, reduced motion and default
   intelligence level. Unknown keys and values fail closed. Existing governed proposal/approval behavior
   for intelligence level remains available and is not weakened.
5. The system-status endpoint composes fresh application runtime and readiness observations. It reports:
   the browser seat as a request-local client observation; Control release, commit, authority, artifact
   and dependency state; and Home provider reachability plus configured model identity. If a Home lease
   or exact resident-model observation is unavailable, it says `unknown`; it never turns provider HTTP
   reachability into a lease or residency claim.
6. Models and routing names Gemma as the fixed primary for the five bounded M1 functions. Per-function
   model selectors remain absent from the ordinary UI. Comparison models remain tabled.
7. Connection rows for Local folders, Local Git, GitHub and Web research are honest lifecycle records.
   This slice may show `known` or `not configured`; it must not claim `connected`, `tested`, `enabled` or
   `use-approved` before the later real connector slices pass.

## Security and persistence boundaries

- All new read and mutation routes require an active ordinary session, the existing exact-origin and
  workspace headers, personal relationship authorization and `no-store` responses.
- User-controlled labels and queries are bounded and reject control characters. Search never returns
  another participant's title, project or chat identifier.
- Settings contain no credential, endpoint, protected profile field or machine path. Credential and
  connection setup remain separate governed work.
- Browser cancellation means the client stopped waiting. It makes no claim that a provider request was
  cancelled unless the server returns a trusted cancellation outcome. Successor work remains blocked
  while an effect outcome is unknown.
- Existing encrypted chat/title envelopes remain authoritative. New preferences use the existing
  participant-settings authority; no browser storage or second settings store is introduced.
- The source and Control predecessor remain rollbackable. No production routing is changed by local,
  deterministic or shadow validation.

## Deterministic acceptance

1. Authenticated CRUD tests cover rename, archive/unarchive, soft delete, branch and export projection,
   including wrong participant, wrong experience, archived/deleted and duplicate-request cases.
2. Search returns only bounded matching current-user records and cannot disclose encrypted values.
3. Settings tests cover defaults, persistence, every allowlisted value, unknown key/value rejection and
   cross-participant isolation.
4. HTTP tests prove exact-origin/session/workspace protection for every new route and `no-store` on
   successful and failed responses.
5. System-status tests prove Ready, Degraded and Unavailable compositions and explicitly reject false
   Home lease/residency or Omen device-health claims.
6. Browser presentation tests prove the primary canvas remains usable at desktop and phone widths,
   Settings is keyboard reachable, in-flight Stop is truthful, and unavailable connection/task states
   contain no active execution control.
7. Existing Gate 6B, Gate 7A-D, Gate 7E, M1 function-routing, roadmap and tracked suites remain green.

## Actual-system and release acceptance

After deterministic success and independent review, build the exact committed release and deploy it to
Control under the existing rollback-protected successor mechanism. Verify the exact running commit,
artifact and Gemma configuration; run the new Settings/system-status and conversation journeys through
an ordinary Omen browser session; verify Home model lifecycle and cleanup for the model-backed journeys;
retain receipts; and confirm rollback remains available. Any actual failure halts this acceptance gate,
receives an RCA and corrected method, and resumes at the failed gate only.

## Explicit exclusions and next slice

This slice does not grant local-folder, local-Git, GitHub, web, file upload, arbitrary command, terminal,
commit, publication, deployment, schedule, voice or desktop-control authority. It does not qualify a
model. The next slice implements authorized local folders and local Git read-only using the actual
Omen/Control software boundary, followed by Research/Code/artifact work surfaces and governed changes.
