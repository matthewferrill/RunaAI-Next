function Wait-R15WatcherQuiescence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string[]]$SourceIdentifier,
    [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[System.Management.Automation.PSEventArgs]]$Destination,
    [ValidateRange(1,60000)][int]$QuietMilliseconds=250,
    [ValidateRange(1,120000)][int]$MaximumMilliseconds=5000,
    [ValidateRange(1,1000)][int]$PollMilliseconds=25
  )
  if($MaximumMilliseconds-lt$QuietMilliseconds){throw 'r15-watcher-quiescence-window-invalid'}
  $sourceIds=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach($sourceId in $SourceIdentifier){
    if([string]::IsNullOrWhiteSpace($sourceId)-or-not$sourceIds.Add($sourceId)){throw 'r15-watcher-quiescence-source-invalid'}
  }
  $maximum=[Diagnostics.Stopwatch]::StartNew()
  $quiet=[Diagnostics.Stopwatch]::StartNew()
  while($maximum.ElapsedMilliseconds-lt$MaximumMilliseconds){
    $batch=@(Get-Event -ErrorAction Stop|Where-Object{$sourceIds.Contains($_.SourceIdentifier)})
    if($batch.Count-ne0){
      foreach($event in $batch){
        $Destination.Add($event)
        Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
      }
      $quiet.Restart()
    }elseif($quiet.ElapsedMilliseconds-ge$QuietMilliseconds){
      return
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
  throw 'r15-watcher-quiescence-timeout'
}
