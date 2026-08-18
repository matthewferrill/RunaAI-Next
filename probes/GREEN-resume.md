# Green criteria — sweep checkpoint and resume

Committed before the implementation exists, per the build loop.

## Baseline (the failure being fixed)

2026-08-18: the v2 sweep session died at memory-012 of 53. `run-v2-log.txt` shows seals verified and
twelve caseIds logged; no `outputs-v2.json` exists, because the runner accumulates every output in
memory and writes once, at end of run. Loss: 12 of 12 completed cases (100%), and the loss is
structural — any death before the final line loses everything. The session crash also killed the
sweep because it ran as a child of the agent session.

## Green — all executed, not read

- **G1 persistence.** During a live run, each completed case is on disk before the next case starts:
  kill -9 the runner after ≥3 recorded cases, and `outputs-v2.partial.jsonl` contains exactly the
  recorded entries, one JSON object per line, each parseable. n=1 kill (deterministic mechanism).
- **G2 resume-skip.** Restarted with a checkpoint holding a non-error entry for a case, the runner
  logs that case as skipped and does not re-run it. A case whose only entries are error entries
  (`(error:` / `(child err:` answers) is re-attempted, at most 3 attempts total, then kept as-is.
  Executed via the real runner, observing its log.
- **G3 consolidation.** Final `outputs-v2.json` holds exactly one entry per attempted caseId,
  preferring the latest non-error entry; the count equals the number of distinct attempted caseIds.
  Executed as a test of the consolidation function on fixture entries.
- **G4 seal unchanged.** `verify-seal.mjs` still runs before any case and still refuses on digest
  mismatch. Observed by the "seal intact" lines in the restarted run's output; no change to the seal
  path is permitted by this work item.
- **G5 claim gate.** This work makes the runner resumable; it says nothing about the sweep itself.
  "Sweep complete" remains claimable only from a run on RUNA-CONTROL against the live endpoint, with
  outputs graded against the sealed v2 labels. Error entries produced by an unreachable endpoint are
  harness environment failures, never framework findings, and are excluded from any fray report.

## What this does not do

No change to corpus, seal, grading, or any probe's semantics. No retry loop inside a case. No
resumption of the 12 lost cases — their outputs are gone; the value is for the next death, and the
runbook change (run the sweep detached from the agent session) is for the same death happening the
same way.
