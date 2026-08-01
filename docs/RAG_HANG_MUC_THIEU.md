# RAG - Kiểm kê hạng mục dữ liệu dự án (quét toàn diện 01/08/2026)

> Quét 526 chunk index (build 02/07) theo 44 hạng mục nhỏ, 8 nhóm. Mỗi hạng mục
> đã xác minh mẫu nội dung thật, không tin regex mù (2 kết quả đầu bị regex
> lừa: "ngập" bắt trúng "nắng ngập tràn" - đã soi tay lại).
>
> ✅ có dữ liệu tốt · 🟡 mỏng/chung chung · ❌ không có

## KHÔNG CÓ - ưu tiên bổ sung (11 hạng mục)

| # | Hạng mục | Ai cung cấp | Ghi chú |
|---|---|---|---|
| 1 | **Giá từng lô** (bảng giá đủ 7 lô đang bán) | Sales admin | RAG chỉ có "từ 8,9 tỷ" - khách hỏi "lô 23 giá nhiêu" là LLM không có số |
| 2 | **Số GPXD / số QĐ phê duyệt** | Pháp lý | Có nhắc "1/500" nhưng không có số văn bản - khách kỹ tính sẽ hỏi |
| 3 | **Mác bê tông / thép / móng sâu bao nhiêu** | Kỹ thuật | Khách kỹ sư hay hỏi; hiện chỉ có 1 câu chung về ép cọc |
| 4 | **Điện 1 pha/3 pha, công suất** | Kỹ thuật | Quan trọng với khách định kinh doanh (Opus) |
| 5 | **Thang máy: hãng, tải trọng kg** | Kỹ thuật | Nói "có thang máy" nhiều nhưng không hãng/tải |
| 6 | **Quy trình nghiệm thu nhận nhà** | Vận hành | Checklist khách cần kiểm khi nhận nhà |
| 7 | **An ninh - dân trí khu vực** | Marketing | Câu "khu này dân thế nào" đang trống |
| 8 | **Vốn điều lệ / năm thành lập / MST Nhã Đạt** | Kế toán | Khách thẩm định chủ đầu tư sẽ tra |
| 9 | **Giải thưởng / chứng nhận** | Marketing | Nếu có thì thêm, không có thì thôi |
| 10 | **Báo chí viết về dự án** | Marketing | Link bài báo tăng độ tin mạnh |
| 11 | **Review / câu chuyện cư dân thật** | Marketing | Dự án cũ của Nhã Đạt có cư dân - xin 2-3 câu chuyện |

## MỎNG - có nhắc nhưng thiếu chi tiết (8 hạng mục)

| # | Hạng mục | Hiện có gì | Cần thêm |
|---|---|---|---|
| 12 | Lịch thanh toán theo đợt | Chỉ "đợt 1: 30% + ký cọc với Cty Nhà Đất Đô Thị Mới" | Đủ các đợt 2,3,4… % và mốc |
| 13 | Trần cao từng tầng | 1 câu | Bảng cao độ từng tầng từng mẫu |
| 14 | Chống thấm / chống sét | 1 câu | Vật liệu gì, bảo hành mấy năm |
| 15 | Kích thước cổng/cửa | 1 câu | Datasheet số đo (đã có ảnh tạm chờ) |
| 16 | Danh mục bàn giao thô | 1 đoạn | Liệt kê đủ hạng mục như phụ lục HĐ |
| 17 | Quy chế cư dân | 1 câu | Nuôi pet/sửa nhà/biển hiệu được-không |
| 18 | Điện nước sang tên, định mức | 1 câu | Thủ tục + giá dân hay kinh doanh |
| 19 | Rác / ca trực bảo vệ | 1 câu | Giờ thu rác, số ca bảo vệ |

## ĐÃ ĐỦ - không cần lo (25 hạng mục)

Pháp lý 1/500 (6) · cam kết ra sổ (2) · điều khoản HĐMB (18) · phạt trễ (2) ·
tên ngân hàng liên kết (13) · lãi suất/ân hạn (6) · đặt cọc (11) · trước bạ/công
chứng (19) · **phí quản lý 0 đồng nhờ ByteLife** (13 - cần anh xác nhận "0 đồng"
còn đúng) · phí bảo trì (2) · thông số 50 lô (2 bảng) · trạng thái bán (5) ·
gói Air chi tiết (10) · gói Max chi tiết (18) · tường gạch (4) · cấp thoát
nước (12) · PCCC (9) · brand thiết bị vệ sinh (5) · brand sơn/gạch/cửa (5) ·
ByteLife (35) · bảo hành có thời hạn (4) · **ngập nước: nội khu nâng nền +60cm
so với mặt đường** (6) · quy hoạch lân cận (4) · tên trường/BV cụ thể (5) ·
khoảng cách km/phút (14) · ban quản lý (4) · dự án đã bàn giao (6).

## Sửa sai báo cáo trước

1. REQUIREMENTS.md từng ghi "ngập nước: trống hoàn toàn" - **SAI**. RAG có câu
   trả lời tốt (nâng nền +60cm, hạ tầng thoát nước mới). Cái thiếu là slide
   keyword - đã thêm slide "Chống ngập & Cao độ nền" (forceStatic) đợt này.
2. Từng ghi "phí quản lý: cần con số" - RAG có "0 đồng nhờ ByteLife" ở 13
   chunk. Cần anh XÁC NHẬN chính sách này còn hiệu lực rồi mới đưa thành slide.

## Cách nạp bổ sung

Mỗi hạng mục viết dạng Q&A ngắn (hỏi như khách nói - đáp có SỐ LIỆU) vào file
trong thư mục dữ liệu, chạy reindex trên /admin, rồi `npm run index:pull` +
commit để bản đóng gói theo deploy được cập nhật.
