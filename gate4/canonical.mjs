import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function canonicalValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw Object.assign(new Error("Canonical JSON requires finite numbers."), { code: "canonical-number-invalid" });
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw Object.assign(new Error("Canonical JSON does not permit undefined values."), { code: "canonical-value-invalid" });
      output[key] = canonicalValue(value[key]);
    }
    return output;
  }
  throw Object.assign(new Error(`Canonical JSON does not permit ${typeof value}.`), { code: "canonical-value-invalid" });
}

export const canonicalJson = value => JSON.stringify(canonicalValue(value));
export const sha256 = value => createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
export const hmac256 = (key, value) => createHmac("sha256", key).update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");

export function safeDigestEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(String(left)) || !/^[a-f0-9]{64}$/.test(String(right))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
