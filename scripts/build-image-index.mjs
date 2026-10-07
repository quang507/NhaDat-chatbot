#!/usr/bin/env node
// VECTOR HÓA TỪNG ẢNH -> image_index.json (dùng bởi lib/image-search.ts, /api/images).
//
//   1. NÉN ảnh nặng tại chỗ (giữ nguyên tên + định dạng, chỉ ghi đè khi nhỏ hơn).
//   2. VISION: Gemini nhìn ảnh, viết mô tả 1-2 câu. Cache ở image_descriptions.json
//      (chung với sync_and_reindex.js) - ảnh đã mô tả thì không gọi lại.
//   3. EMBED mỗi ảnh MỘT vector: thư mục + tên file (đã đặt chuẩn, là thông tin
//      kiểm chứng) + mô tả vision. Vector đã có mà nội dung không đổi -> dùng lại.
//
// Chạy:  node scripts/build-image-index.mjs [--dry] [--no-compress] [--redescribe]
//   --dry          chỉ báo cáo (ảnh cần nén / cần mô tả), không ghi, không gọi API
//   --no-compress  bỏ bước nén
//   --redescribe   chạy lại vision cho mọi ảnh (bỏ qua cache mô tả)
//   --compress-only chỉ nén ảnh, không gọi API (không cần key)
// Cần GEMINI_API_KEY (env, .env.local hoặc api_key.txt - giống sync_and_reindex.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const DESC_CACHE = path.join(ROOT, 'image_descriptions.json');
const OUT = path.join(ROOT, 'image_index.json');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const COMPRESS = !args.has('--no-compress');
const REDESCRIBE = args.has('--redescribe');
const COMPRESS_ONLY = args.has('--compress-only');

// Nén: ảnh > 800KB hoặc cạnh dài > 2400px. 2400px vẫn nét trên TV 4K ở chế độ
// split, còn full nền đã có bản blur riêng (images_bg).
const MAX_BYTES = 800 * 1024;
const MAX_SIDE = 2400;
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// PHẢI khớp lib/rag.ts. 768 chiều: file index nhỏ (~2-3MB cho vài trăm ảnh),
// query embed với cùng outputDimensionality (lib/image-search.ts đọc dim từ file).
const EMBED_MODEL = 'gemini-embedding-001';
const DIM = 768;
const API = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-flash-latest hay bị 503 khi quá tải -> có thể đổi: VISION_MODEL=gemini-flash-lite-latest
const VISION_MODEL = process.env.VISION_MODEL || 'gemini-flash-latest';

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envLocal = path.join(ROOT, '.env.local');
  if (fs.existsSync(envLocal)) {
    const m = fs.readFileSync(envLocal, 'utf-8').match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  const txt = path.join(ROOT, 'api_key.txt');
  if (fs.existsSync(txt)) return fs.readFileSync(txt, 'utf-8').trim();
  return '';
}
const KEY = loadKey();
if (!KEY && !DRY && !COMPRESS_ONLY) {
  console.error('Lỗi: không tìm thấy GEMINI_API_KEY (env, .env.local hoặc api_key.txt).');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fb; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, label) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 3) throw e;
      const wait = 2000 * 2 ** i;
      console.warn(`  ! ${label}: ${e.message} - thử lại sau ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

// ---------- 1. Nén ----------
async function compress(full) {
  const ext = path.extname(full).toLowerCase();
  const before = fs.statSync(full).size;
  const meta = await sharp(full).metadata();
  const side = Math.max(meta.width || 0, meta.height || 0);
  if (before <= MAX_BYTES && side <= MAX_SIDE) return null;
  if (DRY) return { before, after: null };
  let img = sharp(full).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  img = ext === '.png' ? img.png({ compressionLevel: 9, palette: true, quality: 85 })
    : ext === '.webp' ? img.webp({ quality: 82 })
    : img.jpeg({ quality: 82, mozjpeg: true });
  const buf = await img.toBuffer();
  if (buf.length >= before) return null; // không nhỏ hơn -> giữ bản gốc
  fs.writeFileSync(full, buf);
  return { before, after: buf.length };
}

// ---------- 2. Vision ----------
async function describe(full, rel) {
  // Gửi bản thu nhỏ 1024px: đủ để nhận diện nội dung, rẻ + nhanh hơn ảnh gốc.
  const b64 = (await sharp(full).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 }).toBuffer()).toString('base64');
  const res = await fetch(`${API}/models/${VISION_MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/jpeg', data: b64 } },
        { text: `Ảnh thuộc dự án bất động sản của Nhã Đạt (đường dẫn: ${rel} - tên thư mục và tên file đã được đặt chuẩn, coi là thông tin đúng). Mô tả ảnh trong 1-2 câu tiếng Việt: ảnh chụp/vẽ gì (phòng nào, ngoại thất, bản đồ, bảng giá, bảng thông số, logo...), đặc điểm nổi bật, chữ/số quan trọng đọc được trên ảnh. Nếu ảnh có chữ "ẢNH MINH HỌA" thì ghi rõ đây là ảnh minh họa giữ chỗ. CHỈ trả về câu mô tả, không mở đầu.` },
      ]}],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`vision ${res.status} ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const parts = d.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => p.text && !p.thought).map(p => p.text).join(' ').trim() || null;
}

// ---------- 3. Embed ----------
function normalize(v) {
  let n = 0; for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}
async function embed(text) {
  const res = await fetch(`${API}/models/${EMBED_MODEL}:embedContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: DIM }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`embed ${res.status} ${(await res.text()).slice(0, 200)}`);
  const v = (await res.json()).embedding?.values || [];
  if (v.length !== DIM) throw new Error(`embed trả ${v.length} chiều, cần ${DIM}`);
  return normalize(v);
}

// Văn bản đại diện cho ảnh: tên thư mục + tên file (đã đặt chuẩn) + mô tả vision.
function docText(rel, desc) {
  const words = (s) => s.replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel, path.posix.extname(rel));
  return `Thư mục: ${dir === '.' ? '' : words(dir)}\nTên ảnh: ${words(base)}\nNội dung ảnh: ${desc || '(chưa có mô tả)'}`;
}

async function main() {
  const files = walk(IMAGES_DIR);
  console.log(`Tìm thấy ${files.length} ảnh trong public/images.`);
  const descCache = readJSON(DESC_CACHE, {});
  const prev = readJSON(OUT, { images: [] });
  const prevByRel = new Map((prev.images || []).map(e => [e.rel, e]));

  let nComp = 0, saved = 0, nDesc = 0, nEmb = 0, nFail = 0;
  const out = [];
  for (const full of files) {
    const rel = path.relative(IMAGES_DIR, full).split(path.sep).join('/');

    // 1. Nén. Ảnh đã mô tả mà chỉ bị nén thì nội dung không đổi -> giữ mô tả, cập nhật size.
    if (COMPRESS) {
      try {
        const r = await compress(full);
        if (r) {
          nComp++;
          if (r.after) {
            saved += r.before - r.after;
            if (descCache[rel]?.desc) descCache[rel].size = r.after;
          }
        }
      } catch (e) { console.warn(`  ! nén lỗi ${rel}: ${e.message}`); }
    }
    if (COMPRESS_ONLY) continue;

    // 2. Mô tả
    const size = fs.statSync(full).size;
    let desc = descCache[rel]?.desc || '';
    const stale = !desc || descCache[rel].size !== size || REDESCRIBE;
    if (stale) {
      if (DRY) { nDesc++; }
      else {
        try {
          const d = await withRetry(() => describe(full, rel), `vision ${rel}`);
          if (d) { desc = d; descCache[rel] = { size, desc }; nDesc++; }
          await sleep(250);
        } catch (e) { nFail++; console.warn(`  ! vision lỗi ${rel}: ${e.message}`); }
      }
    }

    // 3. Embed (dùng lại vector cũ nếu văn bản đại diện không đổi)
    const text = docText(rel, desc);
    const h = crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
    const placeholder = /giữ chỗ/i.test(desc);
    const url = '/images/' + rel.split('/').map(encodeURIComponent).join('/');
    const old = prevByRel.get(rel);
    if (old && old.h === h && old.vec?.length === DIM) { out.push({ ...old, url, placeholder }); continue; }
    if (DRY) { nEmb++; continue; }
    try {
      const vec = await withRetry(() => embed(text), `embed ${rel}`);
      out.push({ url, rel, desc, placeholder, h, vec });
      nEmb++;
      await sleep(100);
    } catch (e) { nFail++; console.warn(`  ! embed lỗi ${rel}: ${e.message}`); }
  }

  console.log(`Nén: ${nComp} ảnh${DRY ? ' cần nén' : `, giảm ${(saved / 1048576).toFixed(1)}MB`}.`);
  console.log(`Vision: ${nDesc} ảnh ${DRY ? 'cần mô tả' : 'mô tả mới'}. Embed: ${nEmb} ảnh ${DRY ? 'cần embed' : 'mới'}. Lỗi: ${nFail}.`);
  if (DRY) return;
  if (COMPRESS_ONLY) {
    fs.writeFileSync(DESC_CACHE, JSON.stringify(descCache, null, 1), 'utf-8');
    return;
  }

  fs.writeFileSync(DESC_CACHE, JSON.stringify(descCache, null, 1), 'utf-8');
  fs.writeFileSync(OUT, JSON.stringify({ model: EMBED_MODEL, dim: DIM, builtAt: new Date().toISOString(), images: out }), 'utf-8');
  const ph = out.filter(e => e.placeholder).length;
  console.log(`Đã ghi image_index.json: ${out.length} ảnh (${ph} ảnh giữ chỗ - sẽ không được đính).`);
}

main().catch(e => { console.error(e); process.exit(1); });
