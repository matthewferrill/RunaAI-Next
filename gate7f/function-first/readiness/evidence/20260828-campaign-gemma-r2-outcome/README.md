# Gemma M1 campaign round 2: hardware shutdown evidence

This is an aborted functional campaign, not a model qualification or a completed M1 result.
The application operator requested termination after reporting 24 of 120 attempts and a
capture-containment failure. Attempt counts and that diagnosis belong to the separate campaign
evidence, not this hardware receipt. The remaining attempts were not run in this lease.

The exact Gemma and Nomic instances were unloaded after the application operator stopped calls.
The lease ended at 18:31:05.038Z with `completion: abort`, no hardware failure, cleanup verified,
and power restored. Its independent supervisor exited 0 at 18:31:05.317Z. Evidence was exported
before unregistering the completed task; all Home files were retained.

The final read-only observation at 18:34:12.028Z found zero loaded instances, both original
260 W limits, temperatures 42/37 C, no owned task registrations, and unchanged existing
1234/8412 listeners. No successor model was started.

`summary.json` binds the retained raw bytes. It records 163 telemetry samples, peak 65 C,
maximum sampling gap 5,700 ms, minimum host free memory 103,072,690,176 bytes, and minimum
per-GPU free memory 12,733 MiB. The hardware envelope remained within the sealed limits.

The repeatable local retention command was:

```text
node gate7f/function-first/readiness/retain-aborted-campaign.mjs 20260828-campaign-gemma-r2 cbe257317db2ef0943958f1606730575a14ab3e27b8eb94cc6b38418e4f87a58
```

It verifies exact lease/source pins and final cleanup before creating a new immutable outcome
directory. It has no network, model, power, task, or production operations.
