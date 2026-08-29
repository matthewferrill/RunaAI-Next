# Independent receipt-scope closure review — 2026-08-28

Reviewer: `codex-independent-model-role-review-20260828`, a fresh independent agent and author of neither the planner nor the model adapter.

Disposition: **closed within the fixed receipt-scope criterion**. No remaining product or evidence defect was found in this bounded correction.

This closes the receipt-supply finding recorded in independent review commit `aaa1d3df6199223ea3106adef58cb76d9b535787`. It does not change frozen baseline evidence or grades, qualify a model, authorize production, complete M1, or make a 17-family readiness claim.

## Source behavior

Implementation commit `a46fab1acc796cd86857bd05090e5d49e8dd361d` retains the existing ordinary path/suite filter and additionally requires every application-recorded `proposal.restorePaths` entry to be within the current grant before the proposal's receipt can be supplied to the planner. The fresh service preflight remains in force, so a guessed omitted receipt still fails before plan retention, proposal creation, intent creation, or dispatch.

Regression commit `1738aff9451724f65ae4159ef178ede2cb9d8deb` directly records the task's intent count before narrowed-authority replanning and asserts that it remains unchanged afterward. The same regression also checks that the restore-produced receipt is absent from planner input and that plans, proposals, receipts, and adapter mutations remain unchanged when the planner guesses the omitted ID.

## Independent byte and result verification

Evidence commit: `0417474044330f669954b7a1e4c018ab94647731`.

- Reconstructing `git -c core.autocrlf=false archive --format=tar 1738aff9451724f65ae4159ef178ede2cb9d8deb` produced SHA-256 `28c1590d71987772c1b9be63217940895be168053a1fc5ba0fd68697485d664a`, exactly matching the retained seal.
- Every one of the eight source hashes in `result.json` matched both its `1738aff` Git blob and the corresponding reconstructed archive entry. No normalized or alternate hash was accepted.
- `tests.tap` matched SHA-256 `0077d596049aa8517525da3ff0b20045d3adef52b30b49939fbec24fa651ca45`.
- `result.json` matched SHA-256 `756eccf2aa877b69730e27cf31d77d8a738828a5d64c4a3bdc06f88314d08f9b`.
- `SEAL.json` matched SHA-256 `2a3da6a9fa3c902e27e0e482aaa919f4c73419b5bbfb4a467d83b6a1b4662afe`.
- The retained disposable-PostgreSQL/LangGraph suite reports 70 tests, 70 passes, zero failures, skips, or cancellations. The targeted narrowed-grant regression is retained as `ok 22`.
- The retained result identifies deterministic planner/executor fixtures, real disposable PostgreSQL, stopped cleanup, removed owned synthetic data, and no production change.

The earlier R1 evidence remains diagnostic history because its source pins described CRLF working-tree materialization. It is not used for this closure decision.
