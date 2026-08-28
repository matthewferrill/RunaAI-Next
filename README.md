# RunaAI-Next

This is the isolated migration and eventual product repository for **RunaAI**. `Next` is a temporary
repository label only; the product, application, schemas, services, and user experience are named
RunaAI.

The repository was seeded from the completed RunaLab stack-selection history at commit `ec5e346`,
preserved by tag `runalab-stack-baseline-2026-08-20`. Gate 6D made the exact selected-core Control
release named in `MIGRATION-STATUS.md` authoritative for that scope. Legacy RunaAI remains the intact
rollback system and behavioral reference. No further migration implementation or protected-data
conversion is authorized merely because this repository exists.

Start with:

- `PRODUCT-ROADMAP.md` for the complete product destination (the current slice is Milestone 1 only);
- `node roadmap/read-next-slice.mjs` and `roadmap/CURRENT-SLICE.md` before selecting any next slice;
- `MIGRATION-STATUS.md` for current authority, branches, gates, and next decision;
- `AGENTS.md` for mandatory working and safety rules;
- `RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md` for subsystem dispositions and migration gates; and
- `LAB-COMPLETION-REPORT-2026-08-20.md` for the inherited stack evidence.

## Inherited RunaLab baseline

The text below is historical lab context. Current product authority, selected storage/agents and
implementation permission are governed by `AGENTS.md`, `PRODUCT-ROADMAP.md` and the current slice;
the lab's original purity language must not be mistaken for today's implementation instructions.

### Reference stack — the pure standard arm

The steward's method, 2026-08-18: build the industry-standard agent stack end to end, customizing
nothing. Then migrate Runa into it one piece at a time, where every piece — governance and security
included — proves it belongs against the standard before it replaces anything.

## The purity rule

Nothing custom enters this directory. No estate modules are imported here. No ceremonies, no effect
classifier, no Windows Hello — there is nothing here to protect at the start, and pre-installing the
custom machinery would contaminate the baseline the whole method depends on. A governance piece enters
the proving queue at the step where something worth protecting first migrates in, and it enters only
where the standard mechanism fails a requirement scenario the steward defines.

## Boundaries (about the builder, not the build)

This lab does not touch production, the household, or machine-bound state. It talks to the LM Studio
endpoint on RUNA-HOME over the standard OpenAI-compatible interface, which is the industry-standard
surface for a served model.

## What "standard" means here

Leading, externally maintained components in their documented configuration:

- framework/runtime: evaluated inside the assembly (candidate 1: Mastra, TypeScript-native; candidate 2:
  LangGraph.js) — the governed-workflow test in the roadmap is the acceptance bar
- model access: OpenAI-compatible endpoint (LM Studio, RUNA-HOME)
- tools: MCP servers, stock
- memory: the framework's own, in its documented default configuration
- retrieval: BM25 + embeddings + vector store, stock implementations

Own package.json on purpose: the estate's production dependency surface must not change because the lab
installed something.
