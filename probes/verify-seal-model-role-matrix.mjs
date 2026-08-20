import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seal = readFileSync(path.join(root, 'probes', 'SEAL-MODEL-ROLE-MATRIX.md'), 'utf8');
for (const file of ['MODEL-ROLE-MATRIX-PREREGISTRATION.md', 'probes/run-model-role-matrix.mjs']) {
  const line = seal.split(/\r?\n/).find((candidate) => candidate.includes(`\`${file}\``));
  const expected = line?.match(/SHA-256:\s+`([a-f0-9]{64})`/)?.[1];
  if (!expected) throw new Error(`missing sealed hash for ${file}`);
  const actual = createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');
  if (actual !== expected) throw new Error(`${file} drift: ${actual} != ${expected}`);
}
console.log('MODEL ROLE MATRIX SEAL VERIFIED');
