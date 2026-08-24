# Gate 7C UI shell results

Status: implemented, verified, and active on Control for steward visual review.

## Exact scope

- Branch point: `origin/runa2/integration` at `c8d8ed5c6408b78531cbf8d64b15a3bc1e57167b`.
- Frozen scope and green criteria: `f3087c2d458705f55c7f6d6ce364526a8101d45c`.
- UI implementation: `1490a9bb23a6e8ae0729def2d8ca827b72a23a90`
  (`Build the Gate 7C three-column UI shell`).
- Review branch: `codex/gate7c-ui-shell`.
- Active release: `runaai-next-gate7a-lan-ui-2026-08-24-9cea964` at
  `9cea964073523023bafb7a54d3f911f5cafa3c31`.

The implementation restores the useful shape of the legacy RunaAI workspace without porting its old
application architecture. The existing chat remains in the center. Empty, visually unlabeled rails
sit on either side and open independently. Desktop panels resize the center column; narrow-screen
panels become dismissible overlays so they do not make the composer unusable.

## Delivered behavior

1. Left rail, central chat, and right rail are direct sibling regions in a fixed-height workspace.
2. Both rails start collapsed, contain no product copy or feature wiring, and expand independently.
3. Icon-only controls expose accessible names, `aria-controls`, synchronized `aria-expanded`, visible
   keyboard focus, and Escape-to-collapse behavior.
4. The central transcript owns scrolling while the existing composer remains outside that scroll area.
5. The authenticated workspace uses the legacy warm Dawn direction: soft mesh color, translucent
   surfaces, rounded edges, restrained teal accents, and readable dark text.
6. Shell initialization occurs only after an active ordinary session is verified. Anonymous, unavailable,
   and protected-owner paths do not initialize it.
7. The shared narrow-screen rules used by sign-in, owner ceremony, and validation pages remain present.
8. The shell controller performs no fetch, storage, cookie, persistence, or application-data operation.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run test:gate7c` | 5/5 passed |
| `npm run test:gate6b` | 32/32 passed |
| `npm run test:gate7b` | 17/17 passed |
| `npm test` | 398/398 passed; 0 failed or skipped |
| `git diff --check` | passed |

The presentation test also enforces minimum contrast for normal Send text, status/placeholder text,
and the textarea boundary. The final ratios against white are approximately 5.41:1, 5.67:1, and
4.61:1 respectively.

## Visual verification

A disposable loopback-only preview exercised the real static page and controller with synthetic,
non-private session and answer responses. It was not connected to Control or production.

- Wide desktop at 1248 x 720: collapsed, left-expanded, and both-expanded states remained usable.
- Constrained desktop at 960 x 720: both-expanded columns measured 216 px / 488 px / 224 px, with no
  page-level vertical overflow and the composer still reachable.
- Phone at 390 x 844: collapsed rails remained 52 px; each 278 px expanded panel overlaid the center
  independently, retained its close control, and left the header and composer reachable.
- Keyboard Escape collapsed both panels without changing the draft or transcript.
- A synthetic message submission and response rendered through the existing chat form.

Visual testing exposed one mobile grid-placement defect before commit; explicit grid columns corrected
it, and the phone checks then passed. The temporary preview process was stopped, its file was removed,
and its loopback port was verified closed.

## Control activation and reconciliation

The steward authorized the rollback-protected Control deployment after reviewing the implementation
summary. The immutable successor contained 29,503 files, no secrets, and no protected data. It was
accepted with these exact identities:

- release: `runaai-next-gate7a-lan-ui-2026-08-24-9cea964`;
- commit: `9cea964073523023bafb7a54d3f911f5cafa3c31`;
- artifact digest: `137dd471978f9762f9e337814023245345b1e9579606cfaf2aed3dbd7f4cedd5`;
- manifest digest: `15b47ed97a8b61796966f7078aa9acdd5f84c204609200a68160bd0c407d5174`;
- release-configuration digest: `b1d1f9cb5e8524f8318fa428bfe0d107747b4996647f8f6111cba65746b75020`.

The release-configuration digest and all service configuration identities remained unchanged from the
predecessor. Post-deployment reconciliation reported active authority, closed cutover revision 10, all
four dependencies ready, the exact artifact verified, protected-data import still present, owner proof
rebound, and both owner and ordinary-password routes ready. The canonical HTTPS root serves the new
three-column markup and `workspace-shell.mjs`. The prior release
`runaai-next-gate7a-lan-chat-2026-08-24-20039fe` remains retained for rollback.

## Boundaries and rollback

Production changed only to the exact immutable application artifact; Caddy was reloaded with its
unchanged verified configuration inside the same rollback boundary. No identity setting, authority state,
product data, model, network ingress, legacy repository, or protected record changed. No feature has been
assigned to either rail. The predecessor artifact and exact configuration are retained, so rollback does
not require state or data recovery.

## Review gate

The steward reviews the proportions, warm visual direction, collapse behavior, and phone treatment.
Nothing should be named or integrated into the rails, and this branch should not be merged, until that
visual direction is accepted.
