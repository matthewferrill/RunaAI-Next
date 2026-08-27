# Controlled-power rerun after a safety stop

The first acceptance-v1 Qwen arm completed all 117 quality requests on 2026-08-27,
then stopped on `gate7f1-gpu-boundary` before completing integration or starting the
soak. Its original package, run seal and raw capture are retained. This is not a
completed qualification or endurance pass. No Gemma acceptance-v1 arm started.

Last accepted readings were 84/82 C, with substantial GPU and host memory free.
Heat is the leading explanation, but the exact failing sample was discarded by
the original validation-before-recording code. Do not report an observed 85 C
sample or a verified physical cooling fault for that run.

The corrected capture retains an unsafe sample with its error before cleanup;
it does not relax any boundary. Every sample also records each GPU UUID and its
power limit. The controlled-power rerun requires the same two verified Quadro RTX
6000 GPUs at 160 W each, down from their observed/default 260 W, and at most 50 C
before model loading. The unchanged stop remains GPU temperature >=85 C and the
unchanged host floor is 8 GiB. NVIDIA reports a supported range of 100-260 W.

Both full arms will restart under these identical controls. They use the same
artifact/runtime/template pins, public inputs, prompts, decoding, caps, rubric,
thresholds, integration fixtures and 60-minute workload as acceptance-v1. No
model quality answers were inspected to choose this environmental correction.
This is a repeat of the same acceptance set, not a newly unseen holdout.

The source is committed, then a NEW package and RUN-SEAL-POWER-V2.json are made
before either rerun. The original RUN-SEAL.json is not overwritten. The operator
records original power settings, sets limits only on the two exact UUIDs, fails
closed if drift occurs, and restores the original limits after both arms (or on
failure), once owned model cleanup has completed. No firmware, fan curve, clock,
service, production route, private record or unrelated process is changed.

Power-limited performance is explicitly labeled; it is not claimed to equal
default-power production throughput. If this cannot hold a safe temperature,
stop and retain evidence; do not raise the thermal ceiling.

NVIDIA documents power limits as supported, administrator-scoped limits within
the device-reported range: https://docs.nvidia.com/deploy/nvidia-smi/index.html

Independent report verification remains required. Original v1/v2 evidence and
the independent acceptance corpus/grader remain unchanged. The source-bound
verifier remains unchanged; new postprocessing separately checks power telemetry.
