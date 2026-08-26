# Gate 7E Control startup RCA and corrective green criteria

> Resolution, 2026-08-26: every corrective criterion in this document passed on Control. The active
> successor uses private transient source transport, restricted Win32k-compatible MXC policy, and exact
> target-only ancestor preparation. See
> `GATE7E-CONTROL-REPAIR-AND-ACTIVATION-RESULTS-2026-08-26.md`.

Date: 2026-08-25  
Base: `runa2/integration` at `f092d358a18f0ec0b6c2eaaeaf9a057b1d7f6d68`

## Scope

This is a corrective continuation of the accepted Gate 7E-0 / 7E-1 boundary. It does not add a code
capability, broaden ordinary-user authority, change production, or approve host preparation. It corrects
the transport used to move the exact user-selected source into the already approved disposable JavaScript
guest and records the remaining Control host prerequisite accurately.

## Reproduced Control findings

The exact merged source and pinned Node `22.22.0`, MXC `0.8.0`, and QuickJS Emscripten `0.32.0` packages
were exercised from Control's clean source checkout. The diagnostic used only a disposable copy under the
owner temp directory, emitted no source or environment values, removed its temporary tree, and did not
touch the active release.

Two independent startup blockers were reproduced:

1. Supplying any non-empty `process.env` array to the MXC ProcessContainer failed before the child began,
   with Win32 error `0x800700CB` (`environment option not found`). The same failure occurred with one
   harmless test variable and with the original source-and-digest pair. This is an MXC environment-channel
   compatibility defect, not a model, QuickJS, application-session, or source-content failure.
2. With the custom environment removed, MXC created the AppContainer but Node exited during DLL
   initialization with `0xC0000142` and no output. MXC's own read-only capability probe reported
   `prepare-system-drive-required`. Its official host-preparation documentation names `node.exe` among the
   programs that may fail during startup when the Tier 3 AppContainer cannot read minimal metadata from the
   system-drive root.

The earlier Control test therefore failed closed correctly, but it did not reach QuickJS and cannot serve
as activation evidence. A later separately authorized host-preparation attempt exposed the released MXC
drive-root propagation defect recorded in
`GATE7E-CONTROL-HOST-PREP-INCIDENT-2026-08-25.md`. No production release changed.

## Corrective design boundary

The custom environment channel is removed completely. The trusted parent will:

1. create one unique private temporary directory and one source file;
2. write the exact bounded source with exclusive creation;
3. pass only the generated source-file path and its SHA-256 digest as fixed command-line protocol fields;
4. grant the guest read-only access to that one file in both MXC and Node permissions;
5. retain no writable guest path and close stdin unchanged;
6. have the child read once, validate size and digest, then evaluate only inside the existing no-host-
   capability QuickJS context; and
7. remove the temporary source tree before returning any receipt, including on startup error, timeout, or
   output overflow.

The source itself is not placed in the process command line, execution receipt, diagnostic output, or
application log. The generated path and digest are non-authoritative transport fields. Model output still
cannot authorize execution or alter the envelope.

## Corrective green criteria

- The MXC config has no `process.env` field and does not inherit the host environment.
- The source file is created outside the immutable release, is unique per run, and is not a guest-writable
  path.
- The Node permission grant covers the compact runtime and exactly the transient source file, not the temp
  parent, repository, release tree, profile, or project.
- The child rejects a missing, empty, oversized, changed, or digest-mismatched source file.
- The parent attempts cleanup on every path. Cleanup failure suppresses output and returns a bounded
  fail-closed receipt rather than reporting execution success.
- Existing no-network, no-child-process, no-worker, no-stdin, deadline, memory, stack, and output limits
  remain unchanged. Control burn-in later proved that Node 22 exits with `0xC0000142` when MXC applies
  `DisallowWin32kSystemCalls`. The corrected outer policy enables Win32k startup compatibility while keeping
  MXC container UI-object isolation, clipboard denial, input-injection denial, desktop/system-control denial,
  system-settings denial, and IME denial. QuickJS still receives no GUI host object, so evaluated user source
  has no GUI capability.
- Unit/adversarial tests prove the exact config, exclusive file lifecycle, cleanup on success and failure,
  and absence of source content from the command line and receipt.
- The complete repository suite remains green.
- Control must pass the real compact-runtime MXC/Node/QuickJS smoke test after a separately reviewed,
  target-only host-preparation resolution and before any successor release is built or activated.

## Host-preparation incident and revised decision gate

The separately authorized released host-preparation command was attempted and stopped after it failed to
complete and left one of its two exact root ACEs. Microsoft issue 648 now explains the observed behavior:
the released prepare and unprepare paths can propagate ACL normalization into descendants and appear to
hang. Its target-only correction is still draft pull request 649. All temporary tasks, processes, and
scripts were removed; production remains unchanged; one non-inheriting metadata-only root ACE remains.

No released host-preparation or inverse command may be rerun. The next host action requires the explicit
choice documented in `GATE7E-CONTROL-HOST-PREP-INCIDENT-2026-08-25.md`: wait for a released upstream
target-only fix, build and independently review a repository-owned target-only operator, or defer Gate 7E.

## Primary evidence

- [Microsoft MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [Microsoft MXC environment/startup issue 483](https://github.com/microsoft/mxc/issues/483)
- [Microsoft MXC drive-root propagation issue 648](https://github.com/microsoft/mxc/issues/648)
- [Draft Microsoft MXC target-only fix 649](https://github.com/microsoft/mxc/pull/649)
- [Microsoft MXC policy schema](https://github.com/microsoft/mxc/blob/main/docs/schema.md)
- `gate7e/run-mxc-environment-diagnostic.mjs`
