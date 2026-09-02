[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [Parameter(Mandatory)][ValidatePattern('^20260829-campaign-gemma-r[1-9][0-9]*$')][string]$LeaseId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedLeaseSeal,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestFileSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$BatchResultSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityValidationSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$RuntimeSealSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$SourceTreeManifestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{16}$')][string]$RuntimeSealPrefix
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($RuntimeSealPrefix-cne$RuntimeSealSha256.Substring(0,16)){throw 'r15-gemma-completion-runtime-prefix'}
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$campaign='acceptance-evidence/campaign-gemma4-26b-a4b-'+$RuntimeSealPrefix
$validator=Join-Path $root 'Validate-Stage.ps1'
# Replaced with the exact staged validator digest when the fresh common bundle is sealed.
$validatorSha256='ab44d63863a97ab730e445bb1d6c118e0cbdd7ed67829ec0cbd801cd6075d4bd'
if($validatorSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-gemma-completion-validator-not-sealed'}
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';if((Get-FileHash -LiteralPath '$validator' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$validatorSha256'){throw 'r15-gemma-completion-validator-pin'};& '$validator' -StageId '$StageId' -Phase Completion -FinalizationSha256 '$FinalizationSha256' -ExpectedLeaseId '$LeaseId' -ExpectedLeaseSeal '$ExpectedLeaseSeal' -EligibilityManifestFileSha256 '$EligibilityManifestFileSha256' -EligibilityManifestSha256 '$EligibilityManifestSha256' -BatchResultSha256 '$BatchResultSha256' -EligibilityValidationSha256 '$EligibilityValidationSha256';exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
$preflightRaw=@(& ssh.exe -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded)
if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-preflight-failed'}
$preflight=$preflightRaw|Select-Object -Last 1|ConvertFrom-Json
if($preflight.passed-cne$true-or$preflight.leaseId-cne$LeaseId-or$preflight.leaseSealSha256-cne$ExpectedLeaseSeal-or
   $preflight.eligibilityManifestSha256-cne$EligibilityManifestSha256-or$preflight.batchResultSha256-cne$BatchResultSha256-or
   $preflight.eligibilityValidationSha256-cne$EligibilityValidationSha256-or$preflight.runtimeSealSha256-cne$RuntimeSealSha256-or
   $preflight.sourceTreeManifestSha256-cne$SourceTreeManifestSha256-or$preflight.runtimeSealPrefix-cne$RuntimeSealPrefix-or
   $preflight.reviewedAttempts-ne120-or$preflight.productQualificationPassed-cne$false-or$preflight.productionChanged-cne$false){
  throw 'r15-gemma-completion-preflight-result'
}

$completionRaw=(& (Join-Path $PSScriptRoot 'Complete-HomeCampaignV2.ps1') -LeaseId $LeaseId -ExpectedSeal $ExpectedLeaseSeal -Reason completed|Out-String).Trim()
$completion=$completionRaw|ConvertFrom-Json
if($completion.published-cne$true-or$completion.leaseId-cne$LeaseId-or$completion.sealSha256-cne$ExpectedLeaseSeal-or
   $completion.reason-cne'completed'-or$completion.privateValuesIncluded-cne$false){throw 'r15-gemma-completion-publication'}

$deadline=[DateTime]::UtcNow.AddMinutes(3);$status=$null
do{
  $statusRaw=(& (Join-Path $PSScriptRoot 'Invoke-HomeCampaignV2Operator.ps1') -Mode Status -LeaseId $LeaseId -ExpectedSeal $ExpectedLeaseSeal|Out-String).Trim()
  if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-status'}
  $status=$statusRaw|ConvertFrom-Json
  if($null-ne$status.supervisor){break}
  Start-Sleep -Seconds 2
}while([DateTime]::UtcNow-lt$deadline)
if($null-eq$status.supervisor-or$status.taskState-cne'Ready'-or$status.taskExit-ne0-or
   $null-eq$status.result-or$status.result.completion-cne'completed'-or$status.result.failure-ne$null-or
   $status.result.ambiguousLoad-ne$null-or$status.result.cleanupVerified-cne$true-or$status.result.powerRestored-cne$true-or
   $status.result.productionRoutingChanged-cne$false-or$status.result.protectedDataIncluded-cne$false-or
   $status.supervisor.exitCode-ne0-or$status.supervisor.failure-ne$null-or
   $status.supervisor.zeroResidencyAndPowerRestored-cne$true-or$status.supervisor.productionRoutingChanged-cne$false){
  throw 'r15-gemma-completion-supervisor'
}

$temporaryDirectory=Join-Path ([IO.Path]::GetTempPath()) ('r15-gemma-completion-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temporaryDirectory)
try{
  $before=Join-Path $temporaryDirectory 'home-before-cleanup-state.json'
  $after=Join-Path $temporaryDirectory 'home-final-state.json'
  $export=Join-Path $temporaryDirectory 'home-export.json'
  & (Join-Path $PSScriptRoot 'Invoke-HomeCampaignV2Operator.ps1') -Mode Export -LeaseId $LeaseId -ExpectedSeal $ExpectedLeaseSeal -LocalFile $export
  if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-export'}
  & (Join-Path $PSScriptRoot 'Invoke-HomeCampaignV2Operator.ps1') -Mode Final -LeaseId $LeaseId -ExpectedSeal $ExpectedLeaseSeal -LocalFile $before
  if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-before-state'}
  & (Join-Path $PSScriptRoot 'Invoke-HomeCampaignV2Operator.ps1') -Mode Cleanup -LeaseId $LeaseId -ExpectedSeal $ExpectedLeaseSeal
  if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-cleanup'}
  & (Join-Path $PSScriptRoot 'Invoke-HomeCampaignV2Operator.ps1') -Mode Final -LeaseId $LeaseId -ExpectedSeal $ExpectedLeaseSeal -LocalFile $after
  if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-final-state'}
  $statusFile=Join-Path $temporaryDirectory 'home-terminal-status.json'
  [IO.File]::WriteAllText($statusFile,($status|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
  $receiptFile=Join-Path $temporaryDirectory 'home-completion-receipt.json'
  [IO.File]::WriteAllText($receiptFile,$completionRaw,[Text.UTF8Encoding]::new($false))
  $resultFile=Join-Path $temporaryDirectory 'result.json'
  $remoteResult=($root+'\'+($campaign.Replace('/','\'))+'\result.json').Replace('\','/')
  & scp.exe -F 'C:\Users\matth\.ssh\config' -q ('runa-control:'+ $remoteResult) $resultFile
  if($LASTEXITCODE-ne0-or-not(Test-Path -LiteralPath $resultFile -PathType Leaf)-or
     (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash.ToLowerInvariant()-cne$BatchResultSha256){throw 'r15-gemma-completion-result-fetch'}
  $writer=Join-Path $PSScriptRoot '..\gate7f\function-first\readiness\Write-HomeCampaignCompletionV2.ps1'
  $publication=[ordered]@{writerSha256=(Get-FileHash -LiteralPath $writer -Algorithm SHA256).Hash.ToLowerInvariant();
    writerSource=[Convert]::ToBase64String([IO.File]::ReadAllBytes($writer));
    transportScriptSha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'Complete-HomeCampaignV2.ps1') -Algorithm SHA256).Hash.ToLowerInvariant();
    maximumWrappedChars=4000;resultSha256=$BatchResultSha256;
    receiptRaw=[Convert]::ToBase64String([IO.File]::ReadAllBytes($receiptFile));
    receiptSha256=(Get-FileHash -LiteralPath $receiptFile -Algorithm SHA256).Hash.ToLowerInvariant()}
  $publicationFile=Join-Path $temporaryDirectory 'home-completion-publication.json'
  [IO.File]::WriteAllText($publicationFile,($publication|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  $resultValue=Get-Content -LiteralPath $resultFile -Raw|ConvertFrom-Json
  $canonical=Join-Path $PSScriptRoot '..\gate7f\function-first\readiness\verify-completed-campaign-v2.mjs'
  $verificationArguments=@($canonical,$LeaseId,$ExpectedLeaseSeal,$RuntimeSealSha256,$BatchResultSha256,
    $resultValue.sourceCommit,$resultFile,$export,$publicationFile,$before,$after)
  $verificationRaw=(& node.exe @verificationArguments|Out-String).Trim()
  if($LASTEXITCODE-ne0){throw 'r15-gemma-completion-canonical-verification'}
  $verification=$verificationRaw|ConvertFrom-Json
  if($verification.completion-cne'completed'-or$verification.cleanupVerified-cne$true-or$verification.zeroResidency-cne$true-or
     $verification.powerRestored-cne$true-or$verification.ownedTaskRetired-cne$true-or$verification.productionChanged-cne$false){
    throw 'r15-gemma-completion-canonical-result'
  }
  $verificationFile=Join-Path $temporaryDirectory 'home-completion-verification.json'
  [IO.File]::WriteAllText($verificationFile,$verificationRaw,[Text.UTF8Encoding]::new($false))

  $publications=[ordered]@{}
  foreach($item in @(@{Local=$receiptFile;Name='home-completion-receipt.json'},@{Local=$statusFile;Name='home-terminal-status.json'},
    @{Local=$export;Name='home-export.json'},@{Local=$publicationFile;Name='home-completion-publication.json'},
    @{Local=$verificationFile;Name='home-completion-verification.json'},
    @{Local=$before;Name='home-before-cleanup-state.json'},@{Local=$after;Name='home-final-state.json'})){
    $target=($root+'\'+($campaign.Replace('/','\'))+'\'+$item.Name)
    $publish=@'
$ErrorActionPreference='Stop';$target='__TARGET__';$directory=[IO.Path]::GetDirectoryName($target)
for($current=$directory;$current;$current=[IO.Path]::GetDirectoryName($current)){
  $entry=Get-Item -LiteralPath $current -Force;if($entry.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'r15-gemma-completion-publication-reparse'}
}
$stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{[Console]::OpenStandardInput().CopyTo($stream);$stream.Flush($true)}finally{$stream.Dispose()}
[Console]::Out.Write((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant())
'@
    $publish=$publish.Replace('__TARGET__',$target)
    $publishEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($publish))
    $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName='ssh.exe'
    $start.Arguments='-F "C:\Users\matth\.ssh\config" -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand '+$publishEncoded
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    try{
      if(-not$process.Start()){throw 'r15-gemma-completion-publication-start'}
      $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
      $bytes=[IO.File]::ReadAllBytes($item.Local);$process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$process.StandardInput.Close()
      if(-not$process.WaitForExit(30000)){$process.Kill();$process.WaitForExit();throw 'r15-gemma-completion-publication-timeout'}
      $digest=$stdout.GetAwaiter().GetResult().Trim();$errorText=$stderr.GetAwaiter().GetResult()
      if($process.ExitCode-ne0-or$digest-notmatch'^[a-f0-9]{64}$'){throw ('r15-gemma-completion-publication-failed:'+($errorText.Trim()))}
      $publications[$item.Name]=$digest
    }finally{$process.Dispose()}
  }
  [ordered]@{schemaVersion='runaai-m1-r15-gemma-home-completion-lifecycle/v1';passed=$true;leaseId=$LeaseId;
    preflightSha256=$preflight.outputSha256;files=$publications;modelsInvokedByCompletion=$false;productionChanged=$false;protectedDataRead=$false}|ConvertTo-Json -Depth 8 -Compress
}finally{
  if(Test-Path -LiteralPath $temporaryDirectory){Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force}
}
