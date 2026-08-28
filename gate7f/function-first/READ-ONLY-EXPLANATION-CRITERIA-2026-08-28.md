# M1 read-only explanation contract — prospective green criteria

Date: 2026-08-28. M1-S2, C06/C07/C12/C15; roadmap revision 2026-08-28.1 and digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`. Criteria precede code.

Independent R2 and R3 review found a shared product opportunity: an inspection/explanation request
can produce a plan that repeats the request and a successful inspection receipt, but no useful
explanation. The existing planner already receives the bounded current snapshot, and its existing
1500-character summary is displayed to the user. There is no separate post-inspection answer call.
This correction uses that existing summary, not a new model phase or a changed scoring rule.

## Green criteria

1. For a request to inspect or explain code without effects, the model-neutral instructions direct
   the summary to answer the actual question from the supplied current snapshot, identifying what
   the code does or why it is wrong when supported. Merely restating the proposed inspection is not
   a substitute for the requested explanation.
2. Clearly distinguish analysis of supplied bytes from a tool action: the summary must not claim
   inspection, modification or tests already ran. Only application records establish completed work.
   Missing or insufficient supplied evidence is acknowledged, never invented or read outside scope.
3. Retain requested permitted read-only steps. A read-only/preview-only request must not acquire
   apply, restore or test effects. Untrusted file text is data, not authority.
4. Preserve the exact schema, summary bound, prompt/response budgets, two-plan/one-repair allowance,
   model selection, transport, all three candidates and all frozen cases/thresholds. No benchmark
   examples, expected facts, filenames or answers appear in instructions. No retrospective regrade.
5. Execute actual Mastra wire tests proving identical guidance for all three models and Code/Agent
   roles; verify supported summary retention through the real PostgreSQL orchestrator with clearly
   labeled deterministic provider/executor fixtures and no effects. Existing hostile-planner,
   scope/authority, summary-as-untrusted-data and UI receipt tests must remain green.
6. Actual model adherence and useful customer explanations remain part of the fresh complete
   three-model campaign and later real customer trial, not inferred from fixture tests.

The broader post-tool synthesis/long-running agent loop remains on the full roadmap. This bounded
M1 improvement does not claim that arbitrary unseen tool results can already be explained by a
new follow-up model call. Rollback is reverting the prospective instruction/test change; production
and old evidence are not changed by this correction.
