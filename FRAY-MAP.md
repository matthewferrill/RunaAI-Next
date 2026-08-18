# The fray map — where the standard stack breaks

Comprehensive probe of every committed axis across every installed component, corpus v2 (sealed), graded
against locked labels. 53 cases. Each is n=1 per cell unless noted — the *patterns* below are consistent
enough to read, but individual cells are single runs, and one anomaly (depth-50 working-memory) shows
why cell-level claims need n≥3 before they decide anything.

## FRAYS — where stock breaks, and what it means for Runa

**1. Memory default window (KNOB, not a wall).** The gold result of the whole sweep, the memory config
matrix:

```
depth   default   window40   semantic   working
  2       pass      pass       pass       pass
 10       FAIL      pass       pass       pass
 25       FAIL      FAIL       pass       pass
 50       FAIL      FAIL       pass       FAIL*
100       FAIL      FAIL       pass       pass
```

Semantic recall is the only config that holds a planted fact at every depth. A larger window just moves
the cliff (10→~24). Working memory is non-deterministic for arbitrary facts (`*` depth-50 lost it,
depth-100 kept it) because it slots facts into a fixed template. **Reading: memory recall needs no
custom code — it needs `semanticRecall` enabled, which is a stock config option.** This *shrinks* where
custom is justified.

**2. Memory contradiction under default (same knob).** A revised value was lost under the default window;
recovers with semantic recall. Not a separate fray.

**3. Standing-instruction decay (REAL gap).** "End every reply with X" aged out even at window40 and was
not obeyed 20 turns later. Conversational memory holds *facts*, not *standing directives*. This is
exactly the Core / system-instruction territory — a directive that must persist belongs in held identity,
not in the message window. Custom (or resident-instruction) is justified here.

**4. Workflow snapshot has no integrity check (REAL governance fray, high value).** A same-length edit to
the persisted snapshot was acted on at resume — the workflow executed on attacker-modified data. Stock
durable execution trusts its own store. **This is the requirement Decision 0076 exists for, and the
stock stack does not meet it.** Custom integrity is justified.

**5. Workflow mid-effect crash is unrecoverable (REAL fray).** Killing the process during an effect step
produced no double-apply (good) but left the run unresumable — durable execution recovers at suspension
points, not mid-step. For a governed effect that stalls the work. Custom recovery / idempotency is
justified.

**6. Retrieval index staleness gives no freshness signal (REAL, though graded "pass").** When a source
doc changed after indexing, stock returned the stale indexed value silently. Graded pass only because the
sealed label expected the stale value; the *finding* is that stock never signals staleness. This is the
estate's provenance concern, and it is real.

## STRONG — no custom justified, stock wins

- **Retrieval quality: 13/13.** Verbatim, paraphrase, conceptual, two-hop, hard-negative (rejected the
  doc marked OUTDATED), corpus scaling to 1000 docs, topK 1/3/10, reranked path. The estate's hand-rolled
  retrieval failed its own thresholds this morning; stock passed every case. **This is the clearest
  "adopt, do not build" signal in the map.**
- **Tools (MCP): 5/5.** Chained read, honest "file does not exist", write-then-read across calls, a late
  needle in a 5000-line file, and an honest "tool unavailable" when the server would not start.
- **Memory isolation** (thread and resource), **restart survival**, **temporal ordering**, and **bounded
  growth** (2 rows/turn — paired, not leaking): all pass.
- **Model:** context saturation (early fact recalled through 40k chars), structured output 10/10 valid,
  long output completed to 200.

## UNRESOLVED — harness, not a framework finding

- **`@mastra/evals` scoring returned null.** I have not yet called its metric API correctly. This is an
  install-check gap on my side, not a framework fray, and it is marked open rather than counted.

## What this map says about the migration

The two places the estate has genuine, hard-won value — **governed workflow integrity** (fray 4, 5) and
**standing identity/instruction** (fray 3) — are exactly where stock breaks. Everything the estate built
by hand and struggled with — **retrieval, tools, memory recall** — stock does at least as well or better,
out of the box. That is the method delivering its verdict: adopt the commodity broadly, and spend custom
effort only on integrity, recovery, and held identity.
