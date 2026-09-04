# M1-S2B1 supervisor preflight and deadline RCA — 2026-09-04

Status: the model campaign remains paused. No model, browser, network, service, Home, or Control acceptance was run.

## Actual Omen contract pinned before continuation

- Windows PowerShell: `5.1.26100.9168`
- .NET Framework CLR exposed to Windows PowerShell: `4.0.30319.42000`
- Windows API version: `10.0.26200.0`
- supervisor Node runtime: `v22.22.0`
- child execution maximum: 600,000 ms
- supervisor cleanup/evidence allowance after the child deadline: 5,000 ms

The repository already freezes `cleanupMs: 5000` in `control/deployment/closed-adapter.mjs`. Microsoft documents that Windows PowerShell 5.1 `Add-Type` compiles source with its C# CodeDOM provider, and that a Windows Job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates its associated process tree when the last Job handle closes:

- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type?view=powershell-5.1
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject

## Failure 1 — compiler compatibility

The first focused lifecycle run failed before any child launch. Windows PowerShell 5.1 rejected one new implicit C# declaration containing two declarators. Static review had incorrectly treated the source as compatible without first compiling it in the pinned compiler.

Root cause: validation order was wrong. Static reasoning preceded the actual compiler gate even though the target runtime and earlier repository RCAs were known.

Correction:

1. Split the declaration into two compiler-compatible statements.
2. Scan the complete helper for the same declaration shape.
3. Compile the exact helper successfully with pinned Windows PowerShell 5.1.
4. Add a fail-fast test-module preflight that pins Node `v22.22.0`, pins PowerShell major/minor `5.1`, and compiles the exact production helper before any lifecycle test can start.

This failure is harness/implementation infrastructure, not a model failure.

## Failure 2 — execution deadline confused with cleanup deadline

After the compiler correction, the first success case passed. The next timeout case stopped because the host and wrapper terminated themselves at the child's execution deadline. That is precisely when the C# owner must terminate the Job, drain output, prove process/tree absence, and fsync the terminal record. The retained journal therefore had start evidence but no terminal evidence.

Root cause: the refactor collapsed two different clocks:

- `D`: stop admitting child work and terminate the child Job;
- `D + 5,000 ms`: outer watchdog deadline for cleanup and durable evidence.

Correction:

- C# continues to enforce child work at `D` and retains its existing safety exit at `D + 5,000 ms`.
- PowerShell and the detached Node host now enforce their outer safety deadline at `D + 5,000 ms`.
- the controller observation allowance remains `D + 5,000 ms + 2,000 ms` so it cannot manufacture success while a terminal record is still absent.

The exact failed timeout case was run once after correction and passed. It retained an `unknown` timeout terminal with exit `124`, `TimedOut: true`, `StopConfirmed: true`, zero active processes, and automatic replay disabled.

This failure is supervisor timeout design, not a model failure.

## Failure 3 — unbounded aggregate count after bounded drain

The first full focused-suite continuation stopped at the stdout/stderr cap cases. The revised reader correctly continued draining both pipes after the configured limit so an oversized child could not deadlock on a full pipe. It incorrectly retained the complete byte total while the journal/inspector contract permits only a bounded aggregate. The inspector rejected the terminal as `m1-watchdog-result-binding`; it did not accept malformed evidence.

Root cause: one correction combined two separate responsibilities—complete pipe drainage and bounded evidence publication—without preserving the existing bound on the second.

Correction: both shared pipe readers continue draining to EOF but saturate their retained counter at `maximumBytes + 1`. Crossing the limit still sets `OutputLimited`, no raw oversized stdout or stderr is retained, and the terminal fact remains bounded. Only the two exact stdout/stderr cap cases may run next; the full suite must not be retried until those pass.

Both exact cap cases then passed. Test diagnostics were also reduced from complete journal dumps to the small outcome/process/timeout/limit projection needed for review, preventing routine green runs from generating large, costly logs.

This failure is supervisor observation design, not a model failure.

## Failure 4 — nullable PowerShell-to-C# admission value

The first v2 eligibility case stopped before child execution because Windows PowerShell 5.1 did not preserve JSON `null` as a null C# string when invoking the typed `RunV2` method. C# received a non-null empty value and correctly rejected admission. The direct null-environment test used the same unstable nullable call shape, so it reached admission rejection instead of its intended environment assertion.

Root cause: the external JSON contract and the internal PowerShell/C# invocation contract were treated as if they had identical null semantics.

Correction: the external eligibility request and child acknowledgement continue to use JSON `null`; the wrapper converts only the internal HMAC/method-call value to the explicit ASCII sentinel `"-"`. C# requires exactly that sentinel for eligibility and a 64-character digest for resource proof. The child already uses the same `"-"` binding when its optional environment value is absent. The direct environment test now passes the explicit sentinel so it isolates the environment boundary. V2 success tests inspect and project the retained observation before asserting the host exit code, preserving actionable failure evidence.

This failure is PowerShell/C# interop and test isolation, not a model failure.

The isolated environment case passed after this correction, but the actual v2 case still stopped before retaining a terminal. Its first test version removed the private failure journal during unconditional fixture cleanup, leaving only the public `needs-reconciliation` projection. That is a separate harness evidence-retention defect. Before another v2 attempt, the test was changed to stop owned processes but preserve the failed private journal and include its failure stage/code in the bounded diagnostic. No inference from the incomplete projection is accepted as root cause.

## Failure 5 — PowerShell startup normalization

The first evidence-preserving v2 retry stopped at `initialization / m1-supervisor-host-environment`. A separate one-process probe using the exact proposed host map showed that Windows PowerShell 5.1 appends `.CPL` to `PATHEXT` during startup. The detached Node host saw the supplied pre-start value, while the PowerShell wrapper saw the normalized value. The contract incorrectly required those two different runtime layers to expose identical text.

Correction: the supervisor host environment and wrapper now pin the actual PowerShell host value `.COM;.EXE;.BAT;.CMD;.CPL`. The separately constructed child replacement environment remains `.COM;.EXE;.BAT;.CMD`; it does not inherit or depend on PowerShell's startup normalization. The preserved failed journal remains evidence and is not counted as a model result.

This failure is an omitted actual-host preflight and environment-layer conflation, not a model failure.

## Failure 6 — reserved PowerShell `$input` variable

After host normalization was corrected, the next evidence-preserving v2 attempt stopped at `admission / m1-supervisor-admission-framing`. A raw 32-byte stdin probe against the pinned Windows PowerShell executable succeeded when the stream was stored in an ordinary variable. The same probe using `$input` read zero bytes. `$input` is PowerShell's automatic pipeline enumerator and Microsoft advises that automatic variables are maintained by PowerShell rather than used as ordinary storage:

- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_automatic_variables?view=powershell-5.1

Correction: the raw console stream is stored only in `$admissionInput`. The protocol remains exactly 32 bytes plus EOF between host and wrapper, followed by the independently constructed 64-byte authenticated child capability. The failed journal remains preserved and no child/model result was recorded.

This failure is a PowerShell host-language integration defect, not a model failure.

## Failure 7 — culture-dependent filename ordering

After the stdin correction, the preserved v2 attempt stopped at `writer / m1-supervisor-existing-operation`. Inspection showed only the four expected entries. The mismatch came from converting a `Sort-Object` result into one exact string: Windows PowerShell 5.1 sorts `host.json` before the hyphenated support-directory names, unlike the newer shell used during static checking.

Correction: the security boundary now compares count plus bidirectional case-exact membership. Filename order and host collation no longer affect admission. The other sorted comparisons operate on fixed alphanumeric object-property names; the filename set was the punctuation-bearing, host-dependent shape.

This failure is a PowerShell-version collation and contract-representation defect, not a model failure.

## Failure 8 — sorted-string object-key validation

The next v2 attempt executed and stopped its child cleanly, retained a terminal, wrote the admission capability, observed exit zero, and proved process/tree absence. It remained `unknown` because acknowledgement keys were compared through another culture-sorted joined string. The frozen expected string did not match Windows PowerShell 5.1 ordering.

Root cause: exact-set validation was represented as ordering. The same unsafe pattern existed for request, admission, entrypoint, manifest, pin, manifest-member, and acknowledgement objects.

Correction: one `ExactKeys` helper now enforces count plus bidirectional case-exact membership for every object-key contract in the wrapper. No object admission depends on property order or host collation. The retained terminal contained no raw stdout and was not promoted to success.

This failure is a shared contract-validation defect, not a model failure.

## Mandatory sequence from this point

1. Confirm the target-system/runtime matrix and repository contract before implementation.
2. Run the smallest actual compiler/API preflight before any dependent test collection.
3. Perform static review and syntax parsing.
4. Run only the exact previously failed case.
5. On any failure, stop, preserve the evidence, perform shape-wide RCA, and correct analogous paths before one new attempt.
6. Run the focused suite once only after the exact case is green.
7. Independently review the result and commit the finite milestone.
8. Keep the model campaign paused until the full non-model prerequisite sequence is green.

No failed infrastructure attempt may be counted against a model.

## Corrected milestone verification

The corrected source passes Node syntax checks, Windows PowerShell 5.1 parsing, and an exact Windows PowerShell 5.1 `Add-Type` compile. To avoid repeating already-green work, the lifecycle collection was resumed in finite name-filtered segments from each stop rather than rerun wholesale. All 21 distinct cases are green across the final post-correction segments, including a final v1 success after the shared `ExactKeys` change and these v2 boundaries:

- eligibility capability and replacement environment;
- resource-proof capability bound to its eligibility seal;
- manifest above the former 1 MiB ceiling;
- missing/extra/decoy package and environment rejection;
- ignored, truncated, or exfiltrated capability cannot authorize or publish raw output;
- detached-controller loss still ends the owned tree at deadline;
- observer throw/stall never executes the suspended child.

The four preserved failure journals record compiler-follow-on stages `host-environment`, `admission-framing`, `existing-operation`, and terminal acknowledgement `unknown`. Their nine recorded process identities were checked after the final tests; none remained live. The journals are evidence only and do not authorize replay.
