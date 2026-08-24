# Gate 7B customer journey scope and green criteria

Status: approved by the steward on 2026-08-24 for one coherent customer-experience correction.

## Problem statement

Component and gate tests proved individual contracts but did not prove that an invited ordinary user
can sign in and sustain a conversation through the complete production stack. The first live greeting
was incorrectly forced through project retrieval, the second was blocked by an unavailable optional
approved-knowledge projection, and the third reached the model but exposed an untyped JSON parsing
failure. Fixing those symptoms independently is not an acceptable completion method.

Gate 7B therefore treats the customer journey as the unit of correctness:

```text
canonical HTTPS -> sign in -> session -> authorization -> route -> optional context -> model ->
typed provider result -> durable turn -> HTTP response -> browser transcript -> retry/logout
```

## Current product boundary

The current browser product exposes ordinary private chat only. The selected core also contains
API-only guarded chat, project-record research, and explicit workspace comprehension. The workspace
lane uses the deterministic `code` model role for read-only comprehension; it is not a code-writing
agent and has no customer source picker yet. Gate 7B must validate those internal lanes so a shared
provider or error change cannot silently break them, but it must not market research, workspace, or
code execution as a finished customer feature.

Gate 7B does not add web research, autonomous file discovery, code execution, file writes, project
source selection, learning activation, public registration, off-LAN ingress, or protected-owner
capabilities. Those remain later decisions.

## Customer-flow matrix

### Entry and identity

- Anonymous canonical HTTPS renders the customer page without exposing release internals by default.
- Password, optional passkey, and protected-owner routes remain distinct.
- A valid ordinary session opens chat; owner and ambiguous sessions cannot enter the ordinary surface.
- Expired, revoked, missing, and dependency-unavailable sessions produce safe recoverable states.
- Sign out revokes the server session, clears the cookie, and returns to the signed-out page.

### Ordinary chat

- Greeting, small talk, a stable factual question, and a conversational follow-up reach the chat model
  without project retrieval or approved-knowledge availability becoming prerequisites.
- At least six consecutive turns preserve bounded history in order without crossing participant,
  project, or thread scope.
- A current/live request states the missing lookup capability honestly.
- A project-record question uses only scoped evidence and returns an honest miss when none exists.
- Protected/admin/effect requests remain deterministically denied before model execution.
- Enter submits, Shift+Enter inserts a newline, the composer prevents duplicate concurrent sends, and a
  failed turn remains visible with an understandable retry path.

### Provider boundary

- Cold and warm already-running private-model calls are measured separately.
- Plain conversational answers do not depend on the model serializing application JSON.
- Evidence-bearing answers use a validated typed result; malformed, empty, truncated, wrong-model,
  timed-out, and transport-failed responses become stable product error codes rather than raw parser or
  dependency exceptions.
- No hidden reasoning, raw provider body, prompt, private value, stack trace, or JavaScript error reaches
  the customer.
- One total answer deadline includes enough measured cold-start margin, remains bounded, and is enforced
  consistently by browser, application, provider, and outer transport.

### Internal answer lanes

- General chat, guarded/local chat, project-record research, and explicit workspace comprehension each
  execute through the release composition with their deterministic model role.
- General chat cannot acquire project evidence accidentally.
- Research reports its actual record-search denominator and does not imply web access.
- Workspace reads only explicitly supplied same-project sources, cites them, and performs no write.
- The internal `code` role is proven only as read-only workspace comprehension. Code editing, shell
  execution, patching, commit, and push remain unavailable and are stated as such.

### Continuity and recovery

- Successful verified turns are committed once and duplicate request ids return the same result.
- A failed provider turn does not become a successful assistant turn or corrupt the next request.
- Refresh, application restart, same-session continuation, retry, and logout retain their documented
  behavior.
- PostgreSQL, identity, authorization, provider, and malformed-response failures are distinguishable and
  recover without weakening authority.

## Required validation

1. Unit coverage for provider result modes and customer-safe error translation.
2. HTTP/browser-flow tests for anonymous, authenticated, multi-turn, retry, and logout states.
3. One release-composition customer-journey runner exercising every answer lane with the standard stack
   and a controllable provider.
4. Full repository suite and `git diff --check` green.
5. Bounded live private-model validation for cold/warm general chat plus the read-only internal lanes,
   retaining only privacy-safe aggregate results.
6. Immutable Control successor deployment with the exact prior release as automatic rollback.
7. Live canonical HTTPS, session, sustained ordinary-chat, safe-error, and logout acceptance through the
   real browser entry point before completion is claimed.

## Rollback

The predecessor immutable release remains runnable. Deployment must stop and restore it automatically
if artifact verification, readiness, authority, owner proof, ordinary login routing, provider
acceptance, or customer-flow validation fails. Legacy RunaAI and protected product data are not changed.
