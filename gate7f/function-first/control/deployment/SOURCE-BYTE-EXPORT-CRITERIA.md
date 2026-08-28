# Prospective immutable source-byte export correction

Independent audit after supervisor proof found21/26 raw local source pins differ
from Git bytes solely by checkout newline conversion. The93-test raw proof stays
valid for the bytes it actually tested but cannot by itself define a reproducible
package. Do not edit/reseal its proof, normalize during verification, or accept
two hashes.

Declare the existing Git object bytes canonical for deployment `*.mjs`, `*.cs`
and `*.ps1`, plus the eight exact Home wire sources. Mark those paths `-text` so
fresh checkout/archive bytes equal Git on autocrlf true or false. Historical
frozen deployer/evidence already have closer byte-preserving attributes. Do not
rewrite any implementation file in this correction.

Update the new wire harness pins to the canonical Git bytes, then create a fresh
worktree/archive after the attribute commit. Require every source path to match
Git and the fresh checkout before execution; run all supervisor/deployment and
actual40-case wire tests from those exported bytes. Retain both the prior93 proof
and the new proof; only the latter can support a future package seal.
