import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeEquivalentCandidateHistoryResult } from "./compose-equivalent-candidate-result.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => Object.assign(new Error(code), { code });

export function parseHistoryCompositionArguments(argv) {
  if (argv.length % 2) throw fail("m1-history-composition-argument-invalid");
  const allowed = new Set(["owned-root", "history-manifest", "history-manifest-sha256",
    "final-result", "final-result-sha256", "final-plan", "final-plan-sha256",
    "current-runtime-seal", "current-runtime-seal-sha256", "output-directory"]), values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/u, ""), value = argv[index + 1];
    if (!allowed.has(key) || !value || values[key]) throw fail("m1-history-composition-argument-invalid");
    values[key] = value;
  }
  if ([...allowed].some(key => !values[key]) || [...allowed].filter(key => key.endsWith("sha256"))
    .some(key => !HEX.test(values[key]))) throw fail("m1-history-composition-argument-invalid");
  return values;
}

const inside = (root, actual) => {
  const relative = path.relative(root, actual);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

async function loadRegularJson(root, relative, expectedSha256, { evidenceOnly = true } = {}) {
  const boundary = await realpath(evidenceOnly ? path.join(root, "acceptance-evidence") : root);
  const requested = path.resolve(root, relative), requestedStat = await lstat(requested), actual = await realpath(requested);
  const stat = await lstat(actual);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink() || !inside(boundary, actual)
      || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4 * 1024 * 1024) {
    throw fail("m1-history-composition-input-invalid");
  }
  const bytes = await readFile(actual);
  if (sha256(bytes) !== expectedSha256) throw fail("m1-history-composition-digest-invalid");
  return JSON.parse(bytes);
}

async function createOutput(root, relative) {
  const evidence = await realpath(path.join(root, "acceptance-evidence")), requested = path.resolve(root, relative);
  const parent = await realpath(path.dirname(requested));
  if (!path.relative(evidence, requested) || !inside(evidence, requested) || !inside(evidence, parent))
    throw fail("m1-history-composition-output-invalid");
  await mkdir(requested, { recursive: false });
  const actual = await realpath(requested);
  if (!inside(evidence, actual)) throw fail("m1-history-composition-output-invalid");
  return actual;
}

export async function runHistoryComposition(values) {
  const root = await realpath(path.resolve(values["owned-root"]));
  const history = await loadRegularJson(root, values["history-manifest"], values["history-manifest-sha256"]);
  if (history?.schemaVersion !== "runaai-m1-campaign-continuation-history/v1" || history.windows?.length !== 2
      || typeof history.basePlan !== "string" || !HEX.test(history.basePlanSha256 ?? "")
      || history.windows.some((definition, index) => definition?.index !== index + 1
        || typeof definition.result !== "string" || typeof definition.sourcePlan !== "string"
        || typeof definition.runtimeSeal !== "string" || !HEX.test(definition.resultSha256 ?? "")
        || !HEX.test(definition.planSha256 ?? "") || !HEX.test(definition.runtimeSealSha256 ?? ""))) {
    throw fail("m1-history-composition-manifest-invalid");
  }
  const basePlan = await loadRegularJson(root, history.basePlan, history.basePlanSha256);
  const windows = await Promise.all(history.windows.map(async definition => ({ definition,
    resultSha256: definition.resultSha256, planSha256: definition.planSha256,
    runtimeSealSha256: definition.runtimeSealSha256,
    result: await loadRegularJson(root, definition.result, definition.resultSha256),
    plan: await loadRegularJson(root, definition.sourcePlan, definition.planSha256),
    seal: await loadRegularJson(root, definition.runtimeSeal, definition.runtimeSealSha256) })));
  const [finalResult, continuationPlan, currentSeal] = await Promise.all([
    loadRegularJson(root, values["final-result"], values["final-result-sha256"]),
    loadRegularJson(root, values["final-plan"], values["final-plan-sha256"]),
    loadRegularJson(root, values["current-runtime-seal"], values["current-runtime-seal-sha256"], { evidenceOnly: false }),
  ]);
  const composed = composeEquivalentCandidateHistoryResult({ history, windows, basePlan, finalResult,
    continuationPlan, currentSeal, bindings: { historyManifestSha256: values["history-manifest-sha256"],
      basePlanSha256: history.basePlanSha256, currentRuntimeSealSha256: values["current-runtime-seal-sha256"],
      finalResultSha256: values["final-result-sha256"], loadedFinalResultSha256: values["final-result-sha256"],
      finalPlanSha256: values["final-plan-sha256"], loadedFinalPlanSha256: values["final-plan-sha256"] } });
  const output = await createOutput(root, values["output-directory"]);
  const auditBytes = Buffer.from(`${JSON.stringify(composed.audit, null, 2)}\n`), resultBytes = Buffer.from(`${JSON.stringify(composed.result, null, 2)}\n`);
  await writeFile(path.join(output, "equivalence-audit.json"), auditBytes, { flag: "wx" });
  await writeFile(path.join(output, "qwen-composed-result.json"), resultBytes, { flag: "wx" });
  return { outputDirectory: output, auditSha256: sha256(auditBytes), resultSha256: sha256(resultBytes), recordedAttempts: 120 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runHistoryComposition(parseHistoryCompositionArguments(process.argv.slice(2)))
    .then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
      process.stderr.write(`${error?.code ?? error?.message ?? "m1-history-composition-failed"}\n`); process.exitCode = 1;
    });
}
