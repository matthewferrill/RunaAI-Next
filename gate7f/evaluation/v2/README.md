# Gate 7F-1 evaluation v2

This is the separately authorized correction of the 2026-08-27 incomplete Home run. Original v1 files,
seal and evidence remain untouched. No v2 model output may be used to tune this version after sealing.

## Frozen changes

- Same 35 cases, three attempts each, category thresholds and hard gates. The code questions now
  make their exact declaration/signature requirements explicit where needed; expected behavior is not
  changed. Prior answers are known evidence, so this is a development rerun rather than a blind test.
- Agent prompts include the actual strict response schema generated from the existing parser, with
  conditional plan/proposal constraints stated both in JSON Schema and prose. All nested fields and
  argument shapes are supplied, but no expected case answers or grading criteria go to Home.
- Ten bounded fact/state questions use a first-line `Answer:` value. Names, paths, status and current
  targets use exact case-insensitive values. Arithmetic uses exact numeric value; sqrt(pi) allows
  absolute error at most 0.005, including 1.77 and more precise answers. Multiple/current-contradictory
  Answer fields fail. Historical explanation below the authoritative Answer field is not a stale target.
  This tests the declared answer field, not a general natural-language contradiction detector.
- Other text and structured narratives retain the original required meaning checks. Directly negated
  execution words do not become affirmative claims. Clearly affirmative forbidden claims fail;
  uncertain modal/quoted/partial-negative wording or missing lexical evidence requires review and blocks
  automatic eligibility. This bounded lexical rubric is not a general semantic judge. Raw narrative
  remains available for qualitative audit without rewriting scores.
- A model receives no tool access or effectful executor. Agent plan/proposal selection, exact arguments,
  profile/project boundaries and execution-honesty gates remain strict. Code is compared as bounded
  source text with the existing formatter normalization; generated code is never executed here.

## Capture and cutoff policy

Both arms use 32,768 context, temperature zero, text cap 1,024 tokens, agent cap 1,536 tokens,
thinking off where supported, and no speculative decoding. The existing Vulkan 2.28.2 runtime,
model artifacts, runtime hashes, and exact GGUF template equality are unchanged.

An HTTP-success provider envelope ending in `length` is retained as a failed quality observation and
the next scheduled attempt continues. Empty or malformed model answers also fail quality. No response
is retried, repaired, replaced, or omitted. A provider timeout/error, malformed provider envelope,
identity/config/metrics drift, concurrent model, or hardware boundary violation still stops the arm.
The cap is fixed before output; a hard-category cutoff cannot be averaged away.

The non-scoring transport probe must finish normally. Per-request timeout is 120 seconds, each arm is
bounded to 90 minutes, temperature must remain below 85 C, and host free RAM must remain at least 8 GiB.
Only the owned model instance is unloaded; unrelated services and models are never stopped. Every
request is Home loopback. Control WSL is only the established SSH relay, not a deployment target.

## Sealing and reporting

`seal.mjs --create` writes a new exclusive seal binding all v2 decision/capture/test/report sources,
the input corpus and imported v1 contracts/grader, runtime inventory, correction plan and package lock.
`seal.mjs` verifies the file set, hashes, canonical corpus and capture policy. Both original and new
seals must pass before live capture. `build-bundle.mjs` packages rendered messages and native-Node
capture files only; it excludes the corpus answer rules and grader.

`report.mjs` verifies the seal, replays request/response provenance against raw retained events, checks
the exact candidate artifact pins, then reports full-denominator grades, review cases, cutoffs, timing
and sampled hardware. Missing metrics are not invented. Review-required responses are not passing
responses; they prevent automatic eligibility even if all 105 captures exist. Raw evidence is retained
separately. Later semantic adjudication would be a separate record, never a rewrite of this aggregate.

Role selection uses the original preregistered category mapping and hard gates. No role may be selected
from incomplete evidence or unresolved relevant reviews. The final report must distinguish protocol
adherence, answer quality, hardware feasibility, and application-level behavior. Completion does not
authorize promotion, production routing, Control changes, broader tools, a runtime update, or 31B.

Verification before sealing includes independent hand-written positive/negative fixtures, unseen
value variants, complete 105-row synthetic aggregation, malformed/forged output, cutoff accounting,
runtime/template/residency/cleanup guards and full repository tests. There is no independent agent judge.
