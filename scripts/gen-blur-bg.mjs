#!/usr/bin/env node
// Sinh biến thể NỀN MỜ TĨNH cho toàn bộ ảnh slide:
//   public/images/**/x.jpg  ->  public/images_bg/**/x.jpg.webp
//
// Vì sao: SlideBody dùng chính ảnh slide làm nền phủ toàn màn với
// `blur + brightness` CSS. filter: blur trên bề mặt 4K là paint rất đắt với
// SoC của TV - repaint mỗi frame khi có animation đè lên. Biến thể 480px đã
// nướng sẵn blur + tối + giảm bão hòa thì chi phí hiển thị gần bằng 0.
//
// Chạy: node scripts/gen-blur-bg.mjs   (tự động trong `prebuild`)
// Tăng tốc: đã có file mới hơn ảnh gốc thì bỏ qua (incremental).
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'images');
const OUT_DIR = path.join(ROOT, 'public', 'images_bg');

// Khớp hiệu ứng CSS cũ: blur-[3px] trên ảnh full-màn ~ sigma lớn hơn nhiều ở 480px;
// brightness .26 + saturate .8 nướng thẳng vào pixel.
const WIDTH = 480;
const BLUR_SIGMA = 6;
const BRIGHTNESS = 0.26;
const SATURATION = 0.8;

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

async function newerThan(a, b) {
  try {
    const [sa, sb] = [await stat(a), await stat(b)];
    return sa.mtimeMs >= sb.mtimeMs;
  } catch {
    return false; // đích chưa tồn tại
  }
}

let made = 0, skipped = 0, failed = 0;
const t0 = Date.now();
const jobs = [];
for await (const src of walk(SRC_DIR)) {
  const rel = path.relative(SRC_DIR, src);
  const out = path.join(OUT_DIR, rel + '.webp');
  jobs.push({ src, out });
}

// Giới hạn 8 việc song song - đủ nhanh, không nuốt hết RAM máy build.
const CONCURRENCY = 8;
async function worker(queue) {
  for (;;) {
    const job = queue.pop();
    if (!job) return;
    if (await newerThan(job.out, job.src)) { skipped++; continue; }
    try {
      await mkdir(path.dirname(job.out), { recursive: true });
      await sharp(job.src)
        .resize({ width: WIDTH })
        .blur(BLUR_SIGMA)
        .modulate({ brightness: BRIGHTNESS, saturation: SATURATION })
        .webp({ quality: 55 })
        .toFile(job.out);
      made++;
    } catch (e) {
      failed++;
      console.warn(`[gen-blur-bg] LỖI ${job.src}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(jobs)));

console.log(
  `[gen-blur-bg] xong sau ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
  `${made} tạo mới, ${skipped} bỏ qua (đã có), ${failed} lỗi -> ${path.relative(ROOT, OUT_DIR)}`
);
if (failed > 0) process.exitCode = 0; // lỗi lẻ không chặn build - client có fallback CSS
