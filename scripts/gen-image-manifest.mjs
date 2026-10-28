#!/usr/bin/env node
// Sinh image_manifest.json: danh sách URL "/images/..." của mọi file trong public/images.
//
// Vì sao: api/slide cần biết ảnh chọn tay trong slides.json có tồn tại thật không.
// Trước đây kiểm bằng existsSync trên public/images -> phải đóng gói ~72 MB ảnh vào
// hàm serverless (outputFileTracingIncludes), MỖI bản deploy lưu thêm chừng đó vào
// Functions Storage của Vercel. Ảnh vẫn do CDN phục vụ từ /public, hàm chỉ cần danh sách.
//
// Chạy: node scripts/gen-image-manifest.mjs   (tự động trong `prebuild` và buildCommand Vercel)
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'images');
const OUT = path.join(ROOT, 'image_manifest.json');

const entries = await readdir(SRC_DIR, { recursive: true, withFileTypes: true });
const urls = entries
  .filter((e) => e.isFile())
  .map((e) => '/images/' + path.relative(SRC_DIR, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'))
  .sort();

await writeFile(OUT, JSON.stringify(urls));
console.log(`[image-manifest] ${urls.length} ảnh -> image_manifest.json`);
