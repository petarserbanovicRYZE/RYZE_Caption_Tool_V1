param(
 [Parameter(Mandatory=$true)][string]$Installer,
 [string]$CertificateThumbprint,
 [string]$TimestampUrl='http://timestamp.digicert.com/'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Windows signature verification requires Windows.' }
$Installer=(Resolve-Path -LiteralPath $Installer).Path
if ([IO.Path]::GetExtension($Installer) -ne '.exe') { throw 'Expected an EXE installer.' }
if ($CertificateThumbprint) {
 $thumb=$CertificateThumbprint.Replace(' ','')
 if ($thumb -notmatch '^[0-9a-fA-F]{40}$') { throw 'Expected a certificate thumbprint, not a certificate file or password.' }
 $cert=Get-Item -LiteralPath ('Cert:\CurrentUser\My\'+$thumb)
 if (!$cert.HasPrivateKey) { throw 'The selected Windows certificate has no private key.' }
 if ($cert.NotAfter -lt (Get-Date) -or $cert.NotBefore -gt (Get-Date)) { throw 'The Windows signing certificate is outside its validity period.' }
 $eku=@($cert.Extensions | Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
 if ($eku -notcontains '1.3.6.1.5.5.7.3.3') { throw 'A Windows code-signing certificate is required. The CEP certificate is not a substitute.' }
 $signed=Set-AuthenticodeSignature -LiteralPath $Installer -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $TimestampUrl
 if ($signed.Status -ne 'Valid' -or !$signed.TimeStamperCertificate) { throw 'Signing or trusted timestamp verification failed; do not distribute this build.' }
}
$signature=Get-AuthenticodeSignature -LiteralPath $Installer
if ($signature.Status -notin @('Valid','NotSigned')) { throw ('Installer signature is invalid: '+$signature.Status) }
$sha=(Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
$publisher=$null;$thumbprint=$null
if ($signature.SignerCertificate) { $publisher=$signature.SignerCertificate.Subject;$thumbprint=$signature.SignerCertificate.Thumbprint }
$report=[ordered]@{
 schema=1;build='1.0.7';fileName=[IO.Path]::GetFileName($Installer);bytes=(Get-Item -LiteralPath $Installer).Length
 sha256=$sha;signatureStatus=[string]$signature.Status;publisher=$publisher;certificateThumbprint=$thumbprint
 timestampPresent=($null -ne $signature.TimeStamperCertificate);verifiedAtUtc=[DateTime]::UtcNow.ToString('o')
 malwareScanPerformed=$false;companyApproval='NOT_ASSESSED'
 notes='Authenticode verifies publisher/integrity, not absence of malware. CEP signing is separate. Bundled PowerShell and Inno uninstaller are not Authenticode-signed by this step. Obtain IT review of this exact hash.'
}
$sha | Set-Content -LiteralPath ($Installer+'.sha256') -Encoding ASCII
[IO.File]::WriteAllText((Join-Path (Split-Path $Installer -Parent) 'RYZE_RELEASE_VERIFICATION.json'),($report | ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding($false)))
if ($signature.Status -eq 'NotSigned') { Write-Warning 'UNSIGNED PREVIEW: Windows publisher is unverified. Do not treat this as a company-approved release.' }
Write-Host ('RELEASE SHA256: '+$sha)
Write-Host ('WINDOWS SIGNATURE: '+$signature.Status)
