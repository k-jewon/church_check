' Starts church_check with no console window and opens the app window in
' Chrome/Edge app mode (falls back to the default browser if none is found).
' Console mode is still available: run the .bat launcher in this folder, which
' prints the phone-access QR and tunnel URL. The same URL is in the app at
' /admin/tunnel, so hiding the console does not lose it.
Dim fso, sh, dir, browser, port
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

' config.json 의 port 를 읽는다(기본 3000). 기본값만 바꾸면 이 창도 그 포트를 연다.
port = 3000
If fso.FileExists(dir & "\config.json") Then
  Dim cfg, text, re, found
  Set cfg = fso.OpenTextFile(dir & "\config.json", 1)
  text = cfg.ReadAll
  cfg.Close
  ' VBScript 의 정규식은 CreateObject("VBScript.RegExp") 로 만든다(NewRegExp 는 JScript 전용).
  Set re = CreateObject("VBScript.RegExp")
  re.Pattern = """port""\s*:\s*(\d+)"
  Set found = re.Execute(text)
  If found.Count > 0 Then port = found(0).SubMatches(0)
End If

sh.Run "church_check.exe", 0, False
' The server needs a moment to bind the port before the window opens.
WScript.Sleep 2500

browser = ""
For Each p In Array( _
    "C:\Program Files\Google\Chrome\Application\chrome.exe", _
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", _
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe")
  If fso.FileExists(p) Then
    browser = p
    Exit For
  End If
Next

If browser <> "" Then
  sh.Run """" & browser & """ --app=http://localhost:" & port & "/login", 1, False
Else
  CreateObject("Shell.Application").ShellExecute "http://localhost:" & port & "/login", "", "", "", 1
End If
