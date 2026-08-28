# Pinned Qdrant test portability: local result

Criteria were committed first in `47ed217`. Only the test invocation and its negative
regression changed; the package builder, binary contract and service code are unchanged.

The existing native packaging test now forwards an explicit absolute `M1_QDRANT_BINARY`
to the builder's already-supported third argument. Omen's existing location is still the
default. A new test supplies an invalid binary and requires the specific
`m1-qdrant-binary-drift` rejection before any package directory exists.

Local Omen Node v22.22.0 results:

- Default-location invocation: seven tests passed, no skips, including the actual package
  and fifteen native PowerShell guard assertions.
- Explicit pinned-location invocation: seven tests passed, no skips. The invalid-binary
  test additionally matched the exact artifact-rejection error.
- `git diff --check`: pass.

These results do not repair or replace the earlier Control full-suite result. That run
had 1,241 passes and eighteen failures out of 1,259 tests, zero skips. All six actual
PostgreSQL/filesystem/MXC scenarios passed in its compact runtime, including the five
that could not start from Omen's default checkout/profile-temp envelope. One other test
failed on the Omen-only binary path; seventeen failed on exact historical source hashes
after archive line-ending conversion. A separate strict-byte packaging correction is
required; no historical hash or verification rule may be loosened.

The retained Control log is
`artifacts/runs/m1-task-native-d756040b06cb433c8610ffdaffa06508/full-regression-r4.log`,
SHA-256 `1f3b3374640dff499fa69c9dfae1bf403685fbd9b7c501fe6c58a38b658eb40c`.
Its owned database, Qdrant and native runtime were cleaned up; source and evidence remain.
Actual packaged Node is v22.22.0, hash
`bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb`.

Next is the complete Control regression on the corrected exact archive, explicitly setting
the test binary to its staged pinned Qdrant. No model request, production configuration,
service activation or protected-store operation occurred in this correction.
