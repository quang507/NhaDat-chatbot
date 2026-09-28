@echo off
rem Chay chatbot (Next.js production) va TU KHOI DONG LAI neu process chet.
rem Duoc Task Scheduler goi luc may bat (xem install.ps1). Tham so 1 = cong.
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3000"
set "PATH=%ProgramFiles%\nodejs;%PATH%"
cd /d "%~dp0..\.."
if not exist logs mkdir logs

:loop
rem Log qua 20MB thi doi ten sang server.old.log (giu 1 ban cu).
for %%F in (logs\server.log) do if %%~zF GTR 20000000 move /y logs\server.log logs\server.old.log >nul
echo [%date% %time%] START port %PORT% >> logs\server.log
node node_modules\next\dist\bin\next start -p %PORT% >> logs\server.log 2>&1
echo [%date% %time%] EXIT code %errorlevel% - khoi dong lai sau 5s >> logs\server.log
rem timeout.exe loi khi chay khong co console (task SYSTEM) -> dung ping de cho 5s.
ping -n 6 127.0.0.1 >nul
goto loop
