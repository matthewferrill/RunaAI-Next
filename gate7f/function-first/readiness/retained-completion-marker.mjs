import {validCompletion} from './lease-contract.mjs';

export function retainedCompletionMarker(files,expectedSeal,leaseId){
  return files['complete.json']
    ? validCompletion(JSON.parse(files['complete.json']),expectedSeal,leaseId)
    : null;
}
