# R12 Qwen timing-window equivalence composition decision

Date: 2026-08-31

Milestone/slice: M1 / M1-S2

Roadmap digest after this closeout update:
`1865fbca8f50aecb454e275e6eab98fc3d749381f4613efd1f500c2b837eaffa`

Capability IDs: C01, C02, C03, C04, C06, C07, C12, C15, C16

## Steward clarification

The steward clarified after the remaining-13 run that the Qwen results should be
pooled when the missing rows were caused by the campaign timing cutoff rather
than a model, case, prompt, setting, grading, or runtime change. This decision
implements that direction transparently. It does not edit either immutable
result, remove the original hard stop, hide a failed attempt, or claim that the
120 rows came from one uninterrupted execution window.

## Bound evidence

The first window is result SHA-256
`8ffb2286760d0776e112fc58040799cc9d89e1de06a704ed9580254460d962a0`:
107 Qwen3.6 attempts recorded, a batch-hard-stop result, and exactly 13 identities
not executed. The completion window is result SHA-256
`b17ec6bec331cffd3ff1c3743e1cc2c2d2121dbcf4d82dda3c742fd21363c144`:
all and only those 13 identities recorded, no unexecuted row, and no runner stop.

The machine audit proves equality of the model artifact and model ID, request
controls, case bundle, evaluator and qualification criteria, role limits,
model-runtime binary and version, Node/package/Qdrant pins, retrieval artifacts,
and every native suite hash. The complete runtime seals differ only at:

- `sourceCommit`;
- `runtime.sourceArchiveSha256`; and
- `residency.telemetryPolicySha256`.

The source changes between those commits are retained operator/campaign timing,
supplemental selection, directory binding, browser-witness publication, tests,
and handoff evidence. The case-bundle digest and every model-facing sealed value
remain identical. The completion retains three genuine model failures; timing
equivalence does not convert them to passes.

## Composition boundary

The equivalence-audited result contains 120 unique Qwen identities in the
original 120-row plan order. It carries both execution-window result hashes,
source commits, runtime seals and stop codes, and explicitly records
`singleUninterruptedArmClaimed: false`. It may be used as Qwen's complete
120-row denominator for the R12 three-candidate semantic review and role
scorecards.

This is a steward-directed equivalence composition, not a claim that the old
whole-arm no-pooling sentence was satisfied literally. Historical failed r33-r36
arms remain excluded. Product qualification remains false until candidate-blind
independent semantic review validates all 360 rows, computes the frozen role
thresholds, and the required customer-trial gate is reached.

## Generated evidence

`acceptance/compose-equivalent-candidate-result.mjs` rejects a changed model-facing
seal, changed case bundle, overlapping identity, incomplete supplemental result,
or any completion set other than the original 13 unexecuted identities.

The generated evidence is under
`acceptance/evidence/20260831-r12-equivalence-composition/`:

- equivalence audit SHA-256:
  `d08d23641f7c82af9677ccddc769eecc306415d98511b3de255dd8a28b606f3d`;
- composed Qwen result SHA-256:
  `1b5d79874576a47dea02a2a74b55db1f5e8c1d2564348677c794a61c2963270f`;
- 360-row review-input manifest SHA-256:
  `613be84d11c6fa0c89db56b9ec018b6be77324eef1950fe966ca1345fea26532`;
- candidate-blind worksheet SHA-256:
  `9226abf6db677e1f3c3d8f482a4cc2cdb4493a5d1df684c2ef5dc920c1c6f884`;
- review binding SHA-256:
  `e5ac7d00a3049ee8734a3a7592b6f8419cf64786f0f03115cbd8db56d044be85`.

The worksheet is retained outside Git with the synthetic raw campaign packet;
the committed manifest binds all 360 raw and ledger records without publishing
the request bodies. Independent semantic review is the next gate. No new model
inference, Home residency, Control browser checkpoint, production route, or
protected-data access is required for that review.
