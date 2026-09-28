# Chạy chatbot 24/7 trên máy Windows (thay Vercel)

Chạy nguyên app Next.js (`next start`) như một Scheduled Task của Windows: tự bật khi
máy khởi động (không cần đăng nhập), tự chạy lại khi process chết.

## Cài lần đầu

Mở **PowerShell → Run as Administrator**:

```powershell
winget install -e --id Git.Git
# đóng PowerShell, mở lại (Admin) để nhận lệnh git
git clone https://github.com/quang507/NhaDat-chatbot C:\NhaDat-chatbot
cd C:\NhaDat-chatbot
powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
```

Script hỏi từng key rồi lưu vào `C:\NhaDat-chatbot\.env.local` (không commit lên git).
Xong sẽ báo `Chatbot đang chạy: http://localhost:3000`.

Tham số: `-Port 3000` (đổi cổng), `-TunnelToken "<token>"` (xem mục internet bên dưới).

## Cho khách truy cập từ internet (Cloudflare Tunnel)

Không cần IP tĩnh, không mở port router, có HTTPS miễn phí. Cần domain đã trỏ về Cloudflare.

1. Vào https://one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel** (loại Cloudflared).
2. Copy token trong lệnh cài (chuỗi dài sau `service install`).
3. Tab **Public Hostname**: ví dụ `chat.nhadat.company` → Service `HTTP` `localhost:3000`.
4. Chạy lại: `powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1 -TunnelToken "<token>"`

Sau đó đổi URL chatbot trên website:
- Script nhúng: `<script src="https://chat.nhadat.company/embed.js"></script>` (tự nhận domain).
- Plugin WordPress `nhadat-chatbot.php`: sửa `$chatbot_url` thành domain mới.
- Nếu `.env.local` có `ALLOWED_ORIGIN`: phải thêm domain mới vào (vd `chat.nhadat.company,nhadat.company`).

## Việc hằng ngày

| Việc | Lệnh (PowerShell Admin, trong `C:\NhaDat-chatbot`) |
|------|------|
| Cập nhật code mới | `powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1` |
| Đổi key | Sửa `.env.local` bằng Notepad → `powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1 -NoPull` |
| Xem log | `Get-Content logs\server.log -Tail 50 -Wait` |
| Dừng / chạy | `Stop-ScheduledTask NhaDatChatbot` / `Start-ScheduledTask NhaDatChatbot` |
| Gỡ hẳn | `Unregister-ScheduledTask NhaDatChatbot -Confirm:$false; Unregister-ScheduledTask NhaDatChatbot-DailyRestart -Confirm:$false` |

## Lưu ý

- Máy mất điện / mất mạng là bot ngừng - nên có UPS, và bật "Restore on AC power loss" trong BIOS để máy tự bật lại.
- Server tự khởi động lại lúc 4h sáng mỗi ngày (task `NhaDatChatbot-DailyRestart`) để xoay vòng log.
- Script đã tắt sleep/hibernate khi cắm điện. Windows Update vẫn có thể restart máy - task tự chạy lại sau khi bật.
- Log chat/lead vẫn ghi lên GitHub như trên Vercel (cần `GITHUB_TOKEN`).
