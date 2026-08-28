import {demand} from './tls-primitives.mjs';
// Consume a child already created by a trusted fixed-command wrapper. This helper cannot choose
// an executable or command. It never exports stdout/stderr on failure and settles even when the
// OS cannot confirm termination. That last case is explicitly unknown, not permission to retry.
export function privateChildText(child,{timeoutMs=15000,stopMs=1000,cap=16384}={}){
  demand(child&&child.stdin&&child.stdout&&child.stderr&&typeof child.kill==='function'
    &&Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=15000&&Number.isInteger(stopMs)&&stopMs>=1&&stopMs<=1000
    &&Number.isInteger(cap)&&cap>0&&cap<=16384,'private-child-bounds');
  return new Promise((resolve,reject)=>{
    const chunks=[],errors=[];let size=0,failed=false,settled=false,stopTimer=null;
    const failure=stopped=>Object.assign(Error('runtime-settings-file-child-unconfirmed'),
      {code:'runtime-settings-file-child-unconfirmed',executionStopped:stopped});
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(deadline);clearTimeout(stopTimer);chunks.length=0;errors.length=0;
      if(error)reject(error);else resolve(value);
    };
    const fail=()=>{
      if(settled||failed)return;failed=true;
      stopTimer=setTimeout(()=>{
        // We own only these pipe handles. Do not leave a slow reader holding the coordinator
        // indefinitely and do not claim that destroying pipes stopped an unconfirmed child.
        for(const stream of [child.stdin,child.stdout,child.stderr])try{stream.destroy();}catch{}
        try{child.unref();}catch{}finish(failure(false));
      },stopMs);
      try{child.kill();}catch{}
    };
    const deadline=setTimeout(fail,timeoutMs);
    child.on('error',fail);child.stdin.on('error',fail);child.stdout.on('error',fail);child.stderr.on('error',fail);
    child.stdout.on('data',bytes=>{if(settled||failed)return;size+=bytes.length;if(size>cap)fail();else chunks.push(Buffer.from(bytes));});
    child.stderr.on('data',bytes=>{if(settled||failed)return;size+=bytes.length;if(size>cap)fail();else errors.push(Buffer.from(bytes));});
    child.on('close',code=>{
      if(settled)return;
      if(failed||code!==0){finish(failure(true));return;}
      try{const decoder=new TextDecoder('utf8',{fatal:true});
        finish(null,{stdout:decoder.decode(Buffer.concat(chunks)),stderr:decoder.decode(Buffer.concat(errors))});}
      catch{finish(failure(true));}
    });
  });
}

export async function privateChildJson(child,options){
  const {stdout}=await privateChildText(child,options);
  try{return JSON.parse(stdout);}catch{
    // Text is available only after confirmed close. Never attach the private parser input/error.
    throw Object.assign(Error('runtime-settings-file-child-unconfirmed'),
      {code:'runtime-settings-file-child-unconfirmed',executionStopped:true});
  }
}
