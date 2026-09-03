import {demand,sha} from '../home-runtime/tls-primitives.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};

/**
 * This is a product-capability manifest, not an installer manifest. Null exact pins are
 * intentional fail-closed markers for software that has not been released and qualified.
 * In particular, the historical Home runtime is not a local Code worker release.
 */
export const DEVICE_INSTALL_MANIFEST=freeze({
  schemaVersion:'runaai-device-install-capability-manifest/v1',
  productBoundary:{
    scope:'deterministic-device-readiness-only',
    omenRole:'interactive-browser-seat',
    controlRole:'application-authority-and-server-workspace-orchestrator',
    homeRole:'model-inference-only',
    acceptanceClaim:false
  },
  modes:[
    {
      id:'browser-only',userLabel:'Browser with a remote project',
      qualification:{state:'device-evaluable',reason:null},
      installation:{required:false,privilege:'none',rebootPolicy:'never'},
      execution:{host:'server-isolated-worker',deviceCodeExecution:false,addingFolderGrantsExecution:false},
      components:[
        {id:'supported-browser',required:true,version:{policy:'reported',value:null},hash:{policy:'not-required',value:null},
          signature:{policy:'platform-managed',publisher:null}}
      ],
      capabilities:['secure-browser-session','authenticated-session'],
      network:[{id:'control-https',required:true}],
      enrollment:{kind:'none',required:false,reuseHomeRuntimeTls:false},
      serverWorkspace:{required:true},
      rollback:{available:true,uninstallRequired:false,preservesUserFiles:true,
        steps:['Stop the active task and reconcile any pending server operation.','Disconnect or revoke the project connection in Control.','Sign out of the browser session if this device should no longer have access.']}
    },
    {
      id:'one-time-local-snapshot',userLabel:'One-time local folder snapshot',
      qualification:{state:'device-evaluable',reason:null},
      installation:{required:false,privilege:'none',rebootPolicy:'never'},
      execution:{host:'server-isolated-worker',deviceCodeExecution:false,addingFolderGrantsExecution:false},
      components:[
        {id:'supported-browser',required:true,version:{policy:'reported',value:null},hash:{policy:'not-required',value:null},
          signature:{policy:'platform-managed',publisher:null}}
      ],
      capabilities:['secure-browser-session','authenticated-session','directory-picker','explicit-snapshot-consent','bounded-snapshot-upload'],
      network:[{id:'control-https',required:true},{id:'snapshot-upload',required:true}],
      enrollment:{kind:'none',required:false,reuseHomeRuntimeTls:false},
      serverWorkspace:{required:true},
      rollback:{available:true,uninstallRequired:false,preservesUserFiles:true,
        steps:['Cancel an in-progress upload before retrying.','Expire or delete the server snapshot through its governed Control record.','Discard returned downloads or patches locally if they are no longer wanted.']}
    },
    {
      id:'persistent-local-bridge',userLabel:'Optional persistent local folder bridge',
      qualification:{state:'not-released-or-qualified',reason:'No signed bridge release, exact artifact pins, device enrollment, or uninstall proof is frozen.'},
      installation:{required:true,privilege:'current-user',rebootPolicy:'not-expected'},
      execution:{host:'server-isolated-worker',deviceCodeExecution:false,addingFolderGrantsExecution:false},
      components:[
        {id:'runa-local-folder-bridge',required:true,version:{policy:'exact',value:null},hash:{policy:'exact',value:null},
          signature:{policy:'trusted-publisher',publisher:null}}
      ],
      capabilities:['selected-root-confirmation','hash-guarded-file-transport','bridge-no-code-execution'],
      network:[{id:'control-https',required:true},{id:'device-control-mtls',required:true}],
      enrollment:{kind:'device-bridge-mtls',required:true,reuseHomeRuntimeTls:false},
      serverWorkspace:{required:true},
      rollback:{available:false,uninstallRequired:true,preservesUserFiles:true,
        steps:['Stop new bridge transfers and reconcile any in-flight delta.','Revoke the device enrollment in Control.','Uninstall the exact current-user bridge release when its signed uninstall procedure is qualified.','Preserve local user files and report offline cleanup honestly on reconnect.']}
    },
    {
      id:'fully-local-execution',userLabel:'Fully local or private execution',
      qualification:{state:'deferred-separate-qualification',reason:'No end-user local worker, isolation profile, installation contract, or rollback proof is approved.'},
      installation:{required:true,privilege:'not-yet-qualified',rebootPolicy:'not-yet-qualified'},
      execution:{host:'qualified-local-worker-not-defined',deviceCodeExecution:null,addingFolderGrantsExecution:false},
      components:[
        {id:'runa-local-execution-worker',required:true,version:{policy:'exact',value:null},hash:{policy:'exact',value:null},
          signature:{policy:'trusted-publisher',publisher:null}},
        {id:'local-isolation-provider',required:true,version:{policy:'exact',value:null},hash:{policy:'exact',value:null},
          signature:{policy:'trusted-publisher',publisher:null}},
        {id:'pinned-language-runtime',required:true,version:{policy:'exact',value:null},hash:{policy:'exact',value:null},
          signature:{policy:'trusted-publisher',publisher:null}}
      ],
      capabilities:['explicit-local-execution-consent','isolated-local-execution'],
      network:[],
      enrollment:{kind:'local-worker-enrollment-not-defined',required:true,reuseHomeRuntimeTls:false},
      serverWorkspace:{required:false},
      rollback:{available:false,uninstallRequired:true,preservesUserFiles:true,
        steps:['Disable local routing before stopping the worker.','Drain and reconcile owned operations without blind retry.','Revoke local-worker enrollment when that contract exists.','Uninstall only the exact qualified release while preserving user workspaces.','Return to the server-workspace path without treating it as a restoration of deleted user work.']}
    }
  ]
});

const HASH=/^[a-f0-9]{64}$/;
export function validateDeviceInstallManifest(value){
  demand(exact(value,'modes,productBoundary,schemaVersion')&&value.schemaVersion==='runaai-device-install-capability-manifest/v1','device-manifest-shape');
  demand(exact(value.productBoundary,'acceptanceClaim,controlRole,homeRole,omenRole,scope')
    &&value.productBoundary.scope==='deterministic-device-readiness-only'
    &&value.productBoundary.omenRole==='interactive-browser-seat'
    &&value.productBoundary.controlRole==='application-authority-and-server-workspace-orchestrator'
    &&value.productBoundary.homeRole==='model-inference-only'&&value.productBoundary.acceptanceClaim===false,'device-manifest-boundary');
  demand(Array.isArray(value.modes)&&value.modes.length===4,'device-manifest-modes');
  const ids=new Set();
  for(const mode of value.modes){
    demand(exact(mode,'capabilities,components,enrollment,execution,id,installation,network,qualification,rollback,serverWorkspace,userLabel'),'device-mode-shape');
    demand(['browser-only','one-time-local-snapshot','persistent-local-bridge','fully-local-execution'].includes(mode.id)&&!ids.has(mode.id),'device-mode-id');ids.add(mode.id);
    demand(typeof mode.userLabel==='string'&&mode.userLabel.length>0&&exact(mode.qualification,'reason,state')
      &&['device-evaluable','not-released-or-qualified','deferred-separate-qualification'].includes(mode.qualification.state)
      &&(mode.qualification.reason===null||typeof mode.qualification.reason==='string'&&mode.qualification.reason.length>0),'device-mode-qualification');
    demand(exact(mode.installation,'privilege,rebootPolicy,required')&&typeof mode.installation.required==='boolean'
      &&['none','current-user','not-yet-qualified'].includes(mode.installation.privilege)
      &&['never','not-expected','not-yet-qualified'].includes(mode.installation.rebootPolicy),'device-mode-installation');
    demand(exact(mode.execution,'addingFolderGrantsExecution,deviceCodeExecution,host')&&mode.execution.addingFolderGrantsExecution===false
      &&[false,null].includes(mode.execution.deviceCodeExecution)&&typeof mode.execution.host==='string','device-mode-execution');
    demand(Array.isArray(mode.components)&&mode.components.length>0&&Array.isArray(mode.capabilities)&&new Set(mode.capabilities).size===mode.capabilities.length
      &&mode.capabilities.every(item=>typeof item==='string'&&item.length>0),'device-mode-components');
    const componentIds=new Set();
    for(const component of mode.components){
      demand(exact(component,'hash,id,required,signature,version')&&typeof component.id==='string'&&!componentIds.has(component.id)&&component.required===true,'device-component-shape');componentIds.add(component.id);
      demand(exact(component.version,'policy,value')&&['reported','exact'].includes(component.version.policy)
        &&(component.version.value===null||typeof component.version.value==='string'&&component.version.value.length>0),'device-component-version');
      demand(exact(component.hash,'policy,value')&&['not-required','exact'].includes(component.hash.policy)
        &&(component.hash.value===null||HASH.test(component.hash.value)),'device-component-hash');
      demand(exact(component.signature,'policy,publisher')&&['platform-managed','trusted-publisher'].includes(component.signature.policy)
        &&(component.signature.publisher===null||typeof component.signature.publisher==='string'&&component.signature.publisher.length>0),'device-component-signature');
      if(mode.qualification.state==='device-evaluable')demand(component.version.policy!=='exact'||component.version.value!==null,'device-qualified-version-pin');
      if(mode.qualification.state==='device-evaluable')demand(component.hash.policy!=='exact'||component.hash.value!==null,'device-qualified-hash-pin');
      if(mode.qualification.state==='device-evaluable')demand(component.signature.policy!=='trusted-publisher'||component.signature.publisher!==null,'device-qualified-publisher-pin');
    }
    demand(Array.isArray(mode.network)&&mode.network.every(item=>exact(item,'id,required')&&typeof item.id==='string'&&item.required===true)
      &&new Set(mode.network.map(item=>item.id)).size===mode.network.length,'device-mode-network');
    demand(exact(mode.enrollment,'kind,required,reuseHomeRuntimeTls')&&typeof mode.enrollment.kind==='string'
      &&typeof mode.enrollment.required==='boolean'&&mode.enrollment.reuseHomeRuntimeTls===false,'device-mode-enrollment');
    demand(exact(mode.serverWorkspace,'required')&&typeof mode.serverWorkspace.required==='boolean','device-mode-server-workspace');
    demand(exact(mode.rollback,'available,preservesUserFiles,steps,uninstallRequired')&&typeof mode.rollback.available==='boolean'
      &&typeof mode.rollback.uninstallRequired==='boolean'&&mode.rollback.preservesUserFiles===true
      &&Array.isArray(mode.rollback.steps)&&mode.rollback.steps.length>0&&mode.rollback.steps.every(step=>typeof step==='string'&&step.length>0),'device-mode-rollback');
    if(mode.qualification.state==='device-evaluable')demand(mode.rollback.available===true,'device-qualified-rollback');
  }
  demand(ids.size===4,'device-manifest-modes');
  return value;
}

validateDeviceInstallManifest(DEVICE_INSTALL_MANIFEST);
export const DEVICE_INSTALL_MANIFEST_SHA256=sha(JSON.stringify(DEVICE_INSTALL_MANIFEST));
