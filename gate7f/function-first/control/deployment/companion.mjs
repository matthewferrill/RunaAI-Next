import {sha256} from '../../../../gate4/canonical.mjs';
import {APPLICATION,demand} from './assembly.mjs';

function replaceOnce(text,before,after){
  demand(text.split(before).length===2,'companion-marker-drift');return text.replace(before,()=>after);
}

/** Pure checked derivation of the existing deployer, not a second app release.
 * Inputs are raw bytes. Caller packages these operator-only files at the same
 * relative layout and authenticates returned hashes before any later execution. */
export function createClosedPhaseCompanion({sourceBytes,childBytes,functionsBytes,aclBytes}){
  demand(Buffer.isBuffer(sourceBytes)&&sha256(sourceBytes)===APPLICATION.deployerSourceSha256,'deployer-source-drift');
  for(const bytes of [childBytes,functionsBytes,aclBytes])demand(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<65536,'companion-helper');
  const eol='\r\n';let source=sourceBytes.toString('utf8');
  const change=(before,after)=>{source=replaceOnce(source,before.replaceAll('\n',eol),after.replaceAll('\n',eol));};
  change('param(\n','param(\n  [Parameter(Mandatory)][ValidatePattern(\'^[a-f0-9]{32}$\')][string]$TransitionId,\n'
    +"  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HeldCaddySha256,\n"
    +'  [Parameter(Mandatory)][string]$HeldCaddyETag,\n');
  change("$changed=$false",`$changed=$false
if($ExpectedCommit-ne'${APPLICATION.sourceCommit}'-or$M1RuntimeSealSha256-ne'${APPLICATION.runtimeSealSha256}'-or
  $ExpectedUiContract-ne'gate7f-m1-function-first'-or$HeldCaddyETag.Length-lt1-or$HeldCaddyETag.Length-gt256-or
  $HeldCaddyETag-match'[\\r\\n]'){throw 'm1-closed-companion-boundary-invalid'}`);
  const beginning=source.indexOf('function Run-Caddy('),ending=source.indexOf('function JsonFacts(');
  demand(beginning>0&&ending>beginning,'companion-caddy-function');
  const helpers=`$childSource=Join-Path $PSScriptRoot 'Bounded-DeploymentChild.cs'
$closedFunctions=Join-Path $PSScriptRoot 'Closed-Phase-Functions.ps1'
if((Hash $childSource)-ne'${sha256(childBytes)}'-or(Hash $closedFunctions)-ne'${sha256(functionsBytes)}'){
  throw 'm1-closed-companion-helper-drift'
}
if(-not('RunaAI.Next.M1.DeploymentChild'-as[type])){Add-Type -Path $childSource}
. $closedFunctions
`;
  source=source.slice(0,beginning)+helpers.replaceAll('\n',eol)+source.slice(ending);
  change("  if(-not(Test-Path -LiteralPath $targetOnlySource -PathType Leaf)){throw 'gate7a-ordinary-deploy-prepared-release-verifier-missing'}",
    `  if((Hash $targetOnlySource)-ne'${sha256(aclBytes)}'){throw 'm1-closed-companion-acl-helper-drift'}`);
  change("      -ContentType 'application/x-www-form-urlencoded' -Body", "      -TimeoutSec 20 -ContentType 'application/x-www-form-urlencoded' -Body");
  change('      -Headers @{Authorization="Bearer $adminToken"}))','      -TimeoutSec 20 -Headers @{Authorization="Bearer $adminToken"}))');
  change('$pins=@{','Assert-ClosedCaddy\n$pins=@{');
  change('& tar.exe -xzf $archive -C $release\nif($LASTEXITCODE-ne0)',
    "$extraction=Run-BoundedChild (Join-Path $env:SystemRoot 'System32\\tar.exe') @('-xzf',$archive,'-C',$release) 120000 'archive-extract'\nif($extraction.ExitCode-ne0)");
  change('  $qualificationOutput=& $m1Node $m1Verifier --prior $config --successor $stagedConfig `\n'
    +'    --plan $m1Plan --grades $m1Grades --runtime-seal $m1RuntimeSeal --expected-source-commit $ExpectedCommit `\n'
    +'    --expected-plan-sha256 $M1PlanSha256\n  if($LASTEXITCODE-ne0)',
    "  $qualificationRun=Run-BoundedChild $m1Node @($m1Verifier,'--prior',$config,'--successor',$stagedConfig,\n"
    +"    '--plan',$m1Plan,'--grades',$m1Grades,'--runtime-seal',$m1RuntimeSeal,'--expected-source-commit',$ExpectedCommit,\n"
    +"    '--expected-plan-sha256',$M1PlanSha256) 60000 'qualification'\n  $qualificationOutput=$qualificationRun.Stdout\n  if($qualificationRun.ExitCode-ne0)");
  change('Copy-Item -LiteralPath $stagedCaddy -Destination "$caddy.new"','Assert-ClosedCaddy # outer transaction owns every Caddy publication');
  change('  $changed=$true','  Assert-ClosedCaddy\n  $changed=$true');
  change('  Move-Item -LiteralPath "$caddy.new" -Destination $caddy -Force\n'
    +"  if((Run-Caddy reload $caddy)-ne0){throw 'gate7a-ordinary-deploy-caddy-reload-failed'}",
    '  Assert-ClosedCaddy # leave candidate-closed Caddy untouched');
  change('    $rebindOutput=& node $operator --release-root $release --successor-config $config `\n'
    +'      --successor-manifest $manifest --expected-release-id $ReleaseId --expected-commit $ExpectedCommit `\n'
    +'      --expected-artifact-digest $ExpectedArtifactDigest --prior-config (Join-Path $rollback \'candidate.json\') `\n'
    +'      --prior-manifest (Join-Path $rollback $manifestName) --prior-release-id $PriorReleaseId `\n'
    +'      --prior-commit $PriorCommit --prior-artifact-digest $PriorArtifactDigest 2>&1\n    $rebindExit=$LASTEXITCODE',
    "    $rebindRun=Run-BoundedChild (Join-Path $release 'runtime\\node.exe') @($operator,'--release-root',$release,\n"
    +"      '--successor-config',$config,'--successor-manifest',$manifest,'--expected-release-id',$ReleaseId,'--expected-commit',$ExpectedCommit,\n"
    +"      '--expected-artifact-digest',$ExpectedArtifactDigest,'--prior-config',(Join-Path $rollback 'candidate.json'),\n"
    +"      '--prior-manifest',(Join-Path $rollback $manifestName),'--prior-release-id',$PriorReleaseId,\n"
    +"      '--prior-commit',$PriorCommit,'--prior-artifact-digest',$PriorArtifactDigest) 60000 'owner-rebind'\n"
    +'    $rebindOutput=$rebindRun.Stdout;$rebindExit=$rebindRun.ExitCode');
  change("  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-successor/v1';deployed=$true;",
    "  Assert-ClosedCaddy\n  [ordered]@{schemaVersion='runaai-m1-closed-deployment/v1';transitionId=$TransitionId;passed=$true;deployed=$true;\n"
    +'    heldCaddySha256=$HeldCaddySha256;heldCaddyETag=$HeldCaddyETag;admissionOpened=$false;caddyPublicationDeferred=$true;childReceipts=$script:m1ChildReceipts;');
  change('applicationAndCaddyChangedTogether=$true;', 'applicationAndCaddyChangedTogether=$false;applicationChangedWhileAdmissionClosed=$true;');
  change('    privateValuesIncluded=$false}|ConvertTo-Json -Compress','    privateValuesIncluded=$false}|ConvertTo-Json -Depth 8 -Compress');
  change('  $failure=$_.Exception.Message\n  if($changed){',
    "  $failure=$_.Exception.Message\n  if($script:m1EffectUnknown){Write-ClosedPhaseFailure 'm1-deploy-child-outcome-unknown';throw 'm1-deploy-reconciliation-required'}\n"
    +'  Assert-ClosedCaddy\n  if($changed){');
  change("    Copy-Item -LiteralPath (Join-Path $rollback 'Caddyfile') -Destination $caddy -Force\n"
    +'    $caddyRollbackFailed=$false\n'
    +"    if((Run-Caddy reload $caddy)-ne0){$caddyRollbackFailed=$true}",
    '    Assert-ClosedCaddy # restoring app does not authorize reopening old Caddy');
  change("    if($caddyRollbackFailed){throw 'gate7a-ordinary-deploy-caddy-rollback-failed'}",'    Assert-ClosedCaddy');
  change('  throw "gate7a-ordinary-deploy-failed:$failure"',
    "  Write-ClosedPhaseFailure 'm1-closed-deployment-failed'\n  throw 'm1-closed-deployment-failed'");
  change('"$config.new","$manifest.new","$launcher.new","$caddy.new"','"$config.new","$manifest.new","$launcher.new"');
  const bytes=Buffer.from(source);
  return {schemaVersion:'runaai-m1-closed-companion/v1',applicationSourceCommit:APPLICATION.sourceCommit,
    sourceSha256:sha256(sourceBytes),bytes,sha256:sha256(bytes),
    files:[{path:'gate7a/control/Invoke-ClosedM1Successor.ps1',bytes},
      {path:'gate7a/control/Bounded-DeploymentChild.cs',bytes:Buffer.from(childBytes)},
      {path:'gate7a/control/Closed-Phase-Functions.ps1',bytes:Buffer.from(functionsBytes)},
      {path:'gate7e/control/TargetOnlyAcl.cs',bytes:Buffer.from(aclBytes)}].map(file=>({...file,sha256:sha256(file.bytes)})),
    activated:false,applicationArtifactChanged:false};
}
