# Gate 7B customer journey results

Status: source candidate accepted for integration and immutable Control deployment; production browser
acceptance remains pending.

## Root cause

The live `Unexpected end of JSON input` symptom was the last visible point in a longer failure chain.
The already-running private model needed 29.290 seconds for the measured cold greeting, while the
application total deadline, the public Caddy response-header timeout, and the private provider-proxy
timeout were all 30 seconds. A valid answer could therefore arrive as the outer proxy closed the
browser response. The browser then attempted to parse the empty or incomplete body and displayed the
raw JavaScript parser error. Ordinary greetings also depended on the model serializing an application
JSON envelope even though no citations were needed.

## Customer-journey correction

- Ordinary no-evidence conversation now uses plain provider text. Evidence-bearing research and
  workspace answers retain the validated answer/citation JSON contract.
- Empty, malformed, truncated, wrong-model, timed-out, and transport-failed provider results map to
  stable typed outcomes. Raw provider, parser, stack, prompt, and private details never enter the
  customer transcript.
- Incomplete provider outcomes are not recorded as completed durable chat turns.
- The bounded deadline chain is now 60 seconds for the application, 65 seconds for the browser and
  private provider proxy, and 70 seconds for the public application proxy. The unchanged 30-second
  identity proxy remains separate.
- The browser retains the failed user message, presents a fixed customer-safe explanation, and offers
  an explicit retry. Concurrent sends remain disabled and completed history remains bounded to 24
  messages of at most 8,000 characters each.
- The customer page no longer assumes that every ordinary user is Matthew. It truthfully describes
  the available chat surface: questions, brainstorming, writing or code drafts, and pasted-text work;
  no live web lookup or authority to change files, settings, or systems.

## End-to-end validation

The executable synthetic journey crosses the actual HTTP, application, authorization, Gate 2, Gate 1,
continuity, provider, browser-response, and logout boundaries. It proves signed-out state, ordinary
session entry, six consecutive turns, bounded ordered history, general chat, guarded project reading,
project-record research, explicit workspace comprehension, one forced provider failure, recovery on
the next turn, and session revocation. The internal `code` role remains read-only workspace
comprehension; there is no source picker, file write, shell execution, patch, commit, or push feature.

Results:

- focused Gate 7B suite: 13/13;
- full repository suite: 389/389;
- synthetic customer journey: 11/11 checks;
- Control private-model aggregate: 5/5 checks across cold/warm plain chat, research evidence, workspace
  evidence, exact model identity, deterministic role routing, and citation mode;
- measured private-model times in that validation: 1,111 ms cold chat, 243 ms warm chat, 876 ms
  research, and 879 ms workspace. Only aggregate timing, byte count, role, model-match, and citation
  count were retained.

The validation used the already-running private model, downloaded nothing, changed no production
service, opened no protected data, and removed its disposable Control worktree afterward. Both Control
source checkouts remained clean.

## Remaining acceptance

The candidate still needs an immutable successor release, exact predecessor rollback retention,
post-deployment readiness and authority reconciliation, and sustained ordinary-user testing through
the canonical HTTPS browser entry point. Gate 7B is not complete until those production checks pass.

