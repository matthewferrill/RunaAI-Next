# Gate 7D Chat and Code navigation results

Status: implemented and verified in source. Control and production remain unchanged pending the
separate rollback-protected release review.

## Exact scope

- Parent Gate 7C source: `fc8e5480957471d8b28bad370ac0c383bcb856f0`.
- Frozen scope and green criteria: `27fa026b60d9cd430cee7cd344ae8a9e353ecf48`.
- Navigation implementation: `7b9b3bbcdaae03193edcef37b84bfe7d175415f5`.
- Review branch: `codex/gate7d-chat-code-navigation`.
- Active Control release remains the Gate 7C release
  `runaai-next-gate7a-lan-ui-2026-08-24-9cea964`.

Gate 7D adds the first useful content to the reviewed three-column shell. It does not port the old
RunaAI application architecture. The center remains the ordinary private conversation surface, the
right rail remains empty, and the left rail now provides an identity-aware, durable Chat and Code
navigator.

## Delivered behavior

1. The header shows only the authenticated person's bounded public display name and initials. Email,
   identity subject, role, tokens, and protected profile attributes are not returned to the page.
2. The left rail opens on desktop and provides keyboard-accessible Chat and Code tabs with the
   requested chat-bubble and code-brackets symbols.
3. Each tab has its own `New`, `Project`, project list, and chat-record list. Switching tabs cannot
   reuse the other experience's in-memory state or durable records.
4. `New` starts a clean unsaved conversation. PostgreSQL receives no empty chat; a chat is created
   only with its first completed answer.
5. `Project` creates one idempotent participant-scoped project with its display name and Chat/Code
   experience inside the existing authenticated encrypted private envelope.
6. Selecting a record loads its exact ordered user and Runa turns. Archived, wrong-participant,
   wrong-project, and wrong-experience records fail closed.
7. Chat uses the deterministic `chat` role. Code uses the deterministic `code` role but remains a
   conversational drafting surface: it receives no repository, file, terminal, execution, network,
   or protected-record capability.
8. Existing records with no experience default to Chat. A retained `workspace-chat` or `code-chat`
   route classifies its legacy project and unclassified records as Code so one project cannot straddle
   both navigation areas.
9. Navigation reads remain authenticated POST requests with the existing exact-Origin check,
   workspace marker, personal relationship authorization, and no-store response policy.
10. Navigation is disabled while a record, project, or answer request is in flight, preventing a
    response from being attached to a newly selected chat or project.

PostgreSQL `runa_core.projects`, `runa_core.chats`, and `runa_core.chat_turns` remain authoritative.
No local storage, session storage, plaintext private catalog, parallel database, or schema migration
was added.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run test:gate7d` | 8/8 passed |
| `npm test` | 406/406 passed; 0 failed or skipped |
| `git diff --check` | passed |

The focused tests cover bounded identity projection, online session identity, explicit and legacy
experience classification, encrypted PostgreSQL navigation, deterministic Code routing, personal
relationship authorization, preservation of workspace-project authorization, exact-Origin HTTP
boundaries, and the authenticated UI contract.

## Visual verification

A disposable loopback-only preview exercised the real static page and controller with synthetic,
non-private identity and catalog responses. It was not connected to Control or production.

- Desktop at 1440 x 900 showed the `MF` avatar, `Matthew Ferrill`, the expanded left rail, distinct
  Chat/Code selected states, separate project and record lists, central transcript and composer, and
  the still-empty collapsed right rail without page overflow.
- Switching to Code changed the central label, description, greeting, placeholder, projects, and
  record list without leaking Chat entries.
- The inline project form remained contained in the navigation rail.
- Phone at 390 x 844 retained the initials avatar, hid the longer name, kept both rails collapsed on
  entry, and opened the left rail as a dismissible overlay with Chat, Code, New, Projects, and records
  reachable while the composer remained usable.
- The browser reported no console warnings or errors.

The browser-control skill made the desktop and phone review operate against the actual rendered page,
including tab switching and the project form, rather than relying only on source inspection. The
temporary preview process was stopped and its helper file was removed before commit.

## Boundaries and rollback

No Control service, production traffic, PostgreSQL row, protected record, identity setting, network
configuration, model, legacy RunaAI checkout, or active release changed. Source rollback is reverting
the Gate 7D implementation commit or discarding this dependent branch.

A later application rollback must preserve any ordinary projects and completed chats created after
deployment; those are user-owned authoritative records, not disposable release state. Because Gate 7D
stores experience inside the existing encrypted envelopes, application rollback requires no destructive
database-schema rollback. The current Gate 7C immutable release remains the automatic application
rollback target.

## Review gate

The next step is to prepare and review one exact Gate 7D immutable-release projection against the
current Control predecessor. Control deployment requires the steward's separate authorization and must
automatically restore Gate 7C if preflight, activation, readiness, identity, navigation, or chat
reconciliation fails. Merge remains a separate decision after live ordinary-user validation.
