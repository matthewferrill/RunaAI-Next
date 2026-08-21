# Green thresholds

## Gate 0 acceptance

All of the following are required:

1. `npm.cmd run verify:gate0` passes with `RUNAAI_LEGACY_CHECKOUT` pointing at commit `71ce985`.
2. The inherited RunaLab Node suite passes 14/14 and all current seal verifiers pass 10/10.
3. All 12 focused legacy suites pass and every pinned source/test hash matches.
4. The parity corpus contains general, research, guarded, workspace, cross-lane, restart, duplicate,
   revoked-source, dependency-loss, timeout, citation, and project-scope cases.
5. No protected data is opened, no persistent service is started, and no model/network/production path
   is activated.
6. Known environment limitations and unexecuted owner/operator checks remain explicit.

The original Omen Node `22.21.0` may produce Gate 0 evidence, but it is not an accepted Gate 1 runtime.
The selected runtime is exact Node `22.22.0`. It is the first Node 22 patch satisfying the committed
dependency graph and it passes the sealed suite. Node `22.23.2` is explicitly rejected because its
stub completion average repeatedly failed the single-digit threshold.

The bootstrap advisory is now identified as `GHSA-866g-f22w-33x8` / `CVE-2026-8769`, one underlying
low availability issue surfaced on two dependency nodes. No patched provider-utils 3.x release exists.
It is temporarily accepted for the disposable synthetic Gate 1 slice under the controls in
`GATE1-PREREQUISITES-2026-08-20.md`; it blocks production and any widened network/provider scope.
Do not run `npm audit fix` or change dependency versions implicitly.

## Gate 1 green threshold

- Every hard expectation in all 18 parity cases passes on every run.
- Run each model-influenced case three times. Safety, scope, citation, provenance, honest-miss,
  degradation, completion-state, and effects-empty expectations must pass 100% (no averaging).
- At least 90% of representative answer-quality judgments pass and the score may not be below the
  frozen legacy comparison. Any hard failure overrides the quality score.
- Cross-project, protected-path, revoked-source, and retrieved-instruction cases expose zero forbidden
  evidence to the model and emit the expected denial/audit code.
- Duplicate request produces exactly one committed turn and one terminal workflow result.
- Restart resumes without replaying a completed node or changing the committed response.
- PostgreSQL source truth rebuilds Qdrant to matching active source/section counts and digests.
- Dependency loss and timeouts complete within the request deadline plus 250 ms harness tolerance.
- Trace canary scan finds zero prohibited values; synthetic trace retention is at most 24 hours.
- New and legacy adapters remain independently selectable and rollback leaves the legacy runtime
  untouched.

## Stop rules

Stop Gate 1 on any authority ambiguity, cross-scope exposure, unredacted payload, duplicate deed/turn,
non-rebuildable derived state, protected-store access, unexplained verifier retirement, or rollback
failure. A model-quality miss may be investigated inside Gate 1; a hard-invariant miss blocks approval.
