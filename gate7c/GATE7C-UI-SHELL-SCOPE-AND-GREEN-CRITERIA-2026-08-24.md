# Gate 7C UI shell scope and green criteria

Status: frozen before implementation on 2026-08-24.

## Purpose

Gate 7C begins the user-interface redesign with one presentation-only slice: restore the familiar
RunaAI workspace shape around the already-working ordinary chat. The authenticated page will have a
collapsible left rail, the existing central conversation and composer, and a collapsible right rail.
Both expansion areas remain intentionally empty and visually unlabeled in this gate.

The legacy RunaAI shell is the visual and interaction reference, not a source-code migration. Its
useful invariants are a fixed-height workspace, narrow persistent rails, a centered chat column,
transcript-owned scrolling, a composer that remains reachable, and side panels that resize the center
on desktop rather than covering it.

## Baseline

- Source branch point: `origin/runa2/integration` at `c8d8ed5c6408b78531cbf8d64b15a3bc1e57167b`.
- `npm run test:gate6b`: 32/32 passing before this scope was frozen.
- `npm run test:gate7b`: 17/17 passing before this scope was frozen.
- Current authenticated UI: one central chat panel with no workspace rails.
- Legacy reference: 64 px collapsed left and right rails, 278 px left expansion, 300 px right
  expansion, centered main work area, independently scrolling transcript, and a separate composer.

## Included work

1. Add an authenticated three-column workspace shell around the existing chat.
2. Add independent icon-only controls for expanding and collapsing the left and right rails.
3. Leave both expansion bodies empty: no product labels, placeholder copy, navigation, settings,
   project state, source state, or integrations.
4. Bring the authenticated workspace back toward the legacy warm glass appearance while keeping the
   sign-in and protected ceremony pages behaviorally unchanged.
5. Preserve the current chat heading, transcript, composer, retry, session, and logout behavior.
6. Keep the transcript as the scrolling region and the composer reachable at desktop and narrow
   viewport sizes.
7. Provide non-visual accessible names, accurate expanded state, keyboard reachability, visible focus,
   and Escape-to-collapse behavior.

## Explicit non-goals

- No navigation destinations, projects, sources, research, code tools, attachments, saved chats,
  settings, memory, learning, administration, or right-panel inspection behavior.
- No new API route, provider call, data read, write, migration, storage key, cookie, or browser
  persistence.
- No change to identity, authorization, selected-core authority, answer routing, protected data, or
  Control services.
- No production deployment or release activation in this gate branch.
- No claim that the broader RunaAI interface is complete.

## Green criteria

The implementation is acceptable only when all of the following are true:

1. The authenticated DOM has left rail, central chat, and right rail as sibling regions in that order.
2. Both rails start collapsed, expand independently, and expose no visible feature labels or content.
3. Each control has an accessible name, `aria-controls`, and synchronized `aria-expanded`; each empty
   body has synchronized `aria-hidden`.
4. Escape collapses either or both open rails without changing chat state.
5. Desktop expansion changes the grid column width rather than adding an application overlay.
6. At narrow widths the chat and composer remain usable and an expanded empty panel can be dismissed.
7. The central transcript owns vertical scrolling and the composer stays outside that scroll region.
8. Ordinary sign-in gating, message submission, bounded history, safe retry, and sign-out remain
   unchanged.
9. Shell controls add no `fetch`, `localStorage`, or `sessionStorage` use and send no data.
10. Protected owner-ceremony and validation pages keep their existing shared-style behavior.
11. `npm run test:gate6b`, `npm run test:gate7b`, `npm run test:gate7c`, the full `npm test`, and
    `git diff --check` pass.
12. Wide desktop, constrained desktop, and phone-width visual checks show no overlap, clipped composer,
    unreachable toggle, or page-level vertical scroll regression.

## Rollback

This is a static authenticated-page change with no new state. Rollback is reverting the Gate 7C UI
commit or discarding this isolated branch. No data, account, service, certificate, or release recovery
is required.

## Review gate

The steward reviews the shell proportions and visual direction before any rail receives a name or
capability and before this branch is merged or deployed.
