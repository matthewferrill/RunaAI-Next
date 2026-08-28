import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {QuiescenceJournal} from './journal.mjs';

async function fixture(){const directory=await mkdtemp(path.join(tmpdir(),'m1-quiescence-journal-'));
  return {directory,journal:new QuiescenceJournal({directory,allowSyntheticFixture:true})};}
const transitionId='b'.repeat(32);
test('real append-only journal loads latest revision after restart and rejects stale input',async()=>{
  const {directory,journal}=await fixture(),state={transitionId,revision:1,phase:'prepared'};
  await journal.save(state,{expectedRevision:0});await journal.save({...state,revision:2,phase:'needs-reconciliation'},{expectedRevision:1});
  const restarted=new QuiescenceJournal({directory,allowSyntheticFixture:true});
  assert.equal((await restarted.load(transitionId)).phase,'needs-reconciliation');
  await assert.rejects(restarted.save({...state,revision:2},{expectedRevision:1}),/journal-stale/u);
});
test('two actual append attempts at same next revision have exactly one winner',async()=>{
  const {directory,journal}=await fixture(),state={transitionId,revision:1};await journal.save(state,{expectedRevision:0});
  const other=new QuiescenceJournal({directory,allowSyntheticFixture:true});
  const results=await Promise.allSettled([journal.save({...state,revision:2,value:'first'},{expectedRevision:1}),
    other.save({...state,revision:2,value:'second'},{expectedRevision:1})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await journal.load(transitionId)).revision,2);
});
test('partial journal tail is retained and blocks recovery instead of skipping it',async()=>{
  const {directory,journal}=await fixture();await journal.save({transitionId,revision:1},{expectedRevision:0});
  await writeFile(path.join(directory,transitionId+'-000002.json'),'{',{flag:'wx'});
  await assert.rejects(journal.load(transitionId),/journal-record-invalid/u);
  await assert.rejects(journal.save({transitionId,revision:2},{expectedRevision:1}),/journal-record-invalid/u);
});
test('journal directory is bound to one transition and cannot begin a competing operation',async()=>{
  const {directory,journal}=await fixture();await journal.save({transitionId,revision:1,phase:'needs-reconciliation'},{expectedRevision:0});
  const other=new QuiescenceJournal({directory,allowSyntheticFixture:true});
  await assert.rejects(other.save({transitionId:'c'.repeat(32),revision:1},{expectedRevision:0}),/journal-binding-invalid/u);
  assert.equal((await journal.load(transitionId)).phase,'needs-reconciliation');
});
test('non-synthetic journal requires explicit owner-private validation',()=>{
  assert.throws(()=>new QuiescenceJournal({directory:tmpdir()}),/journal-boundary-invalid/u);
});
