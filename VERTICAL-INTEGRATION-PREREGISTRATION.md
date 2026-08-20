# Vertical integration preregistration

Frozen 2026-08-20 before the Phase D integration run. RunaAI remains paused. Security services are
deliberately absent from this development-profile arm and are rerun only after composition passes.

## Question

Do the selected components compose in one recoverable slice without creating a second durable truth?

The slice is: deterministic OpenAI-compatible provider -> Mastra agent -> LangGraph node -> Qdrant
typed retrieval -> PostgreSQL one-time capability/outbox/deed -> LangGraph PostgreSQL checkpoint,
with OpenTelemetry exported through the Collector. PostgreSQL is the record and checkpoint authority;
Qdrant is a derived index; no Mastra workflow snapshot or LibSQL store is permitted.

## Fault sequence

1. A fresh worker runs the provider, Mastra, and retrieval nodes and stops at a LangGraph interrupt
   immediately before the governed effect.
2. The worker process exits. A fresh worker resumes the same thread from PostgreSQL and commits the
   one-time capability effect.
3. A third fresh worker resumes the completed thread to prove replay creates no second provider call,
   capability, outbox item, or deed.

## Gates

- The provider returns `stop`, the returned model identity equals the pinned model, and exactly one
  provider wire call exists across all three processes.
- The Mastra node produces the fixed typed transfer intent.
- Qdrant returns the seeded policy point with its payload digest intact.
- The first process leaves zero deeds; the second reaches `committed`; replay leaves exactly one
  capability, outbox row, and deed with the fixed idempotency key.
- PostgreSQL contains LangGraph checkpoint history and no table whose name starts with `mastra`.
- The Collector retains correlated traces from all three worker attempts with run id, attempt,
  component, deadline, terminal state, and deed reference. Raw prompt and planted secret strings are
  absent.
- All four portable services bind loopback only and are stopped at closeout.

Any failed gate leaves the vertical stack unproven. A happy-path response alone cannot pass.

