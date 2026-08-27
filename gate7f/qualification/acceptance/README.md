# Qualification acceptance package

Owned by the independent evaluation agent; does not load models, call a provider, or change a host.
Frozen v1/v2 evaluation files remain untouched.

Public integration API:

```js
import { loadAcceptanceCorpus } from './corpus.mjs';
import { renderAcceptanceInputs, countInferenceRequests } from './inputs.mjs';
const corpus = loadAcceptanceCorpus();
const publicInputs = renderAcceptanceInputs(corpus); // only this value can go to Home
```

Public case fields: `id`, `roles`, `mode` (`text`, `agent-json`, `native-tool`), `messages`, optional
`trustedState`, `capabilities`, `tools`, and `turns: [{ user }]`. Consolidate trusted application state
using the final frozen provider adapter; do not turn tool content into system instructions. Native tool
history uses ordinary OpenAI `assistant.tool_calls`, `tool.tool_call_id`, and JSON argument strings.
Keep emitted native calls distinct from narrative content. Standard native tool names are
`workspace_inspect` and `workspace_apply_synthetic_change`. They remain inert. Agent JSON uses the
existing complete `AgentEvaluationOutputSchema`, with explicit conditional fields enforced by the
provider adapter and validated by the existing strict parser.

The root decides/finalizes common system instructions, structured-output transport, output budgets,
context, runtime configuration, and model-specific serialization before acceptance inference. Suggested
budgets are at least 1024 tokens text / 1536 structured; root records the actual fixed budgets. No hidden
retry, repair, discarded first result, or cap-based early model exclusion is permitted.

There are 36 cases x 3 attempts = 108 case-attempts per model. Three cases add one actual follow-up,
for 117 requests per model. Do not use prewritten assistant answers for these three continuations.
Store every turn, and preserve invalid output and provider failure as distinct result types.

Evaluator-only API after provider implementation freeze:

```js
import { gradeDeterministic, rawOpenAiMessageToResponse } from './checks.mjs';
const result = gradeDeterministic(item, rawOpenAiMessageToResponse(rawMessage), { turnIndex: 0 });
// result.semanticReviewRequired is always true; follow RUBRIC.md independently.
```

Never transfer `corpus.mjs`, `checks.mjs`, `RUBRIC.md`, expected answers, or private rubric entries to a
model host. Do not inspect acceptance answers during runtime implementation. `tools.mjs` and stripped
rendered values are public transport data. `validate.mjs` checks corpus structure without model calls.

Verification commands:

```powershell
node --test gate7f/qualification/acceptance/acceptance.test.mjs
node gate7f/qualification/acceptance/seal.mjs --verify
```

`SEAL.json` binds acceptance package source/tests/rubric and the preimplementation criteria plus the
existing typed parser dependency. The final complete runtime freeze must also bind the rendered public
input bundle and its own code/configuration. Raw evidence and adjudication reports live outside this
sealed directory. Preserve anonymous mapping separately from response review packets.
