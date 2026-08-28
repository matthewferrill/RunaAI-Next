# M1 useful snapshot explanations — verified component result

Criteria were committed first in `cd76884`. Two generic planner instructions now require a useful
answer to read-only inspection/explanation requests from the already supplied current snapshot.
They distinguish static source analysis from completed tool actions, preserve requested read-only
steps and require uncertainty when evidence is insufficient. The initial summary is not a new
post-tool answer phase. All model controls, schemas, budgets and authority checks remain unchanged.

Executed verification:

- Planner/wire/role suite: 40/40, zero skips. Complete system guidance is byte-identical across all
  three models, both planning roles and both phases; no benchmark-specific facts are inserted.
- Actual disposable PostgreSQL task/orchestrator suite: 48/48, zero skips. The two new Code/Agent
  explanation cases retain the supported summary with only an observed inspection receipt, no edit
  or test and no repeat model request on resume. Provider/executor fixtures are deterministic and
  explicitly labeled; this is not model compliance or native isolation evidence.
- Existing function-panel and conversation-routing tests: 19/19, zero skips, retaining separate
  draft, source, authority, cancellation, restoration and execution-evidence presentation.
- Actual browser rendering at 19:36Z used the unmodified product `function-panel.mjs` with synthetic
  read-only response fixtures on a temporary loopback-only server. Opening the saved task and its
  details displayed the snapshot explanation under “Proposed plan — not execution evidence”, with
  “Actual receipt: project.inspect — observed” separately. Injected image markup was displayed as
  literal text, not an image. This proves presentation, not authentication, model quality or a real
  customer journey. The test tab was cleared and the owned listener stopped; port 65233 was verified
  no longer listening. No production or Home service was used.

Retained local evidence:

- `artifacts/runs/m1-approval-explanation-pg/result.json`:
  `b780eca697a2635dfd0e44d40f770b2152a600a77881fc142a4e15c4427d1ae5`.
- `artifacts/runs/explanation-ui-proof.json`:
  `ac77f8556b7019a6eab732528b4886f41e4a7292fc2a5ee72e57bc1d9fa1d8e6`.
- `artifacts/runs/explanation-ui-proof.mjs`:
  `60a7796c2a3424ee21536d36f152e59f27d48454ab28336e37c2763c81d6ee33`.

An independent reviewer inspected the criteria, instruction diff, source-qualified snapshot flow,
stored plan limits, UI text path and explanation fixtures without implementing the change. No
blocking source finding was reported. Actual model explanations remain subject to the full fresh
three-model campaign; prior failures are not regraded. M1 and the 17-family roadmap remain open.
