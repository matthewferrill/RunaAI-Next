# Gate 7D end-to-end flow correction scope and green criteria

Status: frozen from ordinary-user live review on 2026-08-25 and amended by the repeatable current-turn
verifier failure observed during acceptance. The active Gate 7D correction remains unmerged and
retains its exact predecessor as the automatic application rollback target.

## Why this correction exists

Ordinary-user live review proved fresh password sign-in, new Chat creation, exact record reopening,
switching between retained chats, and continued history. It also exposed five release-blocking defects:

1. `This chat is a test` was classified as a project-record request because the conversation-aware
   classifier treated the generic word `test` as project intent.
2. The resulting approved-knowledge dependency failure was presented and retained as a completed
   answer instead of a retryable, non-persistent failure.
3. A new standalone Code conversation was forced through approved project knowledge and stopped
   before the selected code-role provider was called.
4. The ordinary browser session expired at the short-lived OIDC access-token boundary even though
   the local cookie and documented ordinary-session ceiling are eight hours. A refresh credential was
   retained but never used.
5. Live standalone Code reached its selected provider but returned invented prior values (`64` and
   `12`) instead of answering `Write a JavaScript function that adds two numbers.` After logout and
   sign-in, the retained follow-up `Run the program using a = 14 and b = 12` returned `76` instead of
   `26`. The already-running private endpoint answered the standalone request correctly in six of six
   isolated probes, while replaying the retained bad draft showed that prompt wording/order alone does
   not guarantee current-request arithmetic consistency. This is a release-blocking Code response
    relevance and consistency defect, not evidence of request-ID replay or a reason to switch models.
6. The first response verifier allowed the opening and `14 + 12 = 26` turns, but the next retained
   request `Run the program using a = 15 and b = 15` failed retryably twice. Exact transient replay
   proved the drafting model returned `30` on every run. The verifier instead treated the previous
   `14 + 12` turn as the current request and proposed `26`; correction re-verification rejected that
   stale proposal. The fail-closed result prevented a wrong answer from being retained, but the
   verifier's history input made an ordinary valid turn unavailable.

The same live Chat sequence also returned the previous Italy answer to a new France question. The
request path already uses a fresh request identifier for each send, so the correction must preserve
that guarantee, remove failure-turn pollution, strengthen current-message instructions, and add an
exact consecutive-topic live acceptance check. It must not claim model quality from deterministic
tests alone.

## Included correction

1. Narrow general-conversation project intent to explicit project/repository/workspace references and
   strong project-specific artifact terms. Generic uses of `test`, `facts`, `settings`, or similar
   words do not independently activate governed project retrieval.
2. Preserve contextual follow-up routing only when the immediately preceding user request itself has
   explicit project intent.
3. Treat `code` as a standalone deterministic conversational lane. It calls the selected code role
   without project records, workspace sources, repository access, files, terminal, execution, tools,
   networking, learning, or protected records.
4. Keep `workspace`, `research`, guarded project reads, and explicit general project questions on their
   existing governed knowledge/retrieval boundaries.
5. Treat an approved-knowledge delivery error as incomplete: do not retain either turn, present a
   retry action, and preserve the exact typed internal error outside customer prose.
6. Retain an eight-hour absolute ordinary-session ceiling while rotating short-lived access credentials
   through the existing encrypted refresh credential. Refresh must preserve issuer, audience, subject,
   authentication method, participant mapping, release binding, online revocation, and logout.
7. Serialize refresh for one browser session, rotate credentials atomically, never extend the original
   absolute session expiry, and fail closed when refresh is rejected or identity changes.
8. Make transient identity-refresh unavailability retryable without misreporting it as a completed chat
   turn or silently converting it into a new login authority.
9. Add a bounded current-turn verification pass to standalone Code responses. Conversation continuity
   remains exclusively with the drafting provider; the verifier receives only the current request and
   candidate answer, so earlier transcript text cannot become competing verification authority. It must
   reject mismatched values, contradictory results, and arithmetic inconsistent with the current
   request. A corrected response may be returned only after a second independent verification;
   otherwise the turn fails retryably and is not retained. Because Code has no executor, correct code
   plus a correct deterministic expected output may satisfy a run request without claiming execution.

## Explicit exclusions

- No Gemma model download, model switch, prompt bakeoff, MTP, vision, or provider reconfiguration.
- No repository/file attachment, code execution, terminal, tool, network, or workspace-source capability
  in Code.
- No protected-record access, learning activation, governed effect, identity-policy change, public
  registration, off-LAN ingress, certificate, DNS, Caddy, PostgreSQL schema, or data migration change.
- No destructive cleanup of the live incomplete test conversations. User-owned records remain intact.

## Green criteria

1. The exact live phrase `This chat is a test. I'm going to see if I can reopen it after it is saved.`
   and its `That's ok` follow-up both reach the chat provider without approved-knowledge selection.
2. Explicit project questions such as `What does this project say about Aurora?` still require governed
   project knowledge and fail closed without it.
3. Standalone Code reaches only the deterministic code-role provider when approved knowledge is
   unavailable; no project or workspace read is attempted.
4. Any actual approved-knowledge delivery error has `turnRecorded=false`, is retryable in the browser,
   and does not enter subsequent bounded history.
5. Two different consecutive fact questions retain distinct fresh request identifiers and the provider
   receives the latest user message in order. Live acceptance must additionally prove response relevance.
6. An ordinary session whose access credential expires before its eight-hour ceiling refreshes once,
   survives concurrent requests, retains the same browser session, and rotates the encrypted provider
   credentials.
7. Refresh rejection, subject/audience/issuer/method mismatch, absolute session expiry, and logout all
   fail closed; transient refresh outage remains a safe retryable dependency error.
8. Existing Chat/Code navigation, encrypted PostgreSQL continuity, record reopening, participant/project
   isolation, origin checks, bounded history, deadlines, retry, and rollback tests remain green.
9. Focused Gate 1, Gate 2, Gate 6B, Gate 7A, Gate 7B, and Gate 7D tests pass, followed by the complete
   repository suite and `git diff --check`.
10. A rollback-protected successor may be activated only after source verification. Live review must
    repeat standalone Chat, standalone Code, record reopening, access-token renewal, and Italy-to-France
    topic relevance before merge.
11. The exact observed Code opening must return a JavaScript addition function without invented `64/12`
    context. Its retained follow-up with `a = 14` and `b = 12` must return `26`, must not return `76`, and
    both accepted turns must carry the Code verification receipt. A rejected or unverifiable Code draft
    must remain retryable and unrecorded.
12. A subsequent retained request with `a = 15` and `b = 15` must return `30` and a verification receipt,
    not reuse `14/12`, return `26`, or surface the incomplete-response retry. Exact model replay must
    accept the correct current-turn answer and reject the stale prior-turn answer in every repetition.
