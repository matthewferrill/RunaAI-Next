import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {caddyfile} from '../../../../gate7a/lan-release.mjs';
import {sha256} from '../../../../gate4/canonical.mjs';
import {qualifiedDeploymentFixture} from '../../deployment.fixtures.mjs';
import {APPLICATION,HEALTH_EXPRESSION,buildCaddyProjection,assertCaddyProjection,createConfigurationProjection,qualifyAssemblyProjection} from './assembly.mjs';

export const enrollment=()=>({schemaVersion:'runaai-control-tls-enrollment/v1',enrollmentId:'a'.repeat(32),caSha256:'1'.repeat(64),
  serverCertificateSha256:'2'.repeat(64),clientCertificateSha256:'3'.repeat(64),serverName:'runa-home-m1.internal',
  clientExpiresAt:'2099-01-01T00:00:00.000Z',privateMaterialIncluded:false,activated:false});
const input=()=>({originalBytes:Buffer.from(caddyfile),enrollment:enrollment(),transitionId:'b'.repeat(32)});
function configuration(){const fixture=qualifiedDeploymentFixture();fixture.successor.functionFirst.qdrant.endpoint='http://127.0.0.1:9774';
  fixture.successor.functionFirst.reranker.baseUrl='http://127.0.0.1:9770';
  return {prior:fixture.prior,provider:fixture.successor.provider,functionFirst:fixture.successor.functionFirst,
    caddyConfigurationDigest:'d'.repeat(64),acceptanceGradesSha256:'e'.repeat(64)};}

test('pure provider projection preserves every non-provider byte and exact TLS paths/timeouts',()=>{
  const original=input(),before=Buffer.from(original.originalBytes),projection=buildCaddyProjection(original);
  const cut=caddyfile.indexOf('http://127.0.0.1:9770');assert.equal(projection.finalBytes.subarray(0,cut).toString(),caddyfile.slice(0,cut));
  assert.deepEqual(original.originalBytes,before);assert.equal(projection.originalSha256,sha256(before));
  const text=projection.finalBytes.toString();assert.ok(!text.includes('http://192.168.50.165:1234'));
  for(const token of ['https://192.168.50.165:9776','tls_server_name runa-home-m1.internal','tls_timeout 10s',
    'response_header_timeout 65s','dial_timeout 10s','lb_retries 0','\\client.pem','\\client-key.pem','\\ca.pem'])assert.ok(text.includes(token),token);
  assert.ok(!text.includes('tls_insecure_skip_verify'));assert.ok(!text.includes('BEGIN PRIVATE KEY'));
});
test('closed candidate adds exact GET readiness/framing prefilter before provider maintenance',()=>{
  const {candidateClosedBytes,fullyClosedBytes}=buildCaddyProjection(input());
  const text=candidateClosedBytes.toString();assert.equal((text.match(/expression /gu)??[]).length,1);
  assert.ok(text.includes(HEALTH_EXPRESSION));assert.ok(!fullyClosedBytes.toString().includes(HEALTH_EXPRESSION));
  assert.ok(text.includes('/api/* /health/*'));assert.ok(text.includes('handle_path /auth/*'));
  assert.ok(text.indexOf('reverse_proxy @runa_m1_health_')<text.lastIndexOf('respond @runa_m1_maintenance_'));
});
test('raw CRLF predecessor bytes remain CRLF outside the replaced provider block',()=>{
  const value=input();value.originalBytes=Buffer.from(caddyfile.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
  const projection=buildCaddyProjection(value);assert.ok(!projection.finalBytes.toString().replaceAll('\r\n','').includes('\n'));
});
test('Caddy binding is reconstructed from the exact original, not self-consistent supplied hashes',()=>{
  const value=buildCaddyProjection(input());assert.deepEqual(assertCaddyProjection(value,enrollment()),value);
  value.finalBytes=Buffer.from(value.finalBytes.toString().replace('tls_timeout 10s','tls_timeout 99s'));
  value.finalSha256=sha256(value.finalBytes);assert.throws(()=>assertCaddyProjection(value,enrollment()),/caddy-binding/u);
});
for(const mutate of [v=>v.originalBytes=Buffer.from(caddyfile.replace('http://192.168.50.165:1234','http://other:1234')),
  v=>v.originalBytes=Buffer.concat([v.originalBytes,Buffer.from('http://127.0.0.1:9770 {}\n')]),
  v=>v.enrollment.enrollmentId='..\\secrets',v=>v.enrollment.serverName='other',v=>v.enrollment.clientExpiresAt='2000-01-01',
  v=>v.enrollment.privateMaterialIncluded=true,v=>v.enrollment.key='secret']){
  test('unknown provider/TLS preimage or unsafe enrollment is denied '+String(mutate),()=>{const value=input();mutate(value);assert.throws(()=>buildCaddyProjection(value),/m1-assembly-/u);});
}
test('configuration projection changes only enumerated M1 data and does not imply qualification',()=>{
  const value=configuration(),before=structuredClone(value),result=createConfigurationProjection(value);
  assert.deepEqual(value,before);assert.equal(result.qualified,false);assert.equal(result.plan.runtimeSealSha256,APPLICATION.runtimeSealSha256);
  for(const key of ['gate7a','keyRefs','keycloak','openfga','limits','databaseUrlRef','sourceGeneration'])assert.deepEqual(result.successor[key],value.prior[key],key);
});
for(const mutate of [v=>v.provider.models.code='qwen3-coder-30b-a3b-instruct',v=>v.provider.baseUrl='http://127.0.0.1:1234/v1',
  v=>v.functionFirst.reranker.baseUrl='http://192.168.50.165:8412',v=>v.functionFirst.qdrant.endpoint='http://127.0.0.1:9773',
  v=>v.functionFirst.embedding.baseUrl='http://192.168.50.165:1234/v1',v=>v.prior.limits.totalDeadlineMs=120000]){
  test('mixed primary, bypass route or deadline widening is denied '+String(mutate),()=>{const value=configuration();mutate(value);assert.throws(()=>createConfigurationProjection(value));});
}
test('synthetic verifier fixture cannot qualify the frozen real runtime seal',()=>{
  const fixture=qualifiedDeploymentFixture();assert.throws(()=>qualifyAssemblyProjection({...fixture.inputs(),homeProfile:{},enrollment:enrollment(),caddy:{}}),/m1-assembly-runtime-seal/u);
});
test('pinned Caddy offline adaptation accepts mTLS and literal closed-candidate routing',()=>{
  const binary=process.env.M1_CADDY_BINARY??(existsSync('D:\\Projects\\Runalab\\artifacts\\tools\\caddy\\bin\\caddy.exe')
    ?'D:\\Projects\\Runalab\\artifacts\\tools\\caddy\\bin\\caddy.exe':'C:\\AI\\RunaAI-Next-Candidate\\tools\\caddy\\caddy.exe');
  assert.equal(sha256(readFileSync(binary)),APPLICATION.caddyBinarySha256);
  const value=buildCaddyProjection(input());
  for(const bytes of [value.initialClosedBytes,value.finalBytes,value.fullyClosedBytes,value.candidateClosedBytes]){
    const result=spawnSync(binary,['adapt','--config','-','--adapter','caddyfile'],{input:bytes,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:2*1024*1024});
    assert.equal(result.status,0,result.stderr);const config=JSON.parse(result.stdout);
    if(bytes!==value.initialClosedBytes)assert.ok(JSON.stringify(config).includes('runa-home-m1.internal'));
    if(bytes===value.candidateClosedBytes){
      const provider=Object.values(config.apps.http.servers).find(server=>server.listen.includes('127.0.0.1:9770'));
      const literal=provider.routes[0].handle[0].routes[0].handle[0].routes;
      assert.equal(literal[0].match[0].expression.expr,HEALTH_EXPRESSION);
      assert.equal(literal[0].handle[0].handler,'reverse_proxy');assert.equal(literal[1].handle[0].status_code,503);
      assert.deepEqual(literal[1].match[0].path,['*']);assert.equal(literal[2].handle[0].handler,'subroute');
      const transport=literal[0].handle[0].transport;
      assert.equal(transport.response_header_timeout,65000000000);assert.equal(transport.tls.handshake_timeout,10000000000);
      assert.deepEqual(transport.versions,['1.1']);assert.equal(transport.tls.server_name,'runa-home-m1.internal');
      const allRoutes=[];const collect=node=>{if(!node||typeof node!=='object')return;if(node.routes)allRoutes.push(...node.routes);for(const child of Object.values(node))collect(child);};
      collect(config);assert.equal(allRoutes.filter(route=>route.match?.[0]?.expression).length,1);
    }
  }
});
