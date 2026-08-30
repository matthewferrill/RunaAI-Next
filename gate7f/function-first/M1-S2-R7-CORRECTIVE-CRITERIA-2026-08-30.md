# M1-S2 R7 prospective corrective criteria

Date: 2026-08-30  
Scope: model-neutral M1-S2 correction and fresh three-candidate functional campaign  
Production routing: unchanged

## Evidence boundary

R6J is immutable diagnostic evidence. Its 360 attempts, prompts, case bundle,
rubric, results and grades are not reinterpreted or overwritten. R7 uses a new
source archive, case-bundle digest, runtime seal and semantic rubric. No R7
result may be back-applied to R6J.

R6J showed that the shared application and all 12 model-free controls passed,
but no candidate met all five role thresholds. The corrections below address
cross-candidate failure patterns without inserting any case answer into a model
instruction.

## Corrective contract

1. **Complete-request handling.** Every answer role is instructed to answer each
   distinct requested fact, comparison, constraint and unknown. Explicit negative
   evidence remains material. The instruction is generic and contains no R7 case
   name, filename, number, answer or expected conclusion.
2. **Explicit work intent.** A new task records exactly one of `analysis-only`,
   `preview-only` or `effect-requested`. The UI requires the selection. Grants are
   narrowed to the capabilities needed for that intent; approval profile remains a
   separate decision about permitted effects.
3. **Bounded plan correction.** For effect-requested edits, every preview and apply
   must be ordered and argument-identical. Analysis and preview intents reject
   effect steps. The application may ask the same selected planner for at most one
   JSON-only correction inside the original planning deadline. Correction cannot
   add capabilities, approval, receipts or authority. A second invalid plan fails
   closed.
4. **Durable protocol evidence.** The application records both plan attempts,
   their digests and violations, selected role/model/settings, correction count and
   the final clean protocol result. This record is integrity-checked on reload and
   remains separate from the one permitted failed-test repair plan.
5. **Application-owned outcome wording.** A run status response derives file-change
   and test-execution status from that run's canonical proposals and receipts. Model
   prose cannot stamp `applied`, `ran`, `none-recorded` or `unknown`. Agent02's model
   grade covers formula diagnosis; its no-change/no-test facts are application
   checks.
6. **Independent browser timing.** The Agent05 in-flight browser remains an
   independent observation. A one-use, loopback-only harness endpoint is armed
   before the observation deadline. It records server receipt time and consumes
   the exact checkpoint token once. A later forensic file fsync cannot invalidate
   an on-time live receipt, and an after-deadline, replayed, foreign or malformed
   receipt still fails closed.

## Frozen prospective evaluation

- Acceptance policy: `2026-08-30.1`.
- Case bundle SHA-256:
  `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`.
- Independent semantic rubric:
  `2026-08-30.r7-function-contract`.
- Roster: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B and Qwen3.6 27B MTP.
- Roles: Chat, Research, Code, Agent and Review.
- Denominator: 8 distinct cases x 3 repetitions x 5 roles x 3 candidates =
  360 task attempts. No blocked, incomplete or failed attempt is removed.
- Qualification threshold: at least 22/24 acceptable attempts in every role for a
  selected candidate, zero critical model failures, zero critical product failures
  and 12/12 model-free controls.
- No winner is presumed. Role-specific selection remains allowed only when that
  role's complete evidence meets the contract.

The source commit and source-archive SHA-256 are filled by the release/seal step;
the archive must contain this criteria file and the exact implementation under
test. The runtime seal must then bind that archive, case bundle, rubric, model
artifacts, installed identifiers, role settings, auxiliary endpoints, application
configuration, capability digest, fixed suites and evidence destination before the
first scored inference.

## Required validation before a scored run

- Planner-protocol unit tests: exact pairing/order, analysis and preview limits,
  one correction, second-invalid fail-closed, input immutability and role/model
  binding.
- Task/application tests: explicit intent parsing, least-capability grants, durable
  correction record and digest, restart integrity, per-run outcome projection and
  UI wording from server evidence only.
- Browser tests: one-use loopback receipt, replay denial, exact checkpoint/scope/
  cancellation binding, on-time live receipt without ack-file dependency and
  after-deadline rejection.
- Existing full repository test inventory and roadmap retrieval check.
- Fresh model-free Control suite on the sealed source/runtime.

## Run and decision sequence

1. Commit and push the correction; build a fresh source archive from that commit.
2. Seal the prospective criteria, runtime and case bundle before inference.
3. Run the 12 model-free controls on Control.
4. Run one large model at a time on Home through the same candidate application;
   retain all 360 attempts and hardware telemetry, then unload each model.
5. Grade all provider outputs with the new candidate-blind rubric and a separately
   retained explicit decision bundle.
6. Publish per-role results and true failure themes. Advance to steward customer
   testing only if the application controls pass and at least one intended role
   qualifies. Production routing remains unchanged until that later human trial and
   release decision.

Rollback for this corrective slice is source/config rollback to the prior immutable
commit. Evaluation storage is synthetic and disposable; cleanup never changes
production, legacy RunaAI, protected stores or model routing.
