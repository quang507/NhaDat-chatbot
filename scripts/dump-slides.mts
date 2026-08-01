// Sinh public/data/slides.json từ dữ liệu hardcode trong lib/static_slides.ts.
// Chạy: npm run slides:dump
// Sau khi sửa catalog trong TS, chạy lệnh này để JSON và TS luôn khớp nhau.
//
// LƯU Ý: phải dùng dynamic import() - `import` tĩnh bị hoisted và sẽ chạy TRƯỚC
// dòng gán env, khiến static_slides.ts đọc lại chính file JSON cũ thay vì dữ
// liệu hardcode (dump ra y nguyên file cũ, các sửa đổi trong TS bị mất).
import { writeFileSync } from 'fs';
import path from 'path';

process.env.SLIDES_IGNORE_JSON = '1'; // đọc dữ liệu hardcode, không đọc chính file JSON

const mod = await import('../lib/static_slides');
const {
  STATIC_SLIDES,
  ROOM_SLIDES,
  TOPIC_SLIDES,
  MODEL_INTRO,
  MODEL_INTRO_NYAH,
  MODEL_INTRO_KEYWORDS,
} = mod;

const out = {
  _note:
    'Catalog slide tĩnh. Sửa file này rồi restart app là slide đổi ngay, không cần rebuild. ' +
    'Sinh tự động từ lib/static_slides.ts bằng: npm run slides:dump',
  _builtAt: new Date().toISOString(),
  static_slides: STATIC_SLIDES,
  room_slides: ROOM_SLIDES,
  topic_slides: TOPIC_SLIDES,
  model_intro_keywords: MODEL_INTRO_KEYWORDS,
  model_intro: MODEL_INTRO,
  model_intro_nyah: MODEL_INTRO_NYAH,
};

const dest = path.join(process.cwd(), 'public/data/slides.json');
writeFileSync(dest, JSON.stringify(out, null, 2), 'utf-8');
console.log(`✓ ${dest}`);
console.log(`  static_slides: ${STATIC_SLIDES.length}`);
console.log(`  room_slides  : ${Object.keys(ROOM_SLIDES).length}`);
console.log(`  topic_slides : ${Object.keys(TOPIC_SLIDES).length}`);
console.log(`  giá (kiểm tra): ${TOPIC_SLIDES.gia.points[0]}`);
