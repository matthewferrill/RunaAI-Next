// Canonical source text is never normalized or truncated. Only the derived
// embedding input is NFKC-normalized and split before the 2,048-token auxiliary.
// Byte caps are deliberately conservative for its BERT/WordPiece tokenizer;
// the prefix is included in every window. Full source revisions still feed BGE.
export const NOMIC_INPUT_POLICY = Object.freeze({ schemaVersion: "runaai-m1-nomic-input/v1",
  maximumWindowUtf8Bytes: 1600, overlapUtf8Bytes: 128, maximumWindowsPerInput: 64,
  maximumWindowsPerRequest: 64, normalization: "NFKC", combination: "coverage-weighted-normalized-mean" });
const fail = code => Object.assign(new Error(code), { code });
const byteLength = value => Buffer.byteLength(value, "utf8");

export function nomicInputWindows(input) {
  if (typeof input !== "string" || !input.isWellFormed()) throw fail("m1-embedding-input-invalid");
  const prefix = /^(search_document: |search_query: )/.exec(input)?.[0];
  if (!prefix) throw fail("m1-embedding-prefix-required");
  const text = input.slice(prefix.length).normalize("NFKC");
  if (!text.trim()) throw fail("m1-embedding-input-empty");
  const characters = [...text], sizes = characters.map(byteLength), cap = NOMIC_INPUT_POLICY.maximumWindowUtf8Bytes - byteLength(prefix);
  const windows = []; let start = 0, previouslyCovered = 0;
  while (start < characters.length) {
    let end = start, bytes = 0;
    while (end < characters.length && bytes + sizes[end] <= cap) bytes += sizes[end++];
    if (end === start) throw fail("m1-embedding-character-overflow");
    const weight = sizes.slice(Math.max(start, previouslyCovered), end).reduce((sum, value) => sum + value, 0);
    windows.push({ text: prefix + characters.slice(start, end).join(""), weight }); previouslyCovered = end;
    if (windows.length > NOMIC_INPUT_POLICY.maximumWindowsPerInput) throw fail("m1-embedding-input-limited");
    if (end === characters.length) break;
    let overlapStart = end, overlapBytes = 0;
    while (overlapStart > start + 1 && overlapBytes + sizes[overlapStart - 1] <= NOMIC_INPUT_POLICY.overlapUtf8Bytes) overlapBytes += sizes[--overlapStart];
    start = overlapStart;
  }
  return windows;
}

export class BoundedNomicEmbedder {
  constructor(embedder) { this.delegate = embedder; this.dimension = embedder.dimension; }
  async embed(inputs, options) {
    if (!Array.isArray(inputs) || !inputs.length) throw fail("m1-embedding-input-invalid");
    const windows = inputs.map(nomicInputWindows), flat = windows.flat();
    if (flat.length > NOMIC_INPUT_POLICY.maximumWindowsPerRequest) throw fail("m1-embedding-batch-limited");
    const vectors = await this.delegate.embed(flat.map(window => window.text), options);
    if (vectors.length !== flat.length || vectors.some(vector => !Array.isArray(vector) || vector.length !== this.dimension || vector.some(value => !Number.isFinite(value)))) {
      throw fail("m1-embedding-window-shape-invalid");
    }
    let cursor = 0;
    return windows.map(group => {
      if (group.length === 1) return vectors[cursor++];
      const combined = Array(this.dimension).fill(0);
      for (const window of group) {
        const vector = vectors[cursor++], norm = Math.hypot(...vector);
        if (!Number.isFinite(norm) || norm <= 0) throw fail("m1-embedding-zero-window");
        vector.forEach((value, index) => combined[index] += window.weight * value / norm);
      }
      const norm = Math.hypot(...combined);
      if (!Number.isFinite(norm) || norm <= 0) throw fail("m1-embedding-zero-aggregate");
      return combined.map(value => value / norm);
    });
  }
}
