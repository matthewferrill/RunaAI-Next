import {openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.argv[2];assert.equal(process.platform,'win32');
assert.match(root,/^C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-proof-[a-f0-9]{32}$/);
const fd=openSync(root+'\\state\\synthetic-ownership.jsonl','wx');
try{writeSync(fd,JSON.stringify({schemaVersion:'runaai-os-proof-journal/v1',type:'synthetic-owned',pid:process.pid,
  modelOperations:false,productionChanges:false})+'\n');fsyncSync(fd);}finally{closeSync(fd);}
// The outer native watchdog must survive this process being terminated. No network/model access.
setInterval(()=>{},500);
setTimeout(()=>process.exit(0),30000);
