# Requirements - Bot Slide Ny'ah Phú Định

> Rà soát end-to-end ngày 01/08/2026, góc nhìn UX + kỹ thuật.
> Trạng thái: ✅ đã đạt · 🔧 sửa trong đợt này · ⬜ chưa làm (kèm ưu tiên P0-P3).

## 1. Bức tranh & người dùng

Pipeline: **micro → STT → phân loại ý định → 4 tầng chọn slide (combo / keyword
/ quét thư mục / RAG+LLM) → SlideBody render → giọng đọc**.

| Người dùng | Cần gì nhất |
|---|---|
| Khách tại showroom | Slide ĐÚNG chủ đề vừa hỏi, hiện NGAY, ảnh đẹp, chữ đọc được |
| Sale đứng nói | Máy không phá nhịp: không nhảy slide bậy, không nói số sai |
| Người quản trị nội dung | Thêm/sửa slide, ảnh, giá mà không cần dev |

## 2. Yêu cầu UX

### 2.1 Đúng - nguyên tắc số một
- 🔧 **P0 - Không bao giờ nhảy slide sai chủ đề khi khách nói chuyện thường.**
  Đã sửa đợt này: so khớp keyword có BIÊN TỪ + chặn khớp bỏ-dấu cho từ ngắn
  ("cho anh hỏi" từng ra slide chợ vì chợ→cho; "đánh giá cao" từng ra bảng giá).
- ✅ Số nhạy (giá, kích thước) khóa `forceStatic` - LLM không được viết lại.
- ✅ Câu về đối thủ và câu ngoài lề: cố ý im lặng (guard), sale tự xử lý.
- ⬜ **P1 - Trả lời thật khi KHÔNG có**: "hồ bơi có không?" đang ra slide tiện
  ích chung chung thay vì nói thẳng "không có hồ bơi, đổi lại có X". Cần entry
  "không có" cho: hồ bơi, gym, hầm xe chung.
- ⬜ **P1 - Ngập nước Q8**: câu hỏi nặng ký nhất đang trống. Cần câu trả lời
  chính thức từ công ty, không để LLM tự nói.

### 2.2 Nhanh - ngân sách độ trễ theo tầng
- ✅ Tầng 1-3 (combo/keyword/thư mục): trả ~0ms, chiếm đa số câu showroom.
- ✅ Tầng 4 (RAG+LLM): 1-3s, có trạng thái "Đang suy nghĩ".
- ⬜ **P2 - Đo thật**: log thời gian từng tầng (`_source` đã có, cần cộng dồn
  số liệu) để biết tỉ lệ câu rơi xuống tầng chậm.

### 2.3 Trình chiếu
- ✅ Một ảnh một thời điểm, crossfade 0,8s, nhịp 2,5s, chấm chỉ báo.
- ✅ Ken-burns 0,8s chạy một lần; tôn trọng prefers-reduced-motion.
- ✅ Chữ đè gradient đen - tương phản ổn định trên mọi ảnh.
- ⬜ **P2 - Sale điều khiển được**: nút/lệnh "giữ slide này" (pin) và "quay lại
  slide trước" - hiện slide đổi là mất, sale không kéo lại được.
- ⬜ **P3 - Đồng bộ giọng đọc với vòng ảnh**: speech dài hơn 7,5s (3 ảnh × 2,5s)
  thì ảnh lặp vòng - cân nhắc kéo nhịp theo độ dài speech.

### 2.4 Hiểu ngôn ngữ nói
- ✅ Phiên âm STT cho tên riêng: phiu dân/cát mô/ô put/ê tốp.
- ✅ Keyword là chữ khách nói ra miệng, có bản bỏ dấu (từ đủ dài).
- ⬜ **P1 - NGỮ CẢNH HỘI THOẠI**: mỗi câu đang xử lý độc lập. "Còn căn nào?" →
  "thế căn ĐÓ giá nhiêu?" - bot không biết "căn đó" là gì. Đề xuất: client gửi
  kèm 2-3 câu gần nhất + slide đang hiện; route nối vào cleanMsg trước khi
  match, và đưa vào prompt LLM. (lib/conversation.ts có state machine sẵn
  nhưng /api/slide CHƯA dùng - nối lại.)

## 3. Yêu cầu kỹ thuật

### 3.1 So khớp & định tuyến
- 🔧 **P0 - kwHit()** (lib/intent.ts): biên từ hai đầu; khớp bỏ-dấu chỉ cho từ
  ≥5 ký tự hoặc cụm nhiều từ. Dùng chung cho `has()` (route) + `matchStaticSlide`.
- 🔧 P0 - Bỏ keyword trần một-từ dễ dính: 'giá', 'trộm' → thay bằng cụm.
- ✅ Kết quả combo không bị chuỗi generic đè (guard đã thêm đợt trước).
- ⬜ **P2 - Một bảng định tuyến duy nhất**: thứ tự ưu tiên đang rải trong ~150
  dòng if/else ở route.ts - gom về bảng khai báo để đọc được và test được.

### 3.2 Dữ liệu & nội dung
- ✅ slides.json là nguồn sửa nhanh (87 entry), có ngưỡng an toàn ≥60, fallback
  hardcode; `npm run slides:dump` đồng bộ từ TS.
- 🔧 **P1 - dump tự kiểm ảnh**: đường dẫn ảnh sai là fail ngay lúc dump, không
  thành slide trống hình trên production.
- ✅ Ảnh tạm có mộc "ẢNH MINH HỌA" cho chủ đề chưa có ảnh thật; thay file cùng
  tên là xong.
- ⬜ **P1 - Index RAG tươi**: build 02/07, không có nhắc hạn. Cần: cron reindex
  hoặc cảnh báo khi builtAt > 30 ngày; slide tiến độ tự trỏ tháng mới nhất có
  ảnh thay vì hardcode T6.
- ⬜ P2 - Boost nguồn 03_Human-QA đang là code chết (0 chunk nguồn đó) - hoặc
  nạp Q&A chuẩn vào, hoặc bỏ boost.

### 3.3 Kiểm thử & quan sát
- ✅ test:retrieval (Hit@5 91,7%) · loader JSON có 6 ca hỏng đều fallback đúng.
- ⬜ **P1 - Gauntlet định tuyến tự động**: bộ ~40 câu (đúng chủ đề + câu vu vơ
  phải SKIP) chạy `npm run test:routing` trước mỗi lần merge - hôm nay toàn bộ
  test chạy tay bằng curl.
- ⬜ P2 - Log câu bị SKIP về admin: mỏ vàng để biết khách hỏi gì mà bot chịu.
- ⬜ P3 - Telemetry tỉ lệ tầng 1-4, top câu hỏi theo tuần.

### 3.4 Vận hành
- ✅ /thu-slide: gõ câu ra slide thật, cờ ambient giống showroom, soi nhánh +
  thời gian + ảnh 404.
- ⬜ P2 - Trang admin xem/sửa slides.json trực tiếp (đang phải sửa file).
- ⬜ P3 - Rate-limit /api/slide (đang mở, tin tưởng cùng mạng showroom).

## 4. Việc đã chốt đợt này (01/08)

1. kwHit - so khớp biên từ, diệt lớp lỗi "cho anh hỏi → slide chợ" (P0)
2. Dọn keyword trần 'giá', 'trộm'
3. dump-slides tự kiểm ảnh tồn tại
4. Xác minh: 6 câu vu vơ SKIP đúng, 15 câu chủ đề giữ nguyên, retrieval không đổi

## 5. Đề xuất thứ tự làm tiếp

1. **Ngữ cảnh hội thoại** (P1 - nâng chất lượng rõ nhất với khách thật)
2. **Gauntlet test:routing** (P1 - khóa không cho lỗi định tuyến quay lại)
3. **Câu trả lời "không có" + ngập nước** (P1 - cần nội dung từ công ty)
4. **Index tươi + reindex định kỳ** (P1)
5. Pin/back slide cho sale (P2) → bảng định tuyến khai báo (P2) → admin UI (P2)
