# Wave 0 — freeze and inventory

The review's method, made runnable. Wave 0 produces the machine-derived denominator that COVERAGE.md
was wrongly claiming to be. Order and outputs:

## Steps

1. **Freeze the base** — `node wave0/collect-manifest.mjs` → `BASE-MANIFEST.json`.
   **Must run on Control** (or wherever the sweep runs): it records host, Node version, the live
   endpoint's served models, and LM Studio version. Set `LMSTUDIO_VERSION` in the environment when
   known — the collector writes null with a reason rather than guessing. A manifest collected on any
   other host is not the frozen base and must not be committed as one; the cloud clone's run was
   discarded for exactly this reason.

2. **Inventory the public surface** — `TS_DIR=<dir-with-typescript> node wave0/extract-surface.mjs`
   → `MACHINE-SURFACE.json`. Machine-extracts every exported symbol (and class/interface members for
   the runtime packages) from the installed `.d.ts` files via the packages' own export maps.
   TypeScript is intentionally not a lab dependency — point `TS_DIR` at any dir whose node_modules
   has typescript ≥5. Valid from any clone with the identical `package-lock.json`; the current run
   inventoried 21,831 entries across 105 entry points, 0 failures.

3. **Draw the runtime graph** — `RUNTIME-GRAPH.json`, hand-authored: nodes (exercised /
   installed-bypassed / installed-unexercised), edges with trust/durable/effect/network/authority
   attributes. Every untrusted-data edge and durable write is a coverage object.

4. **Generate the edge register** — `node wave0/generate-edges.mjs` → `EDGE-REGISTER.json`. Applies
   the seven standard question families to each graph edge where the family's predicate holds, waves
   and rule-classes each scenario. Current run: 345 candidate scenarios. **This under-counts on
   purpose right now:** it enumerates graph-edge scenarios only. Machine-surface operations without a
   graph edge are a tracked follow-up (see below), so the register is not yet the total denominator —
   it is the first mechanical cut of it.

5. **Threat model** — `THREAT-MODEL.md`, DRAFT. Wave 2 seals nothing until the steward ratifies its
   assets, prohibited outcomes, and severity classes.

## Regeneration and drift

Every generator is re-runnable and diffable. On any dependency or config change: re-run steps 2 and
4, diff the JSON, and any changed/removed/added surface or edge invalidates the affected register
scenarios and their results. That diff is `COVERAGE-DRIFT.json` (tooling is a Wave 0 follow-up).

## Tracked Wave 0 follow-ups (not yet done — named, not hidden)

- Expand EDGE-REGISTER from MACHINE-SURFACE operations that have no graph edge (config-option fields,
  event payloads, lifecycle hooks) so the denominator is complete, not graph-only.
- `MIGRATION-TRACEABILITY.json` and `COVERAGE-DRIFT.json` generators.
- Make COVERAGE.md's coverage counts generated from the register rather than hand-written.
- Run `collect-manifest.mjs` on Control to produce the real `BASE-MANIFEST.json`.
