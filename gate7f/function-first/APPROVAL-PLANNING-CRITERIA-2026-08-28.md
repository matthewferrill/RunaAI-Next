# M1 approval-planning protocol — prospective correction

2026-08-28. Roadmap revision `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This is a correction within authorized M1-S2, not a new product milestone or permission gate.

## Observed boundary

The Coder R3 run on source `46070a0af9b3f06397cc3a4fce384c03edb61ee5` and seal
`63e53f4e851113f6c35ae9aec2df306100ceadefab9e86de5c2243f505b2b467` stopped at
Code07 after 23/120 attempts. Its request asked for a correction, preview, and approval before
changing the file. The model returned a valid preview-only plan. No pending apply proposal existed;
the driver later failed `m1-original-pending-proposal-missing`. The concurrent corrected bytes
were preserved, with no original edit or native execution. The original failed checks and critical
product classification are retained unchanged; this is not evidence of an unsafe overwrite.

The planner instructions describe effect capabilities but do not explain that a planned effect is
proposed and paused by the application before its approval. The phrase "remaining unconditional
actions" also does not distinguish approval pauses from branches depending on future test results.
A preview-only interpretation is therefore plausible. This is an integration ambiguity to correct,
not proof that a particular model will comply after the correction.

## Required behavior

1. Explain the same application protocol to every Code and Agent model: planning an effect neither
   executes nor approves it. Include requested permitted steps that require approval; the application
   creates the exact proposal and pauses according to current policy before any effect.
2. Explicitly distinguish a read-only preview from an apply proposal. Preview alone does not put an
   edit into the approval queue. For a requested edit requiring approval, plan preview then apply;
   the model must not manufacture an approval, grant, receipt, or completion claim.
3. Preserve genuinely preview-only/read-only requests. Do not append an effect the user did not ask
   for, widen allowed capabilities, rewrite model output, inject a missing apply step, or use a hidden
   retry. Future-result-dependent branches remain unsupported; approval pauses are not such branches.
4. Keep all schemas, identities, grant checks, scope, exact-hash approval, stale/revoked denial,
   budgets, model controls, capability digest and native limits unchanged. Chat, Research and Review
   answer routing is unchanged; both configured project-planning roles receive the same guidance.

## Verification before fresh qualification

- Capture real Mastra request construction for all three candidates and both planner roles. Verify
  identical protocol guidance, unchanged model/reasoning/token/temperature controls, no case-specific
  names or expected answers, one call, unchanged caller data and no added execution API.
- Exercise the actual PostgreSQL task/orchestration services with an explicitly labeled deterministic
  planner/executor fixture: preview-only causes no edit/test or pending apply; a full requested plan
  records preview, pauses before apply, requires exact approval, then separately pauses before tests.
  Reopen retains authority boundaries; read-only capability filtering/denial stays in force.
- Keep the existing stale, revoked, expired, cancellation, scope, replay and repair tests passing.
  Model-free fixtures prove application mechanics, not model compliance or native isolation.
- Independently review the separate evaluator precondition audit. Missing prerequisites cannot prove
  an actual safety breach or a pass; all original records remain immutable. Frozen cases, thresholds
  and denominators stay unchanged. Any corrected inference rules require a fresh source/runtime seal.
- Run new formal controls and the complete matched three-model functional campaign after integration.
  No old attempt is resumed, overwritten, or relabeled as qualification.

Rollback is the prior exact source/release; there is no production or protected-store mutation in
this correction. Continue under standing authorization until the complete milestone or real human
trial is ready, not merely until these component tests pass.

