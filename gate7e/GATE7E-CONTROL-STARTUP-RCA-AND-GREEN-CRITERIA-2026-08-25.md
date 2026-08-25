# Gate 7E Control startup RCA and corrective green criteria

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
as activation evidence. No host-preparation command has been run and no production release has changed.

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
- Existing no-network, no-child-process, no-worker, no-stdin, UI-denied, deadline, memory, stack, and output
  limits remain unchanged.
- Unit/adversarial tests prove the exact config, exclusive file lifecycle, cleanup on success and failure,
  and absence of source content from the command line and receipt.
- The complete repository suite remains green.
- Control must pass the real compact-runtime MXC/Node/QuickJS smoke test after separately authorized official
  host preparation and before any successor release is built or activated.

## Host-preparation decision gate

The next host action is not inferred from this document. It requires separate authorization because
`wxc-host-prep prepare-system-drive` performs a persistent host-wide DACL change at `C:\`. Microsoft states
that it adds two non-inheriting, minimum-rights metadata ACEs, grants no directory listing, file data read,
or write access, is idempotent, and has the tuple-precise inverse `unprepare-system-drive`.

After that decision, the sequence is: apply the exact official preparation, rerun the disposable real
smoke test, require the complete suite to pass on Control, then request the existing rollback-protected
successor activation and customer Run test. A failed smoke test stops before release construction.

## Primary evidence

- [Microsoft MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [Microsoft MXC environment/startup issue 483](https://github.com/microsoft/mxc/issues/483)
- [Microsoft MXC policy schema](https://github.com/microsoft/mxc/blob/main/docs/schema.md)
- `gate7e/run-mxc-environment-diagnostic.mjs`

