import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createR5RuntimeSeal} from './r5-runtime-seal.mjs';

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4)throw Error('usage: node build-r5-runtime-seal.mjs ABSOLUTE_INPUT_MANIFEST ABSOLUTE_NEW_OUTPUT/runtime-seal.json');
  const result=await createR5RuntimeSeal({manifestPath:process.argv[2],outputPath:process.argv[3]});console.log(JSON.stringify(result));
}
