# Báo cáo kiểm thử — 17/08/2026

Phạm vi: sau đợt sửa toàn bộ findings review (PR #128) + tối ưu tốc độ Vercel (PR này).

## 1. Kết quả tự động

| Hạng mục | Kết quả | Ghi chú |
|----------|---------|---------|
| State machine trình chiếu (`test:machine`) | ✅ 14/14 pass | gồm case mới: override khi frozen quay về đúng trạng thái |
| Lib chất lượng (`test:lib`) | ✅ 17/17 pass | STT normalize, cổng intent biên từ, lọc RAG, units |
| TypeScript (`tsc --noEmit`) | ✅ sạch | (trừ `bun:test` types — có sẵn từ trước, không ảnh hưởng build) |
| `next build` production | ✅ thành công | bundle `/slide` 136kB, `/` 98kB first-load |
| Smoke production (qua Vercel) | ✅ `/` 200, `/api/config` 200 đúng schema | môi trường CI hiện tại bị chặn egress tới vercel.app nên chưa chạy full `test:smoke` từ đây — đã có script + workflow để chạy từ máy khác/Actions |

## 2. Kiểm tra production sau deploy PR #128

- Trang chủ serve đúng bản mới (font `--font-display` đã áp dụng, widget render đủ).
- `/api/config` trả đúng JSON gợi ý + SĐT.
- **Phát hiện**: functions đang chạy ở `iad1` (US East) → mỗi request từ VN cộng ~200–300ms RTT. Đã sửa trong PR này (`regions: ["sin1"]`).

## 3. Tối ưu tốc độ trong đợt này

| Thay đổi | Tác dụng ước tính |
|----------|-------------------|
| `vercel.json` → `regions: ["sin1"]` (Singapore) | −200–300ms MỌI request API từ VN |
| Cache vector câu hỏi (embedQuery, RAM lambda) | −200–500ms cho câu hỏi lặp lại (rất phổ biến ở showroom) |
| `/api/config` cache CDN edge 5 phút | mở widget gần như 0ms, không đánh thức lambda |
| (từ PR #128) RAG index không còn flip-flop + memoize lọc chunk | bỏ tải 14MB định kỳ + bỏ ~5 regex × nghìn chunk mỗi request |
| (từ PR #128) timeout 5s Google Maps | không còn treo tới 60s khi Google chậm |

## 4. Việc còn mở (đề xuất, chưa làm)

1. Chạy `npm run test:smoke -- --url <prod>` từ máy có mạng tự do sau mỗi deploy (CI Actions đã có bản tương đương chạy 8h sáng hằng ngày).
2. `npm run test:harness:live` (chấm chất lượng trả lời 20+ câu) — tốn quota Gemini, chạy tuần/lần.
3. Cân nhắc thêm token cho `/api/slide`, `/api/transcribe`, `/api/tts` — cần phối hợp vì TV showroom/LAN gọi từ origin khác.

## 5. Cách báo lỗi

Tạo issue trên GitHub bằng template **🐞 Báo lỗi** (chọn nơi xảy ra + mức P0–P3, kèm bước tái hiện). Quy trình chi tiết: `docs/QA_TEST_PLAN.md` §1.
