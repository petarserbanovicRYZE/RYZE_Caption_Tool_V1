param([switch]$Remove)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$data=Join-Path $env:APPDATA 'RYZE\CaptionToolV1'
$target=Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.ryze.captiontool.v1.bridge'
$receipt=Join-Path $data 'installed.json'
$config=Join-Path $data 'connection.json'
$id='com.ryze.captiontool.v1.uxp'
$pluginName='RYZE Caption Tool'
$pluginVersion='1.0.7'
$utf8=New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $data -Force | Out-Null
function Log([string]$s) { [IO.File]::AppendAllText((Join-Path $data 'installer.log'),([DateTime]::UtcNow.ToString('o')+' '+$s+"`r`n"),$utf8); Write-Host $s }
function UPI([string[]]$Arguments) {
 $output=& $script:upia @Arguments 2>&1; $code=$LASTEXITCODE
 foreach($line in $output){ Log ([string]$line) }
 if($code -ne 0 -or (($output -join "`n") -match '(?im)^\s*(Failed\b|Error\b)|\bstatus\s*=\s*-\d+')){throw "Adobe UPIA reported failure (process exit $code); see output above."}
 return $output
}
function Listing([object[]]$Lines) {
 $hostName='';$sawPremiere=$false
 foreach($entry in $Lines){
  $line=[string]$entry
  if($line -match '^\s*\d+ extensions? installed for (.+?)\s*$'){
   $hostName=$Matches[1];if($hostName -match '^Premiere Pro \(ver '){$sawPremiere=$true};continue
  }
  if($line -match '^\s*(Enabled|Disabled)\s+(.+?)\s+(\d+(?:\.\d+){1,3})\s*$'){
   [pscustomobject]@{HostName=$hostName;Status=$Matches[1];Name=$Matches[2];Version=$Matches[3]}
  }
 }
 if(!$sawPremiere){throw 'UPIA listing format or Premiere installation was not recognized. No guessed plugin identity will be used.'}
}
function Current-Rows([object[]]$Rows) {
 @($Rows | Where-Object { $_.HostName -match '^Premiere Pro \(ver ' -and $_.Name -ceq $pluginName -and $_.Version -ceq $pluginVersion })
}
function Remove-OwnedUXP {
 $rows=@(Listing @(UPI @('/list','all')))
 $ours=@(Current-Rows $rows)
 if($ours.Count -eq 0){return}
 # Adobe removes by LISTED NAME, not manifest ID. Never remove an ambiguous name.
 $sameName=@($rows | Where-Object {$_.Name -ceq $pluginName})
 if($ours.Count -ne 1 -or $sameName.Count -ne 1){throw 'Multiple plugins share the RYZE Caption Tool name. Remove ONLY version 1.0.7 in Creative Cloud Manage Plugins, then retry uninstall. Older versions were not touched.'}
 UPI @('/remove',$pluginName) | Out-Null
 $after=@(Listing @(UPI @('/list','all')))
 if(@(Current-Rows $after).Count -ne 0){throw 'UPIA still lists V1 after removal; cleanup is not confirmed.'}
}


# CCX is Adobe's unsigned ZIP format. Personalize only UXP, never signed CEP.
function Configure-Package([string]$Source,[string]$Destination,[string]$Connection) {
 Copy-Item -LiteralPath $Source -Destination $Destination
 $pair=Get-Content -LiteralPath $Connection -Raw | ConvertFrom-Json
 $zip=[IO.Compression.ZipFile]::Open($Destination,[IO.Compression.ZipArchiveMode]::Update)
 try {
  $entry=$zip.GetEntry('installer-config.json');if(!$entry){throw 'Pairing placeholder missing in CCX.'}
  $reader=New-Object IO.StreamReader($entry.Open())
  try{$oldPair=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
  if($oldPair.schema -ne 1 -or $oldPair.build -ne $pluginVersion -or $null -ne $oldPair.token){throw 'Invalid shared pairing placeholder.'}
  $entry.Delete();$entry=$zip.CreateEntry('installer-config.json')
  $stream=$entry.Open();$writer=New-Object IO.StreamWriter($stream,$utf8)
  try{$writer.Write((@{schema=1;build=$pluginVersion;port=48771;token=$pair.token}|ConvertTo-Json -Compress))}finally{$writer.Dispose()}
 }finally{$zip.Dispose()}
 # Reopen and compare every original file byte-for-byte, excluding the one configured entry.
 $before=[IO.Compression.ZipFile]::OpenRead($Source);$after=[IO.Compression.ZipFile]::OpenRead($Destination)
 try {
  if($before.Entries.Count -ne $after.Entries.Count){throw 'Configured CCX entry count changed.'}
  $seen=@{}
  foreach($entry in $before.Entries){
   if($seen.ContainsKey($entry.FullName)){throw 'Duplicate CCX entry.'};$seen[$entry.FullName]=$true
   $other=$after.GetEntry($entry.FullName);if(!$other){throw 'Configured CCX entry missing.'}
   if($entry.FullName -eq 'installer-config.json'){continue}
   $a=$entry.Open();$b=$other.Open();$sha=[Security.Cryptography.SHA256]::Create()
   try{if([BitConverter]::ToString($sha.ComputeHash($a)) -cne [BitConverter]::ToString($sha.ComputeHash($b))){throw "Configured package changed source: $($entry.FullName)"}}finally{$a.Dispose();$b.Dispose();$sha.Dispose()}
  }
  $reader=New-Object IO.StreamReader($after.GetEntry('installer-config.json').Open())
  try{$check=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
  if($check.schema -ne 1 -or $check.build -ne $pluginVersion -or $check.port -ne 48771 -or $check.token -cne $pair.token){throw 'Configured pairing verification failed.'}
 }finally{$before.Dispose();$after.Dispose()}
}
# A completed conversion is durable Undo state, not an in-flight transaction.
# Preserve it byte-for-byte; only the host's existing identity/readback guards may authorize Undo.
function Get-CheckpointOutputs($Saved) {
 if($Saved.PSObject.Properties.Name -contains 'outputs' -and $Saved.outputs){return @($Saved.outputs)}
 return @($Saved.output)
}
function Get-UpgradeSessionKind($Saved) {
 if($null -eq $Saved){return 'idle'}
 if($Saved.phase -in @('finished','abandoned','idle')){return 'idle'}
 if($Saved.phase -ne 'converted'){throw 'An unfinished conversion/Undo checkpoint was found. Upgrade stopped; no checkpoint was deleted.'}
 if($Saved.batch -cnotmatch '^[a-f0-9]{32}$' -or $Saved.owned -ne $true -or $Saved.hideAttempted -ne $true -or $Saved.fault -ne $false){throw 'Completed checkpoint flags are inconsistent.'}
 $count=@($Saved.plan).Count
 $outputs=@(Get-CheckpointOutputs $Saved);$total=0;$trackIDs=@{}
 foreach($output in $outputs){
  if($output.count -lt 1 -or $output.trackIndex -lt 0 -or [string]::IsNullOrWhiteSpace($output.trackID) -or $trackIDs.ContainsKey([string]$output.trackID)){throw 'Invalid output ownership in checkpoint.'}
  $trackIDs[[string]$output.trackID]=$true;$total+=$output.count
 }
 if($count -lt 1 -or $count -gt 500 -or $Saved.next -ne $count -or @($Saved.verified).Count -ne $count -or $total -ne $count){throw 'Completed checkpoint counts are inconsistent.'}
 if([string]::IsNullOrWhiteSpace($Saved.folder) -or [string]::IsNullOrWhiteSpace($Saved.prep.sequenceID)){throw 'Completed checkpoint identity is missing.'}
 $seen=@{}
 foreach($clip in $Saved.verified){
  if([string]::IsNullOrWhiteSpace($clip.id) -or $seen.ContainsKey([string]$clip.id)){throw 'Completed checkpoint clip identities are ambiguous.'}
  $seen[[string]$clip.id]=$true
 }
 return 'completed'
}
function Backup-CompletedCheckpoint([string]$SessionPath,[string]$DataPath,$Saved) {
 $hostPath=Join-Path $Saved.folder 'host-state.json'
 if(!(Test-Path -LiteralPath $hostPath -PathType Leaf)){throw 'Completed host journal is missing. Preserve session.json and the Desktop diagnostic folder before repairing.'}
 $hostState=Get-Content -LiteralPath $hostPath -Raw | ConvertFrom-Json
 if($hostState.phase -ne 'converted' -or $hostState.sequenceID -ne $Saved.prep.sequenceID -or @($hostState.created).Count -ne @($Saved.verified).Count -or !$hostState.expected){throw 'Completed session and host journal do not match; upgrade stopped.'}
 $outputs=@(Get-CheckpointOutputs $Saved)
 if($hostState.PSObject.Properties.Name -contains 'ownedTracks' -and $hostState.ownedTracks){$owned=@($hostState.ownedTracks)}else{$owned=@([pscustomobject]@{trackID=$hostState.newTrackID;trackIndex=$hostState.newTrackIndex})}
 if($outputs.Count -ne $owned.Count){throw 'Output ownership track count mismatch.'}
 for($i=0;$i -lt $outputs.Count;$i++){if($outputs[$i].trackID -ne $owned[$i].trackID -or $outputs[$i].trackIndex -ne $owned[$i].trackIndex){throw 'Output ownership track identity mismatch.'}}
 $ids=@{};foreach($clip in $hostState.created){if($ids.ContainsKey([string]$clip.id)){throw 'Duplicate owned clip in host journal.'};$ids[[string]$clip.id]=$true}
 foreach($clip in $Saved.verified){if(!$ids.ContainsKey([string]$clip.id)){throw 'Session clip absent from host ownership journal.'}}
 $archive=Join-Path $DataPath ('upgrade-backup-'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $archive | Out-Null
 foreach($source in @($SessionPath,$hostPath)){
  $before=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
  $destination=Join-Path $archive ([IO.Path]::GetFileName($source))
  Copy-Item -LiteralPath $source -Destination $destination
  if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $before -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $before){throw 'Checkpoint backup verification failed. Upgrade stopped.'}
 }
 return $archive
}
$installedCEP=$false;$attemptedUXP=$false;$createdConfig=$false;$backup=$null;$stage=$null;$oldReceipt=$null;$success=$false;$receiptTouched=$false
try {
 Add-Type -AssemblyName System.IO.Compression
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 if (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Close Premiere before installing or uninstalling.' }
 $upia=Join-Path ${env:CommonProgramW6432} 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
 if (!(Test-Path -LiteralPath $upia)) { throw 'Adobe UPIA was not found. Install/update Creative Cloud Desktop, then retry.' }
 if ($Remove) {
  if (!(Test-Path -LiteralPath $receipt)) {
   if(Test-Path -LiteralPath $target){throw 'Helper exists without an installation receipt. Refusing to delete an unverified folder.'}
   Log 'No completed RYZE installation receipt; leaving Adobe-managed plugins and user data unchanged.';exit 0
  }
  $old=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
  if($old.uxpID -ne $id -or $old.target -ne $target){throw 'Installation receipt mismatch.'}
  $pluginVersion=$old.version
  Remove-OwnedUXP
  if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}
  Remove-Item -LiteralPath $receipt -Force
  Log 'Uninstalled. Diagnostics and connection data retained. Premiere projects were not touched.'
  exit 0
 }
 if(Test-Path -LiteralPath $receipt){
  $oldReceipt=Get-Content -LiteralPath $receipt -Raw
  $old=$oldReceipt | ConvertFrom-Json
  if($old.uxpID -ne $id -or $old.target -ne $target -or $old.version -notin @('1.0.0','1.0.1','1.0.2','1.0.3','1.0.4','1.0.5','1.0.6','1.0.7')){throw 'Unknown installation receipt. Refusing to overwrite another installation.'}
 }elseif(Test-Path -LiteralPath $target){throw 'Helper exists without a matching receipt. Preserve the folder and repair the installation before upgrading.'}
 $session=Join-Path $data 'session.json'
 if(Test-Path -LiteralPath $session){
  $saved=Get-Content -LiteralPath $session -Raw | ConvertFrom-Json
  if((Get-UpgradeSessionKind $saved) -eq 'completed'){
   if(!$oldReceipt){throw 'Completed session requires a matching existing installation receipt.'}
   $archive=Backup-CompletedCheckpoint $session $data $saved
   Log ('COMPLETED_CHECKPOINT_PRESERVED: '+$archive)
   Log 'Completed Undo state retained unchanged. The new panel will verify the original project/sequence before permitting Undo.'
  }
 }
 $rows=@(Listing @(UPI @('/list','all')))
 $present=@(Current-Rows $rows)
 if($present.Count -gt 1){throw 'Multiple matching V1 entries; cannot safely repair.'}
 if($present.Count -eq 1 -and $present[0].Status -ne 'Enabled'){throw 'Existing 1.0.7 plugin is disabled. Enable it in Creative Cloud and retry.'}
 $hashes=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'payload-hashes.json') -Raw | ConvertFrom-Json
 foreach($item in $hashes){
  if($item.path -notmatch '^(signed-cep/[^:]+|RYZE_Caption_Tool\.ccx)$' -or $item.path.Contains('..')){throw 'Invalid payload path'}
  $file=Join-Path $PSScriptRoot $item.path
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){throw "Payload checksum failed: $($item.path)"}
 }
 if(!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'signed-cep\META-INF\signatures.xml'))){throw 'Missing signed CEP payload.'}
 if(Test-Path -LiteralPath $config){
  $existing=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
  if($existing.port -ne 48771 -or $existing.token -cnotmatch '^[a-f0-9]{64}$'){throw 'Existing connection file is invalid; preserve it and contact the builder.'}
 }else{
  $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  $token=([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
  [IO.File]::WriteAllText($config,(@{token=$token;port=48771}|ConvertTo-Json -Compress),$utf8);$createdConfig=$true
 }
 $stage=Join-Path $data ('setup-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $stage | Out-Null
 $configured=Join-Path $stage 'RYZE_Caption_Tool.ccx'
 Configure-Package (Join-Path $PSScriptRoot 'RYZE_Caption_Tool.ccx') $configured $config
 Log 'PER_USER_PAIRING_VERIFIED: UXP configured; signed CEP unchanged; credential not logged.'
 New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
 if(Test-Path -LiteralPath $target){
  $backup=Join-Path $data ('helper-backup-'+[Guid]::NewGuid().ToString('N'))
  Move-Item -LiteralPath $target -Destination $backup
 }
 $installedCEP=$true
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'signed-cep') -Destination $target -Recurse
 # Always submit the configured package. Never reuse 1.0.0 or an unpaired 1.0.7 registration.
 $attemptedUXP=$true
 UPI @('/install',$configured) | Out-Null
 $after=@(Listing @(UPI @('/list','all')))
 $installed=@(Current-Rows $after)
 if($installed.Count -ne 1 -or $installed[0].Status -ne 'Enabled'){throw 'UPIA did not confirm exactly one enabled RYZE Caption Tool 1.0.7 for Premiere.'}
 Log 'UPIA_NAME_VERSION_VERIFIED: Premiere / RYZE Caption Tool / 1.0.7 / Enabled'
 $receiptTouched=$true
 [IO.File]::WriteAllText($receipt,(@{uxpID=$id;target=$target;version=$pluginVersion;installed=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json),$utf8)
 $success=$true
 Log 'Installed 1.0.7. Open Premiere > Window > UXP Plugins > RYZE Caption Tool. Pairing is automatic.'
 Log 'No CEP debug registry flags were changed. Runtime acceptance and speed measurement still required.'
}catch{
 Log ('INSTALLER_STOP: '+$_.Exception.Message)
 if(!$Remove){
  if($attemptedUXP){Log 'ADOBE_REGISTRATION_CHECK_REQUIRED: Adobe may have updated its plugin before stopping. No ambiguous name-based removal was attempted. Keep Premiere closed and rerun Setup; retain installer.log if it fails.'}
  if($installedCEP -and (Test-Path -LiteralPath $target)){try{Remove-Item -LiteralPath $target -Recurse -Force}catch{Log ('HELPER_CLEANUP_FAILED: '+$_.Exception.Message)}}
  if($backup -and (Test-Path -LiteralPath $backup)){try{Move-Item -LiteralPath $backup -Destination $target;$backup=$null;Log 'Previous helper restored.'}catch{Log ('HELPER_RESTORE_FAILED: '+$_.Exception.Message)}}
  # Keep the connection credential: Adobe may have installed the configured UXP package.
  if($receiptTouched){if($oldReceipt){[IO.File]::WriteAllText($receipt,$oldReceipt,$utf8)}elseif(Test-Path -LiteralPath $receipt){Remove-Item -LiteralPath $receipt -Force}}
 }
}finally{
 if($stage -and (Test-Path -LiteralPath $stage)){try{Remove-Item -LiteralPath $stage -Recurse -Force}catch{Log 'Could not remove private setup staging folder.'}}
 if($success -and $backup -and (Test-Path -LiteralPath $backup)){try{Remove-Item -LiteralPath $backup -Recurse -Force}catch{Log 'Previous helper backup retained.'}}
}
if($success){exit 0}else{exit 1}
