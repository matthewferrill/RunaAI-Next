# M1-S2B Omen Git implementation review stop — 2026-09-02

Status: actual Omen Git retry stopped before execution. The first independent implementation review returned
P0=0/P1=7; its corrections passed 13 focused checks. A second exact-byte review returned P0=0/P1=8,
a third review returned P0=0/P1=5, and the fourth and fifth reviews each returned P0=0/P1=2. Both
fifth-review corrections are implemented and pass 13 focused checks. Fresh exact-byte independent review
returned GO with P0=0/P1=0; a source commit remains mandatory before
actual execution. This is a pre-execution
implementation stop, not an actual-system or model failure. No browser, model, listener, production or
Git acceptance run occurred on the rejected bytes.

## Findings

1. The required credential-free sanitized-remotes view was absent from the implementation and proof.
2. The retained Windows volume/file identity was not revalidated immediately before Git execution, so a
   replaced root or `.git` target was not closed by the stored-root contract.
3. repository-config parsing accepted valid hostile forms including implicit booleans and section headers
   with trailing comments, and replacement/partial-clone/submodule surfaces were incompletely denied.
4. NUL decoding did not enforce operation-specific record shapes, counts, commit ids or path fields.
5. The manifest described controls but did not bind the generated MXC policy bytes or compare the native
   script, Git executable and MXC executor with independently frozen release pins.
6. timeout/output termination could wait indefinitely for `close`, and raw Git stderr could cross the
   code/count/digest-only diagnostics boundary.
7. The prospective actual runner hashed the repository only once around the aggregate run and omitted the
   hostile repository, exact-policy, process-tree/no-survivor and zero-network-connection cases required
   by the frozen criteria.

## Correction design

- Add the sanitized-remotes operation and reduce every URL locally to a credential-free host/repository
  label before a response is authored.
- Revalidate the retained root handle identity before every read/Git plan and again before releasing a Git
  result; pass the expected identity into the native handle read.
- Replace permissive Git-config parsing with a strict supported-subset parser that fails on unknown or
  ambiguous syntax and rejects includes, implicit promisor state, partial clone, executable extensions,
  alternates, grafts, replacement refs and submodule traversal.
- Parse each Git verb with an exact NUL-record schema and bounded counts; malformed hashes, timestamps,
  status records, paths or numstat records fail closed.
- Add a committed Omen release-pin document for the native helper, PowerShell host, Git executable and MXC
  executor; force the SDK to use the pinned executor and bind the exact generated config bytes into each
  operation receipt.
- Use one bounded terminal state machine: normal close, process error, timeout, output overflow or a short
  post-kill terminal deadline. Expose only error codes, byte counts and SHA-256 digests.
- Rebuild the actual proof around per-verb before/after repository hashes, all six views, hostile owned
  repositories, exact intercepted MXC policy comparison, a long-operation process-tree audit, no-survivor
  checks and loopback/LAN/public-probe zero-connection counters.

The next actual retry is prohibited until all seven corrections are deterministic-green, independently
reviewed at P0=0/P1=0, committed and source-sealed. A failed corrected actual retry stops the slice for a
new RCA; it is not repeated or broadened.

## Implemented correction checkpoint

- Sanitized remotes are parsed locally from the strict repository-config subset; credentials are removed
  and no Git process or remote-capable verb is used.
- CurrentUser DPAPI records are revalidated against the live root volume/file identity before every file
  read and Git plan. Native reads compare the expected identity on the same open root handle, and Git
  results are withheld until post-operation identity revalidation succeeds.
- Native metadata inspection refuses non-directory/reparse `.git`, common-dir indirection, alternates,
  HTTP alternates, grafts and loose replacement refs. Strict config parsing rejects ambiguous syntax,
  includes, implicit promisor state, partial clone and executable extensions; packed replacement refs are
  refused and submodule traversal is disabled on relevant verbs.
- Status, log, branches, numstat and show output now have operation-specific NUL schemas, strict UTF-8,
  bounded arity/counts, full hashes, numeric timestamps/modes and relative path checks.
- `release-pins.json` binds the native helper, PowerShell host, Git executable, MXC executor and process
  monitor to independently recorded SHA-256 values. The SDK receives the exact pinned executor path; the
  generated MXC config bytes and exact command are digest-bound in each result.
- Native and Git child lifecycles now have bounded post-kill terminal deadlines. Nonzero execution exposes
  only an error code, exit/count fields and SHA-256—not raw stderr.
- The prospective actual runner now covers all six views; byte equality around every verb and hostile
  denial; linked/reparse/replaced roots; alternates/grafts/replacement/partial-clone/helper/promisor cases;
  malformed/control output; exact captured policy comparison; pinned-file comparison; a long process-tree
  audit with no survivors; and zero loopback/LAN/public-probe connections.

## Second exact-byte review stop

The second review found eight additional P1 gaps before execution:

1. Root and `.git` could still be swapped between pathname validation and MXC spawn.
2. Legacy dotted-section promisor syntax and repository-selected system/global clean filters remained open.
3. Remote names could contain TAB and diffstat admitted 501 paths despite the 500-path ceiling.
4. Git/PowerShell could execute before their pins were checked, policy comparison was self-derived, and the
   pinned PowerShell line endings were not checkout-stable.
5. Case/8.3 aliases and empty files were mishandled, and file-entry replacement lacked actual coverage.
6. Process evidence trusted names rather than executable paths/hashes and lacked a timeout/no-survivor arm.
7. Network evidence lacked an attempted connection and a fresh post-restart process.
8. Criteria said ten seconds while implementation used 15; the shared native proof was stale after byte
   changes; and two hostile `.git` cases did not hash the complete disposable repository.

The implemented prospective correction holds root and `.git` against delete/rename throughout each operation;
revalidates under that guard; rejects dotted legacy sections, control-character remote names and repository
attributes; pins Git's system config/attributes plus a normalized MXC policy template; verifies every
executable before first use; fixes the 500-path and empty-file boundaries; rejects case/8.3 aliases; records
process paths/hashes for success and timeout; performs connection-attempt containment from fresh first-run
and post-restart child processes; and hashes the complete fixture around every hostile denial. The native
file proof is explicitly stale until one affected-scope rerun. No actual execution is permitted until these
exact bytes receive independent P0=0/P1=0 and are source-committed.

## Final independent review

Fresh exact-byte review of the fifth correction returned GO with P0=0/P1=0. The reviewer confirmed that
the enabled quiet/drain barrier, bounded close, final state checks, late deterministic regression and late
actual mutate-and-restore arm close both prior proof-integrity findings without introducing another P0/P1.
The reviewed source may be committed. No actual Windows, MXC, Git/network, browser, model or production
acceptance ran during any review pass.

## Third exact-byte review stop

The third review found five remaining P1 false-green or race risks: status did not enforce its 500-path
ceiling; the file-entry race accepted replacement bytes; network proof treated any nonzero startup/config
failure as containment; security-relevant repository content could mutate after validation; and failed
native-guard startup killed without waiting for bounded terminal exit.

The correction now counts status paths, binds every native read to a separately opened source-file identity,
and requires the actual race to reject a replaced file id. Network proof requires the exact accepted MXC
tier/warnings, Git exit 128, empty stdout and a strict Git transport-error signature proving the connection
verb ran. A recursive Windows mutation witness begins before the final manifest and suppresses all results
if any repository content changes through completion, closing mutate-and-restore gaps alongside the held
root/`.git` names. Failed guard readiness now kills and waits up to two seconds for terminal close, failing
with a distinct terminal-exit code if cleanup cannot be proved.

## Fourth exact-byte review stop

The fourth review found two remaining P1 proof-integrity gaps before execution. First, the recursive
repository watcher could be closed and the operation returned without waiting for its final queued events,
allowing a late mutation notification to produce a false green. Second, the prospective actual proof did
not exercise a mutate-and-restore event while the watcher was armed, so the intended protection against a
byte-neutral repository race remained unproved.

The correction now closes the watcher through one bounded close/drain state machine, waits for the close
event, and performs a final mutation-error and mutation-count check before any successful result is
returned. The actual proof now includes a dedicated mutate-and-restore arm that changes a tracked file
after contained Git starts, restores the original bytes, confirms the whole-repository digest is unchanged,
and nevertheless requires `omen-git-source-changed`. Syntax checks and all 13 focused deterministic checks
pass. No actual execution is permitted until these exact bytes receive independent P0=0/P1=0 and are
source-committed.

## Fifth exact-byte review stop

The fifth review determined that waiting for `FSWatcher`'s `close` event still proved only watcher shutdown,
not delivery of queued Windows filesystem notifications. It also found that the actual mutate-and-restore
arm changed the repository immediately after the MXC spawn call, before proving that the contained child
had run, so it did not exercise the late-event/shutdown race. These were two P1 proof-integrity findings;
actual execution remained stopped.

The correction keeps the watcher enabled through a 250-millisecond quiet/drain interval, advances the
event loop once, captures its final state, then performs bounded watcher closure and a second final state
check before returning success. The deterministic regression and prospective actual proof now schedule
the mutate-and-restore 50 milliseconds after a successful child close, inside that enabled drain interval.
The actual proof additionally requires the child-completion flag, mutation-completion flag, no mutation
callback error, an unchanged whole-repository digest, and the expected `omen-git-source-changed` denial.
Syntax checks and all 13 focused deterministic checks pass. No actual execution is permitted until these
exact bytes receive independent P0=0/P1=0 and are source-committed.
