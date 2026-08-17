# Kế hoạch kiểm thử — NhaDat Chatbot & Live Slide

> Mục tiêu: đảm bảo chất lượng toàn diện trước/sau mỗi lần deploy Vercel.
> Kịch bản câu hỏi đầy đủ: `200_KICH_BAN_CAU_HOI.md` (+P2). Dữ liệu kiểm thử máy đọc được: `tests/test_data.json`.

## 1. Công cụ & quy trình

| Việc | Công cụ | Cách chạy |
|------|---------|-----------|
| Unit test state machine | bun test | `npm run test:machine` |
| Unit test lib (STT normalize, intent, RAG filter, units) | bun test | `bun test tests/lib_quality.test.ts` |
| Smoke E2E bản web (trang + API + bảo mật) | Node ≥ 18 | `node tests/smoke_e2e.mjs [--url https://…]` |
| Chất lượng trả lời RAG (keyword + chống bịa) | harness có sẵn | `npm run test:harness:live` |
| Chất lượng truy hồi (retrieval) | harness có sẵn | `npm run test:retrieval` |
| Smoke tự động hằng ngày | GitHub Actions | `.github/workflows/smoke-test.yml` (8h sáng VN + bấm tay) |
| **Quản lý lỗi** | GitHub Issues | Template `Báo lỗi` (chọn nơi xảy ra + mức P0–P3); gắn milestone theo đợt sửa; lỗi P0/P1 phải có issue trước khi sửa |

**Quy ước mức độ lỗi**: P0 = sập/sai dữ liệu giá-pháp lý/lộ thông tin (sửa ngay trong ngày) · P1 = tính năng chính hỏng (≤ 3 ngày) · P2 = có đường vòng · P3 = nhỏ.

## 2. Test case người dùng (manual, mỗi lần deploy lớn)

### A. Chat web `/` và widget `/embed`
| ID | Bước | Kỳ vọng |
|----|------|---------|
| A1 | Mở `/`, bấm 1 gợi ý câu hỏi | Có 3 chấm chờ → chữ stream về ≤ ~5s, nội dung đúng dự án |
| A2 | Hỏi "căn số 9 diện tích bao nhiêu" | Số liệu đúng bảng tra cứu (không bịa), có thể kèm ảnh |
| A3 | Hỏi "còn căn nào chưa bán, giá?" | Danh sách lô còn trống + giá |
| A4 | Hỏi đường đi ("từ sân bay tới dự án bao xa") | Số km/phút thật + link Google Maps |
| A5 | Gửi câu mới NGAY khi câu cũ đang stream | Không mất/đè tin nhắn nào |
| A6 | Tắt mạng giữa lúc đang stream | Tin đang dở có dòng "⚠️ Kết nối bị gián đoạn…", không văng trắng |
| A7 | Nhắn tin kèm SĐT (vd "gọi em 0909123456") | Telegram nhận tin báo lead trong ~1 phút |
| A8 | Nhắn tin chứa `<b>` `&` `"` | Hiển thị dạng chữ thường, không vỡ giao diện, lead Telegram vẫn về |
| A9 | Mở widget trên WordPress (iframe) | Nút 🎧/📊 mở tab mới, không kẹt trong iframe |

### B. Live Slide `/slide` (TV showroom)
| ID | Bước | Kỳ vọng |
|----|------|---------|
| B1 | Bật mic, nói "vị trí dự án ở đâu" | Slide vị trí hiện gần như tức thì (pha 1 tĩnh) |
| B2 | Nói tiếp "tầng 2 mẫu cosmo có gì" | Slide công năng tầng đúng datasheet |
| B3 | Tám chuyện ("hôm nay trời đẹp nhỉ") | KHÔNG đổi slide |
| B4 | Nói "đánh giá cao khu này" | KHÔNG nhảy slide bảng giá (biên từ) |
| B5 | Nói "cân số 5" (giọng dễ nghe nhầm) | Vẫn ra đúng thông tin căn số 5 |
| B6 | Rút mạng server LAN / mất WS | Chip "🔌 Mất kết nối server" hiện góc phải, tự nối lại |
| B7 | Mở bằng Brave/Firefox | Sau vài giây báo rõ "trình duyệt chặn nhận diện giọng nói", chuyển chế độ tay |
| B8 | Bấm ảnh phóng to rồi nhấn Esc | Overlay đóng |

### C. Companion `/companion` (điện thoại Sale)
| ID | Bước | Kỳ vọng |
|----|------|---------|
| C1 | ĐÓNG BĂNG khi TV đang nghe | TV hiện "⏸ Đã đóng băng", mic dừng |
| C2 | Đang FREEZE, bấm "chiếu nhanh" một chủ đề | Slide đổi nhưng TV **vẫn frozen** (không tự bật nghe lại) |
| C3 | Tắt server WS rồi bấm nút | Nút mờ + không bấm được (không nuốt lệnh im lặng) |
| C4 | ⏮⏯⏭ chuyển ảnh | TV phản ứng tức thời |

### D. Voice `/voice`
| ID | Bước | Kỳ vọng |
|----|------|---------|
| D1 | Chạm quả cầu, hỏi 1 câu | Bot đọc từng câu (không đợi hết), ảnh nền đổi theo chủ đề |
| D2 | Nói chen khi bot đang đọc | Bot ngắt, quay lại nghe (barge-in) |
| D3 | Rời trang khi mic đang bật | Đèn mic trình duyệt TẮT (không leak) |
| D4 | Nút "Sao chép" log | Hiện "✓ Đã chép", log dán ra đúng nhiều dòng |

### E. Admin `/admin`
| ID | Bước | Kỳ vọng |
|----|------|---------|
| E1 | Vào không có mật khẩu | Bị chặn |
| E2 | Sửa persona.md rồi hỏi lại chat + slide | CẢ HAI đổi văn phong trong ≤ 5 phút |
| E3 | Reindex xong hỏi dữ liệu mới | Bot trả theo index mới, không "flip-flop" về bản cũ |

## 3. Tự động hóa (chạy trước khi merge)

```bash
npm run test:machine                 # 14 test state machine
bun test tests/lib_quality.test.ts   # 17 test lib chất lượng
npm run build                        # build phải xanh
node tests/smoke_e2e.mjs --url <preview-url>   # sau khi Vercel build preview
```

Sau khi merge vào `main`: workflow `Smoke Test Production` tự chạy 8h sáng hằng ngày (hoặc bấm Run workflow) — test 5 câu chat + 5 câu slide + TTS/STT vòng tròn trên production.

## 4. Tiêu chí phát hành (release gate)

- [ ] Unit test + build xanh
- [ ] Smoke E2E pass trên preview URL
- [ ] Không còn issue P0/P1 mở cho các surface bị đổi
- [ ] Đo tay 1 câu chat + 1 câu slide trên production sau deploy (mục A1, B1)
