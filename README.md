# NhaDat Chatbot & Live Slide

Trợ lý AI cho dự án nhà phố **Ny'ah Phú Định** (Quận 8, TP.HCM) của Nhà Đạt: vừa là **chatbot tư vấn** nhúng vào website, vừa là **màn trình chiếu thông minh** tại Sale Gallery — nghe cuộc trò chuyện giữa Sale và khách rồi tự động chiếu slide (mặt bằng, hình ảnh, giá, vị trí…) đúng chủ đề đang nói.

## Tính năng chính

### 💬 Chatbot tư vấn (`/`, `/embed`)
- Trả lời câu hỏi về dự án bằng **RAG** (Retrieval-Augmented Generation): dữ liệu dự án trong `data/` được chia chunk, embed bằng `gemini-embedding-001`, lưu vào `index.json`; mỗi câu hỏi chỉ truy hồi vài đoạn liên quan nhất trước khi gửi cho Gemini — nhanh, rẻ, hạn chế bịa.
- **Persona** tư vấn viên định nghĩa trong `persona.md`; ưu tiên trả lời nguyên văn bộ Q&A chuẩn do con người soạn.
- Nhận diện **căn/lô cụ thể** ("căn 3", "lô 05") và trả đúng thông tin diện tích, giá, tình trạng bán (`lib/units.ts`).
- Hỏi **đường đi** → gọi Google Maps lấy tuyến đường thật (km, phút) thay vì để LLM tự chế số (`lib/maps.ts`).
- **Thu lead**: tự phát hiện số điện thoại trong hội thoại, ghi log phiên chat lên nhánh `chatbot-logs` của GitHub và báo về **Telegram**.
- **Nhúng WordPress**: plugin `nhadat-chatbot.php` gắn widget popup, load trang `/embed` qua iframe.
- Rate-limit theo IP cho mọi API công khai.

### 📺 Live Slide cho Sale Gallery (`/slide`)
- Màn hình TV 75″ dọc **nghe ngầm** cuộc trò chuyện (STT), phân loại chủ đề (giá, vị trí, pháp lý, tiện ích, thiết kế…) và **tự đổi slide** theo ngữ cảnh — không ai phải bấm gì.
- Pipeline slide **2 pha**: pha 1 trả slide tĩnh gần như tức thì (khớp từ khóa → `lib/static_slides.ts`), pha 2 LLM tinh chỉnh nội dung (có cache câu trả lời lặp lại).
- Toàn bộ trạng thái trình chiếu là **state machine thuần TypeScript** (`lib/presentation-machine.ts`) — unit-test được bằng `bun test`, tách hẳn khỏi React.
- **Màn chờ (attract screen)** khi không có hội thoại; HUD debug với `?debug=1`.

### 🎙️ Giọng nói
- **STT** đa tầng fallback: Deepgram Nova (kèm keyword boosting cho tên riêng tiếng Việt) → Gemini → Whisper (Groq); hoặc Web Speech API của trình duyệt (`hooks/useVoiceAgent.ts`).
- **TTS** miễn phí qua Edge TTS (giọng `vi-VN-HoaiMyNeural`), chỉnh được tốc độ đọc. Trang `/voice` cho trải nghiệm hội thoại bằng giọng nói.

### 📱 Companion cho Sale (`/companion`)
- Điều khiển từ điện thoại: đóng băng / xóa slide, chuyển ảnh, chiếu nhanh một chủ đề — lệnh relay tới mọi TV trong showroom qua WebSocket.

### 🖥️ Server showroom (LAN) — `server/`
- Server **Bun + ElysiaJS** chạy trên mini-PC tại showroom, **tái dùng nguyên khối** các route handler Next.js (`app/api/*/route.ts`) — sửa một nơi, chạy cả Vercel lẫn LAN (slide tĩnh ~14ms trong LAN).
- **WebSocket event bus** (`lib/ws-protocol.ts`) nối TV ↔ Companion ↔ server: đẩy `SLIDE_READY`/`REFINE_READY`, prefetch ảnh, heartbeat + auto-reconnect, resume slide khi TV kết nối lại.

### 🛠️ Trang quản trị (`/admin`)
- Upload/convert tài liệu (PDF, Word, Excel → Markdown), upload ảnh, crawl website lấy dữ liệu, dạy Q&A mới, **reindex** embedding, xem log phiên chat.
- Script `sync_and_reindex.js` đồng bộ dữ liệu từ OneDrive → `data/` → rebuild `index.json` (kèm mô tả ảnh tự động bằng Gemini Vision).

## Công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| LLM | Google Gemini (`gemini-flash-latest`), embedding `gemini-embedding-001` |
| RAG | Index tự xây (`lib/rag.ts`): chunk + overlap, lọc chunk rác, cosine trên vector đã chuẩn hóa, lưu `index.json` trên nhánh GitHub riêng |
| STT | Deepgram Nova → Gemini → Whisper (Groq), Web Speech API |
| TTS | Edge TTS (`edge-tts-universal`) |
| Realtime | WebSocket (Bun), giao thức riêng trong `lib/ws-protocol.ts` |
| Server LAN | Bun + ElysiaJS (`server/`) |
| Deploy | Vercel (cloud) + mini-PC showroom (LAN/kiosk) |
| Lưu trữ log/index | GitHub API, nhánh `chatbot-logs` (không trigger deploy) |
| Khác | Google Maps Directions, Telegram Bot (báo lead), sharp (ảnh blur nền), Playwright |

## Cấu trúc thư mục

```
app/
  page.tsx        # Chatbot chính
  embed/          # Bản nhúng iframe cho WordPress
  slide/          # Live Slide cho TV showroom
  companion/      # Điều khiển từ điện thoại Sale
  voice/          # Hội thoại bằng giọng nói
  admin/          # Trang quản trị dữ liệu
  api/            # chat, slide, transcribe, tts, config, log-session, admin/*
components/       # ChatPanel, SlideStage, SlideBody, AttractScreen, DebugHud
hooks/            # useVoiceAgent, usePresentationMachine
lib/              # rag, intent, units, maps, presentation-machine, ws-protocol...
server/           # Server LAN Bun + ElysiaJS
data/             # Dữ liệu dự án (nguồn RAG)
docs/             # Tech spec, kịch bản câu hỏi, yêu cầu
scripts/          # gen-blur-bg, pull-index, dump-slides...
tests/            # test state machine, harness đánh giá RAG/retrieval
persona.md        # Persona tư vấn viên
index.json        # Chỉ mục embedding RAG
nhadat-chatbot.php# Plugin WordPress
```

## Chạy dự án

```bash
npm install
npm run dev          # Next.js dev tại http://localhost:3000

npm run server       # Server LAN showroom (cần bun >= 1.1)

npm run test:machine    # Unit test state machine trình chiếu
npm run test:harness    # Harness đánh giá chất lượng trả lời RAG
npm run test:retrieval  # Harness đánh giá truy hồi
```

Biến môi trường cần thiết (`.env.local` / `.env`):

| Biến | Dùng cho |
|------|----------|
| `GEMINI_API_KEY` | LLM trả lời + embedding + STT fallback |
| `DEEPGRAM_API_KEY` | STT chính (tùy chọn nhưng nên có) |
| `GROQ_API_KEY` | STT fallback Whisper (tùy chọn) |
| `GITHUB_TOKEN` | Ghi log phiên + tải/lưu `index.json` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Báo lead về Telegram |
| `GOOGLE_MAPS_API_KEY` | Tính tuyến đường thật |

## Các URL chính

| Đường dẫn | Mô tả |
|-----------|-------|
| `/` | Chatbot tư vấn |
| `/embed` | Bản nhúng iframe (WordPress) |
| `/slide` | Live Slide TV showroom (`?debug=1` bật HUD, `?ws=...` nối server LAN) |
| `/companion` | Điều khiển cho Sale |
| `/voice` | Hội thoại giọng nói |
| `/admin` | Quản trị dữ liệu & log |
