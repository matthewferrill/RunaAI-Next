import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {sha} from './lease-contract.mjs';
import {completedHardwareOutcome} from './retain-completed-campaign.mjs';

// Copy only in memory. The historical aborted lease and raw evidence stay unchanged.
function fixture(){
  const root=path.join(import.meta.dirname,'evidence/20260828-campaign-coder-r3-outcome'),files={};
  for(const name of readdirSync(root))if(!['README.md','summary.json','final-observation.json'].includes(name))files[name]=readFileSync(path.join(root,name));
  const seal=JSON.parse(files['seal.json']),result=JSON.parse(files['lease-result.json']),marker=JSON.parse(files['complete.json']);
  result.completion='completed';marker.reason='completed';files['lease-result.json']=Buffer.from(JSON.stringify(result));files['complete.json']=Buffer.from(JSON.stringify(marker));
  const writer=Buffer.from('synthetic retained writer fixture'),receipt=Buffer.from(JSON.stringify({schemaVersion:'runaai-atomic-completion-publication/v1',
    leaseId:seal.leaseId,sealSha256:sha(files['seal.json']),markerSha256:sha(files['complete.json']),reason:'completed',published:true,lifecycleCalled:false,privateValuesIncluded:false}));
  return {leaseId:seal.leaseId,expectedSeal:sha(files['seal.json']),packet:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,bytes.toString('base64')])),
    finalBytes:readFileSync(path.join(root,'final-observation.json')),publicationBytes:Buffer.from(JSON.stringify({writerSha256:sha(writer),writerSource:writer.toString('base64'),receiptRaw:receipt.toString('base64'),receiptSha256:sha(receipt)}))};
}
test('completed hardware retention preserves raw records and does not infer functional pass',()=>{
  const input=fixture(),{retained,summary}=completedHardwareOutcome(input);
  assert.equal(summary.completion,'completed');assert.equal(summary.functionalQualityEvaluatedHere,false);
  assert.equal(summary.applicationAttemptCountsNotInferred,true);assert.equal(retained['completion-publication.json'],input.publicationBytes);
});
test('completion publication, source pins, cleanup, and final GPU identities must all agree',()=>{
  for(const mutate of [
    input=>{input.packet['complete.json']=Buffer.from('{}').toString('base64');},
    input=>{input.packet['home-smoke-lease.mjs']=Buffer.from('changed').toString('base64');},
    input=>{const value=JSON.parse(Buffer.from(input.packet['lease-result.json'],'base64'));value.cleanupVerified=false;input.packet['lease-result.json']=Buffer.from(JSON.stringify(value)).toString('base64');},
    input=>{const value=JSON.parse(input.finalBytes);value.gpus[0]=value.gpus[0].replace('GPU-','FOREIGN-');input.finalBytes=Buffer.from(JSON.stringify(value));},
    input=>{const value=JSON.parse(input.publicationBytes);value.receiptSha256='0'.repeat(64);input.publicationBytes=Buffer.from(JSON.stringify(value));},
  ]){const input=fixture();mutate(input);assert.throws(()=>completedHardwareOutcome(input));}
});
