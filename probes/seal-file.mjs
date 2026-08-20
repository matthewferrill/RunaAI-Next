import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Git may materialize text files as CRLF on Windows even when the sealed repository bytes are LF.
// Canonicalize that one transport difference; all other bytes remain significant.
export const canonicalLf = (text) => String(text).replace(/\r\n/g, "\n");

export const sha256CanonicalText = (path) => createHash("sha256")
  .update(canonicalLf(readFileSync(path, "utf8")), "utf8")
  .digest("hex");
