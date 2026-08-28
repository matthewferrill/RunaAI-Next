import {spawn} from 'node:child_process';
import path from 'node:path';
import {fail} from './coordinator.mjs';

// Only this fixed, trusted file-CAS helper can run. A timeout is not proof that
// it stopped: drain the owned child before the caller removes its request file.
export function runFileHelper({requestPath,operationMs=5000,stopGraceMs=2000,spawnImpl=spawn}){
  if(typeof requestPath!=='string'||operationMs<1||operationMs>10000||stopGraceMs<1||stopGraceMs>2000)throw fail('quiescence-file-helper-input');
  return new Promise((resolve,reject)=>{
    const child=spawnImpl('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
      path.join(import.meta.dirname,'Compare-CaddyBytes.ps1'),'-RequestPath',requestPath],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const chunks=[];let bytes=0,settled=false,pendingError=null,stopTimer=null;
    const settle=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(stopTimer);
      if(error)reject(error);else resolve(value);};
    const stop=error=>{if(settled||pendingError)return;pendingError=error;child.kill();
      stopTimer=setTimeout(()=>{const uncertain=fail('quiescence-file-helper-still-running');
        uncertain.retainRequest=true;uncertain.helperPid=child.pid??null;
        // Retain the request and typed unknown outcome for owner reconciliation.
        // Never claim this child died or unlink input it may still be reading.
        child.stdout.destroy();child.stderr.destroy();child.unref?.();settle(uncertain);
      },stopGraceMs);};
    const timer=setTimeout(()=>stop(fail('quiescence-file-write-uncertain')),operationMs);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192)stop(fail('quiescence-file-output-cap'));else chunks.push(chunk);});
    child.stderr.on('data',()=>{});
    child.on('error',()=>settle(fail('quiescence-file-helper-unavailable')));
    child.on('close',code=>settle(pendingError??(code===0?null:fail('quiescence-file-cas-rejected')),Buffer.concat(chunks).toString('utf8')));
  });
}
