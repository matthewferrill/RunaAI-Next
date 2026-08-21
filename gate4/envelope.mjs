import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { canonicalJson, hmac256, safeDigestEqual } from "./canonical.mjs";

export const PRIVATE_ENVELOPE_VERSION = "runa2-private-envelope/v1";
const coded = (code, message) => Object.assign(new Error(message), { code });

function key32(value, label) {
  if (!Buffer.isBuffer(value) || value.length !== 32) throw coded("envelope-key-invalid", `${label} must be 32 bytes.`);
  return Buffer.from(value);
}

function contextOf({ recordType, participantId, recordId, field }) {
  for (const [name, value] of Object.entries({ recordType, participantId, recordId, field })) {
    if (!String(value ?? "").trim()) throw coded("envelope-context-invalid", `Envelope ${name} is required.`);
  }
  return { schemaVersion: PRIVATE_ENVELOPE_VERSION, recordType, participantId, recordId, field };
}

export function createEnvelopeCipher({ encryptionKey, hmacKey, keyId = "disposable-test-key", random = randomBytes, onDecrypt = null }) {
  const encKey = key32(encryptionKey, "encryptionKey");
  const macKey = key32(hmacKey, "hmacKey");
  let destroyed = false;
  const available = () => {
    if (destroyed) throw coded("envelope-key-destroyed", "Envelope key material has been destroyed.");
  };
  const digest = value => { available(); return hmac256(macKey, canonicalJson(value)); };
  return Object.freeze({
    keyId,
    digest,
    encrypt(context, value) {
      available();
      const bound = contextOf(context);
      const nonce = random(12);
      if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw coded("envelope-random-invalid", "Envelope nonce must be 12 bytes.");
      const cipher = createCipheriv("aes-256-gcm", encKey, nonce);
      cipher.setAAD(Buffer.from(canonicalJson(bound)));
      const plaintext = Buffer.from(canonicalJson(value));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Object.freeze({
        schemaVersion: PRIVATE_ENVELOPE_VERSION,
        algorithm: "aes-256-gcm",
        keyId,
        nonce: nonce.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        contentHmac: digest({ context: bound, value }),
      });
    },
    decrypt(context, envelope) {
      available();
      const bound = contextOf(context);
      try {
        if (envelope?.schemaVersion !== PRIVATE_ENVELOPE_VERSION || envelope.algorithm !== "aes-256-gcm" || envelope.keyId !== keyId) {
          throw new Error("version/key mismatch");
        }
        const decipher = createDecipheriv("aes-256-gcm", encKey, Buffer.from(envelope.nonce, "base64"));
        decipher.setAAD(Buffer.from(canonicalJson(bound)));
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
        const value = JSON.parse(plaintext.toString("utf8"));
        if (!safeDigestEqual(envelope.contentHmac, digest({ context: bound, value }))) throw new Error("content hmac mismatch");
        onDecrypt?.(bound);
        return value;
      } catch {
        throw coded("private-envelope-invalid", "The private record failed its authenticated envelope check.");
      }
    },
    destroy() {
      if (!destroyed) { encKey.fill(0); macKey.fill(0); destroyed = true; }
      return Object.freeze({ destroyed: true });
    },
  });
}
