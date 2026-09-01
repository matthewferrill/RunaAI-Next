# M1-S2 R13 Agent and Review correction implementation results

Status: implementation and deterministic verification complete. The sealed R13 campaign and independent
review are also complete; see `M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`. R13 qualifies
Chat, Research, Code and Agent but not Review. No production route changed and the customer trial remains
unavailable.

## Implemented Agent corrections

- Analysis-only Agent plans receive one model-neutral grounding review after protocol validation. The
  reviewer may revise only the summary; the application rejects any change to the exact planned steps.
  The original and final plan digests and model identity are retained separately from the ordinary
  protocol-attempt count.
- The task status API now returns an application-owned `runaai-m1-grounded-run-result/v1` projection.
  Its displayed summary is derived only from exact inspect, change, test, unresolved-repair and
  cancellation receipts. Planner prose cannot become the completed result.
- The function panel displays a final Agent result only when that grounded receipt projection has the
  exact trusted schema and `application-receipts` origin. Read-only inspection, applied changes, test
  pass/failure counts and unresolved states remain distinct.
- The acceptance journey now treats `repair-required` as the frozen explicit continuation boundary.
  It records that boundary and performs exactly one later `run.resume`; a second failure remains final
  rather than looping or receiving an unrecorded repair.
- Provider capture identifies the added analysis-only call as `read-only-plan-review`, and journey
  evidence retains the grounded run result separately from planner output.

## Implemented Review corrections

- The application owns a strict JSON-schema transport for the evidence checker. It accepts only the
  exact accepted or rejected shape frozen in the R13 criteria and fails closed on an accepted answer
  with a correction, malformed keys or invalid correction citations.
- Home-runtime request validation permits only the existing primary evidence schema or the new exact
  verifier schema; arbitrary structured-output contracts remain denied.
- The actual Mastra verifier call receives the strict structured-output contract for every candidate.
  Wire tests inspect the real SDK/HTTP request rather than trusting adapter configuration.
- Generic Review instructions require a material-claim ledger, relevant counterexamples and cross-file
  interactions, current versus stale authority, sample/baseline limitations, authentication versus
  resource/path authorization, precise support and truthful unknowns. Frozen case names and expected
  answers are absent.

## Deterministic verification

- Changed-path focused suite: 162 tests, 123 passed, zero failed, 39 intentionally skipped PostgreSQL
  branches. This includes real provider-wire, verifier-schema, planner, repair-continuation, function
  panel, request-coverage and governed wire-fixture tests.
- Complete repository suite under normal Windows child-process and bounded probe-write permissions:
  1,919 tests, 1,841 passed, zero failed, 78 environment-dependent skips.
- The first restricted-sandbox full run correctly exposed stale governed source hashes and one denied
  probe-fixture write. The prospective wire pins were updated to the new exact source bytes; the wire
  fixture then passed 13/13. The same complete suite with the required bounded filesystem permission
  passed with zero failures, so no failure was waived.
- Roadmap retrieval and verification passed with the implementation-checkpoint digest
  `a12aec62df5b7cd36830e0d749fa0f4502d53388a2450053015ffa6181e2df77` and 15/15 roadmap tests. The
  earlier frozen selection digest remains recorded unchanged in the prospective R13 criteria.
- `git diff --check` passed before this result was written and is required again immediately before the
  implementation commit.

## Sealed-work disposition

This implementation result alone did not prove model quality. The later sealed result now records
360/360 attempts, 12/12 model-free controls, complete Home/Control cleanup and all 963 candidate-blind
semantic decisions. Review remains below the unchanged threshold: Qwen3.6 is closest at 21/24 after
omitting one relevant stated security control in all three repetitions of one case. R14 prospectively
corrects only that generic completeness defect and requires a fresh full campaign. The customer trial
becomes available only after all five functions have a qualifying route.
