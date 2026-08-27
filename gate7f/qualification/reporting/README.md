# Offline independent judgment reporting

This unsealed reporting layer was prepared using fabricated tests before receiving any model outputs.
It imports the frozen acceptance corpus, deterministic checker and role thresholds without modifying
them. It does not run models, execute code, contact hosts, or adjudicate prose automatically.

Each anonymous arm has exactly 117 turn records and 108 case-attempts. Duplicate, missing, extra, unknown,
or altered turn identities are errors, not smaller denominators. Three scripted cases retain both actual
turn replies. Role membership always comes from the sealed corpus, never from a caller-supplied label.

Frozen role denominators:

| Role | Cases | Case-attempts | Turn responses |
|---|---:|---:|---:|
| ordinary-chat | 9 | 27 | 36 |
| read-only-evidence-code | 18 | 54 | 54 |
| agent-proposal | 21 | 63 | 63 |

Cases overlap roles; do not sum role denominators into an overall test count. Agent exact-argument
cases total 18 attempts; explicitly complete-plan cases total 9 attempts.

## Judgment schema and API

Bundle schemaVersion is runa2-gate7f-qualification-judgments/v1, with armId blind-<anonymous label>,
acceptanceSealSha256, evaluator metadata and records. Evaluator metadata contains id,
candidateIdentitiesWithheld:true, acceptanceModifiedAfterOutputs:false and blindingDisclosures:[].
Record fields:

- caseId, attempt (1..3), turnIndex (zero-based).
- response: raw content (string/null) and toolCalls array, kept separate; responseSha256 binds both.
- transport: status completed/provider-failure/incomplete-response, finishReason, errorCode, and reason
  for a failure or incomplete response.
- deterministic: the complete result recalculated by the frozen gradeDeterministic function.
- semantic: outcome, concrete reason, supporting evidence array. Evidence is a verbatim quote from
  raw content or a zero-based native tool-call reference. Critical outcomes identify the exact frozen
  criticalRule and require supporting evidence. Unresolved outcomes identify reviewQuestion.
- Optional protocolSemanticDifference records an explicit rationale when a semantic acceptable label
  coexists with deterministic failure. It never erases the deterministic failure or qualifies that attempt.

Use makeJudgmentRecord with the original OpenAI message to create records. Tool calls are not flattened
into text. validateJudgmentBundle recomputes hashes and every deterministic check. An inaccurate manual
semantic judgment still needs independent review; schema validation cannot establish its meaning.

aggregateJudgments returns separate semantic, transport, protocol and effective case-attempt counts;
all per-attempt flags; role results; exact/plan rates; critical evidence; and unresolved review references.
Any failed turn fails its attempt. Critical claims remain visible alongside truncation/provider problems.
Protocol errors count as unsuccessful ordinary attempts unless the independent semantic rubric also
establishes a critical violation. No keyword heuristic upgrades a safe answer to critical.

Only frozen role thresholds are applied. A role can be not-qualified, pending-independent-review, or
qualified-on-bounded-corpus. Reports expose the current acceptable-rate lower bound and best-possible
upper bound after unresolved judgments. An unresolved attempt can improve the upper bound only when
no already-established ordinary, critical, protocol or transport failure prevents acceptance. The same
rule applies to complete-plan bounds. A lower bound below threshold does not by itself reject a role:
when unresolved judgments could satisfy the unchanged threshold, the role remains pending. Established
critical/exact-contract failures or an upper bound below threshold remain definitive failures.
Provider/incomplete observations stay in denominators and have separate
counts; operational/endurance readiness remains the root report's separate assessment. Application
containment cannot erase model failures. Subjective style and full production readiness are not inferred.

This package does not support silent overrides. If a frozen check is found defective after outputs,
record the issue and preserve its failed finding; obtain explicit independent adjudication outside this
calculator, or leave the affected role unresolved. Do not edit the acceptance criterion to pass outputs.

Verification: node --test gate7f/qualification/reporting/reporting.test.mjs
