# M1-S2B1 Native Gate 3 preflight stop and systemic RCA

Date: 2026-09-04  
Starting source commit: `6fb28fd58060127f7d7324afc9f63f67a6794f64`  
Disposition: `STOP` before compilation or Native execution  
Production changed: no  
PostgreSQL changed: no  
Network/public-Git journey run: no  
Model invoked: no

## What stopped

The mandatory independent five-part Gate 3 source/build review and a read-only Omen/Control toolchain preflight proved
that Gate 3 was not yet an executable gate. The PostgreSQL boundary completed in Gate 2, but the next Native boundary
still contained deliberately fail-closed interfaces rather than the real watchdog, Windows host and worker bootstrap.
The signed Native manifest, reproducible compiler definition and owner-bound candidate operator also did not yet
exist. No compile or test command was attempted after that finding.

This is a Gate 3 readiness failure, not an LLM, browser, PostgreSQL or production failure. It receives no product or
model failure count.

## Root causes across the full issue shape

### 1. Phase accounting described a gate name, not its executable prerequisites

The living status correctly said Gate 3 remained, but the phrase `source/build/hash Gate 3` concealed several distinct
construction stages: cross-language protocol freeze, real Native implementation, reproducible build definition,
release-root closure, Native-first bootstrap verification, sealing, Control staging and five-part review. Because the
status did not expose those prerequisites separately, progress could appear closer to execution than the source was.

**Systemic correction:** Gate 3 is now a finite state machine. A stage cannot be called ready merely because the prior
gate passed. Every stage below requires its own artifact and objective exit check:

1. `G3-A contract`: one accepted, versioned JS/native/watchdog IPC and ownership-transfer contract.
2. `G3-B native build`: real Windows implementation plus deterministic, pinned, self-contained build definition.
3. `G3-C worker wiring`: real coordinator/materializer/watchdog clients with fixed entrypoints and no ambient fallback.
4. `G3-D release integrity`: Native-first bootstrap, exact role/path membership, owner signer and acyclic manifests.
5. `G3-E independent review`: exact five-part `GO P0=0/P1=0` on source, toolchain, outputs and hashes.
6. `G3-F Control proof`: one bounded build and deterministic local Native proof; no public Git.

Only `G3-F` green may make the separate actual Candidate gate eligible.

### 2. The Native interfaces had no real implementation or common transport

All operational methods in `windows-native-host.mjs` and `control-watchdog-host.mjs` failed closed. The C# file was a
contract stub, both child entrypoints stopped as unavailable, and no candidate source connected those children to the
existing broker/TLS/materializer implementation. More importantly, the design did not freeze the transport by which
the Native host authenticates the external watchdog, duplicates handles into its exact process, commits a whole
ownership batch and receives the signed/HMAC receipt before JavaScript sees setup success. Implementing either side in
isolation would have created another integration defect.

**Systemic correction:** freeze one cross-language protocol before transport code. It must define the fixed named-pipe
roles, framing and byte ceilings; process/PID/image authentication; nonce, operation, batch and sequence binding;
ordered resource descriptors; all-or-nothing `DuplicateHandle` ownership; receipt MAC/signature fields; replay
denial; close/EOF behavior; and failure cleanup. The Native and JS lanes may implement only that accepted contract.

### 3. The actual build hosts had no usable compiler authority

Read-only checks found no .NET SDK, `csc`, `MSBuild` or `cl` on either Omen's or Control's ordinary PATH. Control's
ambient Node is `v24.19.0`, while the existing immutable application release correctly contains its own Node
`v22.22.0`. Relying on PATH would therefore make both compilation and runtime selection host-dependent.

**Systemic correction:** use no global compiler installation and no ambient runtime. The build input is the official
portable .NET 10.0.400 Windows x64 SDK ZIP, pinned by its publisher SHA-512
`9b8b88590e4da131bfd0da7aa089d0fc04d5418d5f8607ec13d55dc5a17b4399afd54d496c12657fa05c6c6546dc5eab930f26ac6c50f2d3a7712c0fb378c366`.
`global.json` must disable roll-forward. The product output must be deterministic, self-contained `win-x64`; neither
Control nor an end user installs an SDK to run it. The release uses its sealed `runtime/node.exe`, never PATH Node.

### 4. Integrity verification occurred after executable JavaScript could load

`gate6b/server.mjs` statically imported the full composition before Native verification. Bare package imports could be
resolved and executed before the existing JavaScript manifest check. The Native manifest verifier also treated any
signed list as sufficient, rooted membership at `server-workspace` instead of the application release root, and used
path reads without the required stable native identities and ACL/reparse checks.

**Systemic correction:** the signed Native executable is the first release process. It opens and authenticates the
fixed release root and every path segment, validates ACL/reparse/alias/file identities through stable handles, verifies
the exact Node executable/version and fixed entrypoint, and enforces a compile-time role/path membership set before it
starts Node with a minimal environment. JavaScript then independently verifies the same final manifest digest and
members. Missing, extra, duplicate-identity, wrong-role, wrong-size, wrong-hash or wrong-root members all stop.

### 5. Sealing, activation and installed-release topology were incomplete as one family

The Native manifest was an unsealed template with no members or signature. No owner signer, build/seal command or
outer-release ordering existed. Production release configuration had no default-off Native workspace activation
contract and did not pass a protected parent, fixed source definition or branded Native configuration into M1.
Correcting only the JSON template would still leave an unverifiable and unreachable feature.

**Systemic correction:** build and activation are corrected together. The sealed dependency graph is acyclic:

`source/runtime/native members -> offline-signed Native manifest -> artifact-files manifest -> external release manifest`.

The Native manifest excludes itself, contains an exact sorted role/path/size/SHA-256 inventory, and is signed by the
distinct offline owner release-manifest key, never the runtime watchdog authority key. Its final raw-byte SHA-256 is
`workerReleaseSha256`. The release schema adds one
strict, default-off owner configuration; no request, repository, database row, model output or environment variable
can select a path, endpoint, executable, key or hash.

### 6. Runtime watchdog signing-key custody was not constructible from the public pin alone

The transport design requires the watchdog to sign its server handshake and durable operation-authority evidence, but
the release contract named only a public key. Treating that key as the offline Native release-manifest signer would
collapse two trust domains. Assuming a persistent non-exportable Ed25519 key in Windows CNG without proving the exact
Control OS/provider/API behavior would substitute a design claim for an implementable security boundary.

**Systemic correction:** keep distinct offline Ed25519 release-manifest and runtime watchdog signing keys, identities
and versions. No private key is a release member, JavaScript-readable file, argument, environment value or ordinary
configuration field. Current Microsoft documentation lists persisted ECDSA P-256 but not Ed25519 for Microsoft
Software KSP, so the runtime candidate is machine-persisted ECDSA P-256 under that exact provider. Before key-dependent
transport code, an actual-Control, disposable, separately reviewed capability probe must still prove persistence,
sign-only usage, denied private export, canonical public export/signature conversion, exact service/SYSTEM ACL,
process-reopen behavior and Node verification. Missing or ambiguous support is a Gate 3 architecture stop. It does not
silently use an exportable seed, DPAPI storage, another provider or key reuse. Provisioning, rotation, loss and offline
recovery require their own owner-authorized, fail-closed ceremony and retained compatibility design.
The actual-host probe pins service name `RunaAI-Next-Control-Watchdog`, principal
`NT SERVICE\RunaAI-Next-Control-Watchdog` and derived SID
`S-1-5-80-2359966601-960405813-89951059-4049279541-459939502`; Windows SCM/account readback must match before ACL use.

### 7. Whole-file source ordering was incorrectly used as runtime evidence

The first bounded activation/configuration check stopped after one passing case because a whole-file `indexOf` matched
the earlier `readSecretReference` helper definition rather than its production acquisition call. The application order
was correct; the test method produced a false negative. The complete issue family, replacement actual-product method,
quarantine inventory and affected-only resume rule are retained in
`M1-S2B1-NATIVE-GATE3-ACTIVATION-TEST-METHOD-RCA-2026-09-04.md`.
After independent `GO P0=0/P1=0`, the stable actual-product replacement passed its one affected case. No other case or
gate was replayed.

## Containment and resume rules

- Gate 3 and the actual Candidate gate are paused. Gate 1 and Gate 2 evidence remains valid and is not replayed.
- No unchanged-byte retry, broad suite run, public Git operation, browser journey or model run is permitted while any
  `G3-A` through `G3-E` prerequisite is open.
- Key-dependent watchdog transport remains paused until the distinct runtime signing-key backend is proven on actual
  Control hardware and frozen. The algorithm-neutral bootstrap and identity work may continue under review.
- Builders use isolated worktrees and disjoint file ownership. A separate reviewer checks cross-lane contracts while
  implementation proceeds and again reviews the exact committed union.
- A compiler, runtime, protocol, root, ACL, identity, signature, manifest or hash mismatch stops before execution.
- A compile or deterministic Native failure retains its exact stage and produces an RCA covering every analogous path.
  After correction, only the affected stage resumes on new reviewed bytes.
- An evidence-witness failure never reruns a successful build or Native operation; only the corrected witness resumes
  if all source, tool and output hashes remain exact.
- Candidate, transient and cleanup paths remain identity-bound. Uncertain ownership retains the object and blocks
  progression; cleanup never broadens to a directory or process census.

## Evidence retained by this stop

- Three independent read-only audits of commit `6fb28fd` returned STOP with no P0 and multiple P1 implementation,
  build, release-integrity and operator gaps.
- Omen and `RUNA-CONTROL\\codex-audit` toolchain checks were read-only. Control identity and host were verified; no
  owner profile, protected value or production route was accessed.
- Control's installed release Node `v22.22.0` was observed at its fixed release path; ambient Node `v24.19.0` is not
  accepted as a substitute.
- The official portable SDK archive was downloaded to ignored local tool storage, publisher SHA-512 verified before
  extraction, and its `dotnet.exe --version` returned `10.0.400`. It is not installed globally and is not production
  evidence.

Authoritative runtime-key API references reviewed on 2026-09-04:

- Microsoft, CNG Key Storage Providers:
  `https://learn.microsoft.com/en-us/windows/win32/seccertenroll/cng-key-storage-providers`
- Microsoft, `NCryptCreatePersistedKey`:
  `https://learn.microsoft.com/en-us/windows/win32/api/ncrypt/nf-ncrypt-ncryptcreatepersistedkey`
- Microsoft, `NCryptSetProperty`:
  `https://learn.microsoft.com/en-us/windows/win32/api/ncrypt/nf-ncrypt-ncryptsetproperty`
- Microsoft, Key Storage Property Identifiers:
  `https://learn.microsoft.com/en-us/windows/win32/seccng/key-storage-property-identifiers`

### Actual-Control service-identity readback operator stop

The first read-only service-SID/OS command stopped in the local PowerShell parser before `ssh` ran. Its command string
used backslashes to escape nested double quotes, but PowerShell does not use backslash as its quote escape; it therefore
parsed the remote `[ordered]` expression as a broken local array index. No remote command, key, service, Native process
or other Control operation occurred.

This is another command-construction family, not a Control or cryptography failure. The correction removes nested
remote PowerShell and interpolation entirely: run separate argument-simple read-only SSH invocations for `hostname`,
`whoami`, `cmd.exe /d /c ver` and `sc.exe showsid RunaAI-Next-Control-Watchdog`. Any future remote preflight with
structured PowerShell must use a reviewed encoded script file/hash rather than ad-hoc multi-layer quoting. Only these
four affected reads may resume after independent method review; the disposable key probe remains unexecuted.

Independent method review returned `GO P0=0/P1=0`. The four affected reads then completed on actual Control:
host and `RUNA-CONTROL\codex-audit` identity matched, Windows reported `10.0.26200.9168`, and `sc.exe showsid`
matched the frozen derived service SID. This proves only host/identity/build and deterministic service-name-to-SID
readback. It does not prove that the service exists, its configured account, any key ACL or the key backend. The
disposable key probe remains a separately reviewed, unexecuted gate.

## Next bounded action

Complete `G3-A` through `G3-D` in isolated implementation lanes, reconcile their committed union, and obtain the
independent exact-byte five-part review. Only then stage the pinned portable SDK and exact source archive on Control
for the single `G3-F` build/local-Native proof. Human testing is not yet required.
