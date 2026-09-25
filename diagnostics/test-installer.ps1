# Executed by the Windows builder BEFORE signing. Does not install/remove any Adobe plugin.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if([IO.Compression.ZipArchiveMode]::Update -ne 2){throw 'ZIP update support is unavailable.'}
$root=Split-Path $PSScriptRoot -Parent
$utf8=New-Object Text.UTF8Encoding($false)
$pluginVersion='1.0.7';$pluginName='RYZE Caption Tool'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'installer\Install-Adobe.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Installer PowerShell syntax failed.'}
foreach($name in @('Configure-Package','Listing','Current-Rows','Get-CheckpointOutputs','Get-UpgradeSessionKind','Backup-CompletedCheckpoint')){
 $function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 if(!$function){throw "Installer function missing: $name"}
 . ([scriptblock]::Create($function.Extent.Text))
}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('RYZE-Installer-Test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try{
 $source=Join-Path $temp 'source.ccx'
 [IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $root 'uxp'),$source,[IO.Compression.CompressionLevel]::Optimal,$false)
 $originalHash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
 foreach($user in @('a','b')){
  $credential=$user*64;$config=Join-Path $temp ($user+'.json');$output=Join-Path $temp ($user+'.ccx')
  [IO.File]::WriteAllText($config,(@{token=$credential;port=48771}|ConvertTo-Json -Compress),$utf8)
  Configure-Package $source $output $config
  $zip=[IO.Compression.ZipFile]::OpenRead($output)
  try{
   $reader=New-Object IO.StreamReader($zip.GetEntry('installer-config.json').Open())
   try{$actual=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
   if($actual.token -cne $credential -or $actual.build -ne '1.0.7'){throw 'Per-user pairing test failed.'}
  }finally{$zip.Dispose()}
 }
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $originalHash){throw 'Shared CCX was modified.'}
 $refused=$false
 try{Configure-Package (Join-Path $temp 'a.ccx') (Join-Path $temp 'invalid.ccx') (Join-Path $temp 'b.json')}catch{$refused=$true}
 if(!$refused){throw 'Already-personalized shared payload should be refused.'}
 $rows=@(Listing @('3 extensions installed for Premiere Pro (ver 26.5.1)','Enabled RYZE Caption Tool 0.7.0','Enabled RYZE Caption Tool 1.0.0','Enabled RYZE Caption Tool 1.0.7'))
 $ours=@(Current-Rows $rows)
 if($ours.Count -ne 1 -or $ours[0].Version -ne '1.0.7'){throw 'UPIA name/version filtering failed.'}

 # Completed state must be backed up, not reset; partial state must remain blocked.
 $stateDir=Join-Path $temp 'state';New-Item -ItemType Directory -Path $stateDir | Out-Null
 $sessionPath=Join-Path $stateDir 'session.json';$hostPath=Join-Path $stateDir 'host-state.json'
 $completed=@{phase='converted';batch=('a'*32);owned=$true;hideAttempted=$true;fault=$false;next=1;plan=@(@{top='Caption'});verified=@(@{id='clip1'});output=@{count=1;trackID='7';trackIndex=6};folder=$stateDir;prep=@{sequenceID='sequence1'}}
 $hostJournal=@{phase='converted';sequenceID='sequence1';newTrackID='7';newTrackIndex=6;created=@(@{id='clip1'});expected=@{video=@();audio=@()}}
 [IO.File]::WriteAllText($sessionPath,($completed|ConvertTo-Json -Depth 10),$utf8)
 [IO.File]::WriteAllText($hostPath,($hostJournal|ConvertTo-Json -Depth 10),$utf8)
 $loaded=Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
 if((Get-UpgradeSessionKind $loaded) -ne 'completed'){throw 'Completed session rejected.'}
 $original=(Get-FileHash -LiteralPath $sessionPath -Algorithm SHA256).Hash
 $backupDir=Backup-CompletedCheckpoint $sessionPath $stateDir $loaded
 if((Get-FileHash -LiteralPath $sessionPath -Algorithm SHA256).Hash -ne $original -or (Get-FileHash -LiteralPath (Join-Path $backupDir 'session.json') -Algorithm SHA256).Hash -ne $original){throw 'Completed session was not preserved exactly.'}
 foreach($phase in @('converting','hiding','failed','interrupted')){
  $loaded.phase=$phase;$refused=$false
  try{Get-UpgradeSessionKind $loaded | Out-Null}catch{$refused=$true}
  if(!$refused){throw "Unfinished phase accepted: $phase"}
 }
 $loaded.phase='converted';$loaded.next=0;$refused=$false
 try{Get-UpgradeSessionKind $loaded | Out-Null}catch{$refused=$true}
 if(!$refused){throw 'Incomplete completed count was accepted.'}
 $loaded.next=1;$loaded.output.trackID='wrong';$refused=$false
 try{Backup-CompletedCheckpoint $sessionPath $stateDir $loaded | Out-Null}catch{$refused=$true}
 if(!$refused){throw 'Mismatched host ownership was accepted.'}
 # Multi-track completed checkpoints use per-output counts and owned track identities.
 $completed.next=2;$completed.plan=@(@{top='One'},@{top='Two'});$completed.verified=@(@{id='clip1'},@{id='clip2'})
 $completed.outputs=@(@{count=1;trackID='7';trackIndex=6},@{count=1;trackID='8';trackIndex=7})
 $hostJournal.created=@(@{id='clip1'},@{id='clip2'});$hostJournal.ownedTracks=@(@{trackID='7';trackIndex=6},@{trackID='8';trackIndex=7})
 [IO.File]::WriteAllText($sessionPath,($completed|ConvertTo-Json -Depth 10),$utf8)
 [IO.File]::WriteAllText($hostPath,($hostJournal|ConvertTo-Json -Depth 10),$utf8)
 $loaded=Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
 if((Get-UpgradeSessionKind $loaded) -ne 'completed'){throw 'Multi-track completed session rejected.'}
 Backup-CompletedCheckpoint $sessionPath $stateDir $loaded | Out-Null
 $loaded.outputs[1].trackID='foreign';$refused=$false
 try{Backup-CompletedCheckpoint $sessionPath $stateDir $loaded | Out-Null}catch{$refused=$true}
 if(!$refused){throw 'Multi-track ownership mismatch accepted.'}
 Write-Host 'PASS completed-session upgrade gate: exact backup without reset; partial, incomplete and mismatched ownership states refused.'
 Write-Host 'PASS installer: per-user CCX pairing, unchanged shared source, changed-source verification, configured-source refusal, exact UPIA version match. No Adobe installation performed.'
}finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Recurse -Force}}
