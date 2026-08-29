# Native positive-processing proof criteria

Date: 2026-08-29  
Roadmap: `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`  
Slice: M1-S2; capabilities C02, C04 and C12. This is an operational prerequisite only, not
acceptance of any capability or model role.

## Question being answered

The installed LM Studio CLI exposes `status` and `queued` in `lms ps --json`. Empty and static cases
are already retained. Before that metadata can participate in controlled maintenance, prove that the
installed Home runtime reports an exact owned embedding instance as actively computing and, under a
bounded synthetic overlap, reports queued work when a queue is actually present.

## Frozen boundary

- Load only the exact pinned Nomic embedding artifact. No primary model, reranker change, native
  setting change, production route change, Control application change or protected data is allowed.
- Begin from zero model residency and 260 W on both exact GPUs. Use 160 W while the proof is active,
  sample hardware every five seconds, abort at 85 C, retain at least 8 GiB host memory and 1 GiB free
  on each GPU, then unload the exact owned instance and restore 260 W.
- Reuse the immutable request body from commit `35e01bf`, file
  `gate7f/function-first/readiness/evidence/20260828-actual-adapter-gemma/0017.json`.
  The body remains byte-equivalent JSON data; concurrency repeats it without inventing a new question.
- Run 96 requests at most, with a 30-second per-request deadline, 128 KiB response cap and no headers,
  credentials, redirects or network destination other than Home loopback `/v1/embeddings`.
- A separate, exact Matthew Interactive task samples the supported `lms ps --json` command. It is
  read-only, source/runtime/engine/descriptor pinned, finite, and exports only identifier, model key,
  type, status, queued count and timing. Paths, display names and prompt text are never exported.
- Both tasks and every output use a fresh dedicated ProgramData root with exact ACLs. Existing attempts
  and evidence are immutable. The operator retires only the two exact task names after terminal results.

## Passing evidence

1. The immutable package, artifact, Node/CLI/engine/descriptor, request fixture, task definitions and
   hardware policy all match their prospective seal.
2. Every accepted request returns HTTP 200, the exact model ID, two vectors of 768 finite numbers, and
   a bounded response. All 96 requests must settle; an unknown request outcome fails the proof.
3. At least one fresh owner-context sample reports `computingEmbedding`. At least one sample reports
   `queued > 0`. If installed behavior produces active state but no measurable queue, retain that result
   as incomplete rather than changing the threshold after observation.
4. The sampler sees exactly one expected embedding identity. Unknown, remote, added or missing model
   identities fail closed.
5. The lease result, sampler result and request result bind the same proof ID, seal and exact instance.
6. The final observation proves zero residency, both exact tasks absent and both exact GPUs back at
   260 W. Lifecycle recovery may unload only an instance proved owned by a retained successful load
   response; ambiguous ownership leaves the proof failed and power unchanged.

## Claim limit

A pass establishes that the installed CLI can expose positive processing and queued state for this
owned synthetic Nomic workload. It does not close admission, prove a global drain, control privileged
desktop callers, qualify model quality, authorize native settings mutation or make a production change.

