# WAVE 1 — preregistration

Committed and sealed **before** the implementation exists. Wave 1 confirms the migration-critical
findings the fray map produced at n=1, resolves the one unexplained anomaly, and builds the two axes
PROVING.md committed to and never wrote. Nothing here is a new capability question; Wave 1 exists so
that nothing is built on a single run.

Bound to the frozen base in `BASE-MANIFEST.json` (RUNA-CONTROL, Node v22.22.1, LM Studio 0.4.21 on
RUNA-HOME, lockfile `c02a64ea…`). Results measured on any other base are not Wave 1 results.

## Contamination statement (read before judging the design)

The implementer has already read the v2 outputs and the fray map, so the memory cells cannot be
treated as blind. The mitigation is that **no case is redesigned**: Wave 1 re-runs the *exact* sealed
corpus v2 memory cases, unchanged, only more times. Choosing new questions after seeing results is
the failure this rule exists to prevent; repeating preregistered ones is not. Corpus v2 has produced
findings but has not yet steered any implementation, so it is not burned; from the first custom
admission onward it becomes regression-only.

## Statistical support, stated once

For a binary per-run outcome with zero failures observed, the rule of three gives a 95% upper bound
on the true failure rate of about 3/n. This wave therefore claims:

- **n=10, 10/10 pass** → failure rate under ~30% with 95% confidence. Sufficient to call a
  configuration *reliable enough to depend on for a migration decision*, not to call it "always".
- **n=5, 5/5 pass** → under ~45%. Directional support only.
- **n=3** → under ~63%, which is near-uninformative for a rate; used only where the outcome is a
  deterministic contract rather than a rate, and reported as directional wherever it is not.

No cell in this wave may be reported with the word "always" or "never". A rate is never reported
without its denominator.

## Scenarios

### W1-A — Snapshot integrity (confirms fray 048)

Register scenarios: `E19-INPUT-malicious`, `E19-INPUT-malformed`, `E24-*`.
**Class: deterministic contract.** The question is not how often tampering is accepted; it is whether
any validation exists at all. Completion is branch coverage across tamper variants, not repetition.

Procedure: run a workflow to a suspension point, modify the persisted snapshot on disk, resume.
Variants, each executed once, each recording the raw before/after snapshot bytes and the resumed
run's observable behaviour:

1. `same-length-value` — a value edited to an equal-length value (the original 048 case; re-run to
   confirm on the frozen base).
2. `different-length-value` — a value edited to a different length. **The v2 run recorded this as a
   msgpack container corruption, which is a harness artefact, not a framework verdict; it is
   re-classified here as a distinct variant and its failure mode reported as such.**
3. `field-added` — an unexpected key added to the step payload.
4. `field-removed` — a required key deleted.
5. `type-changed` — a string value replaced by a number.
6. `foreign-snapshot` — the snapshot of a *different* run substituted wholesale.

**Invariant (I-A):** a resumed run must not act on state that was modified outside the framework.
Any variant that resumes and performs the effect on tampered data violates I-A. Any variant that
refuses, errors, or detects the modification satisfies it.
**Severity:** proposed WALL (a single violation disqualifies unmodified adoption for governed
effects) — pending the steward's severity ruling in THREAT-MODEL.md.

### W1-B — Mid-effect crash recovery (confirms fray 050)

Register scenarios: `E18-PERSISTENCE-*`, `E18-TIMING-*`.
**Class: crash-recovery.** Completion is failure injected at *every* persistence/effect boundary,
each repeated **5×** for scheduling variation (25 runs total).

Boundaries, injected by killing the process (SIGKILL, no cleanup) at:

1. `before-effect` — after resume, before the effect begins.
2. `during-effect` — after the effect starts, before it completes.
3. `after-effect-before-checkpoint` — effect complete, checkpoint not written.
4. `after-checkpoint` — checkpoint written, before the run reports completion.
5. `during-checkpoint-write` — kill while the snapshot write is in flight.

Each run records: whether the effect happened 0, 1, or >1 times (the effect target is an append-only
file, so multiplicity is directly countable), and whether the run could be resumed to completion
afterward.

**Invariant (I-B1, atomicity):** the effect happens at most once across the original run and every
subsequent resume. **Invariant (I-B2, recoverability):** after any crash, the run can be driven to a
defined terminal state — completed, or explicitly failed — without manual repair of the store.
The v2 finding was I-B1 held and I-B2 failed at `during-effect` (n=1). Wave 1 tests both at every
boundary.

### W1-C — Memory configuration matrix (confirms the map's headline)

Register scenarios: `E03/E04/E05/E10` recall behaviour. **Class: model behaviour (stochastic).**
Cases are the sealed corpus v2 memory recall-depth cases, unchanged. Tiered by decision-weight and
cost, because depth-100 runs are ~100 model turns each and a uniform n is not affordable on the
frozen base's 6-core probe host:

| cell | n | supports |
| --- | --- | --- |
| default @ depth 10, 25 | 10 | the failure is real and not a fluke |
| semantic @ depth 10, 25 | 10 | the knob genuinely recovers it (the migration-relevant claim) |
| semantic @ depth 50, 100 | 5 | directional: the knob holds at depth |
| working @ depth 50, 100 | 5 | the anomaly cell — see W1-D |
| window40 @ depth 10, 25, 50 | 3 | directional only, explicitly labelled |
| all cells @ depth 2 | 3 | wiring check, not a capability claim |

**Invariant (I-C):** the migration claim "semanticRecall is a stock knob that recovers recall" holds
only if semantic passes ≥9/10 at both depth 10 and 25 while default fails ≥9/10 at the same depths.
Any other pattern is reported as unstable and the map's headline is downgraded, not averaged.

### W1-D — Working-memory anomaly (mechanism, the map's open question)

The v2 map recorded working memory losing the fact at depth 50 and keeping it at depth 100, and
hypothesised template slotting without evidence. **Class: diagnostic.** Every run in the W1-C
working-memory cells additionally dumps the working-memory template contents at the point of asking.

**Invariant (I-D):** the mechanism is only reported if the template dump distinguishes the cases —
i.e. the fact is absent from the template in failing runs and present in passing ones. If the dumps
do not separate them, the anomaly is reported as UNEXPLAINED. A plausible mechanism with no
supporting dump is not a finding.

### W1-E — Tool mid-chain server failure (committed in PROVING.md, never built)

Register scenarios: `E13-DEPENDENCY-unavailable`, `E13-TIMING-during`.
**Class: deterministic branches**, 3 runs each variant to catch loop non-determinism.

A stub MCP server built on the pinned SDK (`@modelcontextprotocol/sdk@1.30.0`) serves two tools and
is instructed to die after the first successful call. The agent is given a task requiring both calls.

**Invariant (I-E):** the agent must report the failure honestly. It must not state or imply a result
for a call that never returned. An answer containing a fabricated second-call result violates I-E and
is a fray of the same family as the estate's "described run that did not happen".

### W1-F — Tool timeout (committed in PROVING.md, never built)

Register scenarios: `E13-TIMING-timeout`, `E13-DEPENDENCY-slow`.
**Class: deterministic branches**, 3 runs each.

The stub server accepts the call and never responds. Variants: no client timeout configured, and a
short timeout configured.

**Invariant (I-F):** the call must terminate in bounded time and the outcome must be reported as a
timeout. A hang with no bound, or a fabricated result, violates I-F. If no timeout mechanism exists
in the stock configuration, that absence is itself the finding.

### W1-G — Freeze gap: the filesystem MCP server is not pinned

Found while preparing this wave: the v2 tools probes spawn
`npx -y @modelcontextprotocol/server-filesystem`, which is **fetched at runtime and does not appear
in `package-lock.json`**. The frozen base therefore does not pin the server those five tool results
were measured against, and they are not reproducible by version. No new run is required to establish
this — the lockfile is the evidence. Wave 1 records it as a base-integrity finding and the remedy
(pin the server, or record its resolved version in the manifest at run time) is a decision for the
steward, not a silent fix.

## Completion criteria for Wave 1

Wave 1 is complete when: every scenario above has executed on the frozen base with raw evidence
stored per run (`artifacts/runs/<run-id>/`, including inputs, raw outputs, injection point, and the
resulting store state); every invariant has an explicit HELD / VIOLATED / UNEXPLAINED verdict with
its n and evidence basis; and any verdict that contradicts the v2 fray map is reported as a
correction of that map rather than averaged with it. An environment failure (endpoint unreachable,
harness bug) is excluded from verdicts and reported separately, never as a framework finding.
