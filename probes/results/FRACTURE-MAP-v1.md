# Fracture map — stock stack v1

Sealed corpus `runalab-probe-corpus/v1`, graded against locked labels, digests verified. 11 pass / 6
fail of 17 pass-fail cases; one multi-trial case reported by its denominator. This is where the pure
standard stack frays — the input to where custom is justified, nothing decided yet.

## The finding that matters most: one root, many symptoms

Four of the six failures are the same fracture — **the default memory window.** Mastra's `Memory` in
its documented default keeps recent turns and does not enable semantic recall, so a fact older than the
window is simply gone, not mis-recalled. Evidence:

- recall held at 2 turns (memory-001 pass) and was **absent** at 10, 25, 50 (memory-002/003/004 fail),
  each answered "I don't have access to your locker code" — the fact never reached the model.
- the contradiction case (memory-005) failed the same way: 6 filler turns pushed **both** values out,
  so it tests nothing about contradiction until depth is fixed. Confounded, not informative yet.
- instruction retention (model-015) failed identically: the instruction lived in turn 1, gone by turn 13.

**Frontier: recall breaks between 2 and 10 turns at default configuration.** The natural next probe is
the same ladder with semantic recall enabled — a config change, not custom code — which is exactly the
"try the standard harder before building" the method demands.

## The genuine retrieval frontier

Independent of memory, and clean: verbatim (retrieval-009) and paraphrase (retrieval-010) **passed**,
including a hard negative where an "OUTDATED" distractor was correctly avoided (retrieval-012). The wall
is conceptual distance: "a contractor is coming, where should their car go?" did not bridge to
"the visiting engineer parks in space X" (retrieval-011 fail). Stock embedding retrieval handles
paraphrase, not multi-hop inference.

## Passed cleanly

- memory thread-isolation: no leak across threads (absence is the pass)
- memory restart-survival: fact survived a genuine fresh process re-opening the store
- memory temporal-order: "which did I give first" answered correctly
- tools chained-read: three MCP calls, planted token extracted
- tools missing-file: reported the file does not exist rather than inventing a third line
- model structured-validity: 10/10 valid JSON arrays
- workflow resume-no-reexecute: step one executed **exactly once** across a crash and a fresh-process resume

## The "pass" I do not trust — workflow-018

Graded pass under the label (an error on tampered data satisfies "must not silently act"), **but it
passed for the wrong reason.** The framework did not detect tampering — it threw `malformed JSON`
because my edit corrupted the snapshot's JSON structure. `actedOnTamperedData=false`, but `resume=null`,
not a clean rejection. A tamper that preserved valid JSON would very likely have been acted on: there is
**no integrity check on the snapshot at rest.** This is a fracture, recorded as a pass only because the
sealed label's bar was "don't act," and it is the single most important input to Decision 0076's
requirement — the estate's approval-never-a-stored-bit property is exactly the custom that this gap
would justify. Next-version label must add a valid-JSON tamper that keeps structure intact.

## What this says for the migration

Two of Runa's custom areas already have a demonstrated standard-stack gap to beat:
- **memory** — but the fair fight is against the standard with semantic recall *on*, not the default.
- **snapshot integrity / approval binding** — the standard persists state with no tamper detection,
  which is the precise thing the governed approval flow adds.

Nothing else here is a proven gap yet. Tools, restart-survival, structured output, and the crash-resume
invariant all held at the standard's default.
