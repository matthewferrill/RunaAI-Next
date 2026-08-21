# Gate 6B release composition

Gate 6B is the first complete selected-core application and the isolated Control shadow candidate.
It does not carry production authority and it does not import protected data or enroll an owner.

## Local proof

```powershell
npm run test:gate6b
npm run verify:gate6b:integration
npm test
```

The focused suite covers the application/HTTP boundary, artifact/configuration verification,
Keycloak and OpenFGA clients, shadow denial, and secret non-disclosure. The disposable integration
proof exercises explicit workspace reads, direct approved knowledge, encrypted continuity, the one
selected governed setting, retry, restart, rollback, and PostgreSQL loss.

## Exact release

`build-release.mjs` accepts only a clean exact commit, a strict reference-only release
configuration, a new output directory, and a new release-manifest path. It copies the tracked
application, installed dependency tree, and exact Node 22.22.0 executable. `artifact-files.json`
covers every shipped file other than itself. The production entry point re-hashes that complete
tree before opening secret references or accepting a request.

## Control shadow

The scripts under `control/` create only `C:\AI\RunaAI-Next-Candidate`, candidate-only ports,
candidate-only scheduled tasks, and one private-firewall rule for the Caddy TLS entry point.
PostgreSQL, Keycloak, OpenFGA, and the application remain loopback-only. Caddy is the sole private
listener and also supplies a loopback-only proxy to the already-established private model host.
Generated secrets remain outside the repository and immutable release under an ACL limited to
SYSTEM and the installing owner.

Initialization and registration are separate so the exact public service/model configuration can
be used to build the release before it starts. Existing candidate tasks cause registration to fail
closed rather than being overwritten.

Gate 6B stops before protected-store access, any RunaAI import, owner enrollment, legacy-write
freeze, traffic change, or target promotion. Those remain Gate 6C/6D decisions.
