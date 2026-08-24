# Gate 7B customer journey results

Status: production path active; sustained ordinary Omen chat proven; one exact-release presentation
recheck remains before Gate 7B closure.

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
- Governance findings remain typed in `gates`, `auditCodes`, and completion metadata. Internal labels
  such as `unsupported-numeric-claim`, Gate numbers, routes, migration slices, and request envelopes are
  not appended to customer prose.

## End-to-end validation

The executable synthetic journey crosses the actual HTTP, application, authorization, Gate 2, Gate 1,
continuity, provider, browser-response, and logout boundaries. It proves signed-out state, ordinary
session entry, six consecutive turns, bounded ordered history, general chat, guarded project reading,
project-record research, explicit workspace comprehension, one forced provider failure, recovery on
the next turn, and session revocation. The internal `code` role remains read-only workspace
comprehension; there is no source picker, file write, shell execution, patch, commit, or push feature.

Results:

- focused Gate 7B suite: 17/17;
- full repository suite: 393/393;
- synthetic customer journey: 11/11 checks;
- Control private-model aggregate: 5/5 checks across cold/warm plain chat, research evidence, workspace
  evidence, exact model identity, deterministic role routing, and citation mode;
- measured private-model times in that validation: 1,111 ms cold chat, 243 ms warm chat, 876 ms
  research, and 879 ms workspace. Only aggregate timing, byte count, role, model-match, and citation
  count were retained.

The model validation used the already-running private model, downloaded nothing, opened no protected
data, and removed its disposable Control worktree afterward. The deployed successor changed only the
immutable application artifact and already-approved Caddy configuration identity. Control source is
clean, the prior immutable release is retained, and protected product data and legacy RunaAI are unchanged.

## Production deployment and live transcript

The first two successor attempts failed before production mutation. Windows PowerShell treated Caddy's
informational stderr as a terminating error even though native validation succeeded; the operator now
uses the native process exit code. The next preflight compared JSON text whose property ordering differed;
the operator now compares typed path/value facts. Both failures left the running release untouched.

The accepted deployment then activated the 60/65/70-second deadline chain with exact rollback retention.
The first browser refresh exposed a separate presentation defect: `status.js` imported
`chat-client.mjs`, but `.mjs` was served as `application/octet-stream` under `nosniff`. Edge correctly
refused the module, leaving the page at its initial sign-in presentation even after successful identity
work. Release `runaai-next-gate7a-lan-browser-2026-08-24-bccf7a7` added the JavaScript MIME mapping and
a live-header regression check.

The steward then completed ordinary password sign-in and supplied a ten-turn transcript. It proved the
private-chat UI, greeting, sustained multi-turn model conversation, an honest no-live-weather boundary,
general knowledge, numeric answering, and truthful refusal to create a downloadable spreadsheet. The
numeric answer for the square root of pi was correct, but a conservative audit label was incorrectly
shown beneath it. Release `runaai-next-gate7a-lan-chat-2026-08-24-20039fe` retains that audit signal in
typed metadata while removing it and other engineering terminology from customer prose. Post-deployment
reconciliation reports active authority, closed cutover revision 10, ready dependencies, running
Application/Caddy tasks, JavaScript MIME delivery, clean Control source, and exact predecessor rollback.

## Product boundary exposed by acceptance

This gate proves a small read-only product foundation, not full RunaAI. The current UI is an acceptance
surface. It has no conversation library, attachment picker, downloadable artifact creation, live web
research, customer workspace selector, code execution, file write, learning controls, protected action
UI, or finished mobile/external-user experience. The model prompt also carries only a thin Runa persona;
the preserved constitutional identity and relationship experience require an explicit next product
decision. Those are neither defects hidden by this result nor implicitly approved extensions.

## Remaining acceptance

Refresh the canonical page, sign in once because the immutable release binding changed, and repeat the
weather and square-root-of-pi prompts. The weather response must contain no Gate terminology, and the
correct numerical answer must contain no audit label. That is the only remaining Gate 7B presentation
check; broader UI and feature work belongs to separately reviewed product stages.
