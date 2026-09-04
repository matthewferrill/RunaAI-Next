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

`source/runtime/native members -> signed Native manifest -> artifact-files manifest -> external release manifest`.

The Native manifest excludes itself, contains an exact sorted role/path/size/SHA-256 inventory, and is signed by the
owner-protected watchdog release key. Its final raw-byte SHA-256 is `workerReleaseSha256`. The release schema adds one
strict, default-off owner configuration; no request, repository, database row, model output or environment variable
can select a path, endpoint, executable, key or hash.

## Containment and resume rules

- Gate 3 and the actual Candidate gate are paused. Gate 1 and Gate 2 evidence remains valid and is not replayed.
- No unchanged-byte retry, broad suite run, public Git operation, browser journey or model run is permitted while any
  `G3-A` through `G3-E` prerequisite is open.
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

## Next bounded action

Complete `G3-A` through `G3-D` in isolated implementation lanes, reconcile their committed union, and obtain the
independent exact-byte five-part review. Only then stage the pinned portable SDK and exact source archive on Control
for the single `G3-F` build/local-Native proof. Human testing is not yet required.
