# Proving methodology — find where the base breaks

The steward's direction, 2026-08-18: the point of probing is not that the smallest test rang true. It
is to find where the standard stack frays at the edges, because the fracture map is what tells us where
custom work is justified later. Custom enters where the standard demonstrably breaks, and nowhere else.

## The rules

**1. Install checks are not proof.** A smoke test ("what is 17×4", "what is my dog's name") verifies
wiring. It makes no capability claim and is never reported as one. Every claim in this repository is
either an install check or a probe result, labelled as which.

**2. Probe to failure, not to pass.** For each capability, escalate difficulty until it breaks, and
record the frontier. "Recalls a fact after 2 turns" is a wiring check. The probe is: after how many
turns does recall fail? Across threads? Under contradictory updates? After a process restart? The
deliverable is "breaks at X under Y", never "passed N tests".

**3. Sealed corpora, answer-bearing labels.** Adversarial review of the estate's earlier corpora found
path-level grading structurally unsafe and outcome-informed relabeling masquerading as ground truth.
Probe corpora here pair each case with the expected fact and its supporting span. Labels are held by
the steward or the reviewing agent, not by the implementer, and a corpus that has steered an
implementation is burned as evidence.

**4. Report the frontier with its denominators.** Per-case results, variance across repeated runs,
attempted counts alongside completed counts. Pseudo-replication is named: five runs of six questions is
six cases, not thirty.

**5. Fracture → requirement → proof.** Each break becomes a written requirement scenario. A custom
piece is admitted only if it fixes the fracture without regressing the rest of the map, measured on the
same probes. Proof, not preference — and this applies to everything, governance and security machinery
included.

## Probe axes per component (to be run after the installs complete)

- **Memory**: recall depth (how many turns), cross-thread isolation, contradictory updates ("my dog is
  Biscuit" … "actually it's Rex"), temporal ordering, restart survival, growth behaviour.
- **Retrieval**: corpus size scaling, paraphrase distance (query shares no words with the answer),
  hard negatives (topically close, factually wrong), staleness (document updated, index not), needle
  questions with sealed spans.
- **Tools (MCP)**: chained calls, mid-chain failure, timeout behaviour, result truncation, unavailable
  server.
- **Workflow/state**: crash at every boundary (before/during/after a step), resume correctness,
  idempotency, suspend across process restart, the approval-consumption scenarios from the estate's
  Decision 0076 review.
- **Model**: context saturation, instruction retention over long turns, structured-output validity
  rates.

## Order

Installs first, across the board, so the base exists as one working system. Then the probes, on the
assembled whole — a component probed in isolation hides the joins, and the estate's history says the
joins are where everything breaks.
