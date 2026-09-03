# M1-S2B actual Git witness failure RCA — 2026-09-03

Status: actual Git acceptance stopped on its first operation. This is an actual-system witness/method
failure under investigation, not a Git result failure and not a model failure. No successor Git verb,
network probe, browser, model or production route ran.

## Exact stopped attempt

- Sealed source: `2b774224ac6cc515eb2784c7562ea57d724bcec2`.
- Prerequisite actual Windows proof: passed all 19/19 DPAPI/path/file/cleanup checks with
  `productionChanged:false` and `modelCalled:false`.
- Command: `node gate7f/function-first/omen-local/actual-git-proof.mjs` on Omen.
- Result: exit 1, schema `runaai-m1-omen-git-error/v1`, code `omen-git-source-changed`, stage
  `contained-git-status`, no child exit/stderr fields and `privateValuesIncluded:false`.
- The runner returned its normal bounded error after `finally`, establishing disposable-root cleanup. It
  did not run log, diffstat, branches, remotes, show, hostile cases, process audit, timeout or network arms.

## What is and is not known

The recursive Node `fs.watch` witness saw at least one repository notification before the first contained
result could be released. It records no event category or durable before/after state in its error, and the
actual runner did not reach its post-operation tree digest. Therefore the retained result cannot determine
whether a name/content/attribute changed, MXC temporarily changed access control, or another actor touched
the disposable repository. The stop is correct; treating the notification as either harmless or a real
mutation without evidence would not be correct.

There is a specific evidence-backed hypothesis. The same repository's prior actual R15 diagnosis recorded
MXC AppContainer/DACL setup and cleanup as `Security`-only `FileSystemWatcher` events, with zero file-name,
directory-name, size, last-write or attribute events and unchanged durable bytes/sets/security state. The
current MXC policy also declares `allowDaclMutation:true`. Node `fs.watch` cannot classify the Windows
notify filter, so it may conflate that expected reversible containment transition with source mutation.
That prior result guides the diagnostic but does not prove this failure.

## Bounded diagnostic design

Before any correction or acceptance retry, run one separately reviewed, disposable, no-model diagnostic:

1. Use the exact sealed native helper, Git, MXC executor, policy template and system Git pins.
2. Create one synthetic repository and the same first `status` operation; do not run other verbs or probes.
3. Start independent recursive Windows `FileSystemWatcher` instances with separate notify filters for
   names, last-write/size, attributes/creation time and security. Retain aggregate counts and error counts
   only—no paths or source text.
4. Hash the complete repository file/directory set and file bytes before and after. Capture canonical
   owner/group/DACL state before and after. Require exact cleanup and zero survivors.
5. Retain the observer outcome, exact contained-process exit class, aggregate event categories and durable
   equality booleans. No notification is suppressed in the diagnostic.

Disposition is prospective: security-only events plus exact durable byte/set/security equality identify a
false-positive witness boundary and permit a narrowly classified watcher design with independent durable
postchecks. Any name/content/attribute event, durable drift, watcher error, process anomaly or cleanup issue
requires a different RCA and remains stopped. The diagnostic source must pass static checks, independent
P0/P1 review and a source commit before its one run. No blind retry is permitted.

## Diagnostic implementation checkpoint

The bounded diagnostic is implemented but has not run. `diagnose-git-witness.mjs` creates only an owned
Windows-temp repository, verifies the production release pins before fixture creation, invokes exactly one
contained `status`, records the observer code and contained lifecycle, compares complete repository-set and
byte digests, and guarantees guarded cleanup. `Classify-RunaRepositoryEvents.ps1` uses four independent
recursive watchers and the previously reviewed bounded quiescence helper to retain aggregate category/error
counts plus canonical owner/group/DACL equality only. Its public records contain no paths, names, source text
or security descriptors. Static source assertions, Node syntax and parsing in the pinned Windows PowerShell
host pass. These are preflight results only. Independent exact-byte review and a source commit remain required
before the one diagnostic run; Git acceptance and all successors remain paused.

The first independent review stopped those prospective bytes at P0=0/P1=4 before execution. Watcher errors
were counted but not fatal; abnormal monitor/watcher cleanup did not prove post-kill terminal exit; process
audit accepted a missing root and zero descendants; and the normalized MXC policy-template pin was checked
only during the later observer operation rather than before fixture creation. The correction makes a nonzero
watcher-error count fatal, requires the pinned MXC root plus at least one pinned Git descendant and zero
survivors, performs bounded post-kill close waits before cleanup, and verifies the normalized policy-template
digest before creating the disposable root. These revised bytes remain non-executable pending focused
preflight and independent re-review. The focused source/parser/observer/native suite then passed 17/17,
roadmap verification passed 15/15 and fresh exact-byte re-review returned GO with P0=0/P1=0. The source
must now be committed before exactly one diagnostic execution; acceptance remains paused.
