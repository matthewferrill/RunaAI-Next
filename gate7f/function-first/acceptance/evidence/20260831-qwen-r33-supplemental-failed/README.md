# Qwen remaining-13 r33 stopped supplemental evidence

Date: 2026-08-31

This directory binds the stopped supplemental run without treating it as a
qualification result. Control stage `35304669bab045cd97c3df555b9f5521`
used source `9028d123843b6a7cbda4ee9f0a020d9947ed4657`, source archive
`a0f89dc8d9d658a2aa14dc32b2a627743b114b4388b57455c157ca40f0f3172c`,
runtime seal `64e4614c76d7328bbe7548dc0c421e1b6afca836ec2c354c2e96a317f2835aa1`
and 12/12 controls SHA-256
`0013fb37d0f9fd1db397447c4faf0206cb907f7b4252dab35bcd69d7d1addd98`.

The runner recorded 3/13 attempts and stopped with
`m1-campaign-attempt-undrained`. Agent04 completed and its actual browser
showed the expected revoked-permission outcome. Agent05 failed before a model
call because its preparation checkpoint was not acknowledged. Agent06 was
interrupted after its later browser checkpoint was not observed and the worker
then disconnected. Ten identities were not executed. All three rows remain
inconclusive and are not pooled with immutable R12.

## Root cause

The campaign runner correctly created a directory named
`supplemental-qwen36-27b-mtp-64e4614c76d7328b-8ffb2286760d`. The owner-side
PowerShell bindings in `Publish-BrowserWitness.Remote.ps1`,
`Publish-BrowserWitnessAndAck.Remote.ps1` and `Write-BrowserAck.Remote.ps1`
accepted only `campaign-*` directories. Their Omen operator wrappers had the
same restriction. Agent04 was acknowledged only through the lower-level helper;
the ordinary and combined owner paths required by the following checkpoints
could not bind the supplemental directory. The checkpoint servers then closed
at their declared deadlines, which explains the later loopback connection
refusal without implying a Control network failure.

The prospective correction admits only the exact generated Qwen supplemental
shape: `supplemental-qwen36-27b-mtp-<16 lowercase hex>-<12 lowercase hex>`.
Full campaign names remain accepted. Other candidates, wrong lengths, child
paths and traversal forms remain denied. The cases, model prompts, expected
answers, thresholds, runtime settings and immutable prior result do not change.

## Preservation and cleanup

`result.json` is the exact stopped result. `evidence-manifest.json` binds every
raw Control file by byte length and SHA-256; the raw stage directory remains
preserved separately. Home lease `20260829-campaign-qwen36-r33` expired safely
with `cleanupVerified=true` and `powerRestored=true`. A fresh owner-context
observation found zero model residency and both GPUs at 260 W. The exact idle
scheduled task was removed, while its evidence directory was retained. The
Control stage had no owned process left. Production routing did not change and
no protected data was read.
