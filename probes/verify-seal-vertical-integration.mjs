import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256CanonicalText } from './seal-file.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seal = readFileSync(path.join(root, 'probes', 'SEAL-VERTICAL-INTEGRATION.md'), 'utf8');
for (const file of ['VERTICAL-INTEGRATION-PREREGISTRATION.md', 'bakeoffs/durable/vertical-integration-worker.mjs',
  'bakeoffs/durable/run-vertical-integration.mjs', 'bakeoffs/observability/collector-integration.yaml']) {
  const line = seal.split(/\r?\n/).find(candidate => candidate.includes(`\`${file}\``));
  const expected = line?.match(/SHA-256:\s+`([a-f0-9]{64})`/)?.[1];
  if (!expected) throw new Error(`missing sealed hash for ${file}`);
  const actual = sha256CanonicalText(path.join(root, file));
  if (actual !== expected) throw new Error(`${file} drift: ${actual} != ${expected}`);
}
console.log('VERTICAL INTEGRATION SEAL VERIFIED');

