# M1 actual-adapter readiness — all three candidates

This is a small **unscored wiring check**, not the 360-attempt functional campaign,
not a model winner, not a Qdrant customer journey, and not execution of model-written code.
The five application adapters were actually called from Control, using the sealed Home
primary plus the pinned Nomic auxiliary and existing BGE service. No production routing changed.

| Candidate | Chat / research / review | Code / agent planning | Nomic / BGE | Largest primary call |
| --- | --- | --- | --- | --- |
| Gemma 4 26B A4B | 3/3 | 2/2 | 2/2 | 1.795 s |
| Qwen3 Coder 30B A3B | 3/3 | 2/2 | 2/2 | 1.656 s |
| Qwen3.6 27B MTP | 3/3 | 2/2 | 2/2 | 4.480 s |

Calls used the actual Mastra/AI SDK answer and planner code, exact response model IDs,
temperature zero, 512 answer tokens / 1536 planning tokens and 30-second limits.
Gemma/Qwen sent `reasoning_effort: none`; Coder omitted it. No textual `/no_think` suffix.
The synthetic grounded answers cited the supplied note; plans proposed inspection only.
Nomic returned two correctly indexed finite 768-dimensional vectors with the required
document/query prefixes; BGE ranked the two actual synthetic passages. Source queries
through Qdrant, task execution, browser continuity and independent function grading remain
the separate full campaign's responsibility.

Exact source commit: `a95971a15158f1ee09b18bfc3c4859617fcc4862`.
Transferred archive SHA-256: `ca34c64c3600c07ad75dea0a8f47bf99569602ac0f52951410d7987c6e519b95`.
`readiness/evidence/20260828-actual-adapter-{gemma,coder,qwen}/EXPORT.json` retains each
runtime lease, exact smoke seal, source correspondence and every raw request/reply hash.
`retain-operator-smoke.mjs` independently checks captured requests/replies before retention.
No supplied private text, account token or protected production row is included.

The first retention verifier compared the archive's Windows CRLF bytes directly with Git's
LF blob and stopped. The sealed runtime pins had matched exactly before all live calls.
Inspection proved the archive bytes were the exact CRLF export of the pinned LF Git blobs;
the verifier now checks the archive hash, each exact archived hash, and that precise line-ending
transformation, retaining both hashes. No source-content change or new inference was needed.

Each primary ran separately with Nomic, at the same temporary 160 W per GPU and 85 C cutoff.
The independent hardware supervisor retained exact instance IDs and cleanup. Sampled peaks
were 53 C / 54 C / 59 C respectively. After each lease, both owned instances were unloaded
and the original 260 W limits restored. The final operator receipt at 16:40:26Z verifies zero
loaded models, no owned smoke task registrations, and unchanged existing service listeners.
See `readiness/RESULTS-2026-08-28.md` and its retained lease exports for the hardware evidence.

After these short-input checks, M1 composition gained a conservative bounded-window Nomic
adapter for longer inputs. It preserves full canonical source text, uses complete derived
windows and combines their vectors; it never silently truncates the source. Its unit checks
are not retroactively part of these smoke results. Its tokenizer bound and real-stack quality
must be verified in the new prospective functional campaign before deployment.
