// Wave 0 — machine extraction of the installed public surface (MACHINE-SURFACE.json).
// Mechanical and re-runnable: same installed tree in, same inventory out; drift detection is re-run
// and diff. Uses the TypeScript compiler API against the packages' own declaration files, resolved
// through their export maps — sources 1 and 2 of the review's priority order.
//
// TypeScript is deliberately NOT a lab dependency (the frozen base must not change to be measured).
// Point TS_DIR at any directory whose node_modules carries typescript >= 5:
//   TS_DIR=/path/to/tooling node wave0/extract-surface.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const req = createRequire(process.env.TS_DIR ? path.join(process.env.TS_DIR, "package.json") : import.meta.url);
const ts = req("typescript");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const NM = path.join(ROOT, "node_modules");
const pkgJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const packages = Object.keys(pkgJson.dependencies);

// Member (method/property) extraction is limited to the runtime-framework packages; zod's recursive
// generic surface would multiply entries without adding probeable operations. The rule is mechanical
// and recorded in the output metadata.
const MEMBER_PACKAGES = /^(@mastra\/|ai$|@ai-sdk\/)/;

const tryTypes = (dir, val, seen = new Set()) => {
  if (!val || seen.has(val)) return null;
  seen.add(val);
  if (typeof val === "string") {
    for (const cand of [val, val.replace(/\.(m|c)?js$/, ".d.$1ts").replace(".d.cts", ".d.cts").replace(".d.mts", ".d.mts"), val.replace(/\.(m|c)?js$/, ".d.ts")]) {
      if (/\.d\.(m|c)?ts$/.test(cand) && existsSync(path.join(dir, cand))) return path.join(dir, cand);
    }
    return null;
  }
  if (typeof val === "object") {
    for (const key of ["types", "import", "default", "node", "require"]) {
      const r = tryTypes(dir, val[key], seen);
      if (r) return r;
    }
  }
  return null;
};

const roots = [];
for (const pkg of packages) {
  const dir = path.join(NM, pkg);
  const meta = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const exportsMap = meta.exports ?? { ".": meta.types || meta.typings || "./index.d.ts" };
  for (const [subpath, val] of Object.entries(exportsMap)) {
    if (subpath.includes("*") || subpath.endsWith("package.json")) continue;
    const file = tryTypes(dir, val);
    if (file) roots.push({ pkg, version: meta.version, subpath, file });
  }
}

const program = ts.createProgram(roots.map((r) => r.file), {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();

const kindOf = (sym) => {
  const f = sym.flags;
  if (f & ts.SymbolFlags.Class) return "class";
  if (f & ts.SymbolFlags.Interface) return "interface";
  if (f & ts.SymbolFlags.TypeAlias) return "type";
  if (f & ts.SymbolFlags.Function) return "function";
  if (f & ts.SymbolFlags.Enum) return "enum";
  if (f & ts.SymbolFlags.Variable) return "const";
  if (f & ts.SymbolFlags.Module) return "namespace";
  return "other";
};
const anchor = (sym) => {
  const d = (sym.declarations ?? [])[0];
  if (!d) return { file: null, line: null };
  const sf = d.getSourceFile();
  return { file: path.relative(NM, sf.fileName), line: sf.getLineAndCharacterOfPosition(d.getStart()).line + 1 };
};
const isHidden = (sym) => {
  if (sym.getName().startsWith("#") || sym.getName().startsWith("__")) return true;
  const d = (sym.declarations ?? [])[0];
  if (d && ts.canHaveModifiers(d)) {
    const mods = ts.getModifiers(d) ?? [];
    if (mods.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) return true;
  }
  return false;
};

const entries = [];
const failures = [];
for (const { pkg, version, subpath, file } of roots) {
  const sf = program.getSourceFile(file);
  const modSym = sf && checker.getSymbolAtLocation(sf);
  if (!modSym) { failures.push({ pkg, subpath, reason: "no module symbol" }); continue; }
  for (const exp of checker.getExportsOfModule(modSym)) {
    let resolved = exp;
    try { if (exp.flags & ts.SymbolFlags.Alias) resolved = checker.getAliasedSymbol(exp); } catch {}
    const kind = kindOf(resolved);
    const { file: declFile, line } = anchor(resolved);
    const id = `${pkg}:${subpath}#${exp.getName()}`;
    entries.push({ id, package: pkg, version, exportPath: subpath, symbol: exp.getName(), kind, file: declFile, line });
    if (!MEMBER_PACKAGES.test(pkg)) continue;
    if (!(resolved.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface))) continue;
    let props = [];
    try { props = checker.getDeclaredTypeOfSymbol(resolved).getProperties(); } catch {}
    for (const m of props) {
      if (isHidden(m)) continue;
      const mKind = m.flags & ts.SymbolFlags.Method ? "method" : "property";
      const { file: mFile, line: mLine } = anchor(m);
      entries.push({ id: `${id}.${m.getName()}`, package: pkg, version, exportPath: subpath, symbol: exp.getName(), member: m.getName(), kind: mKind, file: mFile, line: mLine });
    }
  }
}

entries.sort((a, b) => a.id.localeCompare(b.id));
const lockDigest = createHash("sha256").update(readFileSync(path.join(ROOT, "package-lock.json"))).digest("hex");
const out = {
  schemaVersion: "runalab-machine-surface/v1",
  method: {
    sources: ["installed .d.ts via package export maps", "TypeScript compiler API getExportsOfModule + declared-type properties"],
    memberExtraction: "class/interface members for packages matching " + String(MEMBER_PACKAGES) + "; private/protected/#/__ excluded mechanically",
    limits: [
      "configuration option FIELDS appear as interface/type members, not as expanded per-option entries",
      "call signatures, overloads and event payloads are not expanded",
      "an entry proves the surface exists, never that any path exercises it",
    ],
  },
  base: { packageLockSha256: lockDigest, packages: Object.fromEntries(roots.map((r) => [r.pkg, r.version])) },
  counts: {
    entryPoints: roots.length,
    entries: entries.length,
    byPackage: entries.reduce((m, e) => ((m[e.package] = (m[e.package] ?? 0) + 1), m), {}),
    failures: failures.length,
  },
  failures,
  entries,
};
writeFileSync(path.join(ROOT, "MACHINE-SURFACE.json"), JSON.stringify(out, null, 1));
console.log(`entry points: ${roots.length}, entries: ${entries.length}, failures: ${failures.length}`);
console.log(Object.entries(out.counts.byPackage).map(([k, v]) => `${k}: ${v}`).join("\n"));
