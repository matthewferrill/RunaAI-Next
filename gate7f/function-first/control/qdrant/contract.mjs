import {createHash} from 'node:crypto';
export const CONTRACT=Object.freeze({
  schemaVersion:'runaai-m1-qdrant-package/v1',
  root:'C:\\AI\\RunaAI-Next-Candidate\\m1-qdrant',
  taskPath:'\\RunaAI-Next\\',taskName:'M1-Qdrant',serviceSid:'S-1-5-19',
  host:'127.0.0.1',httpPort:9774,grpcPort:9775,
  version:'1.19.0',binaryBytes:84184576,
  binarySha256:'369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4',
});
export const SOURCE_FILES=Object.freeze(['Common-M1Qdrant.ps1','Run-M1Qdrant.ps1',
  'Install-ControlM1Qdrant.ps1','Start-ControlM1Qdrant.ps1','Rollback-ControlM1Qdrant.ps1']);
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function configuration(){
  const state=CONTRACT.root.replaceAll('\\','/')+'/state';
  return `log_level: ERROR\ntelemetry_disabled: true\nservice:\n  host: 127.0.0.1\n  http_port: 9774\n  grpc_port: 9775\n  max_request_size_mb: 8\n  max_workers: 2\n  enable_cors: false\n  enable_tls: false\n  enable_snapshot_url_recovery: false\ncluster:\n  enabled: false\nstorage:\n  storage_path: "${state}/storage"\n  snapshots_path: "${state}/snapshots"\n  temp_path: "${state}/tmp"\n  snapshots_config:\n    snapshots_storage: local\n  performance:\n    max_search_threads: 2\n    optimizer_cpu_budget: 2\n`;
}
export function validatePackage(manifest,files){
  for(const[key,value]of Object.entries(CONTRACT))if(manifest?.[key]!==value)throw Error('m1-qdrant-contract-drift');
  if(Object.keys(manifest).sort().join()!==[...Object.keys(CONTRACT),'files'].sort().join())throw Error('m1-qdrant-manifest-fields');
  const names=[...SOURCE_FILES,'qdrant.exe','qdrant.yaml'].sort();
  if(!Array.isArray(manifest.files)||manifest.files.map(f=>f.name).sort().join()!==names.join())throw Error('m1-qdrant-manifest-files');
  for(const file of manifest.files){
    if(Object.keys(file).sort().join()!=='bytes,name,sha256'||!Number.isSafeInteger(file.bytes)||file.bytes<=0||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('m1-qdrant-file-shape');
    const bytes=files[file.name];if(!Buffer.isBuffer(bytes)||bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('m1-qdrant-file-drift');
  }
  if(files['qdrant.exe'].length!==CONTRACT.binaryBytes||sha(files['qdrant.exe'])!==CONTRACT.binarySha256)throw Error('m1-qdrant-binary-drift');
  if(files['qdrant.yaml'].toString('utf8')!==configuration())throw Error('m1-qdrant-config-drift');
  return manifest;
}
