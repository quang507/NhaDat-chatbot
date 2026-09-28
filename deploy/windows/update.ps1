# Cập nhật chatbot lên code mới nhất trên GitHub rồi khởi động lại.
# Chạy trong PowerShell "Run as Administrator":
#   powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1
# Chỉ đổi key trong .env.local (không kéo code): thêm -NoPull.

param(
  [int]$Port = 3000,
  [switch]$NoPull
)

$ErrorActionPreference = 'Stop'
$TaskName = 'NhaDatChatbot'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Run($exe, [string[]]$argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại (exit $LASTEXITCODE): $exe $($argList -join ' ')" }
}

Push-Location $Root
try {
  if (-not $NoPull) {
    Write-Host '==> git pull'
    Run git @('pull', '--ff-only')
  }

  Write-Host '==> Dừng server'
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

  Write-Host '==> npm ci + build'
  Run npm.cmd @('ci', '--no-audit', '--no-fund')
  Run npm.cmd @('run', 'build')
} finally {
  # Luôn bật lại server, kể cả khi build lỗi (khi đó xem logs\server.log).
  Write-Host '==> Khởi động lại server'
  Start-ScheduledTask -TaskName $TaskName
  Pop-Location
}

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try {
    if ((Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) {
      Write-Host "XONG - server đã chạy lại: http://localhost:$Port" -ForegroundColor Green
      exit 0
    }
  } catch {}
}
Write-Host "Server chưa lên sau 60s. Xem log: $Root\logs\server.log" -ForegroundColor Yellow
exit 1
