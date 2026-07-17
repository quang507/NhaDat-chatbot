/**
 * NhaDat Chatbot — RETRIEVAL Evaluation Harness (BM25 baseline)
 * ─────────────────────────────────────────────────────────────────────────────
 * Đo CHẤT LƯỢNG TRUY HỒI (retrieval), tách biệt với chất lượng câu trả lời:
 * với mỗi câu hỏi, truy hồi top-k đoạn rồi kiểm tra đoạn ĐÚNG (chứa "anchor")
 * có nằm trong top-k không. Cho ra Hit@1 / Hit@3 / Hit@5 và MRR.
 *
 * Vì sao BM25?  Đây là chân đế của kiến trúc "Router Retriever" trong idea board
 * (BM25 + Vector + RRF + Reranker). BM25 chạy HOÀN TOÀN OFFLINE (không cần API key,
 * không cần index vector) nên là ĐƯỜNG CƠ SỞ (baseline) để so sánh khi thêm các
 * tầng vector/RRF/reranker sau này.
 *
 * Cách dùng:
 *   node tests/retrieval_eval_harness.js
 *   node tests/retrieval_eval_harness.js --corpus data.md --k 5
 *
 * Corpus mặc định: data.md nếu có, nếu không thì rag_data_summary.md (bản tổng hợp
 * cùng cấu trúc marker "## 🔖 ...").
 */

const fs = require('fs');
const path = require('path');

// ── Tham số dòng lệnh ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const K = parseInt(getArg('--k', '5'), 10);
const corpusArg = getArg('--corpus', '');

// ── Chuẩn hoá tiếng Việt: bỏ dấu + thường hoá để so khớp bền hơn ──────────────
function fold(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase();
}

const STOPWORDS = new Set(
  ('la o nao co khong thi ma duoc cua cho voi nha dat bat dong san hoi em toi ban ' +
   'nay cai nam o dau va cac mot cthe the nhu di den ra vao ne a').split(/\s+/)
);

function tokenize(text) {
  return fold(text).split(/[^a-z0-9]+/).filter((w) => w && w.length > 1);
}

function tokenizeQuery(text) {
  return tokenize(text).filter((w) => !STOPWORDS.has(w));
}

// ── Nạp + chia nhỏ corpus theo marker "## 🔖" (mỗi section = 1 tài liệu) ───────
// Section quá dài được cắt thành cửa sổ ~1800 ký tự (chồng lấn 200) để sát cách
// hệ thống thật chunk dữ liệu (lib/rag.ts CHUNK=1800/OVERLAP=200).
const CHUNK = 1800;
const OVERLAP = 200;

function loadChunks() {
  const candidates = corpusArg
    ? [corpusArg]
    : ['data.md', 'rag_data_summary.md'];
  let file = null;
  for (const c of candidates) {
    const p = path.join(process.cwd(), c);
    if (fs.existsSync(p)) { file = p; break; }
  }
  if (!file) {
    console.error(`❌ Không tìm thấy corpus (đã thử: ${candidates.join(', ')}).`);
    process.exit(2);
  }
  const raw = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
  // Tách theo dòng marker "## 🔖 ..." — giữ marker làm nhãn nguồn của section.
  const parts = raw.split(/\n(?=##\s*🔖)/);
  const chunks = [];
  for (const part of parts) {
    const body = part.trim();
    if (body.length < 40) continue;
    const srcMatch = body.match(/##\s*🔖[^\n]*/);
    const source = srcMatch ? srcMatch[0].replace(/##\s*🔖\s*/, '').trim() : '(mục lục)';
    if (body.length <= CHUNK) {
      chunks.push({ text: body, source });
    } else {
      for (let i = 0; i < body.length; i += CHUNK - OVERLAP) {
        chunks.push({ text: body.slice(i, i + CHUNK), source });
      }
    }
  }
  return { chunks, file };
}

// ── BM25 (Okapi) ─────────────────────────────────────────────────────────────
function buildBM25(chunks) {
  const N = chunks.length;
  const docs = chunks.map((c) => tokenize(c.text));
  const df = new Map();
  const tfs = docs.map((toks) => {
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return tf;
  });
  const lens = docs.map((d) => d.length);
  const avgdl = lens.reduce((a, b) => a + b, 0) / (N || 1);
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));

  const k1 = 1.5, b = 0.75;
  function search(query, topK) {
    const qTerms = tokenizeQuery(query);
    const scores = new Array(N).fill(0);
    for (let d = 0; d < N; d++) {
      const tf = tfs[d];
      const dl = lens[d];
      let s = 0;
      for (const t of qTerms) {
        const f = tf.get(t);
        if (!f) continue;
        const w = idf.get(t) || 0;
        s += w * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl)));
      }
      scores[d] = s;
    }
    return scores
      .map((score, idx) => ({ idx, score }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => ({ ...chunks[x.idx], score: x.score }));
  }
  return { search, N, avgdl };
}

// ── Bộ ground-truth: câu hỏi + "anchor" (chuỗi đặc trưng) của đoạn ĐÚNG ────────
// Đoạn được coi là LIÊN QUAN nếu (đã bỏ dấu) chứa ÍT NHẤT MỘT anchor.
// Anchor chọn đủ đặc trưng để chỉ đoạn thật sự trả lời mới chứa.
const TESTS = [
  { id: 1, cat: 'Vị trí', query: 'Dự án Ny\'ah Phú Định nằm ở đường nào quận mấy?', anchors: ['truong dinh hoi'] },
  { id: 2, cat: 'Kết nối', query: 'Đi từ dự án vào trung tâm quận 1 mất bao lâu?', anchors: ['18 phut'] },
  { id: 3, cat: 'Pháp lý', query: 'Pháp lý dự án thế nào, có sổ hồng không?', anchors: ['so hong'] },
  { id: 4, cat: 'Mẫu nhà', query: 'Mẫu nhà Cosmo Gen 2 có gara ô tô không?', anchors: ['cosmo'] },
  { id: 5, cat: 'Mẫu nhà', query: 'Nhà phố Opus dành cho ai, kinh doanh được không?', anchors: ['opus'] },
  { id: 6, cat: 'Thiết kế', query: 'Signature by Codinachs là dòng nhà gì?', anchors: ['codinachs'] },
  { id: 7, cat: 'Công nghệ', query: 'Hệ thống khí tươi trong nhà hoạt động ra sao?', anchors: ['airtop', 'khi tuoi'] },
  { id: 8, cat: 'Mẫu nhà', query: 'Fusion Gen 5 có mấy phòng ngủ cho gia đình nhiều thế hệ?', anchors: ['fusion'] },
  { id: 9, cat: 'Chủ đầu tư', query: 'Chủ đầu tư Nhã Đạt là ai?', anchors: ['nha dat', 'nha at'] },
  { id: 10, cat: 'Tiện ích', query: 'Trong khu có công viên hay sân chơi trẻ em không?', anchors: ['cong vien', 'san choi', 'tien ich'] },
  { id: 11, cat: 'Thiết kế', query: 'Nhà có thang máy và giếng trời không?', anchors: ['thang may', 'gieng troi'] },
  { id: 12, cat: 'Giá', query: 'Giá bán mỗi căn khoảng bao nhiêu tỷ?', anchors: ['ty', 'gia'] },
];

// ── Chạy đánh giá ─────────────────────────────────────────────────────────────
function relevant(chunkText, anchors) {
  const folded = fold(chunkText);
  return anchors.some((a) => folded.includes(fold(a)));
}

function main() {
  const t0 = Date.now();
  const { chunks, file } = loadChunks();
  const bm25 = buildBM25(chunks);

  console.log('═'.repeat(74));
  console.log('  RETRIEVAL EVAL — BM25 baseline (Router Retriever experiment)');
  console.log('═'.repeat(74));
  console.log(`  Corpus     : ${path.basename(file)}`);
  console.log(`  Chunks     : ${bm25.N}   (avg ${bm25.avgdl.toFixed(0)} tokens/chunk)`);
  console.log(`  Test set   : ${TESTS.length} câu   ·   top-k = ${K}`);
  console.log('─'.repeat(74));
  console.log('  ID  Danh mục       Hit  Rank  Câu hỏi');
  console.log('─'.repeat(74));

  let hit1 = 0, hit3 = 0, hit5 = 0, mrrSum = 0;
  for (const tc of TESTS) {
    const results = bm25.search(tc.query, Math.max(K, 10));
    let rank = 0;
    for (let i = 0; i < results.length; i++) {
      if (relevant(results[i].text, tc.anchors)) { rank = i + 1; break; }
    }
    if (rank === 1) hit1++;
    if (rank >= 1 && rank <= 3) hit3++;
    if (rank >= 1 && rank <= 5) hit5++;
    if (rank >= 1) mrrSum += 1 / rank;

    const mark = rank >= 1 && rank <= K ? '✅' : '❌';
    const rankStr = rank >= 1 ? `#${rank}` : '—';
    console.log(
      `  ${String(tc.id).padStart(2)}  ${tc.cat.padEnd(13)}  ${mark}   ${rankStr.padStart(4)}  ${tc.query.slice(0, 40)}`
    );
  }

  const n = TESTS.length;
  const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;
  console.log('─'.repeat(74));
  console.log(`  Hit@1 = ${pct(hit1)}   Hit@3 = ${pct(hit3)}   Hit@5 = ${pct(hit5)}   MRR = ${(mrrSum / n).toFixed(3)}`);
  console.log(`  Thời gian: ${Date.now() - t0}ms`);
  console.log('═'.repeat(74));

  // Ngưỡng đạt: Hit@5 >= 80% (baseline BM25). Rớt -> exit code 1 để CI bắt được.
  const passRate = hit5 / n;
  if (passRate < 0.8) {
    console.log(`\n❌ FAIL: Hit@5 ${pct(hit5)} < 80% — retrieval baseline chưa đạt.`);
    process.exit(1);
  }
  console.log(`\n✅ PASS: Hit@5 ${pct(hit5)} ≥ 80%.`);
}

main();
