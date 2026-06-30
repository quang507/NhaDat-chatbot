# CẤU TRÚC THƯ MỤC ẢNH SLIDE BOT — Ny'ah Phú Định

> Script `sync_and_reindex.js` **mirror** thư mục OneDrive
> `ChatBot, LiveSlide/ChatBotImages_Upload/` → `public/images/` (xóa cũ, copy mới).
> ⇒ Cấu trúc + TÊN FILE trong OneDrive phải **khớp y hệt** danh sách dưới đây thì slide bot mới hiện đúng ảnh.

Đặt ảnh trong: `ChatBotImages_Upload/01_NyAh-PhuDinh/...`

Mỗi mẫu nhà 1 thư mục. Bot tự suy ra mẫu nhà theo SỐ CĂN khách hỏi:
- 🟨 **Opus** → căn `01, 02, 15–26`
- 🟩 **Fusion Gen 5** → căn `04–14, 27–37`
- 🟥 **Cosmo Gen 2** → căn `03, 38–42, 45–50`
- 🟦 **Signature by Codinachs** → căn `43, 44` *(xem ghi chú cuối)*

---

## 01_NyAh-PhuDinh/

```
01_NyAh-PhuDinh/
├── noi_that/
│   ├── cosmo_gen_2/
│   │   ├── cosmo-gen-2_bep.png            ✅ có
│   │   ├── cosmo-gen-2_gara.png           ✅ có
│   │   ├── cosmo-gen-2_phong-khach.png    ✅ có
│   │   ├── cosmo-gen-2_ngu-master.png     ✅ có
│   │   ├── cosmo-gen-2_phong-ngu-2.png    ✅ có
│   │   ├── cosmo-gen-2_phong-ngu-3.png    ✅ có
│   │   ├── cosmo-gen-2_tang-2.png         ✅ có
│   │   └── cosmo-gen-2_wc.png             ✅ có
│   │
│   ├── fusion_gen_5/
│   │   ├── fusion-gen-5_gara.png          ✅ có
│   │   ├── fusion-gen-5_phong-khach.png   ✅ có
│   │   ├── fusion-gen-5_master-bedroom.png ✅ có
│   │   ├── fusion-gen-5_phong-hoc.png     ✅ có
│   │   ├── fusion-gen-5_phong-ngu-con.png ✅ có
│   │   ├── fusion-gen-5_tang-2.png        ✅ có  (dùng cho "bếp" của Fusion)
│   │   └── fusion-gen-5_tang-3.png        ✅ có
│   │
│   ├── opus/
│   │   ├── opus_bep.jpg                   ✅ có
│   │   ├── opus_phong-ngu-1.jpg           ✅ có
│   │   ├── opus_phong-ngu-2.jpg           ✅ có
│   │   ├── opus_phong-ngu-master.jpg      ✅ có
│   │   ├── opus_sanh-master.jpg           ❌ THIẾU — cần thêm
│   │   ├── opus_tang-1.jpg                ✅ có
│   │   ├── opus_tang-2.jpg                ✅ có
│   │   └── opus_wc.jpg                    ✅ có
│   │
│   └── signature_by_codinachs/           ❌ THIẾU CẢ THƯ MỤC — căn 43, 44
│       ├── signature_bep.jpg
│       ├── signature_gara.jpg
│       ├── signature_phong-khach.jpg
│       ├── signature_ngu-master.jpg
│       ├── signature_phong-ngu-2.jpg
│       ├── signature_tang-2.jpg
│       └── signature_wc.jpg
│
├── mat_bang/
│   ├── nyah-phu-ding_mat-bang-tang-1.jpg ✅ có  (lưu ý: "ding" không phải "dinh")
│   ├── nyah-phu-dinh_mat-bang-tang-2.jpg ✅ có
│   ├── nyah-phu-dinh_mat-bang-tang-3.jpg ✅ có
│   ├── nyah-phu-dinh_mat-bang-tang-4.jpg ✅ có (chưa dùng trong code)
│   └── nyah-phu-dinh_mat-bang-tang-5.jpg ✅ có (chưa dùng trong code)
│
├── phoi_canh/
│   ├── nyah-phu-dinh_phoi-canh-garage.png      ✅ có
│   ├── nyah-phu-dinh_phoi-canh-phong-khach.png ✅ có
│   └── nyah-phu-dinh_phoi-canh-wc.png          ✅ có
│
└── tien_ich/
    ├── vi_tri.jpg                              ✅ có  (kèm QR Google Maps)
    ├── 18_phut_den_Quan_1_Chi_tiet.jpg         ✅ có
    └── nyah-phu-dinh_cong-vien.png             ✅ có
```

---

## Quy ước đặt tên (bắt buộc)

1. **Tên không dấu, không khoảng trắng** — dùng gạch ngang `-` hoặc gạch dưới `_`.
2. **Prefix theo mẫu nhà**: `cosmo-gen-2_`, `fusion-gen-5_`, `opus_`, `signature_`.
3. **Đuôi file**: giữ đúng đuôi như danh sách (`.png` hoặc `.jpg`) — code gọi đích danh.
4. Bộ ảnh phòng tiêu chuẩn mỗi mẫu nhà: `bep`, `gara`, `phong-khach`, `ngu-master`/`master-bedroom`, `phong-ngu-2`, `tang-2`, `wc`.

## Cần thêm
- [ ] `opus/opus_sanh-master.jpg`
- [ ] Cả thư mục `signature_by_codinachs/` (7 ảnh, căn 43 & 44)

