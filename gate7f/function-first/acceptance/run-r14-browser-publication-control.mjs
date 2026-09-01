import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseBrowserPublicationControlArguments, runBrowserPublicationControl } from "./run-r12-browser-publication-control.mjs";

const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "m1-r14-browser-control-failed";

export function parseR14BrowserControlArguments(argv) {
  return parseBrowserPublicationControlArguments(argv, { label: "r14" });
}

export function runR14BrowserPublicationControl(args, options = {}) {
  return runBrowserPublicationControl(args, { ...options, label: "r14",
    sealVersion: "runaai-m1-functional-runtime-seal/v10",
    reportSchema: "runaai-m1-r14-browser-publication-control/v1",
    identitySeedSuffix: "r14-model-free-browser-publication" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await runR14BrowserPublicationControl(parseR14BrowserControlArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ schemaVersion: report.schemaVersion, passed: report.passed,
      errorCode: report.errorCode ?? null, cleanupError: report.cleanupError ?? null, evidenceFile: report.evidenceFile,
      modelsInvoked: report.modelsInvoked, productionChanged: false })}\n`);
    if (!report.passed || report.cleanupError) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r14-browser-publication-control-error/v1",
      passed: false, errorCode: safeCode(error), modelsInvoked: false, productionChanged: false })}\n`);
    process.exitCode = 1;
  }
}
