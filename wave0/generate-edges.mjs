// Wave 0 Phase 4 — mechanically generate the failure-edge register (EDGE-REGISTER.json) from the
// runtime graph. For each graph edge, the standard question families (review §6 Phase 4) are applied,
// but only where the family is meaningful for that edge's attributes — a network edge gets dependency
// and timing questions, a durable-write edge gets persistence questions, an authority edge gets the
// authority family, a data-flow edge crossing a trust boundary gets the adversarial family. This is
// the candidate denominator: every entry is a scenario to be preregistered, sealed, and probed, with
// a completion-rule class the review requires. It is generated, re-runnable, and diffable — not a
// brainstormed list.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const graph = JSON.parse(readFileSync(path.join(ROOT, "RUNTIME-GRAPH.json"), "utf8"));

// Question families. Each: id, the edge attribute that makes it apply, and the completion-rule class
// (review §5) that a scenario in this family must satisfy.
const FAMILIES = {
  INPUT: { applies: (e) => e.dataFlow || e.effect || e.trust, rule: "deterministic-branches",
    qs: ["absent", "malformed", "oversized", "malicious", "stale", "unauthorized", "valid-but-unexpected"] },
  TIMING: { applies: (e) => e.network || e.effect || e.processBoundary, rule: "crash-recovery",
    qs: ["before", "during", "after", "timeout", "cancellation", "retry", "duplicate", "reordered"] },
  DEPENDENCY: { applies: (e) => e.network || e.processBoundary, rule: "crash-recovery",
    qs: ["unavailable", "slow", "partial-response", "malformed-response", "changed-version", "recovers-mid-operation"] },
  PERSISTENCE: { applies: (e) => e.durableWrite, rule: "crash-recovery",
    qs: ["fail-before-write", "partial-write", "write-ok-ack-fails", "effect-ok-record-fails", "record-ok-effect-fails", "restart-each-boundary"] },
  CONCURRENCY: { applies: (e) => e.durableWrite || e.effect, rule: "concurrency",
    qs: ["same-op-twice", "conflicting-ops", "read-during-write", "two-processes", "two-users", "two-runs-same-id"] },
  AUTHORITY: { applies: (e) => e.authority || e.effect, rule: "security",
    qs: ["wrong-actor", "expired-authority", "authority-for-similar-action", "authority-replayed", "action-changed-after-approval"] },
  OBSERVABILITY: { applies: (e) => e.dataFlow || e.effect, rule: "deterministic-branches",
    qs: ["recorded-correctly", "sensitive-data-exposed", "trace-missing-or-duplicated", "telemetry-failure-changes-result"] },
  VERSIONING: { applies: (e) => e.durableWrite || e.processBoundary, rule: "deterministic-branches",
    qs: ["old-state-new-code", "new-state-old-code", "schema-or-roster-changed", "migration-interrupted"] },
  ADVERSARIAL: { applies: (e) => e.dataFlow && /untrusted/.test(e.trust || ""), rule: "security",
    qs: ["injection-instruction-in-data", "exfiltration-via-output", "encoding-concealment", "cross-lane-leak", "poison-persisted-then-reused"] },
};

const register = [];
for (const e of graph.edges) {
  for (const [fam, spec] of Object.entries(FAMILIES)) {
    if (!spec.applies(e)) continue;
    for (const q of spec.qs) {
      const id = `${e.id}-${fam}-${q}`;
      register.push({
        id,
        edge: e.id, from: e.from, to: e.to, family: fam, question: q,
        completionRule: spec.rule,
        trustBoundaryCrossed: Boolean(e.trust && /untrusted|outside|disk-level/.test(e.trust)),
        touchesEffect: Boolean(e.effect),
        touchesDurable: Boolean(e.durableWrite),
        network: Boolean(e.network),
        status: "UNPROBED",
        wave: null,
        note: e.note || null,
      });
    }
  }
}

// Assign waves per COVERAGE.md's adopted order, from edge attributes.
const waveFor = (r) => {
  if (r.family === "ADVERSARIAL" || r.family === "AUTHORITY") return 2;
  if (r.touchesDurable && (r.from === "workflow" || r.to === "workflow" || r.edge === "E17" || r.edge === "E18" || r.edge === "E19")) return 3;
  if (r.from === "tool-layer" || r.to === "mcp-server" || r.from === "mcp-server" || r.edge === "E13") return 4;
  if (r.family === "CONCURRENCY" || r.family === "PERSISTENCE") return 5;
  if (r.to === "vector-index" || r.from === "vector-index" || r.to === "memory" || r.from === "memory") return 6;
  if (r.to === "model-endpoint" || r.from === "model-endpoint") return 7;
  return 2; // default the untriaged to the governance wave for steward review rather than burying them
};
for (const r of register) r.wave = waveFor(r);

register.sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));
const byWave = register.reduce((m, r) => ((m[r.wave] = (m[r.wave] ?? 0) + 1), m), {});
const byRule = register.reduce((m, r) => ((m[r.completionRule] = (m[r.completionRule] ?? 0) + 1), m), {});

const out = {
  schemaVersion: "runalab-edge-register/v1",
  generatedFrom: { runtimeGraph: "RUNTIME-GRAPH.json", graphSha256: createHash("sha256").update(readFileSync(path.join(ROOT, "RUNTIME-GRAPH.json"))).digest("hex") },
  method: "Phase 4: standard question families applied to each graph edge where the family's edge-attribute predicate holds. Waves assigned from edge attributes per the adopted order. This is the CANDIDATE denominator — a scenario here is preregistered work, not a probed cell. Machine-extracted surface operations without a graph edge are NOT yet enumerated here; that expansion is a tracked Wave 0 follow-up, so this register currently under-counts and must not be read as total.",
  counts: { scenarios: register.length, byWave, byCompletionRule: byRule, trustBoundaryScenarios: register.filter((r) => r.trustBoundaryCrossed).length },
  scenarios: register,
};
writeFileSync(path.join(ROOT, "EDGE-REGISTER.json"), JSON.stringify(out, null, 1));
console.log(`scenarios: ${register.length}`);
console.log("by wave:", JSON.stringify(byWave));
console.log("by completion rule:", JSON.stringify(byRule));
