# Cài chatbot NhaDat chạy 24/7 trên Windows (thay Vercel).
#
# Chạy trong PowerShell "Run as Administrator", từ thư mục repo đã clone:
#   powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
#   powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1 -Port 3000 -TunnelToken "<token Cloudflare>"
#
# Việc script làm:
#   1. Cài Node.js LTS + Git (winget) nếu máy chưa có
#   2. Tạo .env.local (hỏi từng key) nếu chưa có
#   3. npm ci + npm run build
#   4. Tạo Scheduled Task "NhaDatChatbot": chạy khi máy bật, tự khởi động lại khi chết
#   5. Tắt sleep/hibernate khi cắm điện, mở firewall cổng cho mạng LAN (Private)
#   6. (Tuỳ chọn) Cài Cloudflare Tunnel nếu có -TunnelToken, để truy cập từ internet qua HTTPS
# Chạy lại script nhiều lần không sao (idempotent).

param(
  [int]$Port = 3000,
  [string]$TunnelToken = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'NhaDatChatbot'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Run($exe, [string[]]$argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại (exit $LASTEXITCODE): $exe $($argList -join ' ')" }
}

# --- 0. Quyền admin -----------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Cần chạy PowerShell bằng "Run as Administrator".' -ForegroundColor Red
  exit 1
}
Write-Host "Thư mục repo: $Root"

# --- 1. Node.js + Git -----------------------------------------------------------
Step 'Kiểm tra Node.js và Git'
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'Không có winget. Cài "App Installer" từ Microsoft Store rồi chạy lại.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Run winget @('install', '-e', '--id', 'OpenJS.NodeJS.LTS', '--scope', 'machine', '--silent',
               '--accept-source-agreements', '--accept-package-agreements')
  Refresh-Path
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Run winget @('install', '-e', '--id', 'Git.Git', '--silent',
               '--accept-source-agreements', '--accept-package-agreements')
  Refresh-Path
}
$nodeVer = (node -v)
Write-Host "Node $nodeVer"
if ([version]($nodeVer.TrimStart('v')) -lt [version]'20.11.0') {
  throw "Cần Node >= 20.11 (đang có $nodeVer). Gỡ Node cũ rồi chạy lại script."
}

# --- 2. .env.local --------------------------------------------------------------
Step 'Cấu hình key (.env.local)'
$envFile = Join-Path $Root '.env.local'
if (Test-Path $envFile) {
  Write-Host '.env.local đã có - giữ nguyên. Muốn sửa key: mở file bằng Notepad rồi chạy update.ps1.'
} else {
  Write-Host 'Nhập từng key (Enter để bỏ trống nếu không dùng):'
  $keys = [ordered]@{
    'ANTHROPIC_API_KEY'   = 'Claude - LLM chính khi Gemini lỗi (bắt buộc nếu Gemini không dùng được)'
    'GEMINI_API_KEY'      = 'Gemini - LLM + embedding cho RAG'
    'GITHUB_TOKEN'        = 'GitHub token - ghi log chat/lead + sửa persona trong trang admin'
    'ADMIN_PASSWORD'      = 'Mật khẩu trang /admin'
    'GOOGLE_MAPS_API_KEY' = 'Google Maps - trả lời chỉ đường'
    'DEEPGRAM_API_KEY'    = 'Deepgram - nhận giọng nói (slide/voice)'
    'GROQ_API_KEY'        = 'Groq - LLM dự phòng cuối (miễn phí)'
    'ALLOWED_ORIGIN'      = 'Domain được gọi API, cách nhau dấu phẩy (PHẢI gồm cả domain của chatbot). Bỏ trống = không giới hạn'
  }
  $lines = @()
  foreach ($k in $keys.Keys) {
    $v = Read-Host "$k  ($($keys[$k]))"
    if ($v.Trim()) { $lines += "$k=$($v.Trim())" }
  }
  # UTF-8 KHÔNG BOM: BOM dính vào tên key đầu tiên -> Next không đọc được key đó.
  [IO.File]::WriteAllText($envFile, ($lines -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding($false)))
  Write-Host "Đã ghi $envFile"
}

# --- 3. Build -------------------------------------------------------------------
Step 'Dừng bản đang chạy (nếu có)'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Step 'Cài thư viện + build (mất vài phút)'
Push-Location $Root
try {
  Run npm.cmd @('ci', '--no-audit', '--no-fund')
  Run npm.cmd @('run', 'build')
} finally { Pop-Location }

# --- 4. Scheduled Task chạy 24/7 ------------------------------------------------
Step "Tạo Scheduled Task '$TaskName' (chạy khi bật máy, không cần đăng nhập)"
$runner = Join-Path $Root 'deploy\windows\run-server.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$runner`" $Port`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

# --- 5. Nguồn điện + firewall ---------------------------------------------------
Step 'Tắt sleep/hibernate khi cắm điện, mở firewall cổng cho mạng LAN'
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
$ruleName = "NhaDat Chatbot $Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Action Allow -Profile Private | Out-Null
}

# --- 6. Cloudflare Tunnel (tuỳ chọn) --------------------------------------------
if ($TunnelToken) {
  Step 'Cài Cloudflare Tunnel (service Windows)'
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Run winget @('install', '-e', '--id', 'Cloudflare.cloudflared', '--silent',
                 '--accept-source-agreements', '--accept-package-agreements')
    Refresh-Path
  }
  if (Get-Service cloudflared -ErrorAction SilentlyContinue) {
    Write-Host 'Service cloudflared đã có - bỏ qua. Muốn đổi token: cloudflared service uninstall rồi chạy lại.'
  } else {
    Run cloudflared @('service', 'install', $TunnelToken)
  }
}

# --- 7. Kiểm tra ---------------------------------------------------------------
Step "Chờ server lên ở http://localhost:$Port"
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
if ($ok) {
  Write-Host "`nXONG. Chatbot đang chạy: http://localhost:$Port" -ForegroundColor Green
  Write-Host "Log: $Root\logs\server.log"
} else {
  Write-Host "`nServer chưa lên sau 60s. Xem log: $Root\logs\server.log" -ForegroundColor Yellow
  exit 1
}
