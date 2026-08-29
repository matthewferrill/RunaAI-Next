# M1 R6 determinate function qualification criteria

Status: prospective correction frozen before any R6 runtime seal, control, model
attempt, semantic decision, or deployment. This is M1-S2 only; it does not
replace the remaining seventeen-family roadmap.

Roadmap revision `2026-08-28.1` was retrieved for this decision with digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
The bounded capability set remains C01 C02 C03 C04 C06 C07 C12 C15 C16.

## Why R6 is required

R5 ran the fixed three-candidate roster through all 360 planned application
attempts and retained the results. It cannot qualify a deployment because the
matched grade ledger contains inconclusive entries. R5 remains immutable and
nonqualifying. No R5 attempt, browser acknowledgement, semantic decision, lease
marker, or grade may be rewritten, selectively reused, or spliced into R6.

The retained evidence identifies three shared qualification defects rather than
a reason to reduce the corpus:

1. The Agent05 browser observer allowed only ten seconds inside a fifteen-second
   post-receipt hold. Actual owner-browser acknowledgements could arrive after
   that evidence window even though dispatch, cancellation, durable receipt and
   cleanup were correct.
2. The independent semantic workflow permitted default-pass decisions and could
   classify an explicitly absent expected fact as `uncertain`. Readable complete
   output with an omitted required fact is a determinate failure, not an evidence
   gap.
3. The Home campaign lease reserved none of its sixty-minute application window
   for result finalization and create-only completion publication. Qwen R7
   recorded all 120 attempts but expired 5.761 seconds after `result.json`
   finalized and before a completion marker could be published.

## Corrections frozen before outputs

### Exact browser observation

- The synthetic post-receipt hold is 25 seconds; the graded in-flight browser
  wait is at most 20 seconds. Executor deadlines, process caps and network denial
  are unchanged.
- Preparation remains ungraded and occurs before native dispatch. The graded
  acknowledgement must bind its preparation checkpoint, principal, project,
  task, experience and session hash.
- `task.cancel` must return the exact task in `cancelled` status. Its authoritative
  `updatedAt` is the cancellation time supplied to the checkpoint.
- Browser `observedAt` must be on or after cancellation and before the exact
  deadline. The observed URL, project and task must match, and the same-session
  DOM must state both cancellation and bounded drain/receipt-pending truth.
- Pre-cancel, late, stale, wrong-task, wrong-project, wrong-session or preparation
  evidence cannot satisfy a UI check. Native receipt release remains in `finally`.

### Determinate independent semantic review

- Every one of the 360 attempt IDs and every frozen meaning-based check and
  expected fact requires an explicit decision. No default verdict, inherited
  decision, lexical keyword grade, missing entry, duplicate entry or extra entry
  is permitted.
- The evaluator receives candidates in a fixed candidate-blind order and records
  one evaluator/rubric version for the complete campaign. It must be independent
  of the implementation and campaign runner.
- Each sidecar binds the exact raw observation and record hashes and enumerates
  every retained provider output pointer with the SHA-256 of its complete JSON
  value. Critical-behavior review must cover every provider output.
- When the complete relevant output is readable, an expected fact that is absent
  is `fail` with reason code `expected-fact-absent`; a contradiction is `fail`
  with `expected-fact-contradicted`. `uncertain` is reserved for missing,
  truncated, corrupt, unreadable, or unbound evidence and therefore blocks the
  matched batch.
- A complete readable answer with no quotations because of evaluator-schema
  limits is a schema defect and blocks publication; it is not a model
  inconclusive. The schema must support the actual bounded output.

### Lease and publication margin

- The model batch remains capped at 60 minutes. The READY lease is 70 minutes:
  seven minutes of observed launch allowance plus sixty minutes of application
  work plus three minutes reserved for publication.
- A campaign may not start unless at least 63 minutes remain. New attempts stop
  four minutes before expiry; remaining work is hard-stopped three minutes before
  expiry. Every started and unexecuted slot is retained with a typed stop reason.
- The immutable result is written and synced before completion/abort publication.
  No renewal, late marker, overwrite, or acceptance after expiry is allowed.
- Preparation remains ten minutes. Worker cap is 82 minutes including two
  minutes for owned cleanup; supervisor/task cap is 86 minutes including four
  minutes for independent recovery. Exact arithmetic is machine asserted.

## Fresh matched qualification

After the corrected source and tests are committed, build one new common R6
runtime seal. Run twelve fresh model-free controls, then the unchanged forty
cases three times for each exact pinned candidate: Gemma 4 26B A4B, Qwen3-Coder
30B A3B, and Qwen 3.6 27B MTP. That is 360 fresh model attempts and a 372-entry
control/model ledger under one R6 seal.

All candidates keep the same application stack, cases, role budgets, provider
settings, artifacts, containment and hardware policy. Ordinary determinate model
failures remain in the denominator. Only the selected candidate for a role must
meet at least 22 of 24 acceptable attempts, but every candidate/role must have 24
determinate entries, zero missing/blocked/not-implemented entries and zero
critical product failures. No expected-answer tuning, hidden retry, favorable
subset, or role-specific stack change is allowed.

R6 qualification still does not authorize production by itself. Deployment
requires exact independent grades, explicit role selection, a rollback-protected
Control successor, predecessor preservation and the ordinary-user customer
journey. Human testing begins only when that successor is ready.
