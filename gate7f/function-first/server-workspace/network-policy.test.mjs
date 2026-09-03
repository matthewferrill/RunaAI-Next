import test from "node:test";
import assert from "node:assert/strict";
import { admitResolverAnswers } from "./network-policy.mjs";
import policy from "./m1-s2b1-network-policy.json" with { type: "json" };

const v4 = (...bytes) => ({ family: 4, address: Buffer.from(bytes) });
const v6 = hex => ({ family: 6, address: Buffer.from(hex, "hex") });

function parsedAddress(value) {
  if (!value.includes(":")) return { family: 4, value: value.split(".").reduce((sum, part) => (sum << 8n) | BigInt(part), 0n) };
  const halves = value.split("::");
  const words = part => part === "" ? [] : part.split(":").map(item => Number.parseInt(item, 16));
  const left = words(halves[0]), right = words(halves[1] ?? "");
  const all = [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  return { family: 6, value: all.reduce((sum, word) => (sum << 16n) | BigInt(word), 0n) };
}
function parsedCidr(text) {
  const [address, prefixText] = text.split("/"), parsed = parsedAddress(address);
  const bits = parsed.family === 4 ? 32n : 128n, prefix = BigInt(prefixText);
  const hostBits = bits - prefix, mask = ((1n << bits) - 1n) ^ ((1n << hostBits) - 1n);
  const start = parsed.value & mask, end = start | ((1n << hostBits) - 1n);
  return { ...parsed, start, end, bits };
}
function binary(family, value) {
  const bytes = family === 4 ? 4 : 16, result = Buffer.alloc(bytes); let remaining = value;
  for (let index = bytes - 1; index >= 0; index -= 1) { result[index] = Number(remaining & 0xffn); remaining >>= 8n; }
  return { family, address: result };
}
const allRanges = [...policy.denyIpv4Cidrs, ...policy.denyIpv6Cidrs].map(parsedCidr);
const globallyDenied = (family, value) => allRanges.some(range => range.family === family
  && value >= range.start && value <= range.end);

test("selects once from a normalized complete binary answer set and exposes only digests", () => {
  const answer = v4(8, 8, 8, 8);
  const admitted = admitResolverAnswers([v6("26064700470000000000000000001111"), answer]);
  assert.equal(admitted.allowed, true);
  assert.equal(admitted.family, 4);
  assert.match(admitted.answerSetDigest, /^[a-f0-9]{64}$/u);
  assert.match(admitted.selectedAddressDigest, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(admitted).includes("8.8.8.8"), false);
  const first = admitted.copySelectedAddress(); first[0] = 1;
  assert.deepEqual([...admitted.copySelectedAddress()], [8, 8, 8, 8]);
});

test("IPv4-mapped IPv6 is reduced and classified through the IPv4 policy", () => {
  const allowed = admitResolverAnswers([v6("00000000000000000000ffff08080808")]);
  assert.equal(allowed.family, 4);
  assert.deepEqual([...allowed.copySelectedAddress()], [8, 8, 8, 8]);
  assert.throws(() => admitResolverAnswers([v6("00000000000000000000ffff7f000001")]),
    error => error.code === "network-resolver-answer-denied");
});

test("one denied or metadata answer rejects the complete set", () => {
  for (const denied of [v4(10, 0, 0, 1), v4(169, 254, 169, 254),
    v6("fd000ec2000000000000000000000254"), v6("fe800000000000000000000000000001")]) {
    assert.throws(() => admitResolverAnswers([v4(8, 8, 8, 8), denied]),
      error => error.code === "network-resolver-answer-denied");
  }
});

test("zero, excessive, duplicate, malformed and ambiguous-family answers fail closed", () => {
  assert.throws(() => admitResolverAnswers([]), error => error.code === "network-resolver-answer-set-empty");
  assert.throws(() => admitResolverAnswers(Array.from({ length: 17 }, (_, index) => v4(8, 8, 8, index + 1))),
    error => error.code === "network-resolver-answer-limit");
  assert.throws(() => admitResolverAnswers([v4(8, 8, 4, 4), v4(8, 8, 4, 4)]),
    error => error.code === "network-resolver-answer-ambiguous");
  for (const record of [{ family: 4, address: Buffer.alloc(16) }, { family: 6, address: Buffer.alloc(4) },
    { family: 5, address: Buffer.alloc(4) }, { family: 4, address: new Uint8Array(4) },
    { family: 4, address: Buffer.alloc(4), zone: "1" }]) {
    assert.throws(() => admitResolverAnswers([record]), error => error.code === "network-resolver-answer-invalid");
  }
});

test("every frozen CIDR denies both boundaries and admits globally safe adjacent addresses", () => {
  for (const range of allRanges) {
    for (const value of new Set([range.start, range.end])) {
      assert.throws(() => admitResolverAnswers([binary(range.family, value)]),
        error => error.code === "network-resolver-answer-denied");
    }
    const maximum = (1n << range.bits) - 1n;
    for (const value of [range.start - 1n, range.end + 1n]) {
      if (value >= 0n && value <= maximum && !globallyDenied(range.family, value)) {
        assert.equal(admitResolverAnswers([binary(range.family, value)]).allowed, true);
      }
    }
  }
});

test("shared JSON cache mutation cannot alter the snapshotted enforcement policy", () => {
  const maximum = policy.maximumDnsAnswers;
  policy.maximumDnsAnswers = 1;
  policy.denyIpv4Cidrs.push("8.0.0.0/8");
  try {
    assert.equal(admitResolverAnswers([v4(8, 8, 8, 8), v4(9, 9, 9, 9)]).allowed, true);
  } finally {
    policy.maximumDnsAnswers = maximum;
    policy.denyIpv4Cidrs.pop();
  }
});
