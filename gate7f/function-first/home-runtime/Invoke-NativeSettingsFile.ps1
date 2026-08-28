param(
 [Parameter(Mandatory=$true)][ValidateSet('Prepare','Swap','Restore')][string]$Mode,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$TransactionId,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedOriginalSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedCandidateSha256,
 [ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedCurrentSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
try{
 . (Join-Path $PSScriptRoot 'Settings-FileTransaction.ps1')
 . (Join-Path $PSScriptRoot 'Tls-Windows.ps1')
 if($env:COMPUTERNAME-cne'RUNA-HOME'-or-not([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'settings-file-host-authority'}
 $script:RuntimeRoot='C:\AI\RunaAI-Next-HomeRuntime-Transactions'
 $target='C:\Users\Matthew\.lmstudio\.internal\http-server-config.json'
 $directory=$script:RuntimeRoot+'\'+$TransactionId
 if(($Mode-ceq'Restore')-ne[bool]$ExpectedCurrentSha256){throw 'settings-file-current-pin'}
 Assert-SettingsPlain 'C:\AI' $true;Assert-SettingsPlain $target
 $inputStream=[Console]::OpenStandardInput();$inputBytes=New-Object IO.MemoryStream
 try{while(($next=$inputStream.ReadByte())-ne-1){if($inputBytes.Length-ge8192){throw 'settings-file-input-cap'};$inputBytes.WriteByte([byte]$next)}
   $rawInput=[Text.UTF8Encoding]::new($false,$true).GetString($inputBytes.ToArray())
 }finally{$inputBytes.Dispose();$inputStream.Dispose()}
 $already=$false;$preimage=$false
 if($Mode-ceq'Prepare'){
   if($rawInput-notmatch'^[A-Za-z0-9+/]+={0,2}$'){throw 'settings-file-input'}
   $candidate=[Convert]::FromBase64String($rawInput)
   if($candidate.Length-eq0-or$candidate.Length-gt4096-or(Settings-Hash $candidate)-cne$ExpectedCandidateSha256){throw 'settings-file-candidate-pin'}
   if(Test-Path -LiteralPath $script:RuntimeRoot){Assert-TlsPrivateAcl $script:RuntimeRoot}else{New-TlsPrivateDirectory $script:RuntimeRoot}
   # Existing IDs are never reused by Prepare. A partial/unknown prepare requires reconciliation.
   New-TlsPrivateDirectory $directory
   $intent=New-SettingsFileIntent $target $directory $ExpectedOriginalSha256 $candidate
 }else{
   if($rawInput-cne''){throw 'settings-file-unexpected-input'}
   Assert-TlsPrivateAcl $script:RuntimeRoot;Assert-TlsPrivateAcl $directory
   $intent=Read-SettingsIntent $directory
   if($intent.target-cne$target-or$intent.originalSha256-cne$ExpectedOriginalSha256-or$intent.candidateSha256-cne$ExpectedCandidateSha256){throw 'settings-file-intent-binding'}
   if($Mode-ceq'Swap'){$null=Invoke-SettingsFileSwap $directory;$preimage=$true}
   else{
     if((Settings-Hash (Read-SettingsBytes $target))-cne$ExpectedCurrentSha256){throw 'settings-file-restore-stale'}
     if($ExpectedCurrentSha256-ceq$ExpectedOriginalSha256){
       # Still inspect all retained conflicts and actual preimage ownership; never short-circuit
       # just because an unrelated actor happened to put the original bytes back at the target.
       $repaired=Repair-InterruptedSettingsSwap $directory;$already=$true
       $preimage=Test-Path -LiteralPath ($directory+'\actual-preimage.bin')
     }else{$null=Restore-SettingsActualPreimage $directory $ExpectedCurrentSha256;$preimage=$true}
   }
 }
 $actual=Settings-Hash (Read-SettingsBytes $target)
 $expected=if($Mode-ceq'Swap'){$ExpectedCandidateSha256}else{$ExpectedOriginalSha256}
 if($actual-cne$expected){throw 'settings-file-result-drift'}
 @{schemaVersion='runaai-native-settings-file/v1';mode=$Mode;transactionId=$TransactionId;
   originalSha256=$ExpectedOriginalSha256;candidateSha256=$ExpectedCandidateSha256;currentSha256=$actual;
   passed=$true;targetBound=$true;privateValuesIncluded=$false;inMemoryEnforcementProved=$false;
   admissionOpened=$false;actualPreimageRetained=[bool]$preimage;alreadyOriginal=[bool]$already}|ConvertTo-Json -Compress
}catch{
 $code=if($_.Exception.Message-match'^(settings|runtime|tls)-[a-z0-9-]+$'){$_.Exception.Message}else{'settings-file-failed'}
 @{schemaVersion='runaai-native-settings-file-error/v1';errorCode=$code;privateValuesIncluded=$false;outcomeConfirmed=$false}|ConvertTo-Json -Compress
 exit 1
}
