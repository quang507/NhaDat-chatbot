// Sinh ẢNH TẠM (placeholder) cho các chủ đề chưa có ảnh thật.
// Chạy: node scripts/gen-placeholder-images.js
//
// Mục đích: bot có ảnh để chiếu ngay khi khách hỏi; sau này thay ảnh thật
// CÙNG TÊN FILE vào đúng chỗ là xong, không phải sửa code hay slides.json.
// Mỗi ảnh ghi rõ "ẢNH MINH HỌA" để không ai nhầm là ảnh thật.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMG_ROOT = path.join(__dirname, '..', 'public', 'images', '01_NyAh-PhuDinh');

// [đường dẫn tương đối, tiêu đề lớn, dòng phụ]
const PLACEHOLDERS = [
  ['gia_ban/gia-ban_bang-gia-hien-tai.jpg', 'BẢNG GIÁ', 'Bảng giá chính thức đợt hiện tại'],
  ['noi_that/goi-air-vs-max_bang-so-sanh.jpg', 'GÓI AIR vs GÓI MAX', 'Bảng so sánh hai gói hoàn thiện'],
  ['noi_that/goi-max_ban-giao.jpg', 'GÓI MAX', 'Tủ bếp cao cấp · Máy lạnh · Smart Home ByteLife'],
  ['thong_so/thong-so_cong-chinh.jpg', 'CỔNG CHÍNH', 'Datasheet kích thước cổng chính'],
  ['thong_so/thong-so_cua-phu.jpg', 'CỬA PHỤ', 'Datasheet kích thước cửa phụ'],
  ['thong_so/brand_vat-lieu-noi-that.jpg', 'THƯƠNG HIỆU VẬT LIỆU', 'Bếp · Thiết bị vệ sinh · Thang máy · AirTop · ByteLife'],
  ['ngoai_that/cosmo-gen-2_mat-ngang.jpg', 'MẶT NGANG COSMO', 'Mặt đứng bên hông - Cosmo Gen 2'],
  ['ngoai_that/fusion-gen-5_mat-ngang.jpg', 'MẶT NGANG FUSION', 'Mặt đứng bên hông - Fusion Gen 5'],
  ['ngoai_that/opus_mat-ngang.jpg', 'MẶT NGANG OPUS', 'Mặt đứng bên hông - Opus'],
  ['an_ninh/an-ninh_camera.jpg', 'CAMERA AN NINH', 'Vị trí camera giám sát toàn khu'],
  ['an_ninh/an-ninh_chot-bao-ve.jpg', 'CHỐT BẢO VỆ', 'Bảo vệ trực và kiểm soát ra vào'],
  ['noi_that/cosmo_gen_2/cosmo-gen-2_tinh-nang-tang-5.jpg', 'COSMO · TẦNG 5', 'Công năng tầng 5'],
  ['noi_that/cosmo_gen_2/cosmo-gen-2_tinh-nang-tang-6.jpg', 'COSMO · TẦNG 6', 'Sân thượng - công năng tầng 6'],
  ['noi_that/fusion_gen_5/fusion-gen-5_tinh-nang-tang-5.jpg', 'FUSION · TẦNG 5', 'Công năng tầng 5'],
  ['noi_that/fusion_gen_5/fusion-gen-5_tinh-nang-tang-6.jpg', 'FUSION · TẦNG 6', 'Sân thượng - công năng tầng 6'],
  ['noi_that/opus/opus_tinh-nang-tang-5.jpg', 'OPUS · TẦNG 5', 'Công năng tầng 5'],
  ['noi_that/opus/opus_tinh-nang-tang-6.jpg', 'OPUS · TẦNG 6', 'Sân thượng - công năng tầng 6'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgFor(title, sub) {
  // 1600x1000 ngang - khớp khung slide. Nền tối brand + kẻ mờ + chữ DejaVu
  // (font có sẵn trong môi trường build, đủ dấu tiếng Việt).
  return `<svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="1600" height="1000" fill="#0C0F0D"/>
  <rect x="40" y="40" width="1520" height="920" fill="none" stroke="#2E9E5B" stroke-width="3" stroke-dasharray="14 10" opacity="0.55"/>
  <text x="800" y="140" font-family="DejaVu Sans" font-size="34" letter-spacing="14" fill="#A8D94A" text-anchor="middle" opacity="0.9">NY'AH PHU DINH</text>
  <text x="800" y="470" font-family="DejaVu Sans" font-weight="bold" font-size="96" fill="#FFFFFF" text-anchor="middle">${esc(title)}</text>
  <text x="800" y="580" font-family="DejaVu Sans" font-size="44" fill="#FFFFFF" fill-opacity="0.75" text-anchor="middle">${esc(sub)}</text>
  <rect x="560" y="820" width="480" height="76" rx="38" fill="#2E9E5B" opacity="0.92"/>
  <text x="800" y="870" font-family="DejaVu Sans" font-weight="bold" font-size="34" fill="#0C0F0D" text-anchor="middle">ẢNH MINH HỌA</text>
</svg>`;
}

(async () => {
  let made = 0, skipped = 0;
  for (const [rel, title, sub] of PLACEHOLDERS) {
    const dest = path.join(IMG_ROOT, rel);
    if (fs.existsSync(dest)) { skipped++; continue; } // KHÔNG đè ảnh thật đã thay
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp(Buffer.from(svgFor(title, sub))).jpeg({ quality: 82 }).toFile(dest);
    made++;
    console.log('  +', rel);
  }
  console.log(`Xong: tạo ${made}, bỏ qua ${skipped} (đã có file - có thể là ảnh thật).`);
})();
