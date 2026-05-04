[Setup]
AppName=AI Novel Writer
AppVersion=1.0.1
AppPublisher=rsdasdasdad
DefaultDirName={autopf}\AI-Novel-Writer
DefaultGroupName=AI Novel Writer
OutputDir=.
OutputBaseFilename=AI-Novel-Writer-Setup-v1.0.1
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\AI-Novel-Writer.exe
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\AI-Novel-Writer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AI Novel Writer"; Filename: "{app}\AI-Novel-Writer.exe"
Name: "{group}\Uninstall AI Novel Writer"; Filename: "{uninstallexe}"
Name: "{commondesktop}\AI Novel Writer"; Filename: "{app}\AI-Novel-Writer.exe"

[Run]
Filename: "{app}\AI-Novel-Writer.exe"; Description: "启动 AI Novel Writer"; Flags: postinstall nowait skipifsilent shellexec

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c taskkill /f /im AI-Novel-Writer.exe 2>nul"; Flags: runhidden
