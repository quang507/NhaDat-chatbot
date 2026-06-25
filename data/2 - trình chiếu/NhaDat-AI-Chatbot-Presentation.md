# TỔNG HỢP TÍNH NĂNG NHADAT AI CHATBOT

---

## SLIDE 1: TỔNG QUAN
**NhaDat AI Chatbot**
*Hệ thống tư vấn bất động sản thông minh — tích hợp RAG, giọng nói & nhận diện ảnh*

**Chỉ số nổi bật:**
- **278** Tài liệu học
- **24/7** Hoạt động
- **3** Dự án được train
- **AI** Vision + Voice

---

## SLIDE 2: KIẾN TRÚC KỸ THUẬT
**Luồng hoạt động:**
Khách hỏi (Text/Giọng nói) ➔ RAG Engine (Tìm kiếm) ➔ Gemini AI (Sinh trả lời) ➔ Phản hồi (Text + Ảnh + Giọng nói)

**Công nghệ sử dụng:**
- **Next.js + TypeScript**: Frontend framework
- **Google Gemini 2.5**: LLM + Vision AI
- **Cohere Embed v3**: Vector embedding
- **Index JSON + GitHub**: Vector store & deploy
- **Web Speech API**: Speech-to-Text (Nhận diện giọng nói)
- **Google TTS**: Text-to-Speech (Đọc phản hồi)

---

## SLIDE 3: RAG — HỌC TỪ TÀI LIỆU THẬT
**Quy trình 4 bước:**
1. **Tài liệu gốc**: Nhận File Word, Excel, Markdown từ OneDrive.
2. **Chunk hóa**: Cắt nhỏ theo đoạn ngữ nghĩa.
3. **Vector hóa**: Cohere embed 1024 chiều.
4. **Tìm kiếm**: Cosine similarity theo câu hỏi.

**Nguồn dữ liệu đang được train:**
- **NyAh – Phú Định**: Giá bán, mặt bằng, tiến độ, chính sách thanh toán.
- **Villa NyAh**: Thiết kế, homestay, phong cách sống.
- **Dự án khác**: Các sản phẩm bất động sản Nhã Đạt.
- **Tài liệu marketing**: Sale kit, kịch bản tư vấn, nội dung marketing.

---

## SLIDE 4: THẤU HIỂU ĐA CHIỀU DỮ LIỆU
*Khả năng phân tích và tư vấn chuyên sâu dựa trên file đã nạp*

- 📐 **Thiết kế & Diện tích**: Số liệu m², mặt bằng, layout phòng ngủ, hướng nhà. Tư vấn chính xác căn hộ phù hợp với nhu cầu gia đình.
- 📍 **Vị trí & Tiện ích**: Khoảng cách đến trung tâm, liên kết vùng (trường học, siêu thị) và tiện ích nội khu (hồ bơi, công viên, gym).
- 🧱 **Vật liệu & Bàn giao**: Chi tiết hãng thiết bị vệ sinh, loại sàn gỗ, cửa kính, tủ bếp. Trả lời chi tiết "bàn giao gồm những gì?".
- 💰 **Giá bán & Chính sách**: Tiến độ thanh toán, chiết khấu, hỗ trợ vay vốn ngân hàng, thời gian bàn giao nhà, pháp lý dự án.

---

## SLIDE 5: GIAO TIẾP BẰNG GIỌNG NÓI
- **Speech-to-Text (STT)**: Nhận diện tiếng Việt bằng Web Speech API. Tự động restart ngầm khi mất kết nối mạng.
- **Text-to-Speech (TTS)**: Google TTS giọng nữ tiếng Việt. Preload audio để phát gần như tức thì.
- **Chuẩn hóa cách đọc**: Tự động đọc đúng chuẩn tiếng Việt: m² ➔ "mét vuông", Nhã Đạt Co.Ltd ➔ "công ty Nhã Đạt", v.v.
- **Tự phục hồi lỗi mạng**: Hoạt động ổn định, loại bỏ thông báo lỗi khó chịu khi người dùng im lặng lâu.

---

## SLIDE 6: GỬI ẢNH MINH HỌA TỰ ĐỘNG
**Quy trình xử lý ảnh:**
Upload ảnh ➔ Vision AI Tag (Gemini tự động mô tả) ➔ Index vào RAG ➔ Chatbot tự động gửi ảnh khi khách hỏi.

**Cấu trúc tự động nhận diện:**
- Mặt bằng tầng (mat_bang/)
- Phối cảnh dự án (phoi_canh/)
- Nội thất mẫu (noi_that/)
- Tiện ích dự án (tien_ich/)
- Logo & Đội ngũ công ty.

---

## SLIDE 7: ĐỒNG BỘ TỰ ĐỘNG TỪ ONEDRIVE
**Quy trình vận hành:**
1. **OneDrive (Thủ công)**: Nhân viên đưa tài liệu mới vào thư mục.
2. **Copy files (Tự động)**: Tự kéo file .md, .docx, .xlsx, ảnh về local.
3. **Tạo vectors (Tự động)**: Bỏ qua file cũ (check MD5 hash), chỉ chạy embedding cho file mới ➔ Tiết kiệm quota API.
4. **Deploy (Tự động)**: Push index lên GitHub, Vercel tự build và deploy live trong ~30 giây.

---

## SLIDE 8: SỐ LIỆU THỰC TẾ (PERFORMANCE)
- **278**: Tài liệu trong kho dữ liệu (Markdown, Word, Excel, hình ảnh).
- **1024D**: Vector dimensions (Cohere embed-multilingual-v3).
- **<1s**: Thời gian độ trễ phát TTS (Preload audio, near-zero latency).
- **3**: Dự án BĐS được train (NyAh Phú Định, Villa NyAh...).
- **5**: Loại file hỗ trợ (.md, .docx, .xlsx, .jpg, .png).
- **∞**: Khả năng mở rộng (Thêm dự án mới chỉ cần thả file vào thư mục).

---

## SLIDE 9: LỘ TRÌNH TÍNH NĂNG (ROADMAP)
✅ **Đã hoàn thành**:
- RAG từ tài liệu thật (278 file)
- Voice AI (STT + TTS tiếng Việt, chuẩn hóa đọc)
- Tự phục hồi lỗi mạng im lặng
- Auto-sync từ OneDrive
- Auto-tag ảnh bằng Vision AI

🔜 **Sắp ra mắt**:
- Index 100% tài liệu
- Chatbot gửi ảnh minh họa mượt mà
- Dashboard xem chat logs
- Ghi nhận lead khách hàng & Thống kê câu hỏi.

💡 **Tiềm năng mở rộng**:
- Đa ngôn ngữ (EN, ZH, KO)
- Tích hợp vào website chính, Zalo, Facebook
- Liên kết CRM tự động cập nhật
- Video call AI avatar.

---

## SLIDE 10: TỔNG KẾT
**Nhã Đạt Co., Ltd × AI**
*Tư vấn thông minh mọi lúc mọi nơi*
Hệ thống AI hoạt động 24/7, trả lời chính xác từ tài liệu nội bộ, giao tiếp bằng giọng nói tiếng Việt tự nhiên.
