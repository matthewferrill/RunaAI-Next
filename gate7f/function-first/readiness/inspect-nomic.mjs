// Read-only metadata/static-runtime inspection. No model load, tokenize, embed or inference call.
import {openSync,closeSync,readSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
if(hostname().toUpperCase()!=='RUNA-HOME')throw Error('nomic-inspect-host');
const file='C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\bin\\bundled-models\\nomic-ai\\nomic-embed-text-v1.5-GGUF\\nomic-embed-text-v1.5.Q4_K_M.gguf';
const fd=openSync(file,'r');let offset=0;
function take(n){if(!Number.isSafeInteger(n)||n<0||offset+n>134217728)throw Error('nomic-inspect-bounds');const b=Buffer.alloc(n);if(readSync(fd,b,0,n,offset)!==n)throw Error('nomic-inspect-short');offset+=n;return b;}
const u32=()=>take(4).readUInt32LE(),u64=()=>Number(take(8).readBigUInt64LE());
function str(keep){const n=u64();const b=take(n);return keep?b.toString('utf8'):null;}
function value(type,keep,depth=0){
 if(depth>3)throw Error('nomic-inspect-depth');
 if(type===8)return str(keep);
 if(type===9){const subtype=u32(),count=u64();if(count>10000000)throw Error('nomic-inspect-array');const summary={arrayType:subtype,count};
  if(keep&&subtype===8){summary.emptyTokens=0;summary.bareContinuation=0;summary.phantomSpaceOnly=0;for(let i=0;i<count;i++){const s=value(subtype,true,depth+1);if(s==='')summary.emptyTokens++;if(s==='##')summary.bareContinuation++;if(s==='\u2581')summary.phantomSpaceOnly++;}}
  else for(let i=0;i<count;i++)value(subtype,false,depth+1);return keep?summary:null;}
 const spec={0:[1,'readUInt8'],1:[1,'readInt8'],2:[2,'readUInt16LE'],3:[2,'readInt16LE'],4:[4,'readUInt32LE'],5:[4,'readInt32LE'],6:[4,'readFloatLE'],7:[1,'readUInt8'],10:[8,'readBigUInt64LE'],11:[8,'readBigInt64LE'],12:[8,'readDoubleLE']}[type];
 if(!spec)throw Error('nomic-inspect-type');const b=take(spec[0]);return keep?Number(b[spec[1]](0)):null;
}
let metadata;
try{if(take(4).toString()!=='GGUF'||u32()!==3)throw Error('nomic-inspect-format');const tensors=u64(),count=u64(),selected={};if(count>100000)throw Error('nomic-inspect-count');
 for(let i=0;i<count;i++){const key=str(true),type=u32(),keep=/^(general\.(name|architecture)|tokenizer\.|.*\.(context_length|embedding_length|pooling_type))/.test(key);const v=value(type,keep);if(keep)selected[key]=v;}
 metadata={path:file,tensors,metadataCount:count,metadataBytes:offset,selected};
}finally{closeSync(fd);}
const indexPath='C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\main\\index.js';
const index=readFileSync(indexPath),text=index.toString('utf8'),snippets=[];
for(const term of ['/v1/embeddings','/api/v0/embeddings','Input too long','truncateToFitContext','tokenize']){
 let from=0,count=0;while(count<4){const at=text.indexOf(term,from);if(at<0)break;snippets.push({term,offset:at});from=at+term.length;count++;}
}
console.log(JSON.stringify({schemaVersion:'runa-m1-nomic-static-inspection/v1',time:new Date().toISOString(),readOnly:true,
 inferenceCalled:false,metadata,indexPath,indexSha256:createHash('sha256').update(index).digest('hex'),snippets},null,2));
