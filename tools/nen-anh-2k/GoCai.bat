@echo off
chcp 65001 >nul
REM Go menu chuot phai "Nen anh ve 2K".
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "foreach ($e in '.png','.jpg','.jpeg') {" ^
  "  $k = 'HKCU:\Software\Classes\SystemFileAssociations\' + $e + '\shell\Nen2K';" ^
  "  if (Test-Path $k) { Remove-Item $k -Recurse -Force }" ^
  "};" ^
  "Write-Host 'Da go menu chuot phai.'"
pause
