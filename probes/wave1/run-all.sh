#!/usr/bin/env bash
# Wave 1, in order: cheap deterministic scenarios first, the hours-long memory matrix last, so a
# failure late in the run never costs the early verdicts. Each step continues past a failing
# predecessor deliberately — one broken scenario must not withhold the others' evidence.
set -u
cd "$(dirname "$0")/../.."
echo "=== Wave 1 start $(date -Is) on $(hostname), node $(node -v)"
node probes/wave1/verify-seal-wave1.mjs || { echo "SEAL BROKEN — refusing to run Wave 1"; exit 1; }
for step in w1a-snapshot w1b-crash w1ef-tools w1cd-memory; do
  echo "--- $step $(date -Is)"
  node "probes/wave1/$step.mjs" || echo "!!! $step exited $? — recorded, continuing"
done
echo "=== Wave 1 end $(date -Is)"
