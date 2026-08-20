# Routing contract supplement — preregistration

Frozen before execution on 2026-08-20.

## Reason

The general role matrix asked models to invent `category` and `priority` values without providing the
allowed taxonomy. Exact-label failure in that arm cannot decide routing fitness. This supplement fixes
only that instrument gap. It does not replace any other role result.

## Contract and cases

Use LM Studio's OpenAI-compatible JSON-schema response format. The only allowed categories are
`billing`, `product_help`, `outage`, and `account`; priorities are `normal`, `high`, and `critical`.
The schema requires exactly `category` and `priority` with no additional properties.

Eight fixed cases cover duplicate billing, billing question, UI help, general product help, total API
outage, isolated API error, immediate cancellation, and end-of-term cancellation. Expected labels are
embedded in the sealed runner.

## Candidates and gates

Test only models that met the existing 10 token/s routing speed floor and remain plausible resident
arms: Qwen3 4B, Qwen3 Coder 30B-A3B, Qwen3.6 27B with MTP, and gpt-oss-20b. Llama 3.3 70B is already
disqualified at roughly 3.7 token/s; Qwen3.6 base is represented by the same weights with its proven
faster MTP runtime arm.

A model passes at **8/8 schema-valid exact labels**, median generation at least 10 token/s, zero HTTP
or parse errors, and successful unload. The fastest passing model is selected for model-mediated
routing. If none passes, routing stays deterministic application policy; no custom routing model is
introduced.

