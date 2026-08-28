# Shared request coverage: local integration results

Prospective criteria were committed as `c09137c` before implementation.
Four common instructions were added to the existing Mastra answer adapter:
continuing user constraints, exact requested formatting without extra framing,
retention of material summary details, and explicit requested unknowns. No case
names, expected answers, model-specific prompts, scoring rules, extra generation,
deterministic answer rewrite or authority change was introduced.

Actual Omen Node `v22.22.0` execution passed **91/91 tests, zero failures or skips**:

```powershell
node --test gate7f/function-first/request-coverage.test.mjs gate7f/function-first/evidence-output.test.mjs gate1/mastra-provider.test.mjs gate7f/function-first/provider-transport.test.mjs gate1/gate1.test.mjs gate6b/model-role-providers.test.mjs
```

Twelve new tests exercise the real answer service, Mastra, installed SDK and a
local HTTP listener: all three model profiles across ordinary chat, guarded/local
chat, selected workspace comprehension and deeper review. The record/index and
upstream answers are fixtures. Each test proves one actual HTTP generation,
unchanged current input/history/selected content, the common system instructions,
unchanged model/reasoning/512-token configuration, evidence-only native schema,
independent source-hash citation checking, and zero model calls for a subsequent
request to disable safeguards. They do not prove model compliance or injection
resistance merely because the instruction exists.

The repeated actual SDK wire probe retained the same exact native schema and one
request each for valid/500/429 cases. The old evidence-wire receipts remain pinned
to their original source; this new receipt binds the changed answer instructions.
No Home/native service, production routing, protected record, dependency, model
artifact, evaluation case or threshold was changed.

Exact retained files and nine source pins:
`acceptance/evidence/request-coverage-20260828/manifest.json`.

- 91-test TAP SHA-256:
  `4045f2f6cc87e305f00525d2905b35042004bf9de9a6b6b853a9f6fbae9bd59a`.
- Actual SDK wire SHA-256:
  `6dac91199c38eec527378f1591a65f9954fde8eb742ebee2489c1d597084a68f`.
- Changed answer adapter SHA-256:
  `2ef1340acbf74e47f8262f75a3957e3dd88a7506e9a7a5f294aee37dc166a29c`.

**Model answer quality remains unproved by these tests.** Independent review and
the fresh common-seal three-model campaign must establish whether the shared
corrections improve actual functions. All old failures, unknowns and denominators
remain intact. This is a continuation step, not a request for another approval.
