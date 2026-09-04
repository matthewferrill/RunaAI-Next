# M1-S2 `playwright-core` package preflight — 2026-09-04

## Status and boundary

This is an execution-free package preflight record. It identifies `playwright-core@1.62.1` as a **conditional
candidate**, not an accepted dependency and not an authorization to edit package files, resolve a lock, contact a
registry, install or import a package, download or launch a browser, run a test/service, or claim browser acceptance.

The actual-browser harness design remains stopped before implementation. This package gate is independent from the
later Edge compatibility, Control topology, OIDC, PostgreSQL, Artifact, Agent, native composition, model and human
acceptance gates. A fresh independent exact-byte review of this record is required before one bounded package-only
attempt.

## Retained independent review STOP

The fresh independent review returned `STOP P0=0/P1=3` before any package, registry, worktree, dependency, import,
test, browser, service, commit or push operation. It found that the npm configuration/source layers were not
exhaustively inventoried, the zero-dependency rule omitted peer metadata and both bundle aliases, and the proposed
lock-only command would run in the populated primary worktree without an immutable dependency inventory.

The corrections below retain that STOP and choose only the fresh isolated-worktree route. They remain execution-free
and require a different exact-byte review. The alternative of inventorying and proving the populated primary
`node_modules` before and after lock generation is not selected or authorized.

A second independent review retained `STOP P0=0/P1=1` before any package, registry, worktree, dependency, import,
test, browser, service, commit or push operation. It found that the claimed complete transport projection omitted npm
`ca`/`noproxy` and inherited Node trust/routing environment inputs, and that literal rejection of default-null
`cert`/`key` fields would falsely stop a clean npm configuration. The corrections below retain that STOP, accept only
an exact unconfigured sanitized transport/trust state, and distinguish forbidden key presence from harmless default
null/empty sensitive fields. They do not authorize execution and require another fresh exact-byte review.

## Conditional upstream candidate

The candidate tuple obtained by prior read-only research is:

- npm name/version: `playwright-core@1.62.1`;
- official source: `https://github.com/microsoft/playwright`, package directory `packages/playwright-core`;
- official release: `https://github.com/microsoft/playwright/releases/tag/v1.62.1`;
- license: Apache-2.0;
- upstream supported Node floor: Node.js 20 or newer;
- repository Node pin: `22.22.0` in both `package.json` and `.node-version`;
- prospective observed npm pin: `10.9.4`;
- observed npm launcher: `C:\Program Files\nodejs\npm.ps1`, byte length `1700`, SHA-256
  `E8AEDC8C76D6CB9423B70EDE071228F7CB1644094C114B8721AE6D121100D4FE`;
- observed npm CLI entry point: `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`, byte length `56`, SHA-256
  `3CE7CBA6F5128DD5F54C98B6A5036B0F850496878CC2E21044B675FE3C594E3E`;
- repository lock format: npm `lockfileVersion: 3`;
- declared npm runtime dependencies expected: zero;
- expected registry tarball:
  `https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz`; and
- expected registry integrity:
  `sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==`.

The URL and integrity above are corroborated expectations only. The integrity is deliberately **not authoritative**
until the one authorized npm-generated lock attempt and a fresh authoritative `registry.npmjs.org` metadata read
independently produce the exact same tuple. The package's official tag commit must also be resolved and frozen at that
gate; this document does not invent it. A version, source, license, Node support, dependency count, tarball or integrity
mismatch is a STOP. No mirror, alternate registry, cached ambient package or manually written lock record may replace
that proof.

The npm values are an observed prospective pin, not an assumption that the machine installation will remain stable.
Immediately before the package attempt, the same identity must re-resolve the launcher and CLI entry point, reproduce
the exact version/path/length/hash tuple above, and prove that the launcher resolves that CLI entry point. Drift is a
STOP for a newly reviewed npm pin; the operator may not silently use another npm to obtain a convenient lock diff.

## Same-owner and fresh isolated-worktree gate

The current primary checkout has a populated ordinary `node_modules` directory. It is excluded from package-lock
generation and cannot be used as a dependency source, baseline or implicit module-resolution root for this gate. The
selected future locations are exactly:

- worktree: `D:\RunaPackageWorktrees\runaai-next-playwright-core-1.62.1-a1`;
- branch: `codex/m1-playwright-core-package` created from the exact future commit containing the independently accepted
  preflight records; and
- attempt artifacts: `D:\RunaPackageArtifacts\m1-s2-playwright-core-1.62.1-a1`.

Those paths and both parents must be absent, including no dangling link, before one reviewed same-owner creation
method. Only `ItemNotFoundException` from `Get-Item -Force -ErrorAction Stop` proves absence. Creation must yield
ordinary local directories, not symlinks, Junctions or any other reparse points. The worktree readback must bind its
canonical path, Git common-directory identity, branch, exact source commit, `package.json`/lock hashes and filesystem
owner SID. The artifact root readback must bind its canonical path and the same owner SID.

The accepted operator identity, the Git worktree-creation process, every npm/Node child, both new roots and all files
created by the attempt must have one exact Windows account SID. The observed current documentation process is
`CodexSandboxOffline`, while the intended repository/npm operator is `matth`; that identity mismatch is an explicit
STOP. This current process must not create the worktree or execute the package gate merely because it can write under
the primary repository. A future same-owner review must record the exact non-secret account name and SID without
credentials and prove them again immediately before and after each mutating command.

Before npm runs, `<worktree>\node_modules` and every ancestor resolution candidate—
`D:\RunaPackageWorktrees\node_modules` and `D:\node_modules`—must be absent with the same dangling-link-safe test.
`NODE_PATH` must be absent, Node global search paths must contain no `playwright`, `playwright-core` or
`@playwright/test`, and a bounded resolution probe from the exact worktree must prove those three packages unresolved.
Any directory, file, reparse point, global/ancestor resolution or ownership mismatch is a STOP and is neither removed
nor repaired. This clean worktree remains the sole lock-generation route.

## Exact visible npm configuration inventory

Before any registry access, a separately reviewed bounded preflight must freeze one complete sanitized npm
configuration ledger. For the exact npm CLI pin above, it inventories these layers in precedence order without
printing file contents:

1. CLI flags from the one command below;
2. every case-insensitive `npm_config_*` process-environment key in a bounded private set, plus presence-only checks for
   `NODE_AUTH_TOKEN`, `NPM_TOKEN`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`,
   `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `OPENSSL_CONF`, `NODE_TLS_REJECT_UNAUTHORIZED` and
   `NODE_OPTIONS`. Environment-name matching is case-insensitive. A registry-scoped npm configuration name can itself
   contain a private hostname, so raw `npm_config_*` names never leave the private buffer: the retained ledger contains
   only the fixed safe name for an expected attempt-owned override or a generic rejection code and count;
3. project `<worktree>\.npmrc`;
4. defensive ancestor candidates `D:\RunaPackageWorktrees\.npmrc` and `D:\.npmrc`, recorded even if npm classifies
   them non-effective;
5. the effective user layer
   `D:\RunaPackageArtifacts\m1-s2-playwright-core-1.62.1-a1\empty-user.npmrc` selected by
   `npm_config_userconfig` and the shadowed default user path `C:\Users\matth\.npmrc`;
6. the effective global layer
   `D:\RunaPackageArtifacts\m1-s2-playwright-core-1.62.1-a1\empty-global.npmrc` selected by
   `npm_config_globalconfig` and the npm pin's shadowed default global path
   `C:\Users\matth\AppData\Roaming\npm\etc\npmrc`; and
7. the builtin layer resolved from the pinned CLI as
   `C:\Program Files\nodejs\node_modules\npm\npmrc`.

For each exact path, the ledger records `scope`, `effective`, canonical path, and either `state:"absent"` plus the
authenticated parent identity, or `state:"present"` plus ordinary-file/no-reparse status, owner SID, byte length,
SHA-256 and ACL digest. The two effective override files must be newly created zero-byte ordinary files owned by the
same operator. The pinned CLI must report those exact effective user/global paths. An additional or unaccounted
project, ancestor, user, global, builtin, environment or CLI layer is a STOP.

Before attempt-owned overrides are injected, every inherited routing/trust/credential environment name listed above
must be absent. Every inherited `npm_config_*` member must also be absent; no inherited registry, proxy, no-proxy, CA,
client-certificate, client-key, local-address, user/global-config, cache, offline or TLS value is accepted. After the
exact overrides below are injected, the only accepted `npm_config_*` names and values are the fixed attempt-owned
`ignore_scripts=true`, cache path, user-config path, global-config path, `prefer_online=true` and `offline=false` tuple.
CLI `--registry`, `--prefer-online` and `--ignore-scripts` remain the higher-precedence exact values. Both the inherited
and effective environment projections retain only fixed safe names, absence/configured booleans and the authenticated
attempt-owned path identities; they retain no environment value, proxy/no-proxy host, CA/certificate byte or private
hostname.

The preflight captures npm's complete configuration JSON only into a bounded private child buffer, never the terminal,
log or evidence stream. A reviewed redactor rejects and zeroes that buffer on: any registry-scoped `_auth`,
`_authToken`, token, username or password key even if its value is empty; any non-null/non-empty `_auth`, token,
username, password, client `cert`, client `key`, `certfile` or `keyfile` value; URL userinfo; an unbounded/unknown value;
or an unexpected field. The ordinary top-level npm `cert` and `key` fields are permitted only when their effective
values are exactly null or the empty string; their values are never retained. The same null/empty-only rule applies to
any non-scoped default auth field that the pinned npm exposes. This prevents the pinned npm's harmless default-null
fields from being misclassified while still rejecting every usable credential. Credential environment variables must
be absent. Any credential-bearing stdout/stderr, diagnostic, retained buffer or evidence output is an immediate STOP
and cleanup boundary.

The private parser also evaluates every routing/trust field that the pinned npm exposes. Effective `proxy`,
`https-proxy`, `noproxy`/flattened `noProxy`, inline `ca`, `cafile`, client certificate/key fields and `local-address`
must be null, empty or the exact npm unconfigured representation; `strict-ssl` must be the boolean `true`. Inline CA
strings/arrays, CA files, proxy/no-proxy values, local-address selection and client TLS material are rejected without
retaining their contents, paths or hosts. All inherited Node/OpenSSL trust variables listed above are likewise rejected
by presence, so their values never enter npm, the terminal or retained evidence.

Only this exact aggregate transport projection may leave the redactor:

```json
{
  "registry": "https://registry.npmjs.org/",
  "cache": "<exact fresh attempt cache identity>",
  "offline": false,
  "preferOnline": true,
  "ignoreScripts": true,
  "proxy": null,
  "httpsProxy": null,
  "noProxy": { "configured": false },
  "ca": { "configured": false },
  "cafile": { "configured": false },
  "clientCertificate": { "configured": false },
  "clientKey": { "configured": false },
  "localAddress": { "configured": false },
  "inheritedCredentialEnvironment": {
    "NODE_AUTH_TOKEN": false,
    "NPM_TOKEN": false
  },
  "inheritedTrustEnvironment": {
    "HTTP_PROXY": false,
    "HTTPS_PROXY": false,
    "ALL_PROXY": false,
    "NO_PROXY": false,
    "NODE_EXTRA_CA_CERTS": false,
    "SSL_CERT_FILE": false,
    "SSL_CERT_DIR": false,
    "OPENSSL_CONF": false,
    "NODE_TLS_REJECT_UNAUTHORIZED": false,
    "NODE_OPTIONS": false
  },
  "strictSsl": true
}
```

The registry URL must have no userinfo, query or fragment. The cache projection binds the exact owned cache canonical
path, owner SID and filesystem identity without listing cache contents. A configured proxy is rejected without
retaining its URL; configured no-proxy, inline CA, CA-file, client-certificate/key and local-address values are rejected
without retaining bytes, paths or hosts; and all boolean fields must be exact booleans. Because the only accepted CA-file
state is unconfigured, no CA path/hash is retained. The ledger recomputes effective precedence from privately parsed,
sanitized layer records and requires it to equal npm's sanitized effective projection. A registry/cache/offline/
prefer-online/ignore-scripts/proxy/https-proxy/no-proxy/ca/cafile/client-TLS/local-address/strict-ssl or inherited-trust-
environment mismatch, unreadable layer or configuration output that cannot be safely projected stops before the lock
command.

## Exact package-only mutation

The authorized package gate starts from the fresh clean reviewed worktree above at an exact source commit with the current
`package.json` and `package-lock.json` hashes frozen. It uses the repository-pinned Node `22.22.0` and the exact observed
npm `10.9.4` launcher/CLI tuple above under the same operating-system identity that owns the worktree. Before the
command, it proves there is no `playwright`, `playwright-core` or `@playwright/test` resolution from the worktree or an
ambient parent/global path.

The attempt creates only fresh empty `npm-cache`, `empty-user.npmrc` and `empty-global.npmrc` children in the separate
attempt-artifact root. An occupied, linked, reparse-point or unresolvable root is a STOP and is neither reused nor
cleaned speculatively. The exact layer inventory and aggregate transport projection above must be green immediately
before registry access. An alternate registry, proxy, custom CA/config, pre-existing cache entry or configuration
drift is a source-provenance STOP.

The only lock-generation command is the following PowerShell sequence, from the repository root:

```powershell
$packageGateWorktree = 'D:\RunaPackageWorktrees\runaai-next-playwright-core-1.62.1-a1'
$packageGateRoot = 'D:\RunaPackageArtifacts\m1-s2-playwright-core-1.62.1-a1'
$packageGateCache = Join-Path $packageGateRoot 'npm-cache'
$packageGateUserConfig = Join-Path $packageGateRoot 'empty-user.npmrc'
$packageGateGlobalConfig = Join-Path $packageGateRoot 'empty-global.npmrc'
$packageGateExistingRoot = try {
  Get-Item -Force -LiteralPath $packageGateRoot -ErrorAction Stop
} catch [System.Management.Automation.ItemNotFoundException] {
  $null
}
if ($null -ne $packageGateExistingRoot) { throw 'playwright-core-package-gate-root-occupied' }
$null = New-Item -ItemType Directory -Path $packageGateRoot
$null = New-Item -ItemType Directory -Path $packageGateCache
$null = New-Item -ItemType File -Path $packageGateUserConfig
$null = New-Item -ItemType File -Path $packageGateGlobalConfig
$env:npm_config_ignore_scripts = 'true'
$env:npm_config_cache = $packageGateCache
$env:npm_config_userconfig = $packageGateUserConfig
$env:npm_config_globalconfig = $packageGateGlobalConfig
$env:npm_config_prefer_online = 'true'
$env:npm_config_offline = 'false'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
$env:PLAYWRIGHT_SKIP_BROWSER_GC = '1'
Set-Location -LiteralPath $packageGateWorktree
& 'C:\Program Files\nodejs\npm.ps1' install --package-lock-only --save-dev --save-exact --ignore-scripts --no-audit --no-fund --prefer-online --registry=https://registry.npmjs.org/ playwright-core@1.62.1
```

This is one bounded networked package-metadata operation. `--package-lock-only` must not create or populate
`node_modules`; scripts are disabled both by environment and CLI; the Playwright download guards are defense in depth.
The attempt stops if npm invokes any lifecycle script, downloads any browser, creates an unexpected cache/artifact in
the worktree, or changes anything other than the two package files.

The exact expected two-file semantic diff is:

1. `package.json` gains only a `devDependencies` entry `"playwright-core": "1.62.1"`; its scripts, existing dependencies,
   engine, package type and all other fields remain byte-semantically unchanged.
2. `package-lock.json` remains lockfile v3; the root package gains the same exact dev dependency and exactly one new
   `node_modules/playwright-core` record. That record must contain version `1.62.1`, `dev: true`, the expected official
   registry URL and integrity, and the verified license/engine metadata. It must omit every coupling key:
   `dependencies`, `optionalDependencies`, `peerDependencies`, `peerDependenciesMeta`, `bundledDependencies` and
   `bundleDependencies`; empty lock keys are not accepted. It must also omit install-script and browser-payload
   metadata. No `playwright`, `@playwright/test`, browser package or transitive node may appear.

An npm formatting rewrite outside those semantics, a third changed path, a transitive package, a package script or a
browser artifact is a STOP. The failed two-file diff is retained for RCA and is not silently regenerated.

## Registry, diff and advisory review

After a successful lock-only command, and before any package provisioning or import, the same package gate performs one
forced-online authoritative full-manifest read through the same exact npm launcher and fresh attempt-owned cache:

```powershell
$packageManifestJson = & 'C:\Program Files\nodejs\npm.ps1' view playwright-core@1.62.1 --json --prefer-online --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) { throw 'playwright-core-authoritative-manifest-query-failed' }
$packageManifest = $packageManifestJson | ConvertFrom-Json -AsHashtable
```

The response is subject to a frozen byte ceiling, must be complete valid JSON from the successful command, and must be a
single strict manifest object. Required own fields are `name`, `version`, `license`, `engines`, `repository`, `gitHead`
and `dist`; `dist` must contain the exact `tarball` and `integrity`. Those values must match this record and the
npm-generated lock exactly. Each manifest member of the object-shaped coupling set—`dependencies`,
`optionalDependencies`, `peerDependencies` and `peerDependenciesMeta`—is accepted only when absent or a strict plain
JSON object with exactly zero members. Each member of the array-shaped coupling set—`bundledDependencies` and
`bundleDependencies`—is accepted only when absent or an exact JSON array of length zero. A wrong type, non-empty
object or array, extra member, malformed/truncated JSON, missing required field or command failure is a STOP. The
npm-generated `node_modules/playwright-core` lock record must omit all six corresponding coupling keys rather than
serializing empty variants. Absence of all optional coupling properties is the expected zero-dependency
representation and is not misclassified as an incomplete response.

Source identity is proven rather than inferred from matching names. The manifest repository must normalize exactly to
`https://github.com/microsoft/playwright`; `gitHead` must be one exact commit. A forced-online read of the official
GitHub `refs/tags/v1.62.1`, following an annotated tag only through its exact target, must resolve to that same commit,
and the corresponding GitHub commit must report a valid verified upstream signature. The npm `dist.attestations` and
`dist.signatures` fields are retained as bounded public metadata when present. Presence alone is not verification: an
attestation subject must bind the exact registry tarball digest and source repository/commit through a separately
reviewed Sigstore verifier, and registry signatures must pass the reviewed npm signature verifier after scripts-disabled
provisioning and before any import. If neither evidence is published, a verifier is unavailable, a signature or
attestation cannot be validated, or `gitHead` differs from the peeled official tag, the package remains STOPPED for an
explicit source-provenance decision. No metadata field may be relabeled as cryptographic proof.

Only the bounded public projection of the manifest, tag/commit verification and provenance result is retained. A
registry redirect/mirror, non-fresh cache answer, integrity mismatch or source-binding failure stops the gate without
retry. The fresh cache is evidence transport, not evidence: after all registry/advisory operations, its exact owned root
is reauthenticated and removed with bounded cleanup; absence of that root is required, while the public projection and
hashes remain in the evidence record.

The required two-file review then proves:

- before/after `git status --short` contains exactly `package.json` and `package-lock.json` as new package-gate changes;
- `git diff --name-only` names exactly those two paths;
- `git diff --check -- package.json package-lock.json` is clean;
- the exact semantic assertions above hold in the current bytes;
- the pre-existing scripts and runtime-dependency map are unchanged; and
- there is still no `node_modules`, Playwright browser cache, browser binary or unexpected generated file in the
  worktree.

The package gate also performs exactly one advisory query without automatic remediation:

```powershell
& 'C:\Program Files\nodejs\npm.ps1' audit --package-lock-only --audit-level=high --json --prefer-online --registry=https://registry.npmjs.org/
```

The full public advisory IDs, affected range, severity and fix availability are reviewed; no token, credential, cache
path or private environment value is retained. Any advisory affecting `playwright-core@1.62.1`, any high/critical
finding introduced by the two-file diff, an incomplete report or a query failure is a STOP for explicit dependency
review. `npm audit fix`, force resolution and an unreviewed version substitution are forbidden.

Only after independent review returns `GO P0=0/P1=0` may the exact two-file change be committed as a package-only
milestone. Provisioning remains a separate lock-bound, scripts-disabled operation. It must verify the installed package
name/version/license/file inventory against the committed lock, run the reviewed registry-signature/attestation checks,
and still produce no bundled browser or lifecycle script. The package inventory freezes the path and SHA-256 of every
case-insensitive `LICENSE*`, `NOTICE*` and `ThirdPartyNotices*` file, requires at least one Apache-2.0 license file whose
bytes match the exact accepted upstream source commit, and reconciles any upstream/tarball NOTICE-file difference as a
STOP. The full `playwright` and `@playwright/test` packages remain prohibited. No package import or compatibility run is
authorized until this installed-source and license/provenance gate is independently accepted.

## Explicit Edge 152 compatibility STOP

`playwright-core@1.62.1` is associated with its tested Playwright browser generation, including Chromium 151. The
actual-browser plan requires a separately installed Microsoft Edge executable observed in the current orientation as
major version 152. Playwright permits a custom Chromium-family `executablePath`, but that is not a compatibility
guarantee for an unbundled, newer Edge major. Therefore package suitability is explicitly **STOPPED before Edge 152
compatibility** even if the package/lock gate passes.

No package review may reinterpret source compatibility, a successful import or Playwright's custom-executable option as
proof that Edge 152 works. Edge path/version/length/hash/signature must be freshly pinned at the later gate, and any
Edge version drift requires a newly reviewed compatibility target.

## One later bounded non-model compatibility preflight

After the package-only milestone, installed-package verification, fresh Edge 152 pin and independent acceptance of the
Windows Job Object containment wrapper, implement and review exactly one new fixture:
`gate7f/function-first/actual-browser-edge-compatibility.test.mjs`. Its only command is:

```powershell
node --test --test-concurrency=1 gate7f/function-first/actual-browser-edge-compatibility.test.mjs
```

The fixture has one finite case and a frozen timeout. It uses the reviewed wrapper to create the exact pinned Edge 152
root suspended, assign it to an attempt-owned kill-on-close Job before resume, and connect `playwright-core@1.62.1` to
that contained custom executable with a fresh owned profile. Against one constant non-secret `data:` document only, it
proves browser/version identity, one page/context, locator discovery, visible text, one user-style click and its
deterministic DOM result, then closes Playwright, the browser and the Job. It requires zero contained processes and
removal of the exact owned profile in the failure and success paths.

The compatibility fixture must not contact Control, Keycloak, OpenFGA, PostgreSQL, Qdrant, a model, the public network
or any selected service. It must not use an HTTP server, browser download, reused profile, cookie/state injection,
request interception, screenshot, trace, HAR, video or console/request/response capture. It proves only that the exact
package can drive the exact pinned custom Edge binary through the APIs needed by the future harness; it grants no Runa
UI, OIDC, Artifact, Agent or release acceptance.

Any launch, connection, protocol, locator, action, cleanup, Job containment or identity failure is classified as an
exact package-to-custom-Edge compatibility failure. It is **not** Runa application failure and **not** model failure.
Stop after the first failed attempt, preserve public aggregate diagnostics, complete bounded owned-process/profile
cleanup, write an RCA, correct/freeze the fixture or candidate selection, and obtain fresh independent review before
one affected-scope resume. Blind retry, switching Edge/package versions during the attempt and replaying an already
passed package operation are forbidden.

## Present conclusion

`playwright-core@1.62.1` is a plausible zero-runtime-dependency, Apache-2.0, Node-20-or-newer conditional package
candidate for this Node 22.22.0 lock-v3 repository. Its expected registry identity is recorded but unaccepted. The
package files remain unchanged, the package is not installed, and Edge 152 compatibility remains an explicit later
STOP. The next action is a fresh independent read-only review of this record, not package execution.
