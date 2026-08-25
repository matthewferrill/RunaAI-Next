# Gate 7D end-to-end flow correction results

Status: implementation and synthetic verification complete at
`be6d0cd9274e9f622e5fa3eb9aa81aabb060ccf4`. Control still runs the exact prior Gate 7D release
`runaai-next-gate7a-lan-chat-code-2026-08-25-65b907b`; no successor activation or merge is claimed by
this result.

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
| Focused Gate 1, provider, Gate 2, Gate 6B, Gate 7A, Gate 7B, and Gate 7D suite | 174/174 passed |
| Complete repository suite | 418/418 passed; 0 failed, skipped, or cancelled |
| `git diff --check` | passed |

The focused coverage includes the exact observed Chat phrase and follow-up, explicit project routing,
standalone Code with the knowledge adapter unavailable, non-persistence and browser retry for knowledge
errors, consecutive Italy/France request ordering, provider current-message instructions, Keycloak
refresh exchange, concurrent one-time renewal, encrypted atomic credential rotation, unchanged absolute
expiry, transient retry, refresh rejection, issuer/audience/subject/method mismatch, session expiry,
online profile verification, logout, existing navigation, origin enforcement, participant/project
isolation, record reopening, and rollback contracts.

## Remaining acceptance gate

After exact source verification, activate one rollback-protected successor whose automatic application
rollback target is the currently active Gate 7D release. Then repeat at the canonical origin:

1. fresh ordinary password sign-in and Chat greeting;
2. the exact `This chat is a test` sequence without a project-knowledge error;
3. standalone Code: `Write a JavaScript function that adds two numbers.`;
4. old-record reopening plus switching back to the new record;
5. Italy followed immediately by France, with a relevant answer to each;
6. an access-token renewal while the same browser session remains usable; and
7. logout and fresh sign-in.

Merge remains blocked until that live result is recorded. Model/provider changes and real code-work
capabilities remain separate later decisions.
