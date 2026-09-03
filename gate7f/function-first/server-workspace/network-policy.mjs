import { canonicalSha256, NETWORK_POLICY_DIGEST, NETWORK_POLICY_ID } from "./materialization-contracts.mjs";
import policy from "./m1-s2b1-network-policy.json" with { type: "json" };

const fail = code => Object.assign(new Error(code), { code });

function ipv4Bytes(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some(part => !/^(?:0|[1-9][0-9]{0,2})$/u.test(part)
      || Number(part) > 255)) throw fail("network-policy-address-invalid");
  return Buffer.from(parts.map(Number));
}

function ipv6Bytes(value) {
  if (value.includes("%") || value.includes(".")) throw fail("network-policy-address-invalid");
  const halves = value.split("::");
  if (halves.length > 2) throw fail("network-policy-address-invalid");
  const parse = half => half === "" ? [] : half.split(":").map(item => {
    if (!/^[a-f0-9]{1,4}$/iu.test(item)) throw fail("network-policy-address-invalid");
    return Number.parseInt(item, 16);
  });
  const left = parse(halves[0]), right = parse(halves[1] ?? "");
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    throw fail("network-policy-address-invalid");
  }
  const words = [...left, ...Array(missing).fill(0), ...right];
  if (words.length !== 8) throw fail("network-policy-address-invalid");
  const result = Buffer.alloc(16);
  words.forEach((word, index) => result.writeUInt16BE(word, index * 2));
  return result;
}

function cidr(value, family) {
  const [address, rawPrefix, ...extra] = value.split("/");
  const prefix = Number(rawPrefix);
  const bytes = family === 4 ? ipv4Bytes(address) : ipv6Bytes(address);
  if (extra.length || !Number.isInteger(prefix) || prefix < 0 || prefix > bytes.length * 8) {
    throw fail("network-policy-cidr-invalid");
  }
  return Object.freeze({ bytes, prefix });
}

function prefixMatches(address, range) {
  const whole = Math.floor(range.prefix / 8), remaining = range.prefix % 8;
  if (!address.subarray(0, whole).equals(range.bytes.subarray(0, whole))) return false;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (address[whole] & mask) === (range.bytes[whole] & mask);
}

if (policy.policyId !== NETWORK_POLICY_ID || canonicalSha256(policy) !== NETWORK_POLICY_DIGEST) {
  throw fail("network-policy-integrity-failed");
}
// Never consult the shared JSON module object after this point. Other importers
// cannot mutate enforcement by changing Node's cached JSON object.
const maximumDnsAnswers = policy.maximumDnsAnswers;
const denied = Object.freeze({
  4: Object.freeze(policy.denyIpv4Cidrs.map(value => cidr(value, 4))),
  6: Object.freeze(policy.denyIpv6Cidrs.map(value => cidr(value, 6))),
});
const metadata = new Set(policy.explicitMetadataAddresses.map(value => {
  const family = value.includes(":") ? 6 : 4;
  const bytes = family === 4 ? ipv4Bytes(value) : ipv6Bytes(value);
  return `${family}:${bytes.toString("hex")}`;
}));

function normalize(record) {
  if (!record || Object.getPrototypeOf(record) !== Object.prototype
      || Object.keys(record).sort().join(",") !== "address,family"
      || ![4, 6].includes(record.family) || !Buffer.isBuffer(record.address)
      || record.address.length !== (record.family === 4 ? 4 : 16)) {
    throw fail("network-resolver-answer-invalid");
  }
  let family = record.family, address = Buffer.from(record.address);
  const mapped = family === 6 && address.subarray(0, 10).equals(Buffer.alloc(10))
    && address[10] === 0xff && address[11] === 0xff;
  if (mapped) { family = 4; address = Buffer.from(address.subarray(12)); }
  return Object.freeze({ family, address });
}

/** Classifies the complete binary resolver answer set without logging or returning an address literal. */
export function admitResolverAnswers(records) {
  if (!Array.isArray(records) || records.length === 0) throw fail("network-resolver-answer-set-empty");
  if (records.length > maximumDnsAnswers) throw fail("network-resolver-answer-limit");
  const normalized = records.map(normalize).sort((a, b) => a.family - b.family
    || Buffer.compare(a.address, b.address));
  const keys = normalized.map(item => `${item.family}:${item.address.toString("hex")}`);
  if (new Set(keys).size !== keys.length) throw fail("network-resolver-answer-ambiguous");
  if (normalized.some((item, index) => metadata.has(keys[index])
      || denied[item.family].some(range => prefixMatches(item.address, range)))) {
    throw fail("network-resolver-answer-denied");
  }
  const selected = normalized[0];
  const answerSetDigest = canonicalSha256({ schemaVersion: "runa-network-answer-set/v1", answers: keys });
  const selectedAddressDigest = canonicalSha256({ schemaVersion: "runa-network-selected-address/v1",
    address: keys[0] });
  return Object.freeze({
    family: selected.family,
    answerSetDigest,
    selectedAddressDigest,
    policyId: NETWORK_POLICY_ID,
    policyDigest: NETWORK_POLICY_DIGEST,
    allowed: true,
    copySelectedAddress: () => Buffer.from(selected.address),
  });
}
