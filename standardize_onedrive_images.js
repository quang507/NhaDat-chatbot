const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TARGET_DIR = 'C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide\\ChatBotImages_Upload';

// ── GEMINI VISION ────────────────────────────────────────────────────────────
// Ảnh tên RÁC (z7143..., enscape_..., generated-image..., IMG_, DSC...) thì KHÔNG
// có nghĩa gì cho RAG/slide. Code không "nhìn" được ảnh, nên dùng Gemini Vision
// mở ảnh ra xem thật → phân loại mẫu nhà + không gian → đặt tên chuẩn.
// Cần GEMINI_API_KEY trong env (set GEMINI_API_KEY=... trước khi chạy node).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENABLE_VISION = !!GEMINI_API_KEY;

// Bộ từ vựng KHÔNG GIAN — phải khớp với category trong app/api/slide/route.ts
// (getCategoryMatch) và tên thư mục ảnh để static slide + RAG cùng nhận diện được.
const SPACE_VOCAB = [
  'bep', 'gara', 'phong-khach', 'phong-ngu-master', 'phong-ngu-con', 'phong-ngu-ong-ba',
  'phong-hoc', 'wc', 'san-thuong', 'ban-cong', 'thang-may', 'thang-xoan', 'sanh',
  'mat-bang', 'phoi-canh', 'mat-tien', 'tong-quan', 'tien-ich', 'vi-tri',
  'phap-ly', 'tien-do-xay-dung', 'chu-dau-tu',
];

// Mẫu nhà → prefix tên file (khớp convention hiện có: cosmo-gen-2_*, fusion-gen-5_*, opus_*)
const MODEL_PREFIX = {
  cosmo_gen_2: 'cosmo-gen-2',
  fusion_gen_5: 'fusion-gen-5',
  opus: 'opus',
  signature: 'signature',
  nyah: 'nyah-phu-dinh',
};

// Tên ĐÃ CHUẨN thì bỏ qua Vision (đã có nghĩa). Coi là RÁC nếu khớp các mẫu này.
function isGarbageName(stdName) {
  const garbagePatterns = [
    /^z\d{6,}/,                 // Zalo: z7143988009339_...
    /^enscape[-_]/,             // render Enscape
    /^generated-image/,         // AI generated
    /^img[-_]?\d/,              // IMG_1234
    /^dsc[-_]?\d/,              // DSC_1234
    /^photo[-_]?\d/,
    /^screenshot/,
    /^untitled/,
    /^[0-9a-f]{16,}$/,          // chuỗi hex dài
    /^\d+$/,                    // chỉ toàn số: 1, 5
    /^5v5a\d+/,                 // tên máy ảnh Canon
  ];
  return garbagePatterns.some(re => re.test(stdName));
}

// Đoán mẫu nhà từ tên thư mục cha (gợi ý cho Vision khi ảnh nằm sẵn trong folder model)
function modelHintFromPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes('cosmo')) return 'cosmo_gen_2';
  if (lower.includes('fusion')) return 'fusion_gen_5';
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('signature')) return 'signature';
  return null;
}

function extToMime(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

// Gọi Gemini Vision: trả { model, space, detail } đã ràng buộc vào vocab.
async function geminiVisionClassify(filePath, ext, modelHint) {
  try {
    // Nén tạm về JPEG nhỏ để gửi cho Vision nhanh + rẻ (không ảnh hưởng file gốc).
    const smallBuf = await sharp(filePath).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    const base64 = smallBuf.toString('base64');

    const prompt = `Bạn là chuyên gia phân loại ảnh bất động sản cho dự án nhà phố Ny'ah Phú Định (chủ đầu tư Nhã Đạt).
Dự án có các mẫu nhà: Cosmo Gen 2, Fusion Gen 5, Opus, Signature.
${modelHint ? `GỢI Ý: ảnh này nằm trong thư mục mẫu nhà "${modelHint}". Ưu tiên gợi ý này trừ khi ảnh rõ ràng thuộc mẫu khác.` : ''}

Hãy NHÌN ảnh và trả về JSON thuần (không markdown) với 3 trường:
{
  "model": một trong ["cosmo_gen_2","fusion_gen_5","opus","signature","nyah"] — chọn "nyah" nếu là ảnh chung dự án (tiện ích, vị trí, phối cảnh tổng, pháp lý) không thuộc mẫu nhà cụ thể nào,
  "space": MỘT trong [${SPACE_VOCAB.map(s => `"${s}"`).join(',')}] — loại không gian/chủ đề ảnh thể hiện rõ nhất,
  "detail": 1-3 từ tiếng Việt KHÔNG DẤU mô tả chi tiết nổi bật (vd "tu-bep-go", "ban-do", "ho-boi"), hoặc chuỗi rỗng
}
Quy tắc space: ảnh bếp/bàn ăn->bep; chỗ đậu ô tô->gara; sofa/tiếp khách->phong-khach; giường master->phong-ngu-master; giường con->phong-ngu-con; toilet/lavabo->wc; bản vẽ mặt bằng tầng->mat-bang; phối cảnh ngoài/mặt đứng->phoi-canh; mặt tiền căn->mat-tien; bản đồ/đường đi->vi-tri; công viên/hồ bơi/sân chơi/cà phê->tien-ich; sổ hồng/giấy phép->phap-ly; ảnh công trường đang xây->tien-do-xay-dung; logo/đội ngũ chủ đầu tư->chu-dau-tu; cầu thang xoắn->thang-xoan; ban công/sân thượng->san-thuong.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: extToMime(ext), data: base64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      console.warn(`   [Vision] HTTP ${res.status} — bỏ qua, giữ tên cũ.`);
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(text);

    // Ràng buộc kết quả vào vocab cho an toàn
    const model = MODEL_PREFIX[parsed.model] ? parsed.model : (modelHint || 'nyah');
    const space = SPACE_VOCAB.includes(parsed.space) ? parsed.space : null;
    if (!space) return null;
    const detail = typeof parsed.detail === 'string'
      ? parsed.detail.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
      : '';

    return { model, space, detail };
  } catch (err) {
    console.warn(`   [Vision] Lỗi: ${err.message} — giữ tên cũ.`);
    return null;
  }
}

// Helper to remove Vietnamese diacritics
function removeVietnameseTones(str) {
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  str = str.replace(/đ/g, "d").replace(/Đ/g, "d");
  return str;
}

// Standardize string name
function standardizeName(fileNameWithoutExt) {
  let name = removeVietnameseTones(fileNameWithoutExt).toLowerCase();
  name = name.replace(/[^a-z0-9_-]/g, '-');
  name = name.replace(/[-_]+/g, (match) => match.includes('_') ? '_' : '-');
  name = name.replace(/^[-_]+|[-_]+$/g, '');
  return name;
}

// Sinh tên chuẩn từ kết quả Vision: {model-prefix}_{space}[-detail]
function buildVisionName(cls) {
  const prefix = MODEL_PREFIX[cls.model] || MODEL_PREFIX.nyah;
  let name = `${prefix}_${cls.space}`;
  if (cls.detail) name += `-${cls.detail}`;
  return name;
}

// Tránh trùng tên trong cùng thư mục: thêm hậu tố -2, -3...
function ensureUnique(dirName, baseName, ext) {
  let candidate = baseName;
  let i = 1;
  while (fs.existsSync(path.join(dirName, candidate + ext))) {
    i += 1;
    candidate = `${baseName}-${i}`;
  }
  return candidate;
}

async function processImage(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'].includes(ext)) {
      return;
    }

    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath, ext);

    // 1. Chuẩn hóa tên cơ bản (bỏ dấu, viết thường)
    let stdName = standardizeName(baseName);

    // 1b. Nếu tên RÁC và bật Vision → nhờ Gemini nhìn ảnh đặt tên có nghĩa
    if (ENABLE_VISION && isGarbageName(stdName)) {
      const cls = await geminiVisionClassify(filePath, ext, modelHintFromPath(filePath));
      if (cls) {
        const visionBase = buildVisionName(cls);
        stdName = ensureUnique(dirName, visionBase, '.jpg');
        console.log(`   [Vision] ${baseName}${ext} → ${stdName} (model=${cls.model}, space=${cls.space})`);
      }
    }

    // 2. Quyết định đuôi file: ảnh nội thất chụp/phối cảnh → JPG cho nhẹ; logo → giữ PNG
    let targetExt = '.jpg';
    if (ext === '.png' && stdName.includes('logo')) {
      targetExt = '.png';
    }

    const targetFileName = stdName + targetExt;
    const targetFilePath = path.join(dirName, targetFileName);
    const tempPath = targetFilePath + '.tmp';

    // 3. Đọc metadata + kiểm tra kích thước
    const metadata = await sharp(filePath).metadata();
    const maxW = 2048;
    const maxH = 2048;
    let width = metadata.width;
    let height = metadata.height;
    if (!width || !height) return;

    let needResize = false;
    if (width > maxW || height > maxH) {
      needResize = true;
      const scale = Math.min(maxW / width, maxH / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    let pipeline = sharp(filePath);
    if (needResize) pipeline = pipeline.resize(width, height);

    // 4. Nén về định dạng đích
    if (targetExt === '.jpg') {
      await pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(tempPath);
    } else {
      await pipeline.png({ quality: 80, compressionLevel: 9 }).toFile(tempPath);
    }

    const oldSize = fs.statSync(filePath).size;
    const newSize = fs.statSync(tempPath).size;

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath);
    fs.renameSync(tempPath, targetFilePath);

    console.log(`[OK] ${path.relative(TARGET_DIR, filePath)} -> ${targetFileName} (${(oldSize/1024/1024).toFixed(2)}MB -> ${(newSize/1024).toFixed(1)}KB)`);
  } catch (err) {
    console.error(`[Error] Failed to process ${path.relative(TARGET_DIR, filePath)}:`, err.message);
  }
}

async function walkDir(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let isDir = false;
    try { isDir = fs.statSync(full).isDirectory(); } catch {}
    if (isDir) {
      await walkDir(full);
    } else {
      if (entry.endsWith('.md') || entry.startsWith('.') || entry === 'Thumbs.db') continue;
      await processImage(full);
    }
  }
}

async function main() {
  console.log("=== BẮT ĐẦU CHUẨN HÓA TÊN VÀ NÉN ẢNH ONEDRIVE ===");
  console.log(`Thư mục quét: ${TARGET_DIR}`);
  console.log(ENABLE_VISION
    ? `Gemini Vision: BẬT (model ${GEMINI_MODEL}) — ảnh tên rác sẽ được tự đặt tên theo nội dung.`
    : `Gemini Vision: TẮT (chưa set GEMINI_API_KEY) — chỉ bỏ dấu + nén, KHÔNG tự đặt tên ảnh rác.`);
  if (!fs.existsSync(TARGET_DIR)) {
    console.error("Lỗi: Không tìm thấy thư mục OneDrive!");
    return;
  }
  await walkDir(TARGET_DIR);
  console.log("=== CHUẨN HÓA VÀ NÉN ẢNH HOÀN THÀNH ===");
}

main();
