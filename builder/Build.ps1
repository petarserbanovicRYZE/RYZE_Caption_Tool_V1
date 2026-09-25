param([string]$SignTool, [string]$Certificate, [string]$Compiler, [string]$TimestampUrl='http://timestamp.digicert.com/', [string]$WindowsCertificateThumbprint)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Need-File([string]$p,[string]$label) { if (!$p -or !(Test-Path -LiteralPath $p -PathType Leaf)) { throw "$label not found: $p" }; return (Resolve-Path -LiteralPath $p).Path }
function Run-Native([string]$exe,[string[]]$Arguments) { & $exe @Arguments; if ($LASTEXITCODE -ne 0) { throw "Build command failed: $exe (exit $LASTEXITCODE)" } }
try {
 if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Build and sign this Windows extension on Windows.' }
 if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS, reopen the terminal, and retry.' }
 & node (Join-Path $root 'builder\validate.js'); if ($LASTEXITCODE -ne 0) { throw 'Source validation failed.' }
 foreach ($name in @('test-host','test-fast','test-fused','test-visibility','test-restore-diagnostics','test-connect','test-transport','test-integration','test-checkpoint','test-dynamic','test-grouped','test-compact','test-boundary','test-report','test-panel')) {
  & node (Join-Path $root "diagnostics\$name.js"); if ($LASTEXITCODE -ne 0) { throw "Regression failed: $name" }
 }
 Run-Native (Join-Path $PSHOME 'powershell.exe') @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'diagnostics\test-installer.ps1'))
 if (!$SignTool) { $SignTool=Read-Host 'Full path to the current Windows Adobe ZXPSignCmd.exe' }
 $SignTool=Need-File $SignTool 'ZXPSignCmd'
 if (!$Compiler) { $Compiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe' }
 if (!(Test-Path -LiteralPath $Compiler)) { $Compiler=Read-Host 'Full path to Inno Setup 6 ISCC.exe' }
 $Compiler=Need-File $Compiler 'Inno Setup compiler'
 if (!$Certificate) { $Certificate=Read-Host 'Full path to your CEP signing .p12 (blank creates a NEW private certificate)' }
 $createCert=[string]::IsNullOrWhiteSpace($Certificate)
 if ($createCert) {
  $privateDir=Join-Path $env:LOCALAPPDATA 'RYZE\Signing'
  New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
  $Certificate=Join-Path $privateDir ('RYZE-'+[Guid]::NewGuid().ToString('N')+'.p12')
 } else { $Certificate=Need-File $Certificate 'CEP certificate' }
 $password=Read-Host 'CEP certificate password (keep it for future builds)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
 $build=Join-Path $root ('build\'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $build -Force | Out-Null
 try {
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if (!$plain) { throw 'A non-empty certificate password is required.' }
  if ($createCert) { Run-Native $SignTool @('-selfSignedCert','US','Private','RYZE','RYZE Caption Tool',$plain,$Certificate) }
  $zxp=Join-Path $build 'RYZE_Caption_Tool_Helper.zxp'
  Run-Native $SignTool @('-sign',(Join-Path $root 'cep'),$zxp,$Certificate,$plain,'-tsa',$TimestampUrl)
 } finally { $plain=$null;[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$password.Dispose() }
 Run-Native $SignTool @('-verify',$zxp)
 $signed=Join-Path $build 'signed-cep'
 [IO.Compression.ZipFile]::ExtractToDirectory($zxp,$signed)
 if (!(Test-Path -LiteralPath (Join-Path $signed 'META-INF\signatures.xml'))) { throw 'Missing CEP signature; installer will not be produced.' }
 # Never modify files inside the signed extension. Installation secrets live outside it.
 $ccx=Join-Path $build 'RYZE_Caption_Tool.ccx'
 [IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $root 'uxp'),$ccx,[IO.Compression.CompressionLevel]::Optimal,$false)
 & node (Join-Path $root 'builder\verify-packages.js') $signed $ccx
 if ($LASTEXITCODE -ne 0) { throw 'Package validation failed.' }
 Copy-Item -LiteralPath (Join-Path $root 'installer\Install-Adobe.ps1') -Destination $build
 Copy-Item -LiteralPath (Join-Path $root 'README_TEAM.txt') -Destination $build
 $payloadFiles=@(Get-ChildItem -LiteralPath $signed -Recurse -File)+@(Get-Item -LiteralPath $ccx)
 $manifest=@($payloadFiles | ForEach-Object { @{ path=$_.FullName.Substring($build.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
 [IO.File]::WriteAllText((Join-Path $build 'payload-hashes.json'),(ConvertTo-Json -InputObject $manifest -Depth 5),(New-Object Text.UTF8Encoding($false)))
 $dist=Join-Path $root 'dist';New-Item -ItemType Directory -Path $dist -Force | Out-Null
 Run-Native $Compiler @("/DPayloadDir=$build","/DOutputDir=$dist",(Join-Path $root 'installer\RYZE.iss'))
 $exe=Need-File (Join-Path $dist 'RYZE_Caption_Tool_Setup.exe') 'Installer output'
 & (Join-Path $PSScriptRoot 'Verify-Release.ps1') -Installer $exe -CertificateThumbprint $WindowsCertificateThumbprint -TimestampUrl $TimestampUrl
 if (!$?) { throw 'Windows release verification failed.' }
 Write-Host "BUILT: $exe"
 Write-Host 'V1.0.7 CANDIDATE: automatic pairing, UPIA upgrade and actual speed still require Windows/Premiere acceptance.'
 Write-Host 'Read dist\RYZE_RELEASE_VERIFICATION.json for the final EXE hash and Windows signature status. A valid signature is not an antivirus clearance.'
 if ($createCert) { Write-Host "Keep your private signing certificate outside shared files: $Certificate" }
} catch { Write-Error $_; exit 1 }
