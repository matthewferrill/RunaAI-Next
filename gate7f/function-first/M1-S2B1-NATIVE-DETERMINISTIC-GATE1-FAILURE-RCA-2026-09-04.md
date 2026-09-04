# M1-S2B1 Native deterministic gate 1 failure RCA

Date: 2026-09-04
Branch: `codex/m1-native-control-host`
Stopped commit: `39fd1845edfb9992229b1526e316faacb6c42e7d`
Scope: local deterministic source/tests only; no PostgreSQL server, Native process, Control operation, browser, network,
model, release, production or customer operation.

## Retained stopped result

The first independently authorized seven-file deterministic command ran once at exact clean commit `39fd184`. Node
reported 56 test records: 51 passed and 5 failed. The wrapper returned exit 1 and stopped the lane. Its authenticated
worktree-local dependency junction was removed in `finally`; the reviewed dependency source remained an ordinary
directory, both lockfiles still matched
`CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`, the Native `node_modules` path was absent,
HEAD remained `39fd184`, and the worktree was clean. No successor syntax, database, Native, browser, network or model
command ran.

## Root causes

### Product source defect

`gate7f/function-first/server-workspace/postgres.mjs` line 1771 had one extra closing parenthesis in the
`#recordCandidatePublished` authority guard. It was introduced at `b6725c2` and never parsed before preservation or
integration. Static ESM parsing therefore failed before evaluation, database connection or any effect. Because the
module is reached by static imports, the defect blocked three selected files at load: `composition.test.mjs`,
`native-candidate-wiring.test.mjs`, and `postgres-native-interface.test.mjs`. If released, it would prevent application
composition even with the Native candidate disabled.

### Harness defects

Three assertions were authored in the same `b6725c2` bundle against already-correct source shapes:

1. `control-worker-composition.test.mjs` omitted the closing `)` between `z.object({...})` and `.strict()` in its
   regex, so it rejected the exact strict input schema it intended to require.
2. `postgres-native-authority-source.test.mjs` expected the literal template token `${this.sqlSchema}` although
   `initialize()` deliberately binds `const s = this.sqlSchema` and all four tables use `${s}`.
3. `native-candidate-wiring.test.mjs` would reject the required one-time
   `let nativeCandidateResources = null;` ownership declaration. The parser failure prevented this latent test defect
   from executing. The correct invariant is one exact declaration and no later reset assignment.

The five reported failures were the three parser-blocked file records plus the first two executed assertion failures.
The third harness defect was found by the mandatory static failure review before a retry.

### Process defect

The bundle received semantic review but no pre-execution `node --check` pass. The later exact-tree gate review added
syntax checks after the seven tests, which was too late to prevent the parser defect from consuming the broader local
test attempt. Review also compared the test intent without mechanically reconciling its literal source-shape
assertions. This is a test-order and test-authorship failure, not a model, system-capacity or external-service failure.

## Correction and bounded resume

The correction is limited to one source token and the three defective assertions:

- remove the extra `)` from the publication guard;
- match the exact `z.object({...}).strict()` syntax;
- assert `const s = this.sqlSchema` and require `${s}.<table>`;
- require exactly one Native resource ownership declaration and reject any later reset assignment.

Before any dependency junction or test, parse all 19 Native/production-union JavaScript files with `node --check` and
stop on the first error. After independent exact-byte review and a source commit, resume only the affected checks:

- all 11 `composition.test.mjs` checks;
- all 7 `native-candidate-wiring.test.mjs` checks;
- all 3 `postgres-native-interface.test.mjs` checks;
- the one corrected control-worker source-shape check;
- the one corrected PostgreSQL schema-source check.

That is 23 affected checks. The 51 passed checks from the stopped attempt remain retained and are not replayed. The
same authenticated junction and link-only cleanup procedure applies to the affected resume. After cleanup, require the
Native dependency path absent, both lockfiles unchanged, `git diff --check` green, exact committed HEAD unchanged and
an empty worktree including untracked paths. Any failure stops again for a new RCA; it does not authorize a full-suite,
PostgreSQL, Native, browser, network or model retry.

## Corrected affected-only result

After the correction and its execution method received independent `GO P0=0/P1=0`, exact commit
`48dd9f916e97913deb862ba365b29c1bbff8fb02` passed all 19 syntax checks before any junction was created. The authenticated
temporary dependency junction then supported only the affected resume: 21/21 checks across the three parser-blocked
files, 1/1 corrected Control source-shape check, and 1/1 corrected PostgreSQL source-shape check. The result was 23/23.
The 51 green checks from the stopped attempt were retained and not replayed.

Cleanup removed the junction and verified both lockfiles unchanged at
`CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`, the dependency source remained an ordinary
directory, HEAD remained exactly `48dd9f916e97913deb862ba365b29c1bbff8fb02`, `git diff --check` passed, and the
worktree including untracked paths was empty. No PostgreSQL server, Native process, Control operation, browser, network
or model action ran. This closes deterministic gate 1 only; disposable PostgreSQL Native-authority validation remains
a separate independently reviewed gate.
