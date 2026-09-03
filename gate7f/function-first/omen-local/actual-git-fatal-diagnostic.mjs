import { resolve } from "node:path";
import { runActualOmenGitFatalDiagnostic } from "./actual-git-proof.mjs";

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runActualOmenGitFatalDiagnostic().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(error?.publicRecord ? `${JSON.stringify(error.publicRecord)}\n`
      : "diagnostic-publication-refused\n");
    process.exitCode = 1;
  });
}
