# R4b full isolated Control regression

**Passed: 1,266/1,266 tests, zero failures, cancellations or skips.**

Application source: `9556ed01f9dbabe8c93eea309e482aad60bf809f`.
Source archive: `e10adce53387bcf31b639738e2d7ae26c2b5dd17e2914f1870ba0ef1949b31dc`.
Prospective R4b runtime seal: `416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.

Run on 2026-08-28 from 20:08:57.957Z to 20:12:15.548Z in the unique disposable
Control stage `m1-task-native-ed104b1f647343cca570352b63851a77`:

```text
node --test --test-concurrency=1 --test-reporter=spec
```

All tests were included. Serial execution avoids unrelated test-process
contention without changing the native 1,200ms QuickJS / 2,000ms process ceilings.
The real runtime was Node **v22.22.0**, QuickJS **0.32.0**, MXC **0.8.0** using
processcontainer/AppContainer DACL isolation. The explicit compact runtime,
copied Node and owned transient directory were supplied using the four existing
`M1_EXECUTOR_*` variables. `M1_TASK_PG_URL` targeted only the new loopback synthetic
database; `M1_QDRANT_BINARY` targeted the verified stage-local **Qdrant 1.19.0**.
Network denial, closed stdin, one-process cap and all other native limits stayed
unchanged. All six actual native-project integration tests passed.

Before testing, all four fresh campaign stages passed exact verification of
1,480 archive files, all fourteen historical sealed files, and the read-only
installed dependency artifact (30,036 total files, 29,161 dependency files).

The untouched raw log and result are retained under
`artifacts/runs/m1-task-native-ed104b1f647343cca570352b63851a77/` in the parent
checkout and `acceptance-evidence/` in that Control stage:

- `full-regression-r4b.log`: SHA-256 `d9aa0916a48d06646821ffa1d24de049b5314b11486323c847ab76a1e90fc248`.
- `full-regression-r4b.json`: SHA-256 `792c8c0ab8680ed4ee986523b3b2f938993c93b3d6836bae9f91392d242a7058`.
- `cleanup-regression-r4b.json` records independent read-only cleanup verification
  at 20:13:02.7014879Z: zero owned processes/listeners, all six owned runtime/data
  directories absent, production `\RunaAI-Next\M1-Qdrant` still disabled.

The Node, runner and Qdrant raw hashes were recorded before cleanup. The original
failed R4 artifacts remain untouched. No model inference or production change
was performed. This result permits the separate formal model-free controls to
proceed; it does not itself qualify models, UI journeys or deployment.
