// Kéo index.json mới nhất từ nhánh chatbot-logs về repo để ĐÓNG GÓI theo deploy.
// Chạy: npm run index:pull  (nên chạy sau mỗi lần reindex trên /admin, rồi commit)
// Mục đích: cold start đọc index local ~100ms thay vì tải 14MB từ GitHub (1-3s).
import { writeFileSync } from 'fs';
const URL = 'https://raw.githubusercontent.com/quang507/NhaDat-chatbot/chatbot-logs/index.json';
const r = await fetch(URL);
if (!r.ok) { console.error('Tải index lỗi', r.status); process.exit(1); }
const text = await r.text();
const idx = JSON.parse(text);
if (!idx?.chunks?.length) { console.error('Index rỗng - không ghi'); process.exit(1); }
writeFileSync(new globalThis.URL('../index.json', import.meta.url), text);
console.log(`✓ index.json: ${idx.chunks.length} chunk, builtAt ${idx.builtAt}, ${(text.length/1e6).toFixed(1)}MB`);
