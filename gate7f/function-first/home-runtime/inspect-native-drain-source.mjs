// Read only the exact installed public vendor source, never evaluate/import it or access logs,
// settings/credentials. This static string decoder is the same narrow technique used previously.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const bytes=readFileSync('C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\main\\index.js');
const hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,'6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f');
const source=bytes.toString('utf8'),functionAt=source.indexOf('function a0_0x461c()');assert.ok(functionAt>0);
let cursor=source.indexOf('[',functionAt)+1;assert.ok(cursor>functionAt);const values=[];
while(true){
 while(/\s/.test(source[cursor]))cursor++;if(source[cursor]===']'){cursor++;break;}
 assert.equal(source[cursor++],"'");let value='';
 while(true){const char=source[cursor++];assert.ok(char!==undefined);if(char==="'")break;
  if(char!=='\\'){value+=char;continue;}const escaped=source[cursor++];
  if(escaped==='x'||escaped==='u'){const length=escaped==='x'?2:4,hex=source.slice(cursor,cursor+length);assert.match(hex,new RegExp(`^[a-f0-9]{${length}}$`,'i'));value+=String.fromCharCode(parseInt(hex,16));cursor+=length;}
  else{const escapes={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0',"'":"'",'"':'"','\\':'\\','/':'/'};assert.ok(Object.hasOwn(escapes,escaped));value+=escapes[escaped];}
 }
 values.push(value);while(/\s/.test(source[cursor]))cursor++;if(source[cursor]===']'){cursor++;break;}assert.equal(source[cursor++],',');
}
const rotations=[];for(let rotation=0;rotation<values.length;rotation++){
 const n=code=>parseInt(values[(code-0x71+rotation)%values.length]);
 const value=n(0x8866)*(-n(0x665e)/2)+n(0x60b4)/3*(n(0x553f)/4)+n(0x8aa8)/5*(n(0x6a6f)/6)+n(0x7941)/7*(-n(0x8225)/8)+n(0x4135)/9*(n(0xa357)/10)-n(0x797e)/11*(n(0x57b6)/12)+n(0x6490)/13;
 if(value===0xe95cf)rotations.push(rotation);
}
assert.equal(rotations.length,1);const decode=code=>values[(code-0x71+rotations[0])%values.length],aliases=new Set(['a0_0x5f39']);
let added;do{added=false;for(const match of source.matchAll(/\b(_0x[a-f0-9]+)\s*=\s*(a0_0x5f39|_0x[a-f0-9]+)\s*(?=[,;])/g)){
 if(aliases.has(match[2])&&!aliases.has(match[1])){aliases.add(match[1]);added=true;}
}}while(added);
const decoded=source.slice(0,functionAt).replace(/(_0x[a-f0-9]+)\((0x[a-f0-9]+)\)/g,(original,name,code)=>aliases.has(name)?JSON.stringify(decode(parseInt(code,16))):original);
const needles=['justInTimeModelLoading','http-server-config.json','getHttpServerStatus','stopHttpServer','setHttpServerConfig','activeRequests','activePredictions','ongoingPredictions','inFlight','ongoingRequests','getOngoing','handleEmbeddings','closeAllConnections'];
const sections=needles.map(needle=>{const matches=[];let from=0,count=0;while(true){const index=decoded.indexOf(needle,from);if(index<0)break;count++;if(matches.length<3)matches.push({index,code:decoded.slice(Math.max(0,index-450),index+1800)});from=index+needle.length;}return {needle,count,matches};});
console.log(JSON.stringify({schemaVersion:'runaai-native-drain-source-inspection/v1',observedAt:new Date().toISOString(),sourceSha256:hash,
 readOnly:true,vendorCodeExecuted:false,credentialStoreRead:false,settingsRead:false,sourceBytes:bytes.length,rotation:rotations[0],sections}));
