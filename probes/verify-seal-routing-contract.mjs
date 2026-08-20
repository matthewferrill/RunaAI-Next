import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256CanonicalText } from './seal-file.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seal = readFileSync(path.join(root, 'probes', 'SEAL-ROUTING-CONTRACT.md'), 'utf8');
for (const file of ['ROUTING-CONTRACT-PREREGISTRATION.md', 'probes/run-routing-contract.mjs']) {
  const expected = seal.split(/\r?\n/).find(line => line.includes(`\`${file}\``))?.match(/`([a-f0-9]{64})`/)?.[1];
  const actual = sha256CanonicalText(path.join(root, file));
  if (!expected || actual !== expected) throw new Error(`${file} drift: ${actual} != ${expected}`);
}
console.log('ROUTING CONTRACT SEAL VERIFIED');
