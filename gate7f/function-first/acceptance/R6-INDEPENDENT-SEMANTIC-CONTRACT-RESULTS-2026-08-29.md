# R6 independent semantic contract results

Status: prospective implementation and offline verification on branch
`codex/r6-independent-semantic-contract`, based on exact source commit
`d01f5178d7e469e60c7bda66ff4251ae972f1c2e`. No historical campaign evidence,
host, model, service, route, or production state was read or changed by these
tests.

The reusable validator in `independent-semantic-review.mjs` requires one exact
candidate-blind decision for every one of the 360 frozen attempt IDs. It binds
the raw observation and its ledger record, hashes the complete JSON value of
every retained provider response, and requires every frozen meaning-based check
and expected fact exactly once. Objects are closed-schema: missing, duplicated,
extra, inherited, or default verdicts fail validation.

For readable evidence, an absent expected fact is a determinate failure with
`expected-fact-absent`; a contradiction is a determinate failure with
`expected-fact-contradicted`. `uncertain` is limited to evidence that is
`missing`, `corrupt`, or `unbound`, and grades inconclusive with the matching
reason code. Exact one- and two-character outputs are supported through bound
pointers and complete-value hashes. The validator contains no answer keywords
or lexical semantic pass/fail logic.

Verification executed serially on 2026-08-29:

- `node --test --test-concurrency=1 gate7f/function-first/acceptance/independent-semantic-review.test.mjs gate7f/function-first/acceptance/assertions.test.mjs gate7f/function-first/acceptance/run-model-campaign.test.mjs`: 61 passed, 0 failed, 0 skipped.
- `npm run verify:roadmap`: 15 passed, 0 failed, 0 skipped; roadmap revision `2026-08-28.1`, digest `613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
- `git diff --check`: passed.

This verification establishes only the prospective schema, validator, grader,
and regression behavior. It does not grade R5, qualify an R6 candidate, or
authorize deployment.
