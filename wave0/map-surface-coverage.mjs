// Wave 0 — interface coverage (SURFACE-COVERAGE.json). The review asks for two measures; this builds
// the first: installed public operations exercised over total inventoried. It answers a question the
// raw 21,831-entry inventory cannot: how much of the installed surface does the lab actually touch?
//
// Method and its ceiling, stated up front. This is STATIC analysis of the lab's own probe and source
// files: imported symbols, and member expressions matching known members. It establishes the review's
// level 3 — "Runalab calls it directly" — and nothing above it. Level 4 (the real Runa migration path
// would call it) and level 5 (a scenario exercised that path) need runtime tracing against the live
// endpoint and are NOT claimed here. A symbol counted as referenced was written down in a probe; that
// is not proof any run reached it.
//
// Denominator discipline: types, interfaces, and pure type aliases are not operations. Only callable
// surface — functions, classes, and their methods — counts, because only callable surface can be
// probed. The excluded counts are reported rather than dropped.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const surface = JSON.parse(readFileSync(path.join(ROOT, "MACHINE-SURFACE.json"), "utf8"));

// Lab code under analysis: everything the lab itself wrote, excluding wave0 tooling (which measures
// the base rather than using it) and node_modules.
const labFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "wave0" || name === "storage") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(mjs|js|ts)$/.test(name)) labFiles.push(p);
  }
};
walk(ROOT);
const labSource = labFiles.map((f) => readFileSync(f, "utf8")).join("\n");

// Imported module specifiers tell us which entry points the lab reaches at all.
const importedModules = new Set();
for (const m of labSource.matchAll(/from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)) {
  const spec = m[1] || m[2];
  if (spec && !spec.startsWith(".")) importedModules.add(spec);
}
// Identifiers and member names appearing anywhere in lab code. Deliberately generous: a name match is
// evidence the lab writes that name, and over-counting here makes the coverage number a CEILING, which
// is the safe direction for a claim about how little is covered.
const referencedNames = new Set(labSource.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []);

const isOperation = (e) => e.kind === "method" || e.kind === "function" || e.kind === "class";
const entryModule = (e) => e.exportPath === "." ? e.package : e.package + e.exportPath.slice(1);

const ops = surface.entries.filter(isOperation);
const nonOps = surface.entries.length - ops.length;

const byModule = {};
for (const e of ops) {
  const mod = entryModule(e);
  const name = e.member ?? e.symbol;
  const moduleImported = importedModules.has(mod);
  const nameReferenced = referencedNames.has(name);
  // Level 3 requires both: the lab imports that entry point AND writes that name somewhere.
  const level = moduleImported && nameReferenced ? "referenced-by-lab" : moduleImported ? "entrypoint-imported-symbol-unused" : "installed-only";
  byModule[mod] ??= { module: mod, package: e.package, imported: moduleImported, operations: 0, referenced: 0, samplesReferenced: [] };
  byModule[mod].operations++;
  if (level === "referenced-by-lab") {
    byModule[mod].referenced++;
    if (byModule[mod].samplesReferenced.length < 8) byModule[mod].samplesReferenced.push(name);
  }
}

const modules = Object.values(byModule).sort((a, b) => b.referenced - a.referenced || b.operations - a.operations);
const totalOps = ops.length;
const totalReferenced = modules.reduce((n, m) => n + m.referenced, 0);
const importedModuleCount = modules.filter((m) => m.imported).length;

const out = {
  schemaVersion: "runalab-surface-coverage/v1",
  method: {
    basis: "static analysis of lab source; imported module specifiers plus name occurrence",
    establishes: "review level 3 — Runalab calls it directly",
    doesNotEstablish: [
      "level 4: the real Runa migration path would call it",
      "level 5: a scenario exercised that path",
      "that any referenced symbol was reached at runtime",
    ],
    denominator: "callable surface only (function, class, method). Types, interfaces and aliases are excluded because they cannot be probed.",
    direction: "name matching is generous, so referenced counts are a CEILING — real coverage is at most this, likely less",
  },
  base: { packageLockSha256: surface.base.packageLockSha256, packages: surface.base.packages },
  counts: {
    surfaceEntriesTotal: surface.entries.length,
    nonOperationEntriesExcluded: nonOps,
    operationsInventoried: totalOps,
    operationsReferencedByLab: totalReferenced,
    interfaceCoverageCeiling: Number((totalReferenced / totalOps).toFixed(5)),
    entryPointsInstalled: modules.length,
    entryPointsImportedByLab: importedModuleCount,
  },
  importedModules: [...importedModules].sort(),
  modules,
};
writeFileSync(path.join(ROOT, "SURFACE-COVERAGE.json"), JSON.stringify(out, null, 1));
console.log(`operations inventoried: ${totalOps} (of ${surface.entries.length} entries; ${nonOps} non-operation excluded)`);
console.log(`operations referenced by lab code: ${totalReferenced}  => interface coverage CEILING ${(100 * totalReferenced / totalOps).toFixed(2)}%`);
console.log(`entry points: ${modules.length} installed, ${importedModuleCount} imported by the lab`);
console.log("\ntop modules by referenced operations:");
for (const m of modules.slice(0, 12)) console.log(`  ${m.module}: ${m.referenced}/${m.operations}${m.imported ? "" : "  (never imported)"}`);
