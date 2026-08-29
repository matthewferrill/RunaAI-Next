# R5 common runtime-seal builder criteria

Status: prospective and frozen before builder implementation or any R5 seal.

Roadmap revision `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This is M1-S2 infrastructure for C01, C02, C03, C04, C06, C07, C12, C15
and C16. It does not complete those families or replace the remaining roadmap.

## Immutable authorities

1. The normalized-LF content of
   `R5-CORRECTED-FUNCTION-QUALIFICATION-CRITERIA-2026-08-28.md` is SHA256
   `ce4ab557914c04a6547925b889420e3d961e66ed6df676fbdf597d309af9ba8d`.
2. The R4b runtime seal is an immutable field-layout and fixed-value template
   only. Its exact bytes are SHA256
   `416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.
   Its source commit, source archive and evidence pins are historical and must
   not leak into the new seal merely because they occur in the template.
3. The unchanged case bundle is
   `8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed`.
   Fixed-suite hashes are recomputed from the imported case objects with
   canonical JSON. They are never accepted from an operator manifest.

## Exact prospective input

The builder accepts one strict manifest and no other override surface. It binds:

- campaign ID `m1-r5-corrected-functions` and the authorities above;
- the final 40-hex source commit;
- exact source archive and `package-lock.json` paths plus their SHA256 values;
- proof the archive was exported with command-scoped `core.autocrlf=false`;
- exact readiness, effective-reasoning and telemetry evidence paths plus their
  SHA256 values;
- an explicit pre-inference declaration: zero observed R5 attempts, no imported
  attempts, no selective replacement, no expected-answer tuning, no partial
  roster, no production routing change and no inherited runtime seal.

Every referenced file is read under a finite byte cap, hashed from its actual
bytes and parsed with a fatal UTF-8 decoder where JSON is required. Readiness
evidence must identify all three candidates and their fixed reasoning controls,
state that it is not qualification and predate scored inference. Telemetry must
be a prospective hardware-only plan created before loads, include all three
exact artifacts plus Nomic, bind one concurrent primary and retain the unchanged
reranker. Paths, private values and model output are not copied into the seal.

## Fixed values and rejection boundary

The following values come only from the immutable template and are cross-checked
against cases and telemetry evidence: schema, three candidate IDs, installed
model IDs, artifact hashes and byte sizes, request controls, all five roles,
context/output/deadline budgets, provider/embedding/reranker endpoints and
limits, Node/Qdrant/model-runtime/Nomic/BGE pins, one-model residency,
evaluator ID, one-hour maximum batch and `productionRoutingChanged:false`.

The builder rejects missing/extra candidates or roles, changed order, aliases,
artifact substitutions, different budgets, suite overrides, endpoint changes,
partial or post-inference evidence, reused seal fields, nonzero attempt counts,
retrospective replacement/tuning flags, evidence hash drift, template drift,
case-bundle drift and source/archive/lock drift. A final source commit may not
equal the historical R4b source commit.

## Publication and deterministic acceptance

The output is `canonicalJson(seal) + "\n"`, written with create-only `wx`,
synced, closed, reopened and byte/hash verified. Existing, linked or non-file
targets fail; the builder never overwrites or retrospectively edits a seal.

Tests must prove deterministic bytes across independent directories, exact
suite recomputation, all fixed values, successful create-only publication and
denial of every drift/tuning/partial/reuse boundary. Tests use only synthetic
temporary files. This slice must not create the real R5 seal, contact Home or
Control, load a model, start a service, mutate production or inspect protected
content.
