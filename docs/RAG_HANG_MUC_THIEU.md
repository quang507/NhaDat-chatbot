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
| 12 | ~~Lịch thanh toán theo đợt~~ **SỬA SAI 01/08 tối: RAG CÓ ĐỦ** (file Giá & Thanh toán/phuong-thuc-thanh-toan): cọc 10% → 3%/tháng ×7 = 31% → bàn giao Air +8% = 39% → công chứng HĐMB 61% = 100%, kèm ví dụ chiết khấu thanh toán sớm | Đã đưa lên slide "Lịch thanh toán theo đợt" (forceStatic) | ✅ xong |
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


---

# BỔ SUNG 01/08 (chiều): Quét sâu VẬT LIỆU + GÓI NỘI THẤT

> 27 hạng mục vật liệu + 6 mục gói nội thất, có trích nguồn thật từ RAG.

## Vật liệu - ĐÃ CÓ trong RAG (kèm brand cụ thể)

| Hạng mục | RAG ghi gì |
|---|---|
| Sàn | Gạch porcelain Vietceramics / Trường Thịnh / Đồng Tâm; sàn gạch/gỗ theo gói |
| Tường/sơn | Sơn nội thất Maxilite; ngoại thất ICI Dulux Weathershield Power Flexx |
| Trần | Thạch cao Vĩnh Tường |
| Cửa nhôm kính | Hệ Xingfa 55, kính cường lực; cửa chính kim loại cắt CNC |
| Kính tắm | Cường lực 10mm, phụ kiện Imundex |
| Cầu thang | Đá Granite (mặt nằm) + Moca trắng (mặt đứng); lan can sắt sơn Jotun, tay vịn gỗ sồi phủ PU |
| Mặt bếp | Đá granite |
| Tủ bếp | Ván An Cường (gói Max); tủ quần áo MFC kháng ẩm + đèn led |
| Thiết bị vệ sinh | Inax đầy đủ (lavabo, bồn cầu, vòi sen, phụ kiện) |
| Điện | Dây Cadivi |
| Nước | Ống PPR/PVC Bình Minh; bồn 1000L; máy nước nóng NLMT Đại Thành 210L |
| Máy lạnh | LG âm trần (phòng ngủ) + treo tường (khách) - gói Max |
| Kết cấu | Móng cọc BTCT, khung cột sàn BTCT toàn khối, mái BTCT; móng-tường-cột XÂY RIÊNG TỪNG CĂN |
| AirTop | 9,5 triệu lít khí tươi/ngày |
| ByteLife | Máy chủ tại bếp, khóa garage, công tắc đèn... |

## Vật liệu - CHƯA CÓ (4)

1. **Cửa cuốn: hãng gì** (Austdoor/Titadoor?)
2. **Sen vòi: hãng riêng** (đang gộp chung "Inax đầy đủ" - nếu đúng Inax hết thì ghi rõ)
3. **Thang máy: hãng + tải trọng kg** (nhắc nhiều nhất mà không có spec)
4. **Gạch bông gió: loại/kích thước** (điểm nhấn kiến trúc mà không có thông số)

## Gói nội thất - CÓ / THIẾU

| Mục | Trạng thái |
|---|---|
| Air gồm gì | ✅ sàn, trần, sơn, cầu thang đá, cửa phòng, TBVS Inax, điện nước ngầm, AirTop. Ghi rõ KHÔNG gồm: tủ bếp, thiết bị bếp, máy lạnh, nội thất rời, smarthome |
| Max gồm gì | ✅ Air + tủ bếp An Cường + trọn bộ thiết bị bếp + máy lạnh LG + kệ trang trí + ByteLife |
| **Giá gói Max** | ✅ **1,6 - 1,9 tỷ/căn tùy mẫu** ("chìa khóa trao tay") - đã đưa lên slide |
| Giá gói Air (số tiền) | ❌ chỉ có mốc thanh toán 8% khi bàn giao Air - không có giá gói |
| Giá TỪNG MÓN (tủ bếp bao nhiêu, máy lạnh bao nhiêu) | ❌ không có |
| Hãng từng món nội thất rời (sofa, giường, bàn ăn) | ❌ không có |
| Nội thất Cashmere - danh mục + giá | ❌ không có (chỉ có mô tả không gian) |

## ⚠️ SỐ KHÔNG CÓ NGUỒN - CẦN ANH XÁC NHẬN GẤP

Slide "Gói bàn giao: Thô & Air" và "Bảng giá T6/2026" đang nói **"gói Air cộng
thêm khoảng 3% giá trị"** - quét toàn bộ RAG **không tìm thấy nguồn nào** cho
con số 3% này (có từ catalog cũ trước khi tôi tham gia). Nếu 3% sai thì đang
báo khách số bịa. Anh xác nhận: giữ 3%, đổi thành số khác, hay bỏ ý này?
