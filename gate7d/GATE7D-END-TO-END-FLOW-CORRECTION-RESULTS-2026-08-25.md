# Gate 7D end-to-end flow correction results

Status: implementation, exact-Control verification, and the second rollback-protected correction
activation are complete. Control runs `runaai-next-gate7d-code-verification-2026-08-25-16adbca` at
`16adbcaa936cce38d16bdb12fe255a3e441b9c05`. The final ordinary-user Code retest and merge remain
pending.

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
- Standalone Code now performs a separate bounded response verification against the current request
  and only the relevant retained conversation. Irrelevant prior values, contradictory results, and
  arithmetic inconsistency are rejected. A proposed correction is returned only after a second
  verification; malformed, rejected, or unverifiable results remain retryable and unrecorded. This is
  a response-relevance/consistency guard, not code execution or a claim of formal code correctness.
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
| Focused provider and Gate 2 suite after Code correction | 24/24 passed |
| Complete repository suite | 422/422 passed; 0 failed, skipped, or cancelled |
| Exact commit complete suite on Control | 422/422 passed; 0 failed or skipped |
| Isolated private endpoint: standalone opening | 6/6 correct before implementation |
| Exact source and active-release Code smoke | Opening function and retained `14+12=26` follow-up passed; verification receipts present |
| `git diff --check` | passed |

The focused coverage includes the exact observed Chat phrase and follow-up, explicit project routing,
standalone Code with the knowledge adapter unavailable, non-persistence and browser retry for knowledge
errors, consecutive Italy/France request ordering, provider current-message instructions, Keycloak
refresh exchange, concurrent one-time renewal, encrypted atomic credential rotation, unchanged absolute
expiry, transient retry, refresh rejection, issuer/audience/subject/method mismatch, session expiry,
online profile verification, logout, existing navigation, origin enforcement, participant/project
isolation, record reopening, and rollback contracts.

## Control activations

The first flow-correction successor at `c5c8e31` remained the automatic rollback target while the Code
failure was diagnosed. The second exact immutable successor has artifact digest
`7285f2b2b04018b47cc47c16e8a7843ff186403f25d644f8ff02f95a187073ae`, 29,510 artifact files,
configuration digest `b1d1f9cb5e8524f8318fa428bfe0d107747b4996647f8f6111cba65746b75020`, and manifest
digest `bb0d2d2d7aab54c6dd00a49ae3dc6a817ff7c4823249dba43c3f8e213a8e0647`.

The guarded deployer verified every staged hash, the immutable artifact, active predecessor pins,
unchanged protected configuration, Keycloak owner binding, ordinary and owner routes, selected-core
authority, protected import, public presentation contract, and rollback readiness before success. An
independent post-check confirmed closed cutover, active authority, all dependencies ready, the exact
commit and artifact running, canonical HTTPS status 200, JavaScript status 200, all page/controller
markers, trusted TLS, and clean correction, integration, and legacy checkouts.

The selected-core authority, imported data, identity policy, model, service identities, network
exposure, and legacy checkout did not change. The first flow-correction release remains the automatic
application rollback target. Aggregate evidence is retained in
`gate7d/GATE7D-CODE-VERIFICATION-CONTROL-ACTIVATION-RESULTS-2026-08-25.json`.

## Remaining acceptance gate

The ordinary-user report passed Chat creation, reopening, switching, Italy-to-France relevance, and
logout/fresh sign-in. Repeat only the failed Code path at the canonical origin in a new Code record:

1. `Write a JavaScript function that adds two numbers.` must return the requested function without
   invented `64/12` context; and
2. `Run the program using a = 14 and b = 12.` must return `26`, not `76`.

Merge remains blocked until that live result is recorded. Model/provider changes and real code-work
capabilities remain separate later decisions.
