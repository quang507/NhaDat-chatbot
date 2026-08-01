// Chạy toàn bộ kịch bản trong docs/200_KICH_BAN_CAU_HOI*.md qua matchStaticSlide
// để soi câu nào ra slide gì / câu nào lọt xuống LLM. Không fail build -
// đây là công cụ soi độ phủ: `SLIDES_IGNORE_JSON=1 npx tsx scripts/test-scenarios.mts`
import { readFileSync } from 'node:fs';
import { matchStaticSlide } from '../lib/static_slides';

const files = ['docs/200_KICH_BAN_CAU_HOI.md', 'docs/200_KICH_BAN_CAU_HOI_P2.md'];
const rows: { q: string; mark: string; title: string | null }[] = [];

for (const f of files) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\d+\.\s*(✅|🟡|❌)?\s*(.+)$/);
    if (!m) continue;
    const q = m[2].trim();
    const combo = matchStaticSlide(q, 'combo');
    const gen = combo || matchStaticSlide(q, 'general');
    rows.push({ q, mark: m[1] || '?', title: gen ? gen.title : null });
  }
}

const hit = rows.filter(r => r.title);
console.log(`Tổng ${rows.length} câu | có slide tĩnh: ${hit.length} (${Math.round(hit.length / rows.length * 100)}%)\n`);
console.log('── Câu ĐÁNH DẤU ✅ nhưng KHÔNG ra slide (misroute nặng):');
for (const r of rows.filter(r => r.mark === '✅' && !r.title)) console.log('  ✗', r.q);
console.log('\n── Câu 🟡/❌ nhưng GIỜ ĐÃ có slide (cập nhật ký hiệu):');
for (const r of rows.filter(r => r.mark !== '✅' && r.title)) console.log('  +', r.q, '=>', r.title);
