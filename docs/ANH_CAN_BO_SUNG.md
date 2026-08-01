# Ảnh cần bổ sung cho bot slide - Ny'ah Phú Định

> Đối chiếu ngày 01/08/2026 giữa: ảnh trong repo (`public/images/01_NyAh-PhuDinh`,
> 181 ảnh), thư mục OneDrive `ChatBotImages_Upload/01_NyAh-PhuDinh`, dữ liệu RAG
> (526 chunk) và catalog slide (82 entry).
>
> Cách dùng: bỏ ảnh vào đúng thư mục OneDrive theo bảng dưới, đặt tên theo luật
> ở mục 4, rồi chạy `node standardize_onedrive_images.js` (script có sẵn, tự nén
> + đặt tên bằng Gemini Vision cho ảnh tên rác).

## 1. LỆCH CẤU TRÚC: 6 thư mục OneDrive chưa có trong repo

Ảnh bỏ vào các thư mục này hiện **không tới được bot**:

| Thư mục OneDrive | Xử lý |
|---|---|
| `an_ninh/` | Tạo mới trong repo. Cần ảnh: camera, chốt bảo vệ, barrier cổng |
| `canh_quan/` | Trùng vai với `tien_ich/lanscape-khuon-vien-anh-chup/` - nên gộp về một |
| `chinh_sach/` | Tạo mới. Cần ảnh: bảng chính sách đợt hiện tại, sơ đồ lịch thanh toán |
| `gia_ban/` | Tạo mới. Cần ảnh: bảng giá từng lô T mới nhất (hiện bot chỉ đọc giá bằng chữ) |
| `ngoai_that/` | Tạo mới. Cần ảnh: mặt tiền + **mặt ngang (side view)** từng mẫu |
| `tong_quan/` | Repo đang để 13 ảnh tổng quan rơi lạc ở gốc - dọn vào thư mục này |

## 2. ẢNH CÒN THIẾU THEO CÂU HỎI KHÁCH (ưu tiên từ trên xuống)

### Thiếu hẳn - khách hỏi là slide dùng ảnh sai chủ đề

| Câu khách hỏi | Ảnh cần | Tên file gợi ý |
|---|---|---|
| "Gói Air với gói Max khác gì?" | Bảng so sánh 2 gói + ảnh thực tế từng gói | `goi-air-vs-max_bang-so-sanh.jpg`, `goi-air_ban-giao.jpg`, `goi-max_ban-giao.jpg` |
| "Cổng bao nhiêu mét? Cửa phụ?" | Datasheet kích thước cổng chính, cửa phụ, cửa cuốn | `thong-so_cong-chinh-Xm.jpg`, `thong-so_cua-phu-Xm.jpg` |
| "Nội thất dùng của bên nào?" | Bảng brand vật liệu (bếp, thiết bị vệ sinh, thang máy, AirTop, ByteLife) | `brand_vat-lieu-noi-that.jpg` |
| "Cho xem mặt ngang / bên hông" | Mặt ngang từng mẫu | `cosmo-gen-2_mat-ngang.jpg` (x3 mẫu) |
| "An ninh thế nào?" (đang mượn ảnh cổng) | Camera, chốt bảo vệ | `an-ninh_camera-1.jpg`, `an-ninh_chot-bao-ve.jpg` |
| "Bảng giá đâu?" (đang dùng ảnh sơ đồ lô) | Ảnh bảng giá chính thức đợt hiện tại | `gia-ban_bang-gia-T08-2026.jpg` |

### Từng tầng - đang thiếu tầng 5, 6 của cả 3 mẫu

Hiện có `tinh-nang-tang-1..4`. Khách hỏi "tầng 5 có gì", "sân thượng tầng 6" là hụt.

| Mẫu | Đang có | Cần thêm |
|---|---|---|
| Cosmo Gen 2 | tầng 1-4 | `cosmo-gen-2_tinh-nang-tang-5.jpg`, `-tang-6.jpg` |
| Fusion Gen 5 | tầng 1-4 (+ mặt bằng 5) | `fusion-gen-5_tinh-nang-tang-5.jpg`, `-tang-6.jpg` |
| Opus | tầng 1-4 | `opus_tinh-nang-tang-5.jpg`, `-tang-6.jpg` |

Tốt nhất mỗi tầng dùng **mặt bằng có ghi kích thước** - 1 ảnh trả lời được cả chục câu hỏi số đo.

### Mỏng - có 1-2 ảnh, nên thêm cho slide đỡ lặp

| Thư mục | Đang có | Nên có |
|---|---|---|
| `vi_tri/duong_di/` | 2 | + bản đồ tiện ích ngoại khu (trường, chợ, bệnh viện), ảnh thực tế đường Trương Đình Hội |
| `phap_ly/` | 1 (logo) | + ảnh bìa sổ hồng mẫu / GPXD (che số) - tăng độ tin |
| `tien_ich/cong_vien/` | 2 | + 2-3 ảnh chụp thật khi có |
| WC / sân thượng / ban công từng mẫu | 0-1 | mỗi mẫu 1 ảnh WC master, 1 sân thượng |
| `tien_do/xay_dung/` | tới T6/2026 | **T7, T8/2026** - khách hỏi tiến độ là hỏi tháng mới nhất |

### Tình huống khách hỏi mà CHƯA có slide lẫn ảnh (bổ sung cả 2)

- "Phí quản lý bao nhiêu?" - ảnh bảng phí (nếu có chính sách)
- "Xe hơi 2 chiếc để được không?" - ảnh gara chụp có 2 xe / thông số gara
- "Ngập nước không khu này?" - ảnh cao độ nền / hạ tầng thoát nước
- "Nhà hoàn thiện thực tế" (khác render) - ảnh chụp căn đã bàn giao thật
- "Video/flycam có không?" - nếu có, để link YouTube vào slide (bot hỗ trợ chữ + QR)

## 3. TỔNG SỐ TỐI THIỂU

Đang có 181 ảnh nhưng lệch: thừa render Signature (31), thiếu datasheet/thông số.
Cần thêm khoảng **35-40 ảnh** theo mục 2 là phủ hết câu hỏi sếp liệt kê.

## 4. LUẬT ĐẶT TÊN (bắt buộc)

1. Không dấu tiếng Việt, không khoảng trắng, không ngoặc `()`. Chỉ chữ thường,
   số, gạch `-` và `_`. (Tên có khoảng trắng từng làm chết cả loạt slide.)
2. Công thức: `<mau-nha>_<khong-gian>_<noi-dung>-<so>.jpg`
   - `fusion-gen-5_tang-2_phong-ngu-ong-ba-1.jpg`
   - Ảnh chung cả dự án: prefix `nyah-phu-dinh_...`
3. Ảnh về số liệu thì **cho số vào tên**: `thong-so_cong-chinh-4m.jpg` -
   nhãn nguồn trên slide tự suy từ đường dẫn, và người sau nhìn tên là hiểu.
4. Ảnh tiến độ: `thang_08-2026-1.jpg` trong `tien_do/xay_dung/` - đúng mẫu này
   thì thêm slide tháng mới chỉ mất 1 phút.

## 5. LOGIC CHỌN ẢNH THÔNG MINH (cách hệ thống nên chạy)

Nguyên tắc: **câu hỏi càng cụ thể, tầng khớp càng ưu tiên**. 4 tầng, trên
xuống, trúng tầng nào dừng tầng đó:

```
Khách nói câu X
  │
  ├─ T1. COMBO cụ thể (allOf): "bếp" + "cosmo" → ảnh bếp Cosmo đích danh
  │      ~0ms, chính xác tuyệt đối vì người gán tay
  ├─ T2. KEYWORD đơn (82 entry catalog): "phong thủy" → slide hướng nhà
  │      ~0ms, ảnh cố định theo chủ đề
  ├─ T3. QUÉT THƯ MỤC theo mẫu nhà + không gian: hỏi "wc opus" mà chưa có
  │      entry → tự lấy ảnh trong noi_that/opus/wc/
  │      → ĐÂY LÀ LÝ DO thư mục phải đặt đúng tên: thư mục LÀ dữ liệu
  └─ T4. RAG + LLM: câu lạ ("ngập nước không?") → tìm đoạn dữ liệu, LLM soạn
         slide, chỉ được chọn ảnh có kiểm tra tồn tại. 1-3s.
```

Ba tầng đầu đã chạy trong code hiện tại. Muốn "thông minh" hơn nữa thì thứ cần
đầu tư **không phải code, mà là dữ liệu đúng chỗ**:

1. **Phủ keyword theo miệng khách** - keywords phải là chữ khách nói
   ("cổng bao nhiêu mét", "gói max là sao"), thêm cả phiên âm nghe nhầm của
   micro như đã làm với "phiu dân"/"cát mô".
2. **Mỗi thư mục = một câu trả lời** - bot tự quét thư mục, nên bỏ ảnh đúng
   chỗ là bot tự khôn ra, không cần sửa code.
3. **Ảnh datasheet > ảnh đẹp** khi câu hỏi về số liệu - khách hỏi "cổng mấy
   mét" mà chiếu ảnh cổng lung linh không có số là trả lời trượt.
4. Slide nào có số nhạy (giá, kích thước) thì đặt `forceStatic: true` để LLM
   không được viết lại - số sai còn tệ hơn không có slide.

## 6. VIỆC CODE SẼ LÀM SAU KHI CÓ ẢNH (phía Claude, không phải việc của anh)

- Tạo entry slide mới: gói Air/Max, cổng-cửa, brand nội thất, mặt ngang,
  an ninh, tầng 5-6, phí quản lý, ngập nước
- Map 6 thư mục mới vào `getGeneralImagesForSpace` + `deriveSource`
- Dọn 13 ảnh tổng quan ở gốc vào `tong_quan/`
- Cập nhật slide "Tiến độ" sang tháng mới + reindex RAG
