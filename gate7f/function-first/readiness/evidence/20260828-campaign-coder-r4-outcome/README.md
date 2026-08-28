# Coder R4: incomplete campaign, verified hardware cleanup

Root stopped the functional campaign at a browser checkpoint because an earlier attempt had aged
beyond the preparation deadline and made no provider call. That is not a complete model qualification;
the application attempt counts and detailed disposition belong to the root campaign evidence.

The owned hardware lease received a requested abort marker, then recorded `lease-operator-failed`
with Error class and `completion:null`. Its retained marker validates as `abort` after publication.
The old operator publishes the marker by creating the destination and then writing it; a concurrent
reader may encounter an incomplete or share-locked file. That is a plausible cause, not a proved
cause: the sealed worker did not retain the native error text/code. Do not relabel this as a clean
abort or regrade its model results. No old seal, runner or evidence was changed.

The independent supervisor observed both exact owned instances unloaded and original260W restored.
After raw export, the exact stopped task was unregistered. Final read-only observation at
2026-08-28T20:39:51.9257390Z found zero loaded instances, zero owned lease tasks, both GPUs260W,
temperatures43/37C, and the unchanged1234/8412 listeners. All files remain on Home and the bounded
synthetic evidence is retained here byte-for-byte. No production routing or protected data changed.

232 hardware samples: peak67C, maximum sample gap6188ms, minimum host free98,819,661,824bytes and
minimum GPU free7145MiB. These are hardware observations, not a functional pass.
