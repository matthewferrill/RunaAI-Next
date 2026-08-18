// Wave 0 — mechanical generation of EDGE-REGISTER.json from RUNTIME-GRAPH.json.
// For every graph edge, the standard question families apply by the edge's own properties, never by
// judgment. The register is the authoritative denominator for risk-scenario coverage; COVERAGE.md is
// checked against it, not the other way round. Re-runnable: same graph in, same register out.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const graph = JSON.parse(readFileSync(path.join(ROOT, "RUNTIME-GRAPH.json"), "utf8"));

// The eight families and their standard questions (review §6 phase 4), with mechanical applicability.
const FAMILIES = [
  { family: "input", applies: () => true,
    questions: ["absent", "malformed", "oversized", "malicious", "stale", "unauthorized", "valid-but-unexpected"] },
  { family: "timing", applies: () => true,
    questions: ["fails-before", "fails-during", "fails-after", "timeout", "cancellation", "retry", "duplicate", "reordered"] },
  { family: "dependency", applies: (e) => e.network || e.processBoundary || nodeOf(e.to).external,
    questions: ["unavailable", "slow", "partial-response", "malformed-response", "changed-version", "recovers-mid-operation"] },
  { family: "persistence", applies: (e) => e.durableWrite,
    questions: ["f