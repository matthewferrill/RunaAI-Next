# Actual isolated supervisor and closed-adapter results

Source `84925a4a6f454e844f9cde68f0c04e4c2c727fd2`; prospective criteria
`23d5922`, `8919862`, `455de47`. Full deployment regression: **93/93 pass,
zero failed, cancelled or skipped**, 2026-08-28T23:44:05.788Z through
23:45:32.517Z. No Home/model call, production deployment or protected-store read.

`evidence/20260828-supervisor-r1/proof.json` raw SHA256
`32f0c396c645452c10d123e5ae3d36d5d3dc4187dd4518dc5461f2704ab5e923`
binds every local deployment source/test, the exact archived deployer fixture,
Node22.22.0 SHA `bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb`,
Windows PowerShell SHA `7600ffe12da441fe89d035b13801e8e91d064bc544a27b19a5cf49f6ab8b18f5`,
and complete TAP SHA `df5c8793e07ffcd0c03e2f20dd3a543fc251dfa7a58688634bb732c5b4084a37`.
Stderr was empty. The raw proof directory is byte-preserved.

## What actually ran

Eleven watchdog tests exercise native Windows processes/jobs: suspended atomic
assignment, exact PID/start records before resume, stdin EOF, quoted/unicode argv,
deadline and output caps, companion/grandchild termination, unrelated sentinel
survival, actual separate controller exit, actual supervisor-host death, a
start-record observer throwing or stalling, and a real write followed by lost
terminal. A newly started observer refuses replay without a matching terminal.
Host and wrapper process exits are verified on the controller-loss path; owned
fixture directories are removed after observation. `ActiveProcesses:0` is an
actual job query, not inferred from a generated success statement.

Seventeen adapter tests separately cover seven mandatory authority hooks, failed
qualification/Home/closed-phase/package checks, a durable outer intent followed
by a second Home or Caddy denial (request only, zero launch), exact result schema,
fresh operation/request/package binding, and actual files containing synthetic
child receipts that cannot be reused outside the current companion lifetime.
The real generated companion was executed in the actual supervisor with a
forced synthetic `COMPUTERNAME`; its pre-existing owner/context guard rejected
it before any production reads. The observed exit was1 with zero job processes;
this is denial proof, **not** a successful deployment. Command-record fixtures
are explicitly synthetic, not independent Home readiness or model qualification.

The remaining65 tests are the existing deployment/transaction/child-intent and
wire-fixture regressions. This does not rerun the long36-case wire campaign or
qualify a later changed Home evidence schema.

## Development failures retained, not relabeled

The first run passed1/8 because the exact system PowerShell binary has two NTFS
links; ordinary files remain single-link. Intermediate6/8 and9/11 runs exposed
fixture/terminal-path details and controller-loss behavior. Directly detaching
PowerShell then returned0 without entering its script, both sandbox and owner
context. These failed development runs remain in the task tool record; they are
not the retained93-test pass. A pinned detached Node host solved the demonstrated
Windows launch issue; its normal PowerShell child remains in the host's Windows
job and owns the separate atomic companion job. The actual corrected controller
loss and supervisor death tests passed before this full run. An initial adapter
test invocation also failed because the new worktree lacked its dependency
junction; reusing the existing installed dependency directory fixed setup,
without downloading or changing dependencies.

## Remaining boundary

This finishes the finite fixed-companion executor, not the assembled two-host
deployment. The trusted exclusive journal, fresh qualified-source verification,
native-wide and local caller closure, Home runtime observation and exact rollback
must still be concretely composed and rehearsed. External services/tasks are not
job descendants. Unknown effects never permit blind rollback, replay or opening
admission. The frozen9556 app is diagnostic only; these results do not promote it.

The adapter cross-checks child argv hashes but does not independently reconstruct
the four private command arguments. Those commands are defined by the exact
pinned companion. This trust boundary is explicit in the code and README.
