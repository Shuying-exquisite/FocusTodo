; 安装/卸载前强制结束 FocusTodo 及其子进程，避免旧进程占用文件导致安装中途弹窗
; 使用 nsExec 静默执行，避免 cmd 黑框闪烁
!macro customCheckAppRunning
  nsExec::Exec '"$SYSDIR\taskkill.exe" /f /im "FocusTodo.exe" /t'
  Sleep 800
  nsExec::Exec '"$SYSDIR\taskkill.exe" /f /im "electron.exe" /t'
  Sleep 800
  nsExec::Exec '"$SYSDIR\taskkill.exe" /f /im "FocusTodo.exe" /t'
  Sleep 1500
!macroend
