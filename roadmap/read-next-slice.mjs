import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REQUIRED_CAPABILITIES = Object.freeze(Array.from({ length: 17 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
export const REQUIRED_MODELS = Object.freeze([
  "gemma-4-26b-a4b-it-qat", "qwen3-coder-30b-a3b-instruct", "qwen3.6-27b-mtp",
]);
const fail = message => { throw new Error(`roadmap-invalid:${message}`); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const uniqueStrings = value => Array.isArray(value) && value.every(nonempty)
  && new Set(value).size === value.length;
const states = new Set(["partial", "not-verified", "implemented", "accepted"]);
const facets = ["source", "deterministic", "integration", "modelQualification", "release", "humanAcceptance"];

export function validateRoadmap(catalog, slice) {
  requireValue(catalog?.schemaVersion === "runaai-product-roadmap/v1", "catalog-schema");
  requireValue(slice?.schemaVersion === "runaai-current-slice/v1", "slice-schema");
  requireValue(nonempty(catalog.revision) && slice.roadmapRevision === catalog.revision, "stale-slice-revision");
  requireValue(catalog.milestone1CompletesRoadmap === false && slice.remainingRoadmapRequired === true,
    "milestone-is-not-destination");
  requireValue(uniqueStrings(catalog.primaryModels) && catalog.primaryModels.length === REQUIRED_MODELS.length
    && REQUIRED_MODELS.every(model => catalog.primaryModels.includes(model)), "three-primary-models-required");
  requireValue(uniqueStrings(catalog.milestones) && catalog.milestones.includes("M1"), "milestones");
  requireValue(catalog.currentMilestone === slice.milestone && catalog.milestones.includes(slice.milestone), "current-milestone");
  requireValue(typeof slice.sliceId === "string" && /^M[1-9]\d*-S[1-9]\d*$/.test(slice.sliceId)
    && slice.sliceId.startsWith(`${slice.milestone}-`) && nonempty(slice.nextWork)
    && nonempty(slice.scopeDocument), "slice-fields");
  requireValue(new Set(["authorized-not-complete", "in-progress", "awaiting-human-test", "accepted"]).has(slice.state), "slice-state");
  requireValue(slice.completionClaim === `${slice.milestone} completion is not whole-product completion.`, "slice-completion-claim");
  requireValue(uniqueStrings(slice.completionEvidence)
    && (slice.state !== "accepted" || slice.completionEvidence.length > 0), "slice-completion-evidence");
  requireValue(Array.isArray(catalog.capabilities), "capabilities");
  const ids = catalog.capabilities.map(item => item.id);
  requireValue(uniqueStrings(ids) && REQUIRED_CAPABILITIES.every(id => ids.includes(id)), "capability-coverage");
  requireValue(uniqueStrings(slice.capabilityIds) && slice.capabilityIds.length > 0
    && slice.capabilityIds.every(id => ids.includes(id)), "unknown-slice-capability");
  const byId = new Map(catalog.capabilities.map(item => [item.id, item]));
  for (const item of catalog.capabilities) {
    requireValue([item.title, item.scope, item.acceptance, item.remainingAfterM1].every(nonempty), `capability-fields:${item.id}`);
    requireValue(states.has(item.state), `capability-state:${item.id}`);
    requireValue(uniqueStrings(item.milestones) && item.milestones.length > 0
      && item.milestones.every(id => catalog.milestones.includes(id)), `milestone-coverage:${item.id}`);
    requireValue(uniqueStrings(item.dependsOn) && item.dependsOn.every(id => byId.has(id) && id !== item.id), `dependencies:${item.id}`);
    requireValue(uniqueStrings(item.evidence) && item.evidence.length > 0, `evidence:${item.id}`);
    requireValue(item.proof && facets.every(key => states.has(item.proof[key])), `proof-facets:${item.id}`);
    requireValue(uniqueStrings(item.releaseEvidence), `release-evidence:${item.id}`);
    if (item.state === "accepted") {
      requireValue(facets.every(key => item.proof[key] === "accepted") && item.releaseEvidence.length > 0,
        `acceptance-proof:${item.id}`);
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail(`dependency-cycle:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  ids.forEach(visit);
  return { capabilityCount: ids.length,
    remainingCapabilityIds: catalog.capabilities.filter(item => item.state !== "accepted").map(item => item.id) };
}

function containedPath(root, path) {
  requireValue(nonempty(path) && !isAbsolute(path), "reference-must-be-relative");
  const target = resolve(root, path), delta = relative(root, target);
  requireValue(delta !== "" && !delta.startsWith("..") && !isAbsolute(delta), "reference-outside-repository");
  return target;
}

export async function readPlanningContext(root = ROOT) {
  const files = ["PRODUCT-ROADMAP.md", "roadmap/capabilities.json", "roadmap/current-slice.json",
    "roadmap/CURRENT-SLICE.md", "roadmap/SLICE-TEMPLATE.md", "AGENTS.md", "README.md", "MIGRATION-STATUS.md"];
  const documents = Object.fromEntries(await Promise.all(files.map(async file =>
    [file, await readFile(containedPath(root, file), "utf8")])));
  const catalog = JSON.parse(documents["roadmap/capabilities.json"]);
  const slice = JSON.parse(documents["roadmap/current-slice.json"]);
  const coverage = validateRoadmap(catalog, slice);
  for (const document of ["PRODUCT-ROADMAP.md", "roadmap/CURRENT-SLICE.md"]) {
    requireValue(documents[document].split(/\r?\n/).includes(`Roadmap revision: ${catalog.revision}`), `document-revision:${document}`);
  }
  requireValue(slice.scopeDocument === "roadmap/CURRENT-SLICE.md", "scope-document-mismatch");
  requireValue(documents[slice.scopeDocument].split(/\r?\n/).includes(`Milestone: ${slice.milestone}`), "scope-milestone-mismatch");
  requireValue(documents[slice.scopeDocument].split(/\r?\n/).includes(`Slice ID: ${slice.sliceId}`), "scope-slice-mismatch");
  for (const reference of slice.completionEvidence) await access(containedPath(root, reference));
  for (const entrypoint of ["AGENTS.md", "README.md", "MIGRATION-STATUS.md"]) {
    requireValue(documents[entrypoint].includes("PRODUCT-ROADMAP.md")
      && documents[entrypoint].includes("roadmap/read-next-slice.mjs"), `retrieval-entrypoint:${entrypoint}`);
  }
  for (const item of catalog.capabilities) {
    requireValue(documents["PRODUCT-ROADMAP.md"].includes(`| ${item.id} |`), `prose-coverage:${item.id}`);
    for (const reference of [...item.evidence, ...item.releaseEvidence]) await access(containedPath(root, reference));
  }
  const digestInput = ["PRODUCT-ROADMAP.md", "roadmap/capabilities.json", "roadmap/current-slice.json", "roadmap/CURRENT-SLICE.md"]
    .map(file => `${file}\n${documents[file].replaceAll("\r\n", "\n")}`).join("\n");
  const roadmapDigest = createHash("sha256").update(digestInput).digest("hex");
  return { schemaVersion: "runaai-planning-context/v1", revision: catalog.revision, roadmapDigest,
    ...coverage, milestone: slice.milestone, sliceId: slice.sliceId, nextWork: slice.nextWork,
    requiredReferences: files, documents, passed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== "--check")) fail("unsupported-argument");
    const context = await readPlanningContext();
    const { documents, ...summary } = context;
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!process.argv.includes("--check")) {
      for (const path of ["PRODUCT-ROADMAP.md", "roadmap/CURRENT-SLICE.md"]) {
        process.stdout.write(`\n--- REQUIRED PLANNING CONTEXT: ${path} ---\n${documents[path]}\n`);
      }
      process.stdout.write("\nRead MIGRATION-STATUS.md and the evidence for affected capabilities before selecting work.\n");
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  }
}
