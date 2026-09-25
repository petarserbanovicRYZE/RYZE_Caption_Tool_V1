#ifndef PayloadDir
 #error PayloadDir must be provided by Build.ps1
#endif
#ifndef OutputDir
 #error OutputDir must be provided by Build.ps1
#endif
[Setup]
AppId=RYZE.CaptionTool.V1.Candidate
AppName=RYZE Caption Tool V1 Candidate
AppVersion=1.0.7
DefaultDirName={localappdata}\RYZE\CaptionToolV1Installer
DisableDirPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=RYZE_Caption_Tool_Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
UninstallDisplayName=RYZE Caption Tool V1 Candidate
CloseApplications=no
[Files]
Source: "{#PayloadDir}\signed-cep\*"; DestDir: "{app}\signed-cep"; Flags: recursesubdirs createallsubdirs
Source: "{#PayloadDir}\RYZE_Caption_Tool.ccx"; DestDir: "{app}"
Source: "{#PayloadDir}\payload-hashes.json"; DestDir: "{app}"
Source: "{#PayloadDir}\Install-Adobe.ps1"; DestDir: "{app}"
Source: "{#PayloadDir}\README_TEAM.txt"; DestDir: "{app}"
[Icons]
Name: "{group}\RYZE Caption Tool instructions"; Filename: "{app}\README_TEAM.txt"
Name: "{group}\Uninstall RYZE Caption Tool"; Filename: "{uninstallexe}"
[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var Code: Integer;
begin
 if CurStep = ssPostInstall then begin
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
   '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Install-Adobe.ps1') + '"',
   ExpandConstant('{app}'), SW_SHOW, ewWaitUntilTerminated, Code) then
   RaiseException('Could not start Adobe installation. RYZE is not installed.');
  if Code <> 0 then RaiseException('Adobe installation failed. See %APPDATA%\RYZE\CaptionToolV1\installer.log. Do not treat this as a successful install.');
 end;
end;
function InitializeUninstall(): Boolean;
var Code: Integer;
begin
 Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
  '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Install-Adobe.ps1') + '" -Remove',
  ExpandConstant('{app}'), SW_SHOW, ewWaitUntilTerminated, Code);
 if Result then Result := Code = 0;
 if not Result then MsgBox('Adobe plugin removal failed or Premiere is open. Uninstall was stopped; see installer.log.', mbError, MB_OK);
end;
