# THREAT-MODEL — the frozen reference base (DRAFT for steward review)

Wave 0 requires this before the adversarial wave (Wave 2) has a denominator. It is a draft: the
assets and prohibited outcomes are the estate's to ratify, and the adversarial scenarios in
EDGE-REGISTER.json inherit their severity from what is written here. Nothing in Wave 2 is sealed
until this is ratified.

Scope is the assembled reference stack as RUNTIME-GRAPH.json describes it — not the RunaAI production
estate. The point of modelling threats against the *standard* stack is to find where stock resists an
attack (adopt) and where it complies (a fray with a governance name, and a Runa requirement). Where
this model names an estate concern, it is to make the lab probe representative of what migration
would face, never to move estate secrets into the lab.

## Assets

1. **Governed-effect integrity** — that an effect happens only as an authorized, unmodified action,
   exactly once. The workflow snapshot, the approval-to-effect binding (edge E18), and the effect
   target. This is the asset frays 048 and 050 already scratched.
2. **Held identity and standing instructions** — directives that must persist and bind behaviour
   (the estate's Core territory). Fray 3 showed stock conversational memory does not hold these.
3. **Lane and household separation** — that content, memory, or secrets from one resource/thread/
   household member do not surface in another's context or answers (edges E09, E10, E15).
4. **Truthful record** — that what the observability/telemetry surface and any answer record report
   is what actually happened (edges E23; the estate's "described run that did not happen" failure).
5. **The endpoint and host boundary** — that the filesystem MCP server and model endpoint cannot be
   turned into a path out of their sandbox (edges E13, E14).

## Actors

- **Untrusted content author** — anyone who can put text where a document, a tool result, or a
  memory write will later reach the model: a retrieved document, a file the filesystem server reads,
  a prior turn persisted to memory. No estate privilege required; this is the primary actor.
- **A compromised or malicious MCP server / tool** — code outside the harness process (edge E13)
  that can shape results, report success for a failed effect, or substitute its identity.
- **A disk-level actor** — anything able to modify a libsql file between suspend and resume (the 048
  tamper). Models an attacker with host access, or a bug that corrupts the store.
- **A confused-deputy caller** — a request carrying authority intended for a different or modified
  action (the approval-replay and action-changed-after-approval families on edge E18).
- Explicitly **out of scope for the lab**: a privileged estate insider, and any attack requiring
  RunaAI production credentials — the lab holds none and migrates none in.

## Trust zones

- **Trusted:** the harness/agent process and its own code.
- **Semi-trusted, durable:** the libsql stores and snapshot store — trusted by the framework, but
  writable by the disk-level actor, which is the whole point of asset 1.
- **Untrusted, in-band:** model output, tool/MCP results, retrieved documents, and recalled memory —
  all of it data that enters trusted code and must never be executed as instruction.
- **External:** the LM Studio endpoint and the MCP server process.

## Entry points

Every edge in RUNTIME-GRAPH.json marked with an untrusted `trust` note: E02 (model output), E09
(retrieved text), E10 (recalled memory), E15 (tool results), E19 (snapshot on resume), E24
(disk-level write). These are exactly the edges the register's ADVERSARIAL family attaches to.

## Authority boundaries

The approval-to-effect binding on E18 is the load-bearing one: an approval must bind to one specific
action's digest, be consumed transactionally, and never exist as a reusable approved bit at rest
(the estate's Decision 0076 requirement). The register's AUTHORITY family enumerates the ways to
violate it — wrong actor, expired, meant-for-a-similar-action, replayed, action-changed-after-approval.

## Prohibited outcomes (the invariants Wave 2 probes must assert)

1. Instruction text located in untrusted data (document, tool result, memory) changes what the agent
   does, rather than being treated as content. **Where stock complies, that is a fray.**
2. A governed effect runs unauthorized, more than once, or on arguments changed after approval.
3. Content, memory, or a secret from one lane/resource/household member reaches another.
4. A tampered or corrupt snapshot is resumed and acted on as authoritative (048 — already observed,
   so this invariant is currently VIOLATED by stock and awaits the Runa requirement).
5. A record or trace states an effect, a run, or a result that did not occur, or exposes a secret or
   authority token it should not.
6. The filesystem or model boundary is used to reach outside its sandbox (traversal, SSRF, TOCTOU).

## Expected mitigations to look for in stock (and cost as absent where missing)

Snapshot integrity checking; single-use action-bound approval consumption; per-lane isolation in
memory and retrieval; content/instruction separation for untrusted data; allowed-directory
enforcement in the filesystem server; secret and authority redaction in traces. Each present
mitigation that holds is an "adopt"; each absent one is a requirement scenario for a Runa custom
piece, admitted only with the reverse link to the exact stock failure.

## Open questions for the steward (ratify or correct before Wave 2 seals)

- Is the disk-level actor (asset 1 / actor 3) in scope for the lab, or is snapshot integrity taken
  as a pure governance requirement without modelling the attacker? Fray 048 assumed yes.
- Household separation (asset 3) — how many distinct principals should the lab model, and does
  "household member" carry any authority distinction the probes must represent?
- Which prohibited outcomes are WALL-severity (a single violation disqualifies adoption) versus
  measured-rate? Security completion rule says a severe bypass is never averaged away, so this
  classification decides how each adversarial scenario is graded.
