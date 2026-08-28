import {createHash} from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '['+value.map(canonical).join(',')+']'
  : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export const configDigest = value => digest(canonical(value));
export const fail = code => Object.assign(new Error(code), {code});
const clone = value => structuredClone(value);

// Tokens preserve byte offsets. Only standalone braces are structural; quoted
// text/comments and Caddy placeholders must not change site-block boundaries.
function tokens(text) {
  const result=[]; let index=0;
  while(index<text.length){
    if(/\s/u.test(text[index])){index++;continue;}
    if(text[index]==='#'){while(index<text.length&&text[index]!=='\n')index++;continue;}
    const start=index; let quote=null;
    if(text[index]==='"'||text[index]==='`'){quote=text[index++];
      while(index<text.length){if(quote==='"'&&text[index]==='\\'){index+=2;continue;}if(text[index++]===quote){quote=null;break;}}
      if(quote)throw fail('quiescence-caddyfile-quote-invalid');
    }else while(index<text.length&&!/\s/u.test(text[index]))index++;
    result.push({value:text.slice(start,index),start,end:index});
  }
  return result;
}
export function buildAdmissionOverlay({originalBytes,scopes,transitionId}){
  if(!Buffer.isBuffer(originalBytes)||originalBytes.length>1_048_576||!/^[a-f0-9]{32}$/u.test(transitionId)
    ||!Array.isArray(scopes)||!scopes.length||scopes.length>8)throw fail('quiescence-input-invalid');
  const text=originalBytes.toString('utf8');
  if(!Buffer.from(text).equals(originalBytes)||text.includes('runa_m1_maintenance_'))throw fail('quiescence-caddyfile-invalid');
  const selected=new Map();
  for(const scope of scopes){
    if(!scope||!/^https?:\/\/[a-z0-9.:-]+$/iu.test(scope.siteAddress)||!['api','all'].includes(scope.mode)
      ||selected.has(scope.siteAddress))throw fail('quiescence-scope-invalid');
    selected.set(scope.siteAddress,clone(scope));
  }
  const all=tokens(text),insertions=[];let depth=0,header=[];
  for(const token of all){
    if(depth===0&&token.value==='import')throw fail('quiescence-external-import-denied');
    if(token.value==='{'){
      if(depth===0){const names=header.flatMap(item=>item.value.split(',')).filter(Boolean);header=[];
        const matches=names.filter(name=>selected.has(name));
        if(matches.length){if(matches.length!==1||names.length!==1)throw fail('quiescence-shared-site-denied');
          const scope=selected.get(matches[0]);if(scope.used)throw fail('quiescence-duplicate-site');scope.used=true;
          const eol=text.includes('\r\n')?'\r\n':'\n',name='runa_m1_maintenance_'+transitionId;
          insertions.push({offset:token.end,text:[``, `  @${name} path ${scope.mode==='all'?'*':'/api/* /health/*'}`,
            `  handle @${name} {`, `    respond "Runa maintenance ${transitionId}" 503`, `  }`].join(eol)});
        }
      }
      depth++;
    }else if(token.value==='}') {if(--depth<0)throw fail('quiescence-caddyfile-braces-invalid');if(depth===0)header=[];}
    else if(depth===0)header.push(token);
  }
  if(depth||[...selected.values()].some(value=>!value.used))throw fail('quiescence-site-missing');
  let changed=text;for(const insertion of insertions.reverse())changed=changed.slice(0,insertion.offset)+insertion.text+changed.slice(insertion.offset);
  return Buffer.from(changed);
}

function assertCounters(raw,addresses){
  if(!Array.isArray(raw))throw fail('quiescence-counter-invalid');
  return addresses.map(address=>{const matching=raw.filter(item=>item.address===address);
    if(matching.length!==1)throw fail('quiescence-counter-missing');
    const value=matching[0].num_requests;if(!Number.isSafeInteger(value)||value<0)throw fail('quiescence-counter-invalid');
    return {address,num_requests:value};});
}

// file.compareAndSwap must enforce an exclusive write lease/CAS itself. journal
// is an owner-controlled operator journal, not a new product-record authority.
// No method invokes Home, changes a model or declares native Home work idle.
export class CaddyQuiescenceCoordinator {
  constructor({admin,file,journal,clock=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
    maximumDrainMs=70000,pollMs=250,stableSamples=3}){
    if(!admin||!file||!journal||maximumDrainMs<1||maximumDrainMs>70000||pollMs<1||pollMs>5000
      ||!Number.isSafeInteger(stableSamples)||stableSamples<2||stableSamples>10)throw fail('quiescence-constructor-invalid');
    Object.assign(this,{admin,file,journal,clock,pause,maximumDrainMs,pollMs,stableSamples});
  }
  async record(state,phase,detail={}){
    state.phase=phase;state.events.push({phase,at:new Date(this.clock()).toISOString(),...detail});
    await this.journal.save(clone(state));return clone(state);
  }
  validate(state){
    if(state?.schemaVersion!=='runaai-caddy-quiescence/v1'||!Array.isArray(state.events))throw fail('quiescence-state-invalid');
    const original=Buffer.from(state.originalBase64,'base64'),overlay=Buffer.from(state.overlayBase64,'base64');
    if(digest(original)!==state.originalSha256||digest(overlay)!==state.overlaySha256
      ||configDigest(state.originalConfig)!==state.originalConfigSha256||configDigest(state.overlayConfig)!==state.overlayConfigSha256
      ||!buildAdmissionOverlay({originalBytes:original,scopes:clone(state.scopes),transitionId:state.transitionId}).equals(overlay)
      ||!Array.isArray(state.upstreams)||!state.upstreams.length||new Set(state.upstreams).size!==state.upstreams.length)throw fail('quiescence-state-drift');
  }
  async prepare({transitionId,expectedFileSha256,expectedConfigSha256,scopes,upstreams}){
    if(!Array.isArray(upstreams)||!upstreams.length||upstreams.some(value=>typeof value!=='string')||new Set(upstreams).size!==upstreams.length)throw fail('quiescence-upstreams-invalid');
    const original=await this.file.read(),current=await this.admin.snapshot();
    if(digest(original)!==expectedFileSha256||configDigest(current.config)!==expectedConfigSha256)throw fail('quiescence-predecessor-drift');
    const overlay=buildAdmissionOverlay({originalBytes:original,scopes:clone(scopes),transitionId});
    const adaptedOriginal=await this.admin.adapt(original),adaptedOverlay=await this.admin.adapt(overlay);
    if(configDigest(adaptedOriginal)!==expectedConfigSha256)throw fail('quiescence-file-runtime-drift');
    const counters=assertCounters(await this.admin.upstreams(),upstreams);
    const state={schemaVersion:'runaai-caddy-quiescence/v1',transitionId,scopes:clone(scopes),upstreams:[...upstreams],
      originalBase64:original.toString('base64'),overlayBase64:overlay.toString('base64'),originalSha256:digest(original),overlaySha256:digest(overlay),
      originalConfig:clone(current.config),overlayConfig:adaptedOverlay,originalConfigSha256:expectedConfigSha256,
      overlayConfigSha256:configDigest(adaptedOverlay),phase:'prepared',events:[],scope:'selected-caddy-proxied-requests-only',homeQuiescenceProved:false};
    return this.record(state,'prepared',{counters});
  }
  async observe(state,options={}){
    this.validate(state);const [bytes,current]=await Promise.all([this.file.read(),this.admin.snapshot(options)]);
    return {fileSha256:digest(bytes),configSha256:configDigest(current.config),etag:current.etag};
  }
  async closeAdmission(input){
    const state=clone(input);this.validate(state);if(state.phase!=='prepared')throw fail('quiescence-phase-invalid');
    const before=await this.observe(state);
    if(before.fileSha256!==state.originalSha256||before.configSha256!==state.originalConfigSha256)throw fail('quiescence-predecessor-drift');
    await this.record(state,'admission-intent');
    await this.file.compareAndSwap(state.originalSha256,Buffer.from(state.overlayBase64,'base64'));
    // Re-read the actual ETag after the file write. A concurrent runtime writer
    // must not be replaced even if the on-disk predecessor was still current.
    const actual=await this.admin.snapshot();
    if(configDigest(actual.config)!==state.originalConfigSha256){await this.record(state,'needs-reconciliation',{errorCode:'quiescence-runtime-drift'});throw fail('quiescence-runtime-drift');}
    if(digest(await this.file.read())!==state.overlaySha256){await this.record(state,'needs-reconciliation',{errorCode:'quiescence-file-drift'});throw fail('quiescence-file-drift');}
    let acknowledgementLost=false;
    try{await this.admin.replace({config:state.overlayConfig,etag:actual.etag});}
    catch{acknowledgementLost=true;}
    const after=await this.observe(state);
    if(after.fileSha256!==state.overlaySha256||after.configSha256!==state.overlayConfigSha256){
      await this.record(state,'needs-reconciliation',{errorCode:'quiescence-reload-uncertain'});throw fail('quiescence-reload-uncertain');}
    const counters=assertCounters(await this.admin.upstreams(),state.upstreams);
    return this.record(state,'admission-closed',{acknowledgementLost,counters});
  }
  async reconcile(input){
    const state=clone(input),actual=await this.observe(state);
    if(actual.fileSha256===state.overlaySha256&&actual.configSha256===state.overlayConfigSha256){
      assertCounters(await this.admin.upstreams(),state.upstreams);return this.record(state,'admission-closed',{reconciled:true});}
    if(actual.fileSha256===state.originalSha256&&actual.configSha256===state.originalConfigSha256
      &&['prepared','restored','restore-intent'].includes(state.phase))return this.record(state,'restored',{reconciled:true});
    // In particular, original runtime after a timed-out reload is NOT proof the
    // server will never finish that prior request. Do not resend or roll it back.
    return this.record(state,'needs-reconciliation',{actual});
  }
  async drain(input){
    const state=clone(input);this.validate(state);if(state.phase!=='admission-closed')throw fail('quiescence-phase-invalid');
    const deadline=this.clock()+this.maximumDrainMs;let stable=0;
    while(this.clock()<deadline){
      const actual=await this.observe(state,{maximumMs:Math.max(1,deadline-this.clock())});
      if(this.clock()>=deadline)break;
      if(actual.fileSha256!==state.overlaySha256||actual.configSha256!==state.overlayConfigSha256)throw fail('quiescence-admission-drift');
      const counters=assertCounters(await this.admin.upstreams({maximumMs:Math.max(1,deadline-this.clock())}),state.upstreams);
      if(this.clock()>=deadline)break;
      stable=counters.every(value=>value.num_requests===0)?stable+1:0;
      await this.record(state,'admission-closed',{counters,stableZeroSamples:stable});
      if(this.clock()>=deadline)break;
      if(stable>=this.stableSamples)return this.record(state,'control-quiescent',{stableZeroSamples:stable});
      await this.pause(Math.min(this.pollMs,Math.max(0,deadline-this.clock())));
    }
    await this.record(state,'drain-timeout');
    await this.rollback(state);
    throw fail('quiescence-drain-timeout');
  }
  async rollback(input){
    const state=clone(input);this.validate(state);
    // A timed-out reload can still commit later. Do not "restore" its file while
    // the pending runtime effect is unresolved, even when both digests look known.
    if(!['prepared','admission-closed','control-quiescent','drain-timeout','restored'].includes(state.phase))throw fail('quiescence-reconcile-required');
    const actual=await this.observe(state);
    if(![state.originalSha256,state.overlaySha256].includes(actual.fileSha256)
      ||![state.originalConfigSha256,state.overlayConfigSha256].includes(actual.configSha256))throw fail('quiescence-rollback-drift');
    await this.record(state,'restore-intent');
    if(actual.configSha256===state.overlayConfigSha256){
      try{await this.admin.replace({config:state.originalConfig,etag:actual.etag});}catch{}
      const observed=await this.admin.snapshot();
      if(configDigest(observed.config)!==state.originalConfigSha256){await this.record(state,'needs-reconciliation',{errorCode:'quiescence-restore-uncertain'});throw fail('quiescence-restore-uncertain');}
    }
    if(actual.fileSha256===state.overlaySha256)await this.file.compareAndSwap(state.overlaySha256,Buffer.from(state.originalBase64,'base64'));
    const after=await this.observe(state);
    if(after.fileSha256!==state.originalSha256||after.configSha256!==state.originalConfigSha256)throw fail('quiescence-rollback-drift');
    return this.record(state,'restored');
  }
}
