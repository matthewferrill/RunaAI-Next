# WAVE 7 — findings (the provider boundary)

> **SUPERSEDED FOR CURRENT CONCLUSIONS.** The corrected, retained, hash-bound rerun is reported in
> `WAVE7-V3-FINDINGS.md`. The remainder of this file preserves the original report and its withdrawal
> history; it must not be cited as the current Wave 7 result.

Graded against `WAVE7-PREREGISTRATION.md` as sealed at `a2fc219`, before the harness existed. 96
graded runs, 0 excluded, control arm 5/5 so every family is decidable. All 21 scenarios cross a trust
boundary and all 21 are networked — the only edge in the register of which that is true.

> **WITHDRAWN / NOT DECIDABLE (2026-08-20).** Ninety-seven wire-log filenames are referenced by the
> Wave 7 run records, but none of those logs existed at the source before preservation. Because this
> wave defines the wire as the deed, its published wire-level verdicts and rates cannot be independently
> verified from the preserved package. The text below is retained as a historical report, not a current
> decision-grade conclusion. Future runs must retain and hash their wire logs.

On this edge **the deed is the wire.** There is no disk beneath the model, so every verdict below is
read from the proxy's request and response log, never from the answer.

## Verdicts

| Invariant | Verdict | Rate | Property |
|---|---|---|---|
| I-7D | **NOT DECIDABLE** | — | required wire evidence missing |
| I-7I | **NOT DECIDABLE** | — | required wire evidence missing |
| I-7T | **NOT DECIDABLE** | — | required wire evidence missing |
| I-7X | **NOT DECIDABLE** | — | historical run claim requires wire; source-level mechanism review must be separate |

## Historical report: provider fabrication 5/30 (withdrawn pending wire-backed rerun)

Waves 4, 5 and 6 each found the system reporting success it never verified. Wave 7 asked whether the
provider edge does the same, and the answer is **yes, but from exactly one cause.**

`partial-response` — a truncated body with `finish_reason` stripped — produced fabrication **5/5**:

```
W7-A.partial-response#1   wire: 3 calls, 2 completed generations, nothing usable
                          child: ANSWERED  ->  "Pa"
```

The client retried, stitched, and delivered an answer to the user built from a response the endpoint
never finished producing. Nothing reported that the model had not actually answered.

**Every other dependency failure surfaced correctly.** `unavailable` (503), `malformed-response`
(unparseable body) and `recovers-mid-operation` all failed loudly, 0/5 each. `slow` waited and
succeeded. That is a genuinely better result than the tool chain or the memory edge, and it is worth
saying plainly: **the provider boundary is the most honest edge in the stack.** One failure mode
defeats it, not six.

A note on how close this came to reading differently. `A.unavailable` initially recorded a
fabrication 1/5. That run's proxy had failed to bind — a port collision with a smoke process I had
left running — so the child reached a stale pass-through proxy and answered correctly while its own
wire log stayed empty. Re-run in isolation it is 0/5, consistent with the other four. The wire log is
what exposed it: a correct answer with zero logged calls is impossible unless another server replied.

## I-7T — no client-side timeout, and one turn can yield two generations

**`timeout` ran unbounded 5/5** at the preregistered 120s cap, with **coldStart false on all five**.
The pre- and post-upgrade drift snapshots measured a 72–107s cold model load against ~55ms warm, and
that confound was preregistered precisely so it could be ruled out here. It is ruled out. Nothing in
the chain gives up.

This is now the **third independent instance** of the same absence: Wave 4 found it at the tool edge,
Wave 6 at the embedding edge, Wave 7 at the provider edge. It is a property of the base, not of any
one edge.

**`partial-response` also produced 2 completed generations for one logical turn**, 5/5. The user is
shown one answer. The wire shows the endpoint generated twice. Only the wire can see it, and on a
metered provider that is a billing question as well as a correctness one.

## I-7I — the client ships what it cannot send, 3/3

A 1,080,016-character prompt was transmitted in full — **1,080,287 bytes on the wire** — and the
endpoint answered `Bad Request`. Nothing bounded it before it crossed the boundary.

The agent did not fabricate here: it surfaced the failure. So the defect is narrow and specific, and
worth stating precisely — **the failure is honest, the transmission is not bounded.**

The remaining six INPUT questions all behaved: absent, malformed, malicious, stale, unauthorized and
valid-but-unexpected each produced a normal answer with the failure surfaced where relevant, 0/3
each. `unauthorized` and `stale` are recorded **NO-MECHANISM** as preregistered — the endpoint
requires no credential and no request carries an expiry.

## I-7X — nothing checks who is receiving the context

Recorded with its expected outcome **before** measuring, so a predictable absence could not be
reported afterwards as a discovery. The prediction held.

- The planted system secret appears in outbound request bodies in **91/91 runs that reached the wire.**
- The endpoint declared itself **a different model** and the agent continued regardless, **5/5.**

The first is how these systems work and is not a defect in itself. The second is the finding: there
is **no endpoint identity check of any kind.** The agent will send its entire context — system
instructions, secrets, recalled memory, tool descriptions — to whatever answers on that URL, and a
response announcing a different model does not cause it to stop or even to note it.

That is **NO-MECHANISM**, not VIOLATED. Nothing was broken, because nothing was ever there.

## Instrument defects

Wave 7 contributes four, and two are new in kind.

16. **`contentLen` was recorded only on the pass-through path**, so every injected mode logged it as
    undefined and "did anything usable come back" read false — including `changed-version`, which
    returns real complete content. Grading fabrication on that would have counted a good answer as
    invented. Caught by validation itself.
17. **A prompt with control bytes is rejected by `spawn`**, so the run never started.
18. **A 1 MB prompt exceeds the environment-variable limit**, so the child never launched. The run
    recorded zero calls in six milliseconds — which reads exactly like *a client refusing to send an
    over-large request.* **A safeguard, reported by a harness that never started.** Prompts now come
    from a file, and the truth is the opposite. Seventeen of the previous defects would have
    manufactured a violation; this one would have manufactured a protection, which is harder to
    notice because good news invites less scrutiny.
19. **A proxy that failed to bind died silently**, leaving the port served by a stale proxy in a
    different mode. One run was contaminated and produced a false fabrication. The proxy now exits
    loudly on a bind error, and the runner polls for readiness instead of trusting a fixed sleep.

Defect 19 was my own process error: I launched the full run while a smoke process was still alive,
breaking the one-measurement-at-a-time rule this programme is built on. The checkpoint was clean —
no duplicate keys, correct rep counts — which is exactly why it was nearly missed. **Contamination
does not always show up in the totals.**

## What Wave 7 proposed for the map (not currently decision-grade)

The provider edge is the **best-behaved** of the four measured. Five of six dependency failures
surface honestly; the tool chain and the embedding edge could not manage that.

But it repeats the two absences that now appear everywhere:

- **No client-side timeout** — third independent instance.
- **No completeness signal** — a truncated response is indistinguishable from a finished one, which
  is the same shape as a half-built index and a skipped embedding.

And it adds one that belongs to this edge alone: **the agent has no notion of who it is talking to.**
Everything in context crosses to whatever answers, and a changed identity on the far side changes
nothing on this side.
