# Wave 1 — how to run it, on Control, for record

Wave 1 measures the frozen base in `BASE-MANIFEST.json`. Running it anywhere else produces harness
validation, not Wave 1 results, and the preregistration says so.

Launch detached, as PROVING.md requires, so a session death does not take the run with it:

```bash
cd ~/Projects/runa-reference && git pull
setsid nohup bash probes/wave1/run-all.sh >> probes/results/wave1-log.txt 2>&1 &
tail -f probes/results/wave1-log.txt
```

`tail` can be interrupted freely; the run is detached.

## What runs, in order, and roughly how long

| step | needs the model? | cost |
| --- | --- | --- |
| W1-A snapshot integrity, 6 tamper variants | no | ~1 minute |
| W1-B crash boundaries, 5 × 5 = 25 runs | no | ~5 minutes |
| W1-E/F tool failure and timeout, 4 variants × 3 | yes | ~10 minutes, one variant may sit at the 120 s cap by design |
| W1-C/D memory matrix at tiered n | yes | **hours** — the depth-100 cells are ~100 model turns each, ×5 |

W1-C/D checkpoints every run to `probes/results/w1cd-partial.jsonl` and skips completed runs on
restart, so it can be stopped and relaunched with the same command without losing work.

## When it finishes

```bash
git add probes/results/w1a-outputs.json probes/results/w1b-outputs.json \
        probes/results/w1ef-outputs.json probes/results/w1cd-outputs.json \
        probes/results/wave1-log.txt
git -c user.name="RunaAI Claude Agent" -c user.email="claude-agent@runaai.local" \
    commit -m "Wave 1 raw results from the frozen base"
git push
```

Grading happens after, against the sealed corpus v2 labels and the sealed preregistration. The runner
never reads the labels; that separation is the point.

## If something goes wrong

An endpoint failure is an environment error, not a framework finding — the runners mark those
entries and the grader excludes them. If a step dies for any other reason, the log and the partial
checkpoint are the evidence; report them rather than re-running silently over them.
