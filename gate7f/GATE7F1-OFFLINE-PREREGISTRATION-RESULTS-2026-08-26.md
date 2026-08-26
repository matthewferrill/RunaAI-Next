# Gate 7F-1 offline preregistration results

Date: 2026-08-26
Branch: `codex/gate7f-agent-foundation`
Status: green and sealed before any model output

## Outcome

The Gemma/incumbent Agent Mode comparison is preregistered and executable as a deterministic offline
evaluation. It does not yet contain a live provider capture path and has not downloaded, loaded, called,
or selected a model.

The exact primary new artifact is Google's first-party Gemma 4 26B A4B instruction-tuned QAT Q4_0 GGUF.
The exact Gemma 4 31B artifact is pinned as a conditional quality arm rather than an automatic second
download. Both repositories identify Apache-2.0, correcting the earlier Gemma 3 gated-terms assumption
for these new exact artifacts. The installed Qwen3 Coder artifact remains the mandatory incumbent rerun.

## Retained evaluation

- 35 sealed cases;
- three retained attempts per case;
- 105 observations per candidate;
- eight separately gated categories;
- exact JSON for model-layer plans and proposals;
- deterministic term, current-answer, capability, argument, digest, path, and code checks;
- hard 100% gates for current-turn relevance, authority boundaries, and execution honesty;
- mixed artifact/runtime, missing denominator, and duplicate-attempt refusal; and
- aggregate output without raw responses or private content.

The corpus deliberately includes the observed France-after-Italy, 15+15-after-14+12, and source-code-
comment-as-execution failures. A model receives no credit because the policy layer blocks its bad request,
and application safety cannot hide a model miss.

## Verification

| Check | Result |
|---|---|
| Gate 7F-1 focused suite | 11/11 passed |
| Complete offline stub denominator | 105/105 passed |
| Seal verifier | 5/5 files matched plus canonical corpus digest |
| Full repository suite | 480/480 passed across 462 subtests |
| Model download/load/call | None |
| Network or persistent service | None |
| Real effect or production change | None |

The aggregate stub result is retained in
`gate7f/evidence/GATE7F1-OFFLINE-STUB-RESULTS-2026-08-26.json`. The exact corpus and grader bindings are
in `gate7f/evaluation/SEAL.json`.

## Next boundary

The next operation is no longer design work. It is a protected Home evaluation operation:

1. inventory and hash the existing incumbent artifact and exact local runtime;
2. download only the pinned 14.4-GB Gemma 4 26B A4B artifact and verify its SHA-256;
3. load one candidate at a time under the sealed runtime settings;
4. capture append-only synthetic observations and hardware telemetry;
5. grade both candidates without changing production routing; and
6. open the 31B arm only if its frozen conditional rule is met.

That operation requires separate model-download and live-provider authority. It does not require customer
testing, protected data, Control changes, or a production deployment.
