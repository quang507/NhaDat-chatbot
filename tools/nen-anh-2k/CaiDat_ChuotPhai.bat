@echo off
chcp 65001 >nul
REM Cai menu chuot phai "Nen anh ve 2K" cho file PNG/JPG (chi cho user hien tai, khong can quyen admin).
REM Tro toi Resize2K.ps1 nam cung thu muc voi file .bat nay.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ps = Join-Path '%~dp0' 'Resize2K.ps1';" ^
  "if (-not (Test-Path $ps)) { Write-Host 'KHONG thay Resize2K.ps1 cung thu muc!'; exit 1 };" ^
  "$cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \"' + $ps + '\" \"%%1\"';" ^
  "foreach ($e in '.png','.jpg','.jpeg') {" ^
  "  $k = 'HKCU:\Software\Classes\SystemFileAssociations\' + $e + '\shell\Nen2K';" ^
  "  New-Item -Path $k -Force | Out-Null;" ^
  "  Set-ItemProperty -Path $k -Name '(default)' -Value 'Nén ảnh về 2K';" ^
  "  Set-ItemProperty -Path $k -Name 'Icon' -Value 'imageres.dll,-70';" ^
  "  New-Item -Path ($k + '\command') -Force | Out-Null;" ^
  "  Set-ItemProperty -Path ($k + '\command') -Name '(default)' -Value $cmd;" ^
  "};" ^
  "Write-Host 'DA CAI XONG. Chuot phai vao anh PNG/JPG -> Nen anh ve 2K.'"
echo.
pause
