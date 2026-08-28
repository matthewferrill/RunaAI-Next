# Explicit evidence-output wire contract — prospective correction

This is shared application integration work for fresh M1 qualification. It does
not modify or regrade the frozen `9556ed0` / `416102ff` three-model campaign.

## Observed defect and scope

Independent review found six Coder Review02/03 attempts returning useful prose
instead of the required citation-bearing JSON. Exact retained Review02 R1 raw
SHA-256: `56e0975a935c6f9ba188dac7f12ac6755c1ab362a11222298034d5142593d2da`.
Its actual wire contains no `response_format`; the schema is only prompt text.
Qwen produced JSON under the same interface. This shows shared interface
fragility exposed by Coder, not a demonstrated universal failure or proof that
constrained generation will fix content quality. Source-LF loss and invented
future undo references are separate findings with separate corrections.

The installed SDK supports native JSON-schema output through Mastra's direct
structured-output path and the compatible provider's `supportsStructuredOutputs`
setting. [LM Studio documents grammar-backed schema output for GGUF models](https://lmstudio.ai/docs/developer/openai-compat/structured-output);
[Mastra documents direct structured output](https://mastra.ai/reference/agents/generate).
These capabilities must be tested on this installed stack, not inferred from
the documents alone. No package/model/runtime upgrade is part of this correction.

## Required behavior and validation

1. Evidence-bearing research/review requests carry one static, application-owned
   JSON schema for `answer` and `citations` with `sourceId`/`sectionId`. It contains
   no case-specific expected answers, source enums, model-specific instructions,
   or dynamically supplied authority. All three models use the same interface.
2. Ordinary plain-text chat and Code drafts remain plain text. The application
   still independently parses, checks citation membership/section hashes and
   applies scope/governance. Valid JSON never means true evidence or permission.
3. Use one direct generation: no formatter model, automatic repair call,
   fallback to prompt-only mode, retry on schema/provider failure, or silent
   synthetic success. Existing output/deadline/model/redirect checks remain.
   Assert `maxRetries:0` at the actual SDK model-settings boundary and verify
   transient500/429 produce exactly one HTTP request, not just one outer method.
4. The Home request guard accepts only this exact schema and wrapper. Arbitrary
   schemas, weakened strictness, additional fields/tools/agent settings and
   streaming remain denied. Existing plain-text/Nomic/BGE requests are unchanged.
5. Before changing behavior, capture actual installed-SDK failure/wire evidence
   with disposable HTTP fixtures. Then prove real Mastra/SDK wire and response
   parsing for all three candidate profiles, plus malformed/truncated/mismatched
   responses, transport failure, delayed cancellation, source injection and
   cross-request/plain-text isolation. Mocked model responses prove transport
   only, not model capability or semantic quality.
6. A fresh sealed, fully matched three-model qualification follows shared fixes.
   Retain baseline failures. Do not lower thresholds, raise token/deadline limits,
   retry only failed cases, mix source seals, or call this correction a winner.

No production routing change or native/Home operation is caused by these local
tests. Actual runtime support and independent semantic review remain required.
