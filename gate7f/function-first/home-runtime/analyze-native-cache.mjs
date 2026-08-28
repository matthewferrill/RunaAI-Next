// Offline literal-string inspection of the pinned public vendor bundle. Never import/evaluate it.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const pin='6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f';
const directory=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness/native-source-cache');
assert.equal(readFileSync(path.join(directory,'.gitignore'),'utf8').trim(),'*');
const bytes=readFileSync(path.join(directory,pin+'.bin'));assert.equal(sha(bytes),pin);assert.equal(bytes.length,24258428);
const source=bytes.toString('utf8'),functionAt=source.indexOf('function a0_0x461c()');assert.ok(functionAt>0);
let cursor=source.indexOf('[',functionAt)+1;assert.ok(cursor>functionAt);const values=[];
while(true){
  while(/\s/.test(source[cursor]))cursor++;if(source[cursor]===']'){cursor++;break;}
  assert.equal(source[cursor++],"'");let value='';
  while(true){const char=source[cursor++];assert.ok(char!==undefined);if(char==="'")break;
    if(char!=='\\'){value+=char;continue;}const escaped=source[cursor++];
    if(escaped==='x'||escaped==='u'){const length=escaped==='x'?2:4,hex=source.slice(cursor,cursor+length);
      assert.match(hex,new RegExp(`^[a-f0-9]{${length}}$`,'i'));value+=String.fromCharCode(parseInt(hex,16));cursor+=length;}
    else{const escapes={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0',"'":"'",'"':'"','\\':'\\','/':'/'};
      assert.ok(Object.hasOwn(escapes,escaped));value+=escapes[escaped];}
  }
  values.push(value);while(/\s/.test(source[cursor]))cursor++;
  if(source[cursor]===']'){cursor++;break;}assert.equal(source[cursor++],',');
}
const rotations=[];for(let rotation=0;rotation<values.length;rotation++){
  const n=code=>parseInt(values[(code-0x71+rotation)%values.length]);
  const value=n(0x8866)*(-n(0x665e)/2)+n(0x60b4)/3*(n(0x553f)/4)+n(0x8aa8)/5*(n(0x6a6f)/6)+n(0x7941)/7*(-n(0x8225)/8)
    +n(0x4135)/9*(n(0xa357)/10)-n(0x797e)/11*(n(0x57b6)/12)+n(0x6490)/13;
  if(value===0xe95cf)rotations.push(rotation);
}
assert.deepEqual(rotations,[104]);const decode=code=>values[(code-0x71+104)%values.length],aliases=new Set(['a0_0x5f39']);
let added;do{added=false;for(const match of source.matchAll(/\b(_0x[a-f0-9]+)\s*=\s*(a0_0x5f39|_0x[a-f0-9]+)\s*(?=[,;])/g)){
  if(aliases.has(match[2])&&!aliases.has(match[1])){aliases.add(match[1]);added=true;}
}}while(added);
const decoded=source.slice(0,functionAt).replace(/(_0x[a-f0-9]+)\((0x[a-f0-9]+)\)/g,
  (original,name,code)=>aliases.has(name)?JSON.stringify(decode(parseInt(code,16))):original);
const decodedFile=path.join(directory,pin+'.decoded.txt');
if(existsSync(decodedFile))assert.equal(sha(readFileSync(decodedFile)),sha(decoded));
else writeFileSync(decodedFile,decoded,{flag:'wx'});
const args=process.argv.slice(2);let sections;
if(args[0]==='--at'){
  assert.equal(args.length,3);const [start,length]=args.slice(1).map(Number);
  assert.ok(Number.isSafeInteger(start)&&start>=0&&start<decoded.length&&Number.isSafeInteger(length)&&length>0&&length<=12000);
  sections=[{index:start,code:decoded.slice(start,start+length)}];
}else{
  assert.ok(args.length>0&&args.length<=6&&args.every(value=>/^[A-Za-z][A-Za-z0-9]{1,80}$/.test(value)));
  sections=args.map(needle=>{const offsets=[];let from=0;while(true){const index=decoded.indexOf(needle,from);if(index<0)break;
    offsets.push(index);from=index+needle.length;}
    return {needle,count:offsets.length,offsets:offsets.slice(0,150),matches:offsets.slice(0,2).map(index=>({index,
      code:decoded.slice(Math.max(0,index-250),index+1800)}))};});
}
console.log(JSON.stringify({sourceSha256:pin,decodedSha256:sha(decoded),readOnlyVendor:true,vendorCodeExecuted:false,
  cacheOnly:true,rotation:104,sections}));
