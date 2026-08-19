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

**6. The instrument must be proven before the finding is trusted, in code rather than in prose.**
Nineteen instrument defects across seven waves were five recurring patterns, and they recurred because
the lessons lived in findings documents and were re-derived from memory each time. Every harness now
uses `probes/instrument.mjs` and must pass its gate before a full run is permitted:

- every field constant across a smoke run is justified in an allowlist, or the instrument is fixed;
- every detector is shown to fire true *and* false, because a test of the negative alone cannot
  distinguish *correctly false* from *always false*;
- every injected fault is shown to have landed on the instrument before its outcome is graded;
- payloads travel through files, never the environment, and every record says whether the instrument
  actually ran;
- synchronisation waits on observed readiness or observed progress, never on a timer;
- a grader may not filter more narrowly than its sealed invariant is written;
- a measurement whose target appears in its own input is a tautology and is recorded NOT PROBED.

The library is itself an instrument and carries its own self-tests, each fixture drawn from a defect
that actually happened.

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

## The lock rule (steward's direction, 2026-08-18)

The label file is locked from sealing until testing completes: never widened, never edited, only
checked against. Enforced, not promised — probes/SEAL.md carries the sha256 of both corpus files, the
grader verifies the digests before grading and refuses on any mismatch, and the refusal path was
tested by touching the file and watching it fire. Anything learned during testing that suggests a
label is wrong goes into a new sealed version; the old one stands as committed. Labels were reviewed
mechanically before sealing (check-consistency.mjs); Codex re-reviews when back, before any migration
comparison uses this corpus.

## Order

Installs first, across the board, so the base exists as one working system. Then the probes, on the
assembled whole — a component probed in isolation hides the joins, and the estate's history says the
joins are where everything breaks.

## Scope (steward's direction, 2026-08-18, after the first sweep)

The map must cover the entire base, not a committed slice. COVERAGE.md is the denominator: the full
surface grid, where every probe so far lands on it, and the waves that close the rest. No coverage
claim is made against any other baseline.

## Runbook: running the sweep (added after the 2026-08-18 session death)

Launch the sweep detached from the agent session, so a session death does not kill the run:

    setsid nohup node probes/run-v2.mjs >> probes/results/run-v2-log.txt 2>&1 &

Each completed case is checkpointed to `probes/results/outputs-v2.partial.jsonl` before the next
starts. A restarted runner skips cases with a non-error result, re-attempts cases that only ever
errored (at most 3 attempts), and consolidates `outputs-v2.json` from the checkpoint file at the
end. Error entries caused by an unreachable endpoint are harness environment failures, never
framework findings; the green criteria and their evidence are in `probes/GREEN-resume.md`.

## One measurement at a time, per host (steward's question, 2026-08-18)

No second probe run starts on a host while a wave is measuring there. The reason is not politeness
about CPU: contention falls hardest on the longest runs, and in a tiered design the longest runs are
the expensive high-n cells. Timeouts under load would be recorded as environment errors and correctly
excluded — leaving a matrix whose cheap cells completed and whose expensive cells were
disproportionately dropped. That is a biased sample that passes its own audit, which is worse than
obvious noise. The frozen base also records the host, runtime and endpoint but not "and another
workload was running", so a wave measured under contention is not reproducible from its own manifest.

Building the next wave is unaffected and should continue in parallel: preregistration is writing, and
harness validation runs in the agent clone off the frozen base. Only EXECUTION serialises.
