# Runs the actual installer control flow in isolated fake user directories.
# Only Adobe/process probes are stubbed. Never installs anything into real Adobe paths.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=Split-Path $PSScriptRoot -Parent
$utf8=New-Object Text.UTF8Encoding($false)
$code=[IO.File]::ReadAllText((Join-Path $root 'installer/Install-Adobe.ps1'))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($code,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Installer parse failed.'}
$upi=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'UPI'},$true)
$probe=@'
function Get-Process { param($Name,$ErrorAction) return $null }
function UPI([string[]]$Arguments) {
 [IO.File]::AppendAllText((Join-Path $PSScriptRoot 'calls.txt'),$Arguments[0]+"`r`n")
 if($Arguments[0] -eq '/install'){
  if(!(Test-Path -LiteralPath $Arguments[1])){throw 'Missing configured CCX in test'}
  $script:testInstalled=$true
  if($env:RYZE_TEST_CASE -eq 'adobe-failure'){throw 'Injected Adobe failure after registration'}
  return @('Installation successful')
 }
 if($Arguments[0] -ne '/list'){throw 'Unexpected Adobe mutation in repair test'}
 if($env:RYZE_TEST_CASE -eq 'disabled'){return @('1 extension installed for Premiere Pro (ver 26.3.0)','Disabled RYZE Caption Tool 1.0.7')}
 if(Get-Variable testInstalled -Scope Script -ErrorAction SilentlyContinue){return @('1 extension installed for Premiere Pro (ver 26.3.0)','Enabled RYZE Caption Tool 1.0.7','1 extension installed for Premiere Pro (ver 25.6.0)','Enabled RYZE Caption Tool 1.0.7')}
 return @('0 extension installed for Premiere Pro (ver 26.3.0)')
}
'@
$testCode=$code.Replace($upi.Extent.Text,$probe)
$temp=Join-Path ([IO.Path]::GetTempPath()) ('RYZE-Repair-Flow-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
function Write-TestFile([string]$Path,[string]$Text){New-Item -ItemType Directory -Path (Split-Path $Path) -Force | Out-Null;[IO.File]::WriteAllText($Path,$Text,$utf8)}
try{
 foreach($case in @('fresh','repeat','orphan','bad-receipt','missing-helper','bad-config','stale-cache','adobe-failure','unfinished','foreign','disabled')){
  $caseRoot=Join-Path $temp $case;$payload=Join-Path $caseRoot 'payload';$appData=Join-Path $caseRoot 'user';$common=Join-Path $caseRoot 'common'
  $data=Join-Path $appData 'RYZE/CaptionToolV1';$helper=Join-Path $appData 'Adobe/CEP/extensions/com.ryze.captiontool.v1.bridge'
  New-Item -ItemType Directory -Path $payload,$data -Force | Out-Null
  Write-TestFile (Join-Path $payload 'Install-Adobe.ps1') $testCode
  # A test-only sentinel satisfies discovery; UPI is mocked and never executes this file.
  Write-TestFile (Join-Path $common 'Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.exe') 'TEST SENTINEL - NOT AN EXECUTABLE'
  $signed=Join-Path $payload 'signed-cep'
  Write-TestFile (Join-Path $signed 'META-INF/signatures.xml') '<test-only-not-a-real-signature/>'
  Write-TestFile (Join-Path $signed 'CSXS/manifest.xml') ([IO.File]::ReadAllText((Join-Path $root 'cep/CSXS/manifest.xml')))
  Write-TestFile (Join-Path $signed 'new-file.txt') 'new helper fixture'
  $ccx=Join-Path $payload 'RYZE_Caption_Tool.ccx'
  [IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $root 'uxp'),$ccx)
  $hashes=@(@(Get-ChildItem -LiteralPath $signed -Recurse -File)+@(Get-Item -LiteralPath $ccx) | ForEach-Object {@{path=$_.FullName.Substring($payload.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})
  Write-TestFile (Join-Path $payload 'payload-hashes.json') (ConvertTo-Json -InputObject $hashes)
  if($case -eq 'stale-cache'){Write-TestFile (Join-Path $signed 'obsolete.js') 'not part of this signed build'}
  $config=Join-Path $data 'connection.json';$receipt=Join-Path $data 'installed.json';$session=Join-Path $data 'session.json'
  Write-TestFile $config '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","port":48771}'
  if($case -ne 'fresh'){
   if($case -ne 'missing-helper'){
    Write-TestFile (Join-Path $helper 'CSXS/manifest.xml') ([IO.File]::ReadAllText((Join-Path $root 'cep/CSXS/manifest.xml')))
    Write-TestFile (Join-Path $helper 'old-file.txt') 'original helper fixture'
   }
   if($case -ne 'orphan'){Write-TestFile $receipt (@{uxpID='com.ryze.captiontool.v1.uxp';target=$helper;version='1.0.7'}|ConvertTo-Json)}
  }
  if($case -eq 'bad-receipt'){Write-TestFile $receipt '{broken'}
  if($case -eq 'bad-config'){Write-TestFile $config '{broken'}
  if($case -eq 'unfinished'){Write-TestFile $session '{"phase":"interrupted"}'}
  if($case -eq 'foreign'){Write-TestFile $receipt (@{uxpID='not.ryze';target=$helper;version='1.0.7'}|ConvertTo-Json)}
  $beforeConfig=(Get-FileHash -LiteralPath $config).Hash
  $beforeReceipt=if(Test-Path -LiteralPath $receipt){(Get-FileHash -LiteralPath $receipt).Hash}else{$null}
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=Join-Path $PSHOME 'powershell.exe'
  $start.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $payload 'Install-Adobe.ps1')+'"'
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.EnvironmentVariables['APPDATA']=$appData;$start.EnvironmentVariables['CommonProgramW6432']=$common;$start.EnvironmentVariables['RYZE_TEST_CASE']=$case
  $process=[Diagnostics.Process]::Start($start)
  $stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()
  if(!$process.WaitForExit(30000)){$process.Kill();throw 'Isolated installer test timed out.'}
  $stdout=$stdoutTask.Result;$stderr=$stderrTask.Result
  $expected=if($case -in @('adobe-failure','unfinished','foreign','disabled')){1}else{0}
  if($process.ExitCode -ne $expected){throw "Repair case $case expected exit $expected; got $($process.ExitCode): $stdout $stderr"}
  $process.Dispose()
  if($stdout -match 'a{64}'){throw 'Pairing credential leaked to installer output.'}
  if($case -ne 'bad-config' -and (Get-FileHash -LiteralPath $config).Hash -ne $beforeConfig){throw "Valid pairing changed: $case"}
  $calls=if(Test-Path -LiteralPath (Join-Path $payload 'calls.txt')){[IO.File]::ReadAllText((Join-Path $payload 'calls.txt'))}else{''}
  if($calls -match '/remove'){throw 'Repair attempted an Adobe removal.'}
  if($expected -eq 0){
   if(!(Test-Path -LiteralPath (Join-Path $helper 'new-file.txt'))){throw "New helper missing: $case"}
   if(Test-Path -LiteralPath (Join-Path $helper 'obsolete.js')){throw 'Repair copied stale cached files into signed helper.'}
   $installed=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
   if($installed.uxpID -ne 'com.ryze.captiontool.v1.uxp' -or $installed.version -ne '1.0.7'){throw 'Installed receipt not verified.'}
   if($case -notin @('fresh','missing-helper')){
    $oldFiles=@(Get-ChildItem -LiteralPath $data -Directory -Filter 'helper-backup-*' | ForEach-Object {Join-Path $_.FullName 'old-file.txt'})
    if($oldFiles.Count -ne 1 -or [IO.File]::ReadAllText($oldFiles[0]) -ne 'original helper fixture'){throw 'Old helper backup lost.'}
   }
   if($case -eq 'bad-config'){
    $pair=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
    if($pair.port -ne 48771 -or $pair.token -cnotmatch '^[a-f0-9]{64}$'){throw 'Repaired pairing invalid.'}
   }
  }else{
   if([IO.File]::ReadAllText((Join-Path $helper 'old-file.txt')) -ne 'original helper fixture'){throw 'Failed repair lost previous helper.'}
   if((Get-FileHash -LiteralPath $receipt).Hash -ne $beforeReceipt){throw 'Failed repair changed receipt.'}
   if($case -eq 'adobe-failure' -and $stdout -notmatch 'Previous helper restored'){throw 'Adobe failure did not roll back helper.'}
   if($case -ne 'adobe-failure' -and $calls -match '/install'){throw 'Unsafe repair reached Adobe installation.'}
   if($case -eq 'unfinished' -and [IO.File]::ReadAllText($session) -ne '{"phase":"interrupted"}'){throw 'Interrupted checkpoint changed.'}
  }
  if(@(Get-ChildItem -LiteralPath $data -Directory -Filter 'setup-*').Count){throw 'Private staging not cleaned up.'}
  Write-Host "PASS isolated installer flow: $case"
 }
}finally{
 # Exact generated test directory only; do not follow links during cleanup.
 $full=[IO.Path]::GetFullPath($temp);$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
 if(!$full.StartsWith($parent+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($full) -notmatch '^RYZE-Repair-Flow-[a-f0-9]{32}$'){throw 'Unexpected test cleanup path.'}
 if(Test-Path -LiteralPath $full){
  if(@(Get-ChildItem -LiteralPath $full -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Test cleanup refused linked files.'}
  Remove-Item -LiteralPath $full -Recurse -Force
 }
}
