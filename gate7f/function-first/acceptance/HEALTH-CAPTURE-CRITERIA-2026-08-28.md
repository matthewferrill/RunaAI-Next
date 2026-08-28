# M1-S2 prospective health-read capture correction

Baseline: `b0758dbae7f3db53bdee23c66ab08269f6152447` and stopped runtime seal
`c85583188c65df5d446f83fc6ba414ea32ba234d2c955ae8f923419440ef93c9`.
Roadmap revision `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This corrects M1-S2 C15/C16 application acceptance plumbing; all 17 roadmap
families remain. It does not add a Runa executor, health-derived authority,
model qualification, product deployment or new milestone.

## Reproduced boundary failure

The second Gemma campaign stopped after 24/120 slots. Code08's actual model
role was correct, actual restore/test receipts were present, and the parent
browser independently observed the restored workspace and the restored baseline's
failed test results. Its browser acknowledgement was consumed and its UI check
passed. The only failed deterministic check was `provider.role`: two legitimate
application health GETs were recorded as unexpected inference routes.

The exact raw pointers are `provider.unexpectedCalls[0]` (`embedding`, `/models`)
and `[1]` (`reranker`, `/health`), both `m1-capture-route-denied` at 18:29:09Z.
The capture proxy's POST-only allowlist rejected these; the campaign correctly
stopped on a recorded forbidden route. Preserve that original stop/grade and all
unexecuted slots. Do not relabel or replace the frozen evidence.

## Exact route contract and exclusions

- Permit only bodyless, query-free `GET /models` on the embedding capture and
  `GET /health` on the reranker capture. Neither path is enabled on the primary
  answer/planner provider capture. No aliases, trailing paths, absolute request
  targets, query strings, alternative methods or model-management commands.
- These requests reach only the same pinned configured auxiliary upstream,
  with no forwarded browser credentials, redirect following, request body or
  model inference. Bound reads to two seconds and 64 KiB; retain actual status
  and response or a typed failure. Never invent a healthy upstream.
- Record permitted health observations in a separate health category. They
  cannot count as provider calls, retrieval operations, model answers, role
  evidence, or successful execution. Wrong routes remain unexpected calls and
  keep the existing fail-closed campaign stop policy.
- Model-free control mode still contacts no upstream provider, embedding or
  reranker service. An allowed health read reports explicit unavailability in
  that mode and is captured as a health observation, not a fabricated success.
- Preserve existing POST inference routes, model ID checks, request seals,
  body/output limits, deadlines, drain/cancellation behavior and zero hidden
  retries. Do not modify the 40 frozen cases, denominators, thresholds, model
  prompts, task authority, native runtime or old raw/graded evidence.

## Application route map and prospective verification

`gate6b/public/status.js` initializes from `/api/runtime/status`,
`/api/readiness/status` and `/api/session/status`; there is no automatic periodic
health timer in the current browser script. In the actual acceptance host,
readiness calls `composeM1Functions.health()`, which probes Qdrant `/readyz`,
embedding `/models`, and reranker `/health`. `/health/ready` invokes the same
dependency health function; `/health/live` and runtime/session status do not.
Qdrant's existing exact read allowlist already contains `/readyz`.

Before a new campaign seal, require:

1. Real loopback HTTP positive/negative tests for these exact health routes,
   body/query/method rejection, redirects, timeout and output caps; record actual
   upstream calls and prove no POST/model command can pass via the health path.
2. All three capture kinds in model-free control mode make zero upstream calls.
   Health-only observations cannot pass model-role/answer grading. Valid inference
   following health reads retains exact original model/role and body behavior.
3. Actual application readiness/startup calls over these proxies, including
   repeated `/health/ready` probes and reload beyond the two-second health window,
   produce separate health evidence and zero false containment events.
4. Parent-owned actual browser initial load and reload of an isolated real
   application host; retain real DOM and server capture across a bounded repeated
   health-observation interval. A Node HTTP test alone cannot claim browser proof.
5. Existing acceptance regressions and roadmap checks remain green. Any actual
   browser/native/host work uses a new owned disposable stage; no Home model load,
   production configuration, private store or preserved campaign change.

## Recovery and handoff

Commit these criteria before implementation. Retain actual test and browser
results separately, including any unavailability. Parent integrates the reviewed
correction, freezes a new common source/runtime seal, and reruns exact controls
before fresh model attempts. Old stages and records remain intact; rollback is
the prior immutable implementation, not deletion of evidence or user data.
