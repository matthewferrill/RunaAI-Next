# Gate 7D end-to-end flow correction results

Status: implementation, exact-Control verification, and the third rollback-protected correction
activation are complete. Control runs `runaai-next-gate7d-current-turn-2026-08-25-e10e3db` at
`e10e3db097d894d1f00b389921ceab0decaff24c`. The ordinary-user Code retest is green and Gate 7D was
merged into `runa2/integration` as `3d95e503d6e56b61c16324eba650ef0c8161b5fa`.

## Observed root causes

1. The conversation-aware classifier treated generic words including `test`, `facts`, `settings`, and
   `boundary` as project-record intent. The exact live phrase `This chat is a test` therefore called
   governed project knowledge instead of ordinary Chat.
2. An approved-knowledge delivery error was converted into customer prose before continuity decided
   whether the turn was complete. Its typed error was not in the existing incomplete-reason list, so
   the failed user/assistant pair was retained and then entered later model history.
3. Gate 2 defined every lane except `general` as requiring approved project knowledge. Standalone
   `code` therefore stopped at the knowledge adapter before its deterministic code-role provider ran.
4. Ordinary sessions retained both access and refresh credentials, but the browser session's absolute
   expiry was reduced to the short-lived access-token expiry and the refresh credential was never
   used. The eight-hour cookie could not keep the authenticated application session alive.
5. Every browser send already had a fresh request identifier. The Italy-to-France failure was not
   request replay; it remained a response-relevance defect made more likely by failed-turn history and
   by a model instruction that did not explicitly prioritize the current message.
6. Live Code subsequently proved that reaching the correct provider was insufficient. A fresh request
   invented prior `64/12` context, and the retained post-login follow-up with `14/12` returned `76`.
   The exact endpoint answered the standalone request correctly in six of six isolated probes, and
   Caddy was a stateless reverse proxy with no response cache. Replays also showed the model could emit
   code that calculates `26` while still stating `76`. The evidence therefore supports a model-output
   relevance/consistency failure, not request replay, gateway cache, provider-role drift, or a reason to
   switch models before completing the current stack.
7. The first verifier then passed the opening and `14 + 12 = 26` live turns but failed twice on the next
   `15 + 15` request. A transient exact replay produced the correct draft (`30`) 3/3 while the verifier
   misidentified the earlier `14 + 12` turn as current and proposed `26` 3/3. Correction re-verification
   rejected that stale proposal, so the application correctly retained no bad turn and showed Retry.
   A reduced prompt that retained only prior assistant responses still promoted an old code comment to
   competing authority. The defect was therefore verifier input authority, not draft generation,
   malformed JSON, timeout, storage, routing, or gateway behavior.

## Implemented correction

- General Chat now activates project retrieval only for an explicit scoped project reference or a
  strong project artifact such as repository, workspace, commit, README, or reranker. Contextual
  follow-ups inherit project intent only from an immediately preceding explicit project request.
- Standalone Code is an explicit no-retrieval conversation policy using only the selected code-role
  provider. It still has no repository, file, terminal, execution, tool, network, learning, workspace,
  or protected-record capability.
- Approved-knowledge errors now produce `turnRecorded=false`; the browser presents Retry and does not
  add the failed pair to bounded history.
- The provider instruction now names `input.request.message` as the current request and forbids
  answering an earlier question in its place. Deterministic tests prove ordering and fresh request
  identities; only live acceptance can prove model response relevance.
- Standalone Code now performs a separate bounded response verification against only the current
  request and candidate answer. The drafting provider retains bounded conversation continuity; the
  verifier receives no prior transcript capable of becoming competing authority. Mismatched values,
  contradictory results, and arithmetic inconsistency are rejected. A proposed correction is returned
  only after a second verification; malformed, rejected, or unverifiable results remain retryable and
  unrecorded. The contract explicitly recognizes correct code plus a deterministic expected output
  without claiming actual execution or formal code correctness.
- Ordinary sessions keep one bounded absolute lifetime, rotate encrypted access and refresh
  credentials when the access credential expires, serialize concurrent renewal, and preserve the
  original release binding and session identifier. Renewal verifies issuer, audience, subject,
  authentication method, expiry, and online activity before atomically replacing the encrypted
  credential envelope.
- Rejected, malformed, identity-changing, or expired renewal fails closed. A temporary identity
  outage returns a retryable dependency error without falsely saying that the session ended. Logout
  continues to revoke the latest provider refresh credential and the local session.

No PostgreSQL schema, protected product data, identity policy, Caddy configuration, network exposure,
model, dependency, or legacy checkout changed. Existing user-owned failed conversations were not
deleted. A session created by the predecessor release lacks the new encrypted renewal binding and may
require one fresh login after its old access token expires; sessions created by the successor use the
bounded renewal path.

## Verification

| Check | Result |
| --- | --- |
| Focused provider suite after current-turn correction | 13/13 passed |
| Complete repository suite | 423/423 passed; 0 failed, skipped, or cancelled |
| Exact commit complete suite on Control with required Node 22.22.0 | 423/423 passed; 0 failed or skipped |
| Isolated private endpoint: standalone opening | 6/6 correct before implementation |
| Exact source and active-release Code smoke | Opening function and retained `14+12=26` follow-up passed; verification receipts present |
| Original verifier replay for `15+15` | correct draft 3/3; stale `14+12` correction proposed 3/3, confirming RCA |
| Current-turn verifier contract | correct complete `15+15=30` accepted 3/3; stale `14+12=26` rejected 3/3 |
| Active successor integrated smoke | exact user-supplied history returned `15+15=30` with verification receipt 3/3 |
| Ordinary-browser current-turn acceptance | `15+15=30`, `115+25=140`, new four-parameter program, and retained `2+3`, divisor `2`, multiplier `10` result `25` all passed |
| Post-merge integration tree | exact tree matched the accepted branch; complete suite passed 423/423 |
| `git diff --check` | passed |

The focused coverage includes the exact observed Chat phrase and follow-up, explicit project routing,
standalone Code with the knowledge adapter unavailable, non-persistence and browser retry for knowledge
errors, consecutive Italy/France request ordering, provider current-message instructions, Keycloak
refresh exchange, concurrent one-time renewal, encrypted atomic credential rotation, unchanged absolute
expiry, transient retry, refresh rejection, issuer/audience/subject/method mismatch, session expiry,
online profile verification, logout, existing navigation, origin enforcement, participant/project
isolation, record reopening, and rollback contracts.

## Control activations

The second correction release at `16adbca` remained the exact automatic rollback target while the
current-turn failure was diagnosed. The third exact immutable successor has artifact digest
`53cd635b046ea0b47ca4eaa2505104a28bc27982238f0a8a6033940d007a1e8d`, 29,511 artifact files,
configuration digest `b1d1f9cb5e8524f8318fa428bfe0d107747b4996647f8f6111cba65746b75020`, and manifest digest
`787c98f5de951006d08d2420e779c948c9c5e40f2d8c3f286024548fe06c03b1`.

The guarded deployer verified every staged hash, the immutable artifact, active predecessor pins,
unchanged protected configuration, Keycloak owner binding, ordinary and owner routes, selected-core
authority, protected import, public presentation contract, and rollback readiness before success. An
independent post-check confirmed closed cutover, active authority, all dependencies ready, the exact
commit and artifact running, canonical HTTPS status 200, JavaScript status 200, all page/controller
markers, trusted TLS, and clean correction, integration, and legacy checkouts.

The selected-core authority, imported data, identity policy, model, service identities, network
exposure, and legacy checkout did not change. The second correction release remains the exact automatic
application rollback target. Aggregate evidence is retained in
`gate7d/GATE7D-CURRENT-TURN-VERIFIER-CONTROL-ACTIVATION-RESULTS-2026-08-25.json`.

## Ordinary-browser acceptance

The ordinary-user report passed Chat creation, reopening, switching, Italy-to-France relevance,
logout/fresh sign-in, the Code opening, and retained `14 + 12 = 26`. After the current-turn successor
activated, the same browser session returned:

- `15 + 15 = 30`;
- `115 + 25 = 140`;
- a new JavaScript `calculate(a, b, divisor, multiplier)` program with correct examples; and
- `((2 + 3) / 2) * 10 = 25` in the retained follow-up.

No incomplete-response retry or stale prior values appeared. This satisfies the last Gate 7D browser
criterion and authorizes the reviewed correction chain for merge. Model/provider changes and real
code-work capabilities remain separate later decisions.

## Source merge

The accepted branch was a clean descendant of the current remote integration branch. The configured
protections reported it clean and mergeable, and the source merge completed as
`3d95e503d6e56b61c16324eba650ef0c8161b5fa` without deleting the reviewed source branch. The merged
integration tree hash was exactly `9ccd5d98ff337397e689109b887e4eac23c2d645`, identical to the
accepted branch tree, and the full post-merge suite passed 423/423. This source merge did not restart
Control, change protected data, or alter the retained application rollback release.
