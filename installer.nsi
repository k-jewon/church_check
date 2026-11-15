; Inno Setup 설치 마법사 (Windows). 배포판 church_check.exe 는 Node SEA 실행파일이라
; 대상 PC에 node·npm 설치가 필요 없다 — 실행파일 안에 런타임과 번들이 들어 있다.
; 설치 위치는 %LOCALAPPDATA%\church_check: 최초 실행이 config.json·data/ 를 같은 폴더에
; 쓰는데 ProgramFiles 는 쓰기 권한이 없어 UAC 가 걸린다.

#ifndef APP_VERSION
  #define APP_VERSION "0.0.0"
#endif
#ifndef OutDir
  #define OutDir "."
#endif
// build.mjs가 release/electron/electron.exe의 존재를 확인하고 HAS_ELECTRON을 정의한다.
// Inno는 [Icons]에 설치 시점 조건이 없다 — 빌드 시점에 런처를 고른다. electron이 없으면 기존 vbs 런처.
#ifdef HAS_ELECTRON
  #define Launcher "{app}\electron\electron.exe"
  #define LauncherArgs "shell"
#else
  #define Launcher "{app}\서버시작.vbs"
  #define LauncherArgs ""
#endif

[Setup]
AppName=church_check
AppVersion={#APP_VERSION}
AppPublisher=k-jewon
AppPublisherURL=https://github.com/k-jewon/church_check
DefaultDirName={localappdata}\church_check
DefaultGroupName=church_check
DisableWelcomePage=no
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=none
UninstallDisplayName=church_check (교회 청년부 출석)
UninstallDisplayIcon={app}\church_check.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutDir}
OutputBaseFilename=church_check-{#APP_VERSION}-win-setup
Compression=lzma2/fast
SolidCompression=yes

[Files]
Source: "release\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\church_check 열기"; Filename: "{#Launcher}"; Parameters: "{#LauncherArgs}"; WorkingDir: "{app}"; IconFilename: "{app}\church_check.exe"
Name: "{group}\church_check 서버 멈춤"; Filename: "{app}\서버멈춤.bat"; WorkingDir: "{app}"
Name: "{group}\church_check 업데이트"; Filename: "{app}\업데이트.bat"; WorkingDir: "{app}"
Name: "{group}\church_check 제거"; Filename: "{uninstallexe}"

[Run]
Filename: "{#Launcher}"; Parameters: "{#LauncherArgs}"; Description: "지금 church_check 열기"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent

[Code]
var
  PwPage: TWizardPage;
  InputEdit: TPasswordEdit;
  AdminEdit: TPasswordEdit;

procedure CreatePasswordPage;
var
  InputLabel, AdminLabel: TNewStaticText;
begin
  PwPage := CreateCustomPage(wpWelcome, '로그인 암호 설정',
    '출석 입력자가 쓸 암호와 관리 화면을 열 사람이 쓸 암호를 정합니다. config.json 에 저장됩니다.');

  InputLabel := TNewStaticText.Create(PwPage);
  InputLabel.Caption := '입력용 암호 (출석 입력자):';
  InputLabel.Parent := PwPage.Surface;

  InputEdit := TPasswordEdit.Create(PwPage);
  InputEdit.Left := InputLabel.Left;
  InputEdit.Top := InputLabel.Top + InputLabel.Height + ScaleY(4);
  InputEdit.Width := ScaleX(300);
  InputEdit.Parent := PwPage.Surface;

  AdminLabel := TNewStaticText.Create(PwPage);
  AdminLabel.Caption := '관리자 암호 (관리 화면):';
  AdminLabel.Left := InputLabel.Left;
  AdminLabel.Top := InputEdit.Top + InputEdit.Height + ScaleY(16);
  AdminLabel.Parent := PwPage.Surface;

  AdminEdit := TPasswordEdit.Create(PwPage);
  AdminEdit.Left := AdminLabel.Left;
  AdminEdit.Top := AdminLabel.Top + AdminLabel.Height + ScaleY(4);
  AdminEdit.Width := InputEdit.Width;
  AdminEdit.Parent := PwPage.Surface;
end;

function InitializeSetup(): Boolean;
begin
  // 페이지·컨트롤은 WizardForm 가 만들어진 뒤(InitializeWizard)에 만든다.
  // InitializeSetup에서 만들면 "access WizardForm before it has been created" 오류가 난다.
  Result := True;
end;

procedure InitializeWizard();
begin
  // 무인 설치(/SILENT)에서는 WizardForm 이 만들어지지 않는다 — 이 페이지를 만들지 않는다.
  if not WizardSilent then CreatePasswordPage;
end;

// 암호를 config.json 에 저장한다. exit 0 은 실행파일이 writeFileSync까지 완료한 증거이고,
// FileExists 는 그 결과를 파일로 한 번 더 확인한다 — Exec 성공만으로는 믿지 않는다.
function StorePassword(which, password: String): Boolean;
var
  ExitCode: Integer;
begin
  if not Exec(ExpandConstant('{app}\church_check.exe'), '--setpw ' + which + ' "' + password + '"',
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
    Log(which + ' 암호 저장: Exec 실패');
    Result := False;
    Exit;
  end;
  if ExitCode <> 0 then begin
    Log(which + ' 암호 저장: exit=' + IntToStr(ExitCode));
    Result := False;
    Exit;
  end;
  Result := FileExists(ExpandConstant('{app}\config.json'));
  if Result then
    Log(which + ' 암호 저장: config.json 확인됨')
  else
    Log(which + ' 암호 저장: config.json 없음');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  // 무인 설치(/SILENT)에서는 암호를 못 받는다 — config.json 을 비워 두고 첫 실행이 묻게 둔다.
  if WizardSilent then Exit;
  // 암호 글자는 로그에 남기지 않는다. 길이만 남긴다.
  Log('암호 입력: input=' + IntToStr(Length(Trim(InputEdit.Text))) + '자, admin=' + IntToStr(Length(Trim(AdminEdit.Text))) + '자');
  if (Trim(InputEdit.Text) = '') or (Trim(AdminEdit.Text) = '') then
    Result := '두 암호 모두 입력해야 합니다.';
  // 따옴표는 Exec 인자 전달에서 인자로 다시 해석된다 — 넣지 못하게 막는다.
  if (Pos('"', InputEdit.Text) > 0) or (Pos('"', AdminEdit.Text) > 0) then
    Result := '암호에 따옴표(")는 쓸 수 없습니다.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Failed: Boolean;
begin
  // 무인 설치는 암호를 받지 않으므로 InputEdit 이 nil — 여기서 바로 끝낸다.
  if CurStep <> ssPostInstall then Exit;
  if WizardSilent then Exit;

  // 암호를 config.json 에 미리 담아 첫 실행의 콘솔 질문을 없앤다. 실패해도 서버는
  // 첫 실행에서 평소처럼 암호를 묻는다 — 설치를 실패로 만들지 않는다.
  Failed := False;
  if (Trim(InputEdit.Text) <> '') and not StorePassword('input', Trim(InputEdit.Text)) then
    Failed := True;
  if (Trim(AdminEdit.Text) <> '') and not StorePassword('admin', Trim(AdminEdit.Text)) then
    Failed := True;
  if Failed then
    MsgBox('암호를 config.json 에 저장하지 못했습니다. 서버를 첫 실행하면 암호를 묻습니다.', mbInformation, MB_OK);
end;
