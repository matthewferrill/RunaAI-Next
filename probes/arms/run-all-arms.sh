#!/bin/bash
# Runs every model comparison arm unattended, one at a time.
#
# Each arm is a separate base. base-drift is captured before and after, and an arm whose runtime state
# moved mid-run is marked NOT DECIDABLE rather than reported -- just-in-time loading returns a model at
# whatever context it chooses, so an arm that silently changed context is not a measurement.
#
# Sequential on purpose: two models loaded at once contend for 45 GB of VRAM and for the endpoint, and
# the same one-thing-at-a-time discipline applies here as to every wave.
set -u
cd "$(dirname "$0")/../.." || exit 1
LOG=probes/results/arms-run.log
: > "$LOG"
say() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

# Arm D is included only if its weights actually landed. A missing arm is an absence, never a pass.
LLAMA='C:\lm-studio-models\lmstudio-community\Llama-3.3-70B-Instruct-GGUF\Llama-3.3-70B-Instruct-Q4_K_M.gguf'
llama_size() { ssh -o BatchMode=yes runa-home "for %I in (\"$LLAMA\") do @echo %~zI" 2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$' | tail -1; }

ARMS=("A:qwen3-coder-30b-a3b-instruct" "B:qwen3.6-27b" "C:qwen/qwen3-4b")

for entry in "${ARMS[@]}"; do
  arm="${entry%%:*}"; model="${entry#*:}"
  say "=== arm $arm ($model) ==="

  say "  base-drift before"
  LMSTUDIO_MODEL="$model" node probes/base-drift.mjs "arm-$arm-before" >>"$LOG" 2>&1

  say "  running 55 scenarios"
  ARM="$arm" ARM_MODEL="$model" node probes/arms/run-arm.mjs >>"$LOG" 2>&1
  rc=$?
  say "  arm $arm exited $rc"

  say "  base-drift after"
  LMSTUDIO_MODEL="$model" node probes/base-drift.mjs "arm-$arm-after" >>"$LOG" 2>&1

  node probes/check-drift.mjs "arm-$arm-before" "arm-$arm-after" >>"$LOG" 2>&1
  drift=$?
  case $drift in
    0) say "  drift: BASE UNCHANGED" ;;
    2) say "  drift: PARTIALLY VERIFIED" ;;
    *) say "  drift: BASE MOVED — arm $arm is NOT DECIDABLE" ;;
  esac
  echo "{\"arm\":\"$arm\",\"model\":\"$model\",\"exit\":$rc,\"driftExit\":$drift}" >> probes/results/arms-status.jsonl
done

# Arm D last, and only if the download completed.
sz=$(llama_size); sz=${sz:-0}
if [ "$sz" -ge 42000000000 ]; then
  say "=== arm D (Llama-3.3-70B) — weights present at $sz bytes ==="
  LMSTUDIO_MODEL="llama-3.3-70b-instruct" node probes/base-drift.mjs "arm-D-before" >>"$LOG" 2>&1
  ARM=D ARM_MODEL="llama-3.3-70b-instruct" node probes/arms/run-arm.mjs >>"$LOG" 2>&1
  rc=$?
  LMSTUDIO_MODEL="llama-3.3-70b-instruct" node probes/base-drift.mjs "arm-D-after" >>"$LOG" 2>&1
  node probes/check-drift.mjs "arm-D-before" "arm-D-after" >>"$LOG" 2>&1
  echo "{\"arm\":\"D\",\"model\":\"llama-3.3-70b-instruct\",\"exit\":$rc,\"driftExit\":$?}" >> probes/results/arms-status.jsonl
  say "  arm D exited $rc"
else
  say "=== arm D NOT PROBED — weights incomplete at $sz bytes of ~42.5e9 ==="
  echo '{"arm":"D","status":"NOT PROBED","reason":"weights did not finish downloading"}' >> probes/results/arms-status.jsonl
fi

say "=== all arms finished ==="
