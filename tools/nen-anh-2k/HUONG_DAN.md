# Nén ảnh về 2K bằng chuột phải (Windows)

Thu nhỏ ảnh về tối đa **2560px cạnh dài**, **giữ nguyên tỉ lệ**, ghi đè đúng tên file
(quan trọng để slide tìm thấy đúng ảnh). Ảnh nhỏ hơn 2K thì để nguyên.

## Cài (1 lần)
1. Giữ nguyên 3 file `Resize2K.ps1`, `CaiDat_ChuotPhai.bat`, `GoCai.bat` **trong cùng 1 thư mục**
   (đừng tách rời — `.bat` trỏ tới `.ps1` cùng thư mục). Để chỗ cố định, vd `C:\Tools\Nen2K\`.
2. Nhấp đúp **`CaiDat_ChuotPhai.bat`**. Nếu Windows cảnh báo SmartScreen → "More info" → "Run anyway".
3. Xong: chuột phải vào ảnh **PNG/JPG** sẽ có mục **"Nén ảnh về 2K"**.
   (Windows 11: có thể nằm trong "Show more options" / Shift+chuột phải.)

## Dùng
- Chuột phải 1 hoặc nhiều ảnh PNG/JPG đã chọn → **Nén ảnh về 2K**. File bị ghi đè tại chỗ.
- Không cần cài thêm phần mềm (dùng System.Drawing có sẵn trong Windows).

## Gỡ
- Nhấp đúp **`GoCai.bat`**.

## Tinh chỉnh
- Mở `Resize2K.ps1`, sửa `$MAX = 2560` (muốn 2K = 2048 thì đổi) hoặc `$JPEG_QUALITY = 88`.

> Lưu ý: ghi đè TẠI CHỖ — nếu cần giữ bản gốc thì copy ra chỗ khác trước khi nén.
> Đuôi `.tif`/`.webp` không nằm trong menu (trình duyệt cũng không hiển thị tốt 2 đuôi này — nên đổi sang `.jpg`/`.png`).
