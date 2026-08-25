# Gate 7D Chat and Code navigation scope and green criteria

Status: frozen before implementation on 2026-08-24.

## Purpose

Gate 7D turns the reviewed Gate 7C left rail into the first useful navigation slice. It identifies
the signed-in person and gives ordinary members two deliberately separate work areas: Chat and Code.
Each area owns its own projects, chat records, new-chat action, and project-creation action. The
separation is a durable product rule, not a cosmetic filter.

This gate remains a read-only interaction surface with respect to Runa's governed capabilities. It
may create ordinary-user project and conversation records, but it cannot learn, change protected
records, modify source files, execute code, use live networking, or perform administrative actions.

## Baseline and dependency

- Parent: `codex/gate7c-ui-shell` at `fc8e5480957471d8b28bad370ac0c383bcb856f0`.
- Gate 7C remains independently preserved; Gate 7D is a dependent review branch and does not imply a
  Gate 7C merge.
- Gate 7C's Control release remains the active rollback target until a separately authorized Gate 7D
  deployment.
- The current browser session status exposes only `ordinary` or `owner`, the current left rail is
  empty, and the current ordinary chat creates a new in-memory thread on every page load.
- PostgreSQL `runa_core.projects`, `runa_core.chats`, and `runa_core.chat_turns` remain the only
  authoritative project/chat records. No browser storage or second catalog is introduced.

## Included work

1. Show a theme-matched initials avatar and public display name for the authenticated person. Do not
   expose email, subject identifiers, bearer credentials, roles, or protected profile attributes.
2. Add accessible Chat and Code tabs to the left rail, using a chat-bubble icon and a code-brackets
   icon.
3. Add `New` and `Project` actions to both tabs.
4. List only the selected person's non-archived projects and chat records for the active experience.
5. Create participant-scoped projects with an encrypted display name and explicit Chat or Code
   experience.
6. Persist a new chat on its first completed answer, load an existing chat with exact turn ordering,
   and preserve the selected project grouping.
7. Enforce Chat/Code separation in the continuity adapter. Existing records without explicit
   experience remain Chat unless an existing turn route proves that they are Code.
8. Route Chat messages to the deterministic chat role and Code messages to the deterministic code
   role. Code remains conversational and read-only; source access or execution is not implied.
9. Keep the right rail empty and retain Gate 7C expansion, keyboard, focus, transcript, retry, and
   responsive behavior.

## Explicit non-goals

- No code execution, repository access, file editing, terminal, artifact, attachment, source,
  research, web, weather, learning, memory-management, scheduling, dispatch, customization, or
  administration UI.
- No public self-signup, identity-role change, password-policy change, passkey-policy change, or
  owner-ceremony change.
- No second chat/project authority, local storage, session storage, plaintext private content,
  cross-participant reads, or cross-experience record reuse.
- No production deployment, PostgreSQL mutation on Control, service restart, networking change, or
  release activation without a separate rollback-protected approval.

## Green criteria

1. An authenticated ordinary session returns a bounded public profile containing only display name
   and initials; missing optional identity claims fall back safely to the product principal.
2. The left rail opens on authenticated desktop entry and presents keyboard-accessible Chat and Code
   tabs with visible selected state.
3. Chat and Code each maintain separate project and record lists, and switching tabs cannot display,
   load, or append to the other experience's records.
4. `New` starts a clean unsaved conversation in the selected experience; no empty database record is
   written before the first completed answer.
5. `Project` accepts a bounded name, creates exactly one encrypted participant-scoped project, and
   selects a clean conversation within it.
6. Selecting a saved record loads only the authenticated participant's title, project, and exact
   ordered user/assistant turns.
7. A Chat request uses lane `general` and deterministic role `chat`; a Code request uses lane `code`
   and deterministic role `code` without claiming source access or execution.
8. Existing unclassified records fail toward Chat, except a prior `workspace-chat` or `code-chat`
   route is sufficient evidence to classify a chat as Code.
9. All private titles, project names, and turns remain authenticated encrypted envelopes in
   PostgreSQL; list/read responses are no-store and require the existing authenticated browser
   session plus personal relationship authorization.
10. Cross-participant, cross-project, cross-experience, archived, invalid-name, duplicate-request,
    and unavailable-authority cases fail closed.
11. Sign-in, logout, owner ceremony, selected authority, retry, deadlines, bounded history, and the
    empty right rail do not regress.
12. Focused Gate 7D tests, all prior gate tests, the full suite, and `git diff --check` pass; desktop
    and phone visual checks show a usable identity control, navigation, transcript, and composer.

## Rollback

Source rollback is reverting the Gate 7D implementation commits or discarding this dependent branch.
Any later deployment must retain the currently active Gate 7C release as the automatic application
rollback target. New ordinary projects and chats are user-created authoritative records and must not
be deleted by an application rollback. Because experience is stored inside existing authenticated
private envelopes, this gate requires no destructive database-schema rollback.

## Review gate

The steward reviews the complete signed-in flow and the exact rollback-protected release projection
before Gate 7D changes Control or production traffic. Merge remains a separate approval after live
validation.
