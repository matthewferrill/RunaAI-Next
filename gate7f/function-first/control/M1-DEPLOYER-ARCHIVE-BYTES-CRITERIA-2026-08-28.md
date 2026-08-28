# Prospective operator deployer-byte correction

M1-S2 / C12 C15 C16; roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This corrects the separately prepared operator only. Frozen application9556,
campaign seal416102, cases, historical raw evidence and working application files
are not changed. The 17-family roadmap remains separate and unfinished.

Root's integration of43cfee3 ran54 checks:29 passed,25 failed source binding.
The initial local proof used this checkout's23939-byte/all328CRLF deployer
SHA9834fb63f7c56428fa965f39ac2985ff6a3d132b06f4244e108ebb3cde6aa6f5.
The immutable9556 Git blob ec2ade2e1f5adc3642718441c2f1ce018d4f1478 and
release archive instead contain23611 bytes/328LF, SHA
`5b606b1b9dff1fb6d0bc3132fc852bdc1f82996999c832ed7ef12fbc2f9d8fb9`.
Root's mixed-newline working file is neither immutable input; leave it untouched.
Earlier local green results and the failed integration result remain historical.

Before more wire work, make the generator accept ONLY those exact immutable LF
bytes, then perform its checked LF substitutions. Do not normalize caller input,
accept alternative hashes, reconstruct lost bytes, change the frozen deployer,
or present a checkout-specific result as release proof. Retain an exact raw
frozen-source fixture (with -text preservation) for tests, independent of Git or
the working deployer's newline policy. The operational argument remains raw
sourceBytes supplied by the authenticated package, not an automatic fallback.

Test exact fixture byte count/hash/line endings and immutable source identity;
reject one-byte changes, CRLF and mixed newlines; parse the complete generated
companion; rerun all deployment assembly/child/transaction checks. Retain new raw
proof with the corrected source pin. Tests may start only existing isolated local
children; no Home/Control requests, real enrollment, deployment or model load.

## Correction from exact retained archive inspection

The preceding LF-archive assertion was an unverified inference from the Git blob
and is superseded here before the source correction is committed. Directly read
the retained `m1-task-native-ed104b1f647343cca570352b63851a77/source.tar` from
the root's local artifacts: its full SHA is exactly
`e10adce53387bcf31b639738e2d7ae26c2b5dd17e2914f1870ba0ef1949b31dc`;
the deployer entry is23939 bytes/328CRLF and SHA
`9834fb63f7c56428fa965f39ac2985ff6a3d132b06f4244e108ebb3cde6aa6f5`.
Plain Git archive with the installed core.autocrlf=true also produces those
bytes; the23611-byte LF Git blob is not the retained campaign archive entry.
Root independently accepted this observed correction. Preserve the earlier
criteria in history and29/25 failed integration evidence, not as a corrected pass.

Final implementation requirement: keep strict archive SHA9834 and CRLF
derivation, and replace the tests' mutable working-file read with an exact
archive-extracted23939-byte fixture. Preserve fixture bytes with -text. Verify
the whole e10adce archive before extracting that exact entry; retain its hashes
and the distinct Git blob hash as provenance. Reject LF, mixed and any other
changed source. Do not accept both variants, normalize production input, edit
the frozen application, or use a fallback source read. This fixes reproducible
operator inputs without changing the successful original raw-byte contract.
