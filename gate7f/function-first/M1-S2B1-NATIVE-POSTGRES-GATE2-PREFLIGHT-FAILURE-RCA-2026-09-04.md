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

## Second pre-execution stop: wrapper parse failure

After the first correction was committed and independently reviewed, the one affected-stage resume stopped again while
compiling the substituted in-memory wrapper. PowerShell reported four invalid variable references where a colon followed
an unbraced variable inside a double-quoted string:

```text
hash-mismatch:$literalPath:$actual
node-test-outer-timeout:$mode:$outerDeadlineMs
node-test-failed:$mode:$exitCode
selected-test-name-mismatch:$index:$name
```

PowerShell treats the colon as part of a scoped variable reference unless the preceding variable name is braced. The
wrapper therefore could not compile. The transient host then attempted to invoke an invalid script-block value, producing
a secondary host error; neither error entered the wrapper.

Post-stop evidence again showed a clean Git worktree, no `node_modules` junction, no Candidate artifact root, and zero
Runa-owned PostgreSQL processes. The Node test runner, disposable database, product code, and model were not executed.

### Second root cause

The frozen wrapper contained syntactically invalid PowerShell interpolation, and the review gate inspected its logic but
did not perform a parser-only check of the exact fenced code. The transient host also lacked terminating-error and
parser-zero-error requirements before invocation. This was a second operator/harness defect, not a product or test-result
failure.

### Second correction and prevention

1. Brace the four variables that are immediately followed by colons.
2. Before execution authorization, mechanically instantiate the exact seven reviewed literals and call
   `System.Management.Automation.Language.Parser.ParseInput` without invoking the result; require zero parser errors.
3. In the transient host, set strict mode and `$ErrorActionPreference = 'Stop'` before compilation.
4. Invoke only a non-null script block produced from the exact parser-clean text.
5. Recommit and independently review the complete method and new exact HEAD before the single affected-stage resume.
6. Do not replay any product test, start Compatibility, or assign model/product failure credit for either pre-execution
   stop.
