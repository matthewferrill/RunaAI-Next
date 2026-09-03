# M1-S2B1 isomorphic-git package review - 2026-09-03

## Status

Prospective package record complete; source commit and independent review are required before installation.

No package was installed in the repository. Registry metadata, the exact tarball and an isolated dependency-only
lockfile were inspected in a disposable temporary directory. No endpoint other than the public npm registry and
official public GitHub release pages was used. No Control/browser operation or model invocation occurred.

## Candidate and provenance

- Package: `isomorphic-git@1.41.0`, MIT, Node `>=14.17`.
- Official release: `v1.41.0`, dated 2026-08-08, source commit `4492cf9`; GitHub reports the commit signature verified.
- Registry tarball: `https://registry.npmjs.org/isomorphic-git/-/isomorphic-git-1.41.0.tgz`.
- Published and independently computed SHA-512 match:
  `YADpOKD/pLemtcyZ9jssNXnPVhfDObGl/BAKMtvmU17svgNzOKTT6AHX68DzFHpie5hAZHRtutC0Cka3lYdmBA==`.
- Published and independently computed SHA-1 match: `e35f4c3373191a99907eb1f13066e88fc1e57a4a`.
- Tarball size is 1,205,055 bytes. It contains 36 regular files totaling 4,891,940 unpacked bytes.
- Canonical unpacked-manifest SHA-256 is
  `12cae54e881d4db9fe8e7f307135c0524bc62e08eb0478761f74957e82f64db8`.
- Exact machine-readable record:
  `server-workspace/m1-s2b1-isomorphic-git-release-manifest.json`.
- Canonical release-manifest SHA-256:
  `b10102e79b9ffbd10c92efe411ec0f33c5faf98ed81cdf95fec9743eb30cbd92`.

Release `1.38.7` is the upstream NTFS Alternate Data Streams fix. Candidate `1.41.0` is later than that floor and its
official release adds HTTP `fetchOptions`; Runa does not expose those options to a participant or model.

## Dependency closure and advisory observation

The package declares 11 direct dependencies. An isolated npm 10.9.4 lock-only resolution on Node 22.22.0 produced
55 exact production packages, all from `registry.npmjs.org`, with no package marked as having an install script.
The full path/version/integrity/resolved-url/script tuple set is bound by closure SHA-256
`b1f68762fd0c3ed16f3a57fd8683168bf856609683526e18a027036d057f8820`; its package ids are retained in the manifest.
The isolated lockfile SHA-256 is `52c8b6910bf5d50718c0a5998751eaae898bc4df28b8adaa4f05b7b50e77f579`.

`npm audit --package-lock-only` reported zero info, low, moderate, high or critical advisories on 2026-09-03. This is
a time-bound registry observation, not a permanent safety guarantee. Installation must reproduce the exact package
version, registry integrity and reviewed closure; drift stops the gate and triggers package re-review.

## Runtime entry-point decision

Only the ESM `isomorphic-git/index.js` entry point is admitted. It receives the Runa-authenticated bounded Git broker
transport and held filesystem implementation explicitly. The package's `http/node` and `http/web` adapters, CLI,
CJS/UMD builds, managers and models entry points are denied by the release/module allowlist. The package CLI and Node
HTTP adapter exist in the tarball but are not runtime-authorized. The AppContainer also has no network permission,
native Git binary, credential helper, shell, hook or external protocol path.

The main ESM entry imports only the reviewed JavaScript library dependencies and Node cryptography; it does not import
the package's Node HTTP adapter. This separation is necessary but not sufficient: implementation review must prove the
release allowlist and custom transport are the only reachable paths.

## Gate result

The package is suitable to submit for independent package-review GO. This document does not authorize installation by
itself and provides no implementation or actual-system acceptance credit. Package-record checks pass 3/3 and roadmap
checks pass 15/15 with a clean diff.
