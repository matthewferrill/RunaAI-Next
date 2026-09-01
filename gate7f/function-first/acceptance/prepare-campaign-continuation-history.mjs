import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContinuationHistoryPlan, loadBoundFile } from "./run-campaign-continuation.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => Object.assign(new Error(code), { code });

export function parseContinuationHistoryArguments(argv) {
  if (argv.length % 2) throw fail("m1-continuation-history-argument-invalid");
  const values = {}, allowed = new Set(["owned-root", "candidate-id", "full-plan", "full-plan-sha256",
    "history-manifest", "history-manifest-sha256", "current-runtime-seal", "current-runtime-seal-sha256", "output-directory"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/u, ""), value = argv[index + 1];
    if (!allowed.has(key) || !value || values[key]) throw fail("m1-continuation-history-argument-invalid");
    values[key] = value;
  }
  if ([...allowed].some(key => !values[key]) || ["full-plan-sha256", "history-manifest-sha256", "current-runtime-seal-sha256"]
    .some(key => !HEX.test(values[key]))) throw fail("m1-continuation-history-argument-invalid");
  return values;
}

function contained(root, actual) {
  const relative = path.relative(root, actual);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export async function createContainedOutputDirectory(root, relativeOutput) {
  const evidenceRoot = await realpath(path.join(root, "acceptance-evidence"));
  const requested = path.resolve(root, relativeOutput), parent = path.dirname(requested), actualParent = await realpath(parent);
  if (!path.relative(evidenceRoot, requested) || !contained(evidenceRoot, requested) || !contained(evidenceRoot, actualParent))
    throw fail("m1-continuation-history-output-invalid");
  await mkdir(requested, { recursive: false });
  const actualOutput = await realpath(requested);
  if (!contained(evidenceRoot, actualOutput)) throw fail("m1-continuation-history-output-invalid");
  return actualOutput;
}

export async function regularBoundRootFile(root, relative, expectedSha256) {
  const requested = path.resolve(root, relative), requestedStat = await lstat(requested), rootReal = await realpath(root), actual = await realpath(requested);
  const rel = path.relative(rootReal, actual), stat = await lstat(actual);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink() || !rel || path.isAbsolute(rel)
      || rel === ".." || rel.startsWith(`..${path.sep}`) || !stat.isFile() || stat.isSymbolicLink()
      || stat.size < 1 || stat.size > 4 * 1024 * 1024) throw fail("m1-continuation-history-file-invalid");
  const bytes = await readFile(actual); if (sha256(bytes) !== expectedSha256) throw fail("m1-continuation-history-digest-invalid");
  return JSON.parse(bytes);
}

export async function prepareContinuationHistory(values) {
  const root = await realpath(path.resolve(values["owned-root"]));
  const [fullPlan, history, currentSeal] = await Promise.all([
    loadBoundFile(root, values["full-plan"], values["full-plan-sha256"], "history-full-plan"),
    loadBoundFile(root, values["history-manifest"], values["history-manifest-sha256"], "history"),
    regularBoundRootFile(root, values["current-runtime-seal"], values["current-runtime-seal-sha256"]),
  ]);
  if (fullPlan?.sourceCommit !== currentSeal?.sourceCommit
      || fullPlan?.caseBundleSha256 !== currentSeal?.caseBundleSha256
      || fullPlan?.runtimeSealSha256 !== values["current-runtime-seal-sha256"])
    throw fail("m1-continuation-history-current-plan-binding-invalid");
  if (history?.schemaVersion !== "runaai-m1-campaign-continuation-history/v1" || history.windows?.length !== 2
      || history.basePlanSha256 !== values["full-plan-sha256"] || history.basePlan !== values["full-plan"]
      || history.windows.some((definition, index) => definition?.index !== index + 1
        || typeof definition.result !== "string" || typeof definition.sourcePlan !== "string"
        || typeof definition.runtimeSeal !== "string" || !HEX.test(definition.resultSha256 ?? "")
        || !HEX.test(definition.planSha256 ?? "") || !HEX.test(definition.runtimeSealSha256 ?? ""))) {
    throw fail("m1-continuation-history-manifest-invalid");
  }
  const windows = await Promise.all((history.windows ?? []).map(async definition => ({ definition,
    result: await loadBoundFile(root, definition.result, definition.resultSha256, `history-result-${definition.index}`),
    plan: await loadBoundFile(root, definition.sourcePlan, definition.planSha256, `history-plan-${definition.index}`),
    seal: await loadBoundFile(root, definition.runtimeSeal, definition.runtimeSealSha256, `history-seal-${definition.index}`),
  })));
  const prepared = createContinuationHistoryPlan({ campaign: { "candidate-id": values["candidate-id"] }, fullPlan,
    history, windows, currentSeal, bindings: { historyManifestSha256: values["history-manifest-sha256"],
      basePlanSha256: values["full-plan-sha256"], basePlan: fullPlan } });
  const output = await createContainedOutputDirectory(root, values["output-directory"]);
  for (const [name, value] of [["continuation-plan.json", prepared.plan], ["continuation-history-audit.json", prepared.audit]])
    await writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  return { outputDirectory: output, resumeAttemptId: prepared.plan.resumeAttemptId,
    retainedPrefixAttempts: prepared.plan.retainedPrefixAttempts, continuationAttempts: prepared.plan.attempts.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prepareContinuationHistory(parseContinuationHistoryArguments(process.argv.slice(2))).then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
    process.stderr.write(`${error?.code ?? error?.message ?? "m1-continuation-history-failed"}\n`); process.exitCode = 1;
  });
}
