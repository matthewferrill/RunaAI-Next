// Read-only static inspection of one exact installed vendor source. Never imports or executes it.
// Parse only its literal string array and reproduce its public index rotation arithmetic.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const file='C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\main\\index.js';
const bytes=readFileSync(file),sourceSha256=createHash('sha256').update(bytes).digest('hex');
assert.equal(sourceSha256,'6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f');
const source=bytes.toString('utf8'),functionAt=source.indexOf('function a0_0x461c()');assert.ok(functionAt>0);
let cursor=source.indexOf('[',functionAt)+1;assert.ok(cursor>functionAt);const values=[];
while(true){
  while(/\s/.test(source[cursor]))cursor++;if(source[cursor]===']'){cursor++;break;}
  assert.equal(source[cursor++],"'");let value='';
  while(true){const char=source[cursor++];assert.ok(char!==undefined);if(char==="'")break;
    if(char!=='\\'){value+=char;continue;}const escaped=source[cursor++];
    if(escaped==='x'||escaped==='u'){const length=escaped==='x'?2:4,hex=source.slice(cursor,cursor+length);
      assert.match(hex,new RegExp(`^[a-f0-9]{${length}}$`,'i'));value+=String.fromCharCode(parseInt(hex,16));cursor+=length;
    }else {const escapes={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0',"'":"'",'"':'"','\\':'\\','/':'/'};
      assert.ok(Object.hasOwn(escapes,escaped));value+=escapes[escaped];}
  }
  values.push(value);while(/\s/.test(source[cursor]))cursor++;
  if(source[cursor]===']'){cursor++;break;}assert.equal(source[cursor++],',');
}
const matches=[];
for(let rotation=0;rotation<values.length;rotation++){
  const n=code=>parseInt(values[(code-0x71+rotation)%values.length]);
  const result=n(0x8866)*(-n(0x665e)/2)+n(0x60b4)/3*(n(0x553f)/4)+n(0x8aa8)/5*(n(0x6a6f)/6)
    +n(0x7941)/7*(-n(0x8225)/8)+n(0x4135)/9*(n(0xa357)/10)-n(0x797e)/11*(n(0x57b6)/12)+n(0x6490)/13;
  if(result===0xe95cf)matches.push(rotation);
}
assert.equal(matches.length,1);const rotation=matches[0];
const decode=code=>values[(code-0x71+rotation)%values.length];
const aliases=new Set(['a0_0x5f39']);let added;
do {added=false;for(const match of source.matchAll(/\b(_0x[a-f0-9]+)\s*=\s*(a0_0x5f39|_0x[a-f0-9]+)\s*(?=[,;])/g)){
  if(aliases.has(match[2])&&!aliases.has(match[1])){aliases.add(match[1]);added=true;}
}}while(added);
// Transform only identifiers assigned to the lookup decoder, not arbitrary webpack require calls.
// Output remains a static reading aid, not evaluated JavaScript or a complete semantic decompiler.
const decodeSnippet=text=>text.replace(/(_0x[a-f0-9]+)\((0x[a-f0-9]+)\)/g,(original,name,code)=>aliases.has(name)?JSON.stringify(decode(parseInt(code,16))):original);
const checkAt=source.indexOf("['checkPermissionRequestAgainstGrant']");assert.ok(checkAt>0);
const checkEnd=source.indexOf("['checkPermission']",checkAt);assert.ok(checkEnd>checkAt);
const schemaAt=source.indexOf("'dynamicRemoteMcpServer':",source.indexOf('0x58f989'));
const decoded=decodeSnippet(source.slice(0,functionAt));
const routes=['["handleLoadModel"]=','["handleUnloadModel"]=','["handlePostModelsDownload"]=','["createTokenAuthEvaluationMiddleware"]=','["post"]("/models/load"'];
const routeSnippets=routes.map(route=>{const at=decoded.indexOf(route);return {route,offset:at,snippet:at<0?null:decoded.slice(Math.max(0,at-300),at+2200)};});
const handlerChecks=routes.slice(0,3).map(route=>{
  const at=decoded.indexOf(route);assert.ok(at>0);
  const next=decoded.slice(at).search(/\},0x[a-f0-9]+:\(/);assert.ok(next>0);
  const body=decoded.slice(at,at+next);
  return {handler:route,decodedCharacters:body.length,permissionCheckMentions:(body.match(/checkPermission|getAuthContext|clientIdentifier|tokenMode/g)??[]).length,
    internalClient:body.includes('lmstudioClientProvider'),decodedSha256:createHash('sha256').update(body).digest('hex')};
});
console.log(JSON.stringify({schemaVersion:'runaai-lmstudio-permissions-static/v1',observedAt:new Date().toISOString(),
  sourceSha256,readOnly:true,vendorCodeExecuted:false,credentialStoreRead:false,sourceBytes:bytes.length,stringCount:values.length,
  rotation,permissionSwitch:decodeSnippet(source.slice(checkAt,checkEnd)),
  permissionGrantSchema:decodeSnippet(source.slice(schemaAt,schemaAt+1500)),handlerChecks,routeSnippets}));
