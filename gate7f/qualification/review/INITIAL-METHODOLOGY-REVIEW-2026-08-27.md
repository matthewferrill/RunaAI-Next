# Initial independent qualification review

Date: 2026-08-27. Reviewed source: `1715412d54592d326004c0b54cc4aa9b2df45823`.
Reviewer worktree: `runaai-qualification-review`, detached and initially clean. Read `AGENTS.md`
and the qualification authorization/criteria. No Home/Control access, model requests, changes to
sealed evaluation files, protected data, or fresh acceptance answers. This note is the only edit.

This review identifies qualification requirements, not a production incident. Gate 7F-0 is an inert
synthetic foundation; v2 openly documents that it is a text-only model-layer evaluation.

## Prioritized findings

### R1 — effect-time task authority must survive model laundering (high)

`gate7f/core.mjs:31` rejects explicitly labeled retrieved/tool origins but accepts model output.
`gate7f/core.mjs:45` and `gate7f/policy.mjs:14` authorize by capability/profile/preferences, not a
server-owned operation/path grant. The task stores an objective hash (`gate7f/contracts.mjs:78`),
which is not an executable scope restriction. Relative path containment is not task authorization.

An offline in-memory fixture created a safe-autopilot task whose objective was “Only update
ALLOWED.md; never modify OTHER.md.” A model-output apply request for OTHER.md executed. That is the
expected current capability-level behavior, and precisely the gap that must not be promoted as
task-bound protection. No actual filesystem content was touched.

Acceptance: application-minted grants bind authenticated participant, task, project, environment,
exact permitted operation/path/arguments or an explicitly bounded transformation, expiry and revision.
Every affected path must be checked, including verify assertions and restore-receipt targets.
Model/retrieved/tool content cannot construct or widen those values. Recheck immediately before the
effect, not just before asking the model. Prove both denial of laundered out-of-scope requests and
successful legitimate requests. Exact-argument fixtures do not establish safety for arbitrary generated
source changes within a broadly writable path; that limitation must remain explicit.

### R2 — pending approvals currently outlive a newly recorded deny (high)

`gate7f/core.mjs:181` checks proposal status/expiry and active task before executing, but does not
reevaluate current policy/preferences. In an offline fixture: stage an ask-every-time proposal, record
a session deny for its capability, then approve the old proposal. The synthetic effect still executed.

Acceptance: a stale/revoked/expired/superseded grant or current hard deny blocks an old pending approval
at the effect boundary. Test denied-after-stage, revoked-after-stage, expiry at the boundary, cancellation,
workspace revision drift, changed arguments, duplicate delivery and restart. Returning an existing receipt
must never produce another effect. Define separately whether an explicit *new* user authorization may
replace a deny; an old proposal/approval token must not silently do so.

### R3 — v2 does not exercise native tool or constrained-output integration (high for Agent qualification)

`gate7f/evaluation/v2/capture-contract.mjs:41` permits only user/assistant/system content messages;
`:46` emits no `tools` or `response_format`; `:58` rejects tool calls. Consequently exact JSON
proposal success proves text contract compliance, not native tool parsing or result continuation.
Schema text in `prompt.mjs:18` is an instruction, not decoder enforcement.

Current LM Studio documentation describes structured output and native tool calls through
`/v1/chat/completions`; v2 uses `/api/v0/chat/completions`. Verify installed-provider behavior rather
than assume the two endpoints have identical feature support. Use raw requests/responses and a
negative-control schema probe to establish that the option is actually honored. Keep strict local
validation even if decoder enforcement works. Unsupported schema keywords or provider rejection are
integration findings, not model mistakes. [Structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output),
[tool transport](https://lmstudio.ai/docs/developer/openai-compat/tools).

### R4 — supplied-state failure is not yet attributable to the model or template (medium)

`gate7f/evaluation/v2/prompt.mjs:15` prepends instructions to existing messages; state cases in
`gate7f/evaluation/corpus.json:164` and `:169` therefore send consecutive system messages.
The old capture proves what was sent to the API, not the final tokens delivered to inference.

Static inspection of the exact templates retained in the original v2 events found that **both**
support later system messages: Qwen template lines 111–112 render them; Gemma lines 227–234 and
323–349 render their role/content. There is no static support for the assertion that these templates
simply discard all later system messages. Hash equality confirms template bytes, not successful
runtime preprocessing, correct rendering, or model attention to the rendered state.

Also important: the Gemma recorded template expects assistant `tool_calls[].function.arguments` to
be a mapping (lines 249–262), while the compatible API ordinarily returns JSON strings. The provider
may normalize these correctly; test actual continuation before claiming either a defect or compatibility.
Do not patch a GGUF template merely because a text answer missed context.
[Gemma 4 formatting](https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4).

### R5 — comparison provenance is incompletely reconstructed by the v2 report (medium)

`gate7f/evaluation/v2/report.mjs:45` reconstructs wire requests and response fields, but it does not
recompute `runtimeFingerprintSha256`, validate `identity.sourceBundleSha256`, or revalidate load/template
metadata against sealed pins. These are recorded by the runner (`home-runner.mjs:100`, `:121`) and
were operator-checked, but the report alone cannot establish them.

An offline copied-in-memory mutation of all observation fingerprints, the bundle hash, and the load
template was accepted by `validateCapturedRows`; `summarizeCapture` still returned
`validForComparison: true`. Original evidence was not modified. This does not show that actual v2
evidence was altered; it shows a missing negative test and automated verification boundary.

New acceptance should bind exact capture source/package hashes, candidate artifact, runtime manifest,
loaded config/template, renderer/schema and schedule into the fingerprint and independently recompute
it during reporting. Validate the unique load/identity/cleanup event sequence and raw-observation
correspondence, including performance events. Each binding needs a deliberate one-field tamper test.

### R6 — repeated prompts and role totals need careful interpretation (medium)

`gate7f/evaluation/v2/home-runner.mjs:134` runs three adjacent identical requests at temperature zero.
This measures repeatability under that state/cache, not three independent draws or three different
tasks. The 23.6-second Gemma first-token outlier occurred at the transition to the first agent-schema
case, so cold processing/schema/token counts must be separated before interpreting steady-state speed.
That is a diagnostic lead, not an established explanation.

Report unique-case success, repeated-attempt stability, protocol success and semantic quality separately.
The compared Qwen Q6_K and Gemma Q4_0 packages are deployment candidates with different quantization;
do not generalize this to architecture-level or equal-precision superiority. Keep model-anonymized
adjudication independent of implementation and preserve per-case reasons/uncertainty.

## Minimal discriminating diagnostics before freezing acceptance

Run each condition for both candidates using identical semantic input. Preserve every result. Known
v2 failures belong in development diagnostics, never in the new held-out score.

1. **State delivery, one factor at a time.** Use two small cases: arbitrary synthetic nonce recall and
   pending-versus-confirmed receipt state. Compare consolidated first system, second system, and an
   explicitly labeled user-message state control. Include a no-state control. Capture actual formatted
   inference input if the installed runtime exposes it safely; otherwise record this observability gap.
   Change the nonce/state across successive stateless requests to detect accidental stale reuse.
2. **Endpoint/enforcement.** On the documented endpoint, compare plain schema-instruction output with
   `response_format` using the same simple schema and then the actual application schema. Use a required
   constant/enum conflicting with the user’s requested format as a decoder-enforcement probe. Unsupported
   provider/schema errors remain separate. Freeze the smallest supported schema contract only after the
   local parser and negative fixtures agree; do not relax authority semantics to fit a decoder subset.
3. **Native tool round-trip.** Request one available tool, retain its exact returned assistant tool call,
   append a matched tool result and ask for the resulting state. Test benign result, explicit failure and
   malicious result with the same task scope. Test forged/mismatched tool IDs locally. Validate argument
   deserialization and actual runtime template rendering; no model-generated command is executed.
4. **Cache/cold controls.** Mark first versus repeated request, capture prompt/output token counts and
   explicit cache metrics when supplied. Use a fixed interleaved schedule plus fresh-value variants;
   never claim caching is disabled when it is merely unobserved. At least one unload/reload cold comparison
   per model can distinguish startup effects without repeatedly interrupting the shared service.

After these diagnostics, freeze the same meaningful contract for both candidates and run independent
acceptance through the full inert application path, not a hand-authored final-receipt shortcut. Do not
count a safeguard rejecting a bad model proposal as a successful model answer. A strict forced JSON
decoder can improve transport correctness while leaving planning, grounding and authorization errors.

## New-runner safety checks to review before live execution

- Measure hardware during prolonged load/inference/concurrency, not only between requests; preserve
  unrelated listeners and BGE. Stop scheduling new work on a violated limit and abort only owned work.
- Treat a timed-out load as ambiguous residency. The old runner learns its instance ID only after a
  successful load reply (`home-runner.mjs:109–111`); never unload an arbitrary model to repair that gap.
  Use a task-owned load identifier if supported, or explicitly reconcile the pre/post inventory with
  conservative ownership proof and stop if ownership cannot be established.
- Unload in `finally`, verify exact owned cleanup, retain failure evidence even on provider errors.
  Do not declare missing work a model quality failure; keep it in the full scheduled denominator as
  unobserved/infrastructure failure and block affected role qualification.
- Initial one-hour soak is not a multi-user SLO proof. Record concurrency and queueing separately from
  generation speed. Zero failures in a bounded sample is not a universal reliability guarantee.

## Checks performed

- `node --test --test-reporter=tap gate7f/evaluation/v2/v2.test.mjs gate7f/gate7f.test.mjs`:
  **43/43 passed**. The new findings are absent coverage, not existing test regressions.
- Three read-only/in-memory diagnostics: out-of-objective-path model request executed;
  newly-denied pending proposal executed; altered provenance fields accepted by v2 report.
- Read exact v2 GGUF templates from retained synthetic events in the prior isolated worktree.
  No fresh qualification acceptance material was inspected.
- Source/working-tree checks performed; no host connection or model inference initiated.

The root operator and authority implementation agent were informed of R1/R2 immediately. The root
operator was informed of R3/R4/R5 before new inference. This is the initial review, not approval of code
that has not yet been written or independently inspected.
