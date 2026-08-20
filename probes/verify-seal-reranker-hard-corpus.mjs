import { readFileSync } from 'node:fs';
import { sha256CanonicalText } from './seal-file.mjs';
const seal = readFileSync('probes/SEAL-RERANKER-HARD-CORPUS.md', 'utf8');
for (const file of ['RERANKER-HARD-CORPUS-PREREGISTRATION.md', 'probes/run-reranker-hard-corpus.mjs']) {
  const line = seal.split(/\r?\n/).find(candidate => candidate.includes(`\`${file}\``));
  const expected = line?.match(/SHA-256:\s+`([a-f0-9]{64})`/)?.[1];
  const actual = sha256CanonicalText(file);
  if (!expected || actual !== expected) throw new Error(`${file} seal mismatch`);
}
console.log('RERANKER HARD CORPUS SEAL VERIFIED');

