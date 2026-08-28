// Read-only fixed inventory, to run only between candidate leases. Never import/execute a vendor
// binary, call a server, inspect auth/log stores, follow links, or enumerate arbitrary profiles.
import {readFileSync,lstatSync,existsSync,openSync,closeSync,readSync,fstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
assert.equal(hostname().toUpperCase(),'RUNA-HOME');
const profiles=['C:\\Users\\Matthew','C:\\Users\\codex-audit'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function plain(file,maximum){
 for(let current=file;current!==path.dirname(current);current=path.dirname(current))
  assert.equal(lstatSync(current).isSymbolicLink(),false,'inventory-linked-path');
 const stat=lstatSync(file);assert.ok(stat.isFile()&&stat.nlink===1&&stat.size<=maximum,'inventory-file');return stat;
}
function small(file,maximum){plain(file,maximum);return readFileSync(file);}
function executable(file,allowedRoots){
 if(typeof file!=='string'||path.resolve(file)!==file||path.extname(file).toLowerCase()!=='.exe'
  ||!allowedRoots.some(root=>file.toLowerCase().startsWith(root.toLowerCase()+'\\')))
  return {status:'outside-reviewed-roots',path:typeof file==='string'?file:null};
 if(!existsSync(file))return {status:'absent',path:file};
 const before=plain(file,536870912),fd=openSync(file,'r');
 try{
  const held=fstatSync(fd);assert.equal(held.ino,before.ino);assert.equal(held.dev,before.dev);
  const buffer=Buffer.alloc(65536),digest=createHash('sha256');let total=0,count;
  while((count=readSync(fd,buffer,0,buffer.length,null))>0){
   if(total===0)assert.equal(buffer.subarray(0,2).toString(),'MZ','inventory-not-pe');
   total+=count;assert.ok(total<=536870912,'inventory-binary-cap');digest.update(buffer.subarray(0,count));
  }
  const after=fstatSync(fd);assert.equal(total,before.size);assert.equal(after.mtimeMs,held.mtimeMs);assert.equal(after.nlink,1);
  return {status:'present',path:file,bytes:total,sha256:digest.digest('hex'),versionExecuted:false};
 }finally{closeSync(fd);}
}
const observations=profiles.map(profile=>{
 const expectedRoots=[path.join(profile,'.lmstudio'),path.join(profile,'.cache','lm-studio')];
 const pointer=path.join(profile,'.lmstudio-home-pointer');let root=expectedRoots[0],pointerSha256=null;
 if(existsSync(pointer)){const raw=small(pointer,2048);root=new TextDecoder('utf8',{fatal:true}).decode(raw).trim();pointerSha256=hash(raw);}
 const result={profile,pointerPresent:existsSync(pointer),pointerSha256,root,rootInReviewedSet:expectedRoots.includes(root),descriptors:[]};
 if(!result.rootInReviewedSet)return result;
 const allowedRoots=[...expectedRoots,path.join(profile,'AppData','Local','Programs','LM Studio')];
 for(const name of ['app-install-location.json','llmster-install-location.json']){
  const file=path.join(root,'.internal',name);
  if(!existsSync(file)){result.descriptors.push({name,status:'absent'});continue;}
  const raw=small(file,16384),value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.path==='string','inventory-descriptor');
  // Only the executable path and aggregate argument count are retained. No unreviewed arguments,
  // environment, profile contents, machine key or credential can enter the output.
  result.descriptors.push({name,status:'present',bytes:raw.length,sha256:hash(raw),
   argumentCount:Array.isArray(value.argv)?value.argv.length:null,executable:executable(value.path,allowedRoots)});
 }
 return result;
});
console.log(JSON.stringify({schemaVersion:'runaai-headless-inventory/v1',observedAt:new Date().toISOString(),
 host:hostname(),readOnly:true,cliExecuted:false,modelsCalled:false,settingsChanged:false,credentialsRead:false,
 privateValuesIncluded:false,observations}));
