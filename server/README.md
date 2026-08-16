# Server Showroom (Bun + ElysiaJS) — B1

Server LAN chạy trên mini-PC đặt tại showroom, phục vụ TV 75″ dọc theo kiến trúc
`docs/PORTRAIT_75_TECHSPEC.md` §5. **Tái dùng nguyên khối** các route handler của
Next trong `app/api/*/route.ts` — không copy logic, sửa một nơi chạy cả Vercel lẫn LAN.

## Chạy

```bash
# 1 lần: cài dependency của server (elysia)
bun install --cwd server

# chạy (từ repo root — script tự chdir về root nên chạy từ đâu cũng được)
npm run server           # = bun server/index.ts
PORT=8080 npm run server # đổi cổng (mặc định 3080)
```

Yêu cầu: `bun` ≥ 1.1, file `.env` ở repo root chứa các key (GEMINI_API_KEY,
GROQ_API_KEY, DEEPGRAM_API_KEY…) — Bun tự nạp `.env` theo cwd.

## Endpoint

| Đường | Nguồn | Ghi chú |
|-------|-------|---------|
| `POST /api/slide` | `app/api/slide/route.ts` | pipeline slide (static_fast ~14ms LAN) |
| `POST /api/transcribe` | `app/api/transcribe/route.ts` | STT Deepgram→Gemini→Whisper |
| `GET /api/tts` | `app/api/tts/route.ts` | Edge TTS |
| `POST /api/log-session` | `app/api/log-session/route.ts` | tổng hợp phiên → Telegram |
| `GET /images/*`, `/images_bg/*` | `public/` | cache 1 năm immutable |
| `GET /healthz` | — | cho script giám sát/kiosk |
| `GET /*` | `out/` rồi `public/` | bản static export (B3); chưa build thì trang giữ chỗ |

CORS mở cho `/api/*` trong giai đoạn chuyển tiếp (app TV còn chạy từ origin khác).

## Bước kế tiếp (theo tech-spec)

- **B2**: WS event bus `/ws/tv`, `/ws/companion` (protocol §5.3) + heartbeat/resume.
- **B3**: `next.config.mjs` → `output: 'export'`, server này serve luôn app TV; kiosk hóa
  mini-PC (systemd + chromium `--kiosk`).
- **B4**: streaming STT qua WS (Deepgram live).
