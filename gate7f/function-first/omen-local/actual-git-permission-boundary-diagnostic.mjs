import { resolve } from "node:path";
import { runActualOmenGitPermissionBoundaryDiagnostic } from "./actual-git-proof.mjs";

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runActualOmenGitPermissionBoundaryDiagnostic()
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
      process.stderr.write(error?.publicRecord ? `${JSON.stringify(error.publicRecord)}\n`
        : "diagnostic-publication-refused\n");
      process.exitCode = 1;
    });
}
