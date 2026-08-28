import {lstat,open,readdir,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fail} from './coordinator.mjs';

// Append-only owner-private operator state. A deterministic create-only next
// revision is the CAS boundary: two processes cannot both publish revision N+1.
// A partial/crashed write remains a reconciliation failure, never skipped.
export class QuiescenceJournal {
  constructor({directory,assertOwnerPrivate,allowSyntheticFixture=false}){
    if(typeof directory!=='string'||(!allowSyntheticFixture&&typeof assertOwnerPrivate!=='function'))throw fail('quiescence-journal-boundary-invalid');
    this.directory=path.resolve(directory);this.assertOwnerPrivate=assertOwnerPrivate;
  }
  async boundary(){
    const stat=await lstat(this.directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||path.resolve(await realpath(this.directory)).toLowerCase()!==this.directory.toLowerCase())throw fail('quiescence-journal-boundary-invalid');
    await this.assertOwnerPrivate?.(this.directory);
  }
  async load(transitionId){
    if(!/^[a-f0-9]{32}$/u.test(transitionId))throw fail('quiescence-journal-id-invalid');
    await this.boundary();
    const all=await readdir(this.directory);let binding;
    try{binding=await readFile(path.join(this.directory,'transition-id'),'utf8');}
    catch(error){if(error.code!=='ENOENT')throw error;if(all.length)throw fail('quiescence-journal-binding-invalid');return null;}
    if(binding!==transitionId)throw fail('quiescence-journal-binding-invalid');
    const names=all.filter(name=>name.startsWith(transitionId+'-')).sort();
    if(!names.length)return null;
    if(names.length>4096||names.some((name,index)=>name!==transitionId+'-'+String(index+1).padStart(6,'0')+'.json'))throw fail('quiescence-journal-sequence-invalid');
    const filename=path.join(this.directory,names.at(-1)),stat=await lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8_388_608)throw fail('quiescence-journal-record-invalid');
    let state;try{state=JSON.parse(await readFile(filename,'utf8'));}catch{throw fail('quiescence-journal-record-invalid');}
    if(state.transitionId!==transitionId||state.revision!==names.length)throw fail('quiescence-journal-record-invalid');
    return state;
  }
  async save(state,{expectedRevision}){
    const prior=await this.load(state.transitionId);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||(prior?.revision??0)!==expectedRevision
      ||state.revision!==expectedRevision+1||state.revision>4096)throw fail('quiescence-journal-stale');
    const bytes=Buffer.from(JSON.stringify(state));if(bytes.length>8_388_608)throw fail('quiescence-journal-record-invalid');
    if(expectedRevision===0){
      let binding;
      try{binding=await open(path.join(this.directory,'transition-id'),'wx');}
      catch(error){if(error.code!=='EEXIST')throw error;}
      if(binding){try{await binding.writeFile(state.transitionId);await binding.sync();}finally{await binding.close();}}
      if(await readFile(path.join(this.directory,'transition-id'),'utf8')!==state.transitionId)throw fail('quiescence-journal-binding-invalid');
    }
    const filename=path.join(this.directory,state.transitionId+'-'+String(state.revision).padStart(6,'0')+'.json');
    let file;try{file=await open(filename,'wx');}catch(error){throw error.code==='EEXIST'?fail('quiescence-journal-stale'):error;}
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  }
}
