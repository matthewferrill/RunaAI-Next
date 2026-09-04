# Native PostgreSQL Gate 2 preflight-instantiation failure RCA — 2026-09-04

## Disposition

- Classification: operator/harness instantiation defect; not a RunaAI product, PostgreSQL, or model failure.
- Gate result: **STOPPED before execution**. The Candidate test was not started and earns no pass or fail credit.
- Resume point: the same reviewed Candidate gate at commit `491c284fdf40b45288e843903720bb77beef750c`, only after this correction is committed and independently reviewed against the new exact commit.
- Retry policy: one affected-stage resume only. No unchanged or previously green tests are replayed.

## What happened

The operator mechanically extracted the frozen PowerShell wrapper and replaced all seven exact `FINAL_GO_*` value
sentinels once. An additional outer guard then searched the complete extracted block for the broad substring
`FINAL_GO`. That substring legitimately remained in the wrapper's explanatory comment and generic fail-closed wildcard
guard. The outer guard raised `unresolved-final-go-sentinel` before it compiled or invoked the frozen wrapper.

Observed command result:

```text
exit_code=1
unresolved-final-go-sentinel
```

Post-stop evidence showed a clean Git worktree, no `node_modules` junction, no Candidate artifact root, and no Runa-owned
PostgreSQL process. Therefore the wrapper, Node test runner, disposable database, product code, and model were never
executed.

## Root cause

The transient instantiation layer validated a broad marker prefix instead of the seven exact replaceable values. It
conflated intentional guard text with unresolved configuration. This added check was not part of the reviewed frozen
wrapper and was stricter in the wrong dimension.

## Contributing controls gap

The final source review validated the frozen wrapper and literal pins, but the operator added the broad post-substitution
scan while assembling the transient invocation. The invocation path did not have an explicit rule distinguishing exact
sentinel values from intentional generic sentinel-prefix text.

## Correction design

1. Keep the reviewed frozen wrapper and its internal fail-closed checks unchanged.
2. Mechanically extract only the unique fenced PowerShell block.
3. For each of the seven exact sentinel values, require exactly one pre-replacement occurrence, replace it with the
   independently reviewed literal, and require that exact sentinel value to have zero post-replacement occurrences.
4. Do not scan the complete script for the broad `FINAL_GO` prefix.
5. Compile and invoke only the resulting in-memory script block; do not write another repository script.
6. Re-authenticate the new committed HEAD, clean status, physical file hashes, exact test names, dependencies, tools,
   process census, junction absence, and artifact-root absence inside the frozen wrapper before starting Node.
7. On any subsequent stop, retain artifacts for RCA and do not start Compatibility.

## Prevention

The authoritative preflight now states the exact-value substitution invariant and forbids broad prefix matching. A fresh
independent review must approve the corrected document, new commit, updated document hash, and exact transient literals
before the single affected-stage resume.
