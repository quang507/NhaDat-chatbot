// RAG: chia nhỏ data.md, tạo embedding, lưu chỉ mục, và truy hồi đoạn liên quan.
// Mục tiêu: thay vì nhét cả 250k token vào mỗi câu hỏi (gây chậm + lỗi 429),
// ta chỉ gửi vài đoạn liên quan nhất tới câu hỏi -> nhanh, rẻ, ít lỗi.
import { readFile, writeFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';
import os from 'os';

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const INDEX_BRANCH = 'chatbot-logs'; // dùng chung nhánh log (không trigger Vercel deploy)
const INDEX_PATH = 'index.json';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// PHẢI khớp model dùng để build index (sync_and_reindex.js + crawl-save-index).
// Index hiện tại build bằng gemini-embedding-001 (3072 chiều) — đổi model khác sẽ làm
// vector lệch không gian -> retrieval sai dù cùng số chiều.
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface Chunk {
  text: string;
  vec: number[]; // đã chuẩn hóa (normalized) để cosine = dot product
  file?: string;
  hash?: string;
}
export interface Index {
  chunks: Chunk[];
  builtAt: string;
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

// ---------- Chia nhỏ văn bản ----------
// Chia theo đoạn/markdown, gộp tới ~CHUNK ký tự, có chồng lấn nhẹ để không mất ngữ cảnh.
const CHUNK = 1800;
const OVERLAP = 200;

export function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  // tách theo dòng tiêu đề markdown hoặc dòng trống kép
  const blocks = text.split(/\n(?=#{1,6}\s)|\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const b of blocks) {
    // Nếu block là bảng biểu markdown, tách riêng làm chunk độc lập để tránh bị chia cắt/gộp sai
    const isTable = b.startsWith('|');
    if (isTable) {
      if (cur) { chunks.push(cur); cur = ''; }
      if (b.length > CHUNK) {
        // cắt cứng nếu bảng quá lớn
        for (let i = 0; i < b.length; i += CHUNK - OVERLAP) {
          chunks.push(b.slice(i, i + CHUNK));
        }
      } else {
        chunks.push(b);
      }
      continue;
    }

    if (b.length > CHUNK) {
      // block quá dài -> cắt cứng
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < b.length; i += CHUNK - OVERLAP) {
        chunks.push(b.slice(i, i + CHUNK));
      }
      continue;
    }
    if ((cur + '\n\n' + b).length > CHUNK) {
      if (cur) chunks.push(cur);
      cur = b;
    } else {
      cur = cur ? cur + '\n\n' + b : b;
    }
  }
  if (cur) chunks.push(cur);

  // Khử trùng: bỏ các chunk có nội dung giống hệt nhau (data thường bị lặp file
  // do tổ chức thư mục trùng), giữ lần xuất hiện đầu. So khớp theo nội dung đã
  // bỏ dòng nhãn "## 🔖 [...]" và chuẩn hóa khoảng trắng để bắt cả bản gần giống.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const c of chunks) {
    const key = c
      .replace(/^##\s*🔖[^\n]*\n+/g, '')   // bỏ dòng nhãn nguồn ở đầu chunk
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (key.length < 8) { deduped.push(c); continue; } // chunk quá ngắn, giữ nguyên
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

// ---------- Embedding ----------
function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

// Embed batch
async function embedBatch(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  forceDim?: number
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Dùng Gemini embedding (gemini-embedding-001). Gọi song song nhẹ để tránh rate limit.
  const PARALLEL = 5;
  const out: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += PARALLEL) {
    if (i > 0) await new Promise(r => setTimeout(r, 200));
    const slice = texts.slice(i, i + PARALLEL);
    const vecs = await Promise.all(slice.map(async t => {
      // Chiều của query PHẢI khớp chiều của index. retrieve() truyền indexDim vào forceDim.
      // gemini-embedding-001 mặc định 3072 chiều; chỉ ép outputDimensionality khi forceDim
      // được cung cấp để tránh lệch chiều -> RAG trả về rỗng.
      const body: Record<string, unknown> = {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t }] },
        taskType,
      };
      if (forceDim) body.outputDimensionality = forceDim;
      const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini Embedding lỗi ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return normalize(data.embedding?.values || []);
    }));
    vecs.forEach((v, j) => { out[i + j] = v; });
  }
  return out;
}

export async function embedQuery(text: string, forceDim?: number): Promise<number[]> {
  const [v] = await embedBatch([text], 'RETRIEVAL_QUERY', forceDim);
  return v || [];
}

// ---------- Xây chỉ mục ----------
export async function buildIndex(dataText: string): Promise<Index> {
  const texts = chunkText(dataText);
  const vecs = await embedBatch(texts, 'RETRIEVAL_DOCUMENT');
  // GẮN file cho từng chunk dựa trên marker "## 🔖 [folder] · tên-file" có sẵn trong data.md.
  // Quan trọng: retrieve() cộng điểm ưu tiên theo c.file (03_Human-QA +0.35, drive-extracted +0.05).
  // Nếu không gắn -> các boost này chết, Q&A chuẩn không được ưu tiên. Chunk không có marker thì
  // kế thừa file của marker gần nhất phía trên (file dài bị cắt thành nhiều chunk).
  let currentFile = '';
  const rawChunks: Chunk[] = texts.map((text, i) => {
    const m = text.match(/##\s*🔖\s*\[([^\]]*)\]\s*·\s*([^\n]+)/);
    if (m) currentFile = `${m[1].trim()}/${m[2].trim()}`;
    return { text, vec: vecs[i] || [], file: currentFile || undefined };
  });

  // NEAR-DUP: gộp các chunk gần như y hệt (cùng nội dung đăng lại nhiều file/nguồn).
  // An toàn: ngưỡng rất cao 0.985, BỎ QUA bảng (| ...) để không xoá nhầm dòng phân lô gần giống,
  // và khi trùng thì GIỮ nguồn ưu tiên cao hơn (canonical theo source_priority).
  const NEAR_DUP = 0.985;
  const sourcePriority = (file?: string): number => {
    const f = (file || '').toLowerCase();
    if (f.includes('03_human-qa')) return 5;       // Q&A chuẩn Human — tin nhất
    if (f.includes('drive-extracted')) return 4;   // dữ liệu gốc từ Drive
    if (f.includes('nyah-phudinh') || f.includes('nyah-phuinh') || f.includes('01 nyah')) return 3;
    if (f.includes('qa-generated')) return 2;       // QA sinh tự động — dễ sai
    if (f.includes('web-crawl')) return 1;          // crawl web — thấp nhất
    return 3;
  };
  const isTable = (t: string) => t.trim().startsWith('|') || t.includes('\n|');
  const chunks: Chunk[] = [];
  let nearDupRemoved = 0;
  for (const c of rawChunks) {
    if (!c.vec.length || isTable(c.text)) { chunks.push(c); continue; }
    let dupIdx = -1;
    for (let j = 0; j < chunks.length; j++) {
      const k = chunks[j];
      if (!k.vec.length || isTable(k.text)) continue;
      if (dot(c.vec, k.vec) > NEAR_DUP) { dupIdx = j; break; }
    }
    if (dupIdx >= 0) {
      nearDupRemoved++;
      // giữ bản từ nguồn ưu tiên cao hơn làm canonical
      if (sourcePriority(c.file) > sourcePriority(chunks[dupIdx].file)) chunks[dupIdx] = c;
    } else {
      chunks.push(c);
    }
  }
  console.log(`[buildIndex] ${rawChunks.length} chunk -> bỏ ${nearDupRemoved} near-dup -> ${chunks.length} chunk.`);
  return { chunks, builtAt: new Date().toISOString() };
}

// ---------- Lưu / đọc chỉ mục trên GitHub (đọc qua blob API để không bị giới hạn 1MB) ----------
async function getSha(path: string): Promise<string | null> {
  const r = await fetch(`${API}/contents/${path}?ref=${INDEX_BRANCH}`, { headers: ghHeaders(), cache: 'no-store' });
  if (!r.ok) return null;
  return (await r.json()).sha || null;
}

export async function saveIndex(index: Index): Promise<void> {
  const sha = await getSha(INDEX_PATH);
  const res = await fetch(`${API}/contents/${INDEX_PATH}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message: 'Cập nhật chỉ mục tìm kiếm (RAG)',
      content: Buffer.from(JSON.stringify(index), 'utf-8').toString('base64'),
      branch: INDEX_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Lưu chỉ mục lỗi: ${res.status} ${await res.text()}`);
}

let memIndex: Index | null = null;
let memIndexAt = 0;
let memIndexLoading: Promise<Index | null> | null = null;

const TMP_CACHE_PATH = path.join(os.tmpdir(), 'rag_index.json');

export async function loadIndex(): Promise<Index | null> {
  const now = Date.now();

  // 0) Thử đọc trực tiếp từ file index.json local (rất nhanh, ~1-2ms, không tốn network/coldstart)
  try {
    const localPath = path.join(process.cwd(), 'index.json');
    if (existsSync(localPath)) {
      const content = await readFile(localPath, 'utf-8');
      const index = JSON.parse(content) as Index;
      if (index && index.chunks && index.chunks.length > 0) {
        memIndex = index;
        memIndexAt = now;
        return memIndex;
      }
    }
  } catch (e) {
    console.warn('[RAG] Đọc index.json local thất bại:', e);
  }

  // 1) Nếu cache trong RAM chưa quá 5 phút -> trả về ngay (0ms)
  if (memIndex && now - memIndexAt < 5 * 60 * 1000) {
    if (memIndex.chunks?.[0]?.vec?.length) {
      return memIndex;
    } else {
      memIndex = null;
      memIndexAt = 0;
    }
  }

  // 2) Nếu có file cache ở /tmp và chưa quá 15 phút -> đọc từ /tmp cực nhanh (2-5ms)
  if (existsSync(TMP_CACHE_PATH)) {
    try {
      const stats = statSync(TMP_CACHE_PATH);
      const fileAge = now - stats.mtimeMs;
      if (fileAge < 15 * 60 * 1000) { // cache trong /tmp 15 phút
        const content = await readFile(TMP_CACHE_PATH, 'utf-8');
        memIndex = JSON.parse(content) as Index;
        memIndexAt = now;
        
        // Kích hoạt revalidate ngầm từ GitHub để cập nhật index mới nếu có
        revalidateIndexInBackground();
        
        return memIndex;
      }
    } catch (e) {
      console.warn('[RAG] Đọc cache /tmp thất bại, sẽ tải từ GitHub...', e);
    }
  }

  // 3) Nếu chưa có cache -> tải từ GitHub (đồng bộ)
  return fetchAndCacheIndex();
}

async function fetchAndCacheIndex(): Promise<Index | null> {
  if (memIndexLoading) return memIndexLoading;
  memIndexLoading = (async () => {
    try {
      console.log('[RAG] Bắt đầu tải chỉ mục từ GitHub Raw CDN...');
      const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${INDEX_BRANCH}/${INDEX_PATH}`;
      const r = await fetch(rawUrl, { cache: 'no-store' });
      
      let json = '';
      if (r.ok) {
        json = await r.text();
      } else {
        console.warn(`[RAG] Tải từ GitHub Raw CDN lỗi (${r.status}), rơi vào phương thức API cũ...`);
        const sha = await getSha(INDEX_PATH);
        if (!sha) return null;
        const apiRes = await fetch(`${API}/git/blobs/${sha}`, { headers: ghHeaders(), cache: 'no-store' });
        if (!apiRes.ok) return null;
        const blob = await apiRes.json();
        json = Buffer.from(blob.content || '', blob.encoding || 'base64').toString('utf-8');
      }

      const index = JSON.parse(json) as Index;
      
      // Cache vào RAM
      memIndex = index;
      memIndexAt = Date.now();
      
      // Cache vào /tmp
      try {
        await writeFile(TMP_CACHE_PATH, json, 'utf-8');
      } catch (err) {
        console.warn('[RAG] Không thể lưu cache vào /tmp:', err);
      }
      
      return index;
    } catch (err) {
      console.error('[RAG] Lỗi khi tải chỉ mục từ GitHub:', err);
      return null;
    } finally {
      memIndexLoading = null;
    }
  })();
  return memIndexLoading;
}

// Hàm revalidate ngầm (Stale-While-Revalidate)
function revalidateIndexInBackground() {
  if (memIndexLoading) return;
  // Chạy ngầm hoàn toàn, không chặn luồng chính
  fetchAndCacheIndex().catch(err => {
    console.warn('[RAG] Revalidate index ngầm lỗi:', err);
  });
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function extractKeywords(query: string): RegExp[] {
  const q = query.toLowerCase();
  const patterns: RegExp[] = [];

  // Số căn/lô cụ thể (Hỗ trợ định dạng "căn #3" và tìm kiếm dạng "#03" trong bảng)
  let m: RegExpExecArray | null;
  const unitRe = /(?:căn|lô|ô|unit)\s*(?:số\s*|#\s*)?([a-z]?\d+[a-z]?)/g;
  while ((m = unitRe.exec(q)) !== null)
    patterns.push(new RegExp(`(?:căn|lô|ô|unit)[^\\d]*${m[1]}\\b|#0*${m[1]}\\b`, 'i'));

  // Tên mẫu nhà
  const modelM = q.match(/\b(cosmo\s*gen\s*\d+|cosmo|fusion|opus|office|villa\s*ny[aâ]h|ny[aâ]h)\b/i);
  if (modelM) patterns.push(new RegExp(modelM[0].replace(/\s+/g, '\\s*'), 'i'));
 
  // Số căn/lô đứng độc lập không đi kèm từ khoá "căn/lô" (vd: "diện tích 24", "giá 3")
  // Loại trừ số đi kèm đơn vị (không phải số căn): tỷ/triệu/m²/phút/giờ/km/năm/% /tầng/phòng...
  // và loại trừ số đứng SAU "quận/q/phường/p/tầng/lầu/năm" (vd "quận 1", "phường 7" KHÔNG phải căn).
  const standaloneNumRe = /(?<!\b(?:quận|q|phường|p|tầng|lầu|năm|lúc|khoảng|q\.|p\.)\s?)\b([1-9]\d?)\b(?![\s-]*(?:tỷ|tỉ|triệu|m|tr\b|m2|m²|phút|giờ|km|năm|tuổi|%|tầng|lầu|phòng|người|giây|ngày|tháng))/i;
  const standaloneMatch = q.match(standaloneNumRe);
  if (standaloneMatch) {
    const val = standaloneMatch[1];
    if (!patterns.some(pat => pat.test(`#0*${val}`))) {
      patterns.push(new RegExp(`(?:căn|lô|ô|unit)[^\\d]*${val}\\b|#0*${val}\\b`, 'i'));
    }
  }

  // Người sáng lập / chức danh
  if (/founder|chủ\s*tịch|giám\s*đốc|sáng\s*lập|lãnh\s*đạo|CEO/i.test(q))
    patterns.push(/Ngô\s*Trần\s*Công\s*Luận|Nhã\s*Đạt/i);

  // Dự án / địa điểm
  if (/phú\s*định|villa|địa\s*chỉ|vị\s*trí|quận|đường/i.test(q))
    patterns.push(/Phú\s*Định|Ny'ah|quận\s*8|An\s*Dương\s*Vương/i);

  // Giá / tài chính
  if (/giá|bao\s*nhiêu|tiền|thanh\s*toán|vay|đặt\s*cọc|chiết\s*khấu/i.test(q))
    patterns.push(/(?:tỷ|triệu|thanh\s*toán|chiết\s*khấu|đặt\s*cọc)/i);

  // Pháp lý
  if (/pháp\s*lý|sổ|quyền\s*sử\s*dụng|giấy\s*tờ|quy\s*hoạch/i.test(q))
    patterns.push(/(?:sổ\s*(?:đỏ|hồng)|QSDĐ|pháp\s*lý|quy\s*hoạch)/i);

  return patterns;
}

export interface ScoredChunk {
  text: string;
  score: number;
  file?: string;
}

// Truy hồi top-K đoạn liên quan nhất — hybrid: vector similarity + keyword boost
// Trả kèm score để caller có thể áp ngưỡng confidence (tránh slide sai khi query mơ hồ)
export async function retrieve(query: string, index: Index, k = 20, minScore = 0): Promise<string[]> {
  const indexDim = index.chunks[0]?.vec?.length || 0;
  let q: number[] = [];
  let isVectorFailed = false;

  try {
    q = await embedQuery(query, indexDim);
  } catch (err: any) {
    console.warn(`[RAG WARNING] Gọi Gemini Embedding thất bại (hết tiền hoặc quá tải), chuyển sang tìm kiếm từ khóa offline: ${err.message}`);
    isVectorFailed = true;
  }

  // Tách từ khóa chung từ câu hỏi nếu chế độ offline được kích hoạt
  const stopWords = new Set(['là', 'ở', 'nào', 'có', 'không', 'thì', 'mà', 'được', 'của', 'cho', 'với', 'nhà', 'đất', 'bất', 'động', 'sản', 'cho', 'hỏi', 'em', 'tôi', 'ad', 'bot', 'với', 'ạ', 'dạ', 'này', 'cái', 'nằm', 'ở', 'đâu']);
  const words = query.toLowerCase().split(/[\s,.\-?!\(\)]+/).filter(w => w.length > 1 && !stopWords.has(w));
  const textKeywords = words.map(w => new RegExp(w, 'i'));

  const keywords = extractKeywords(query);

  // Lọc bỏ toàn bộ dữ liệu thuộc dự án Villa Ny'ah
  const phuDinhChunks = index.chunks.filter(c => {
    const text = c.text.toLowerCase();
    const file = (c.file || '').toLowerCase();
    
    const isVillaNyah = text.includes("villa ny'ah") || text.includes("villa ny’ah") || text.includes("villa nyah") || text.includes("cầu tràm") || text.includes("cần giuộc");
    const isPhuDinh = text.includes("phú định") || text.includes("phu dinh") || text.includes("cosmo") || text.includes("fusion") || text.includes("opus");
    
    if (isVillaNyah && !isPhuDinh) return false;
    if (file.includes('villa-nyah') || file.includes('villa_nyah') || file.includes('cau_tram') || file.includes('cau-tram')) return false;
    
    return true;
  });

  const scored = phuDinhChunks.map(c => {
    let score = 0;
    let hits = 0;
    let headerHits = 0;

    for (const re of keywords) {
      if (re.test(c.text)) {
        hits++;
        // Boost thêm nếu khớp ngay ở dòng đầu tiên (thường là tiêu đề file/section)
        const firstLine = c.text.split('\n')[0] || '';
        if (re.test(firstLine)) {
          headerHits++;
        }
      }
    }
    
    if (isVectorFailed) {
      // Offline mode: Đếm số lượng từ khóa chung khớp
      let wordHits = 0;
      let wordHeaderHits = 0;
      for (const re of textKeywords) {
        if (re.test(c.text)) {
          wordHits++;
          const firstLine = c.text.split('\n')[0] || '';
          if (re.test(firstLine)) wordHeaderHits++;
        }
      }
      // Điểm số offline dựa vào hits của từ khóa thường + từ khóa đặc biệt
      score = (hits * 15) + (wordHits * 10) + (headerHits * 10) + (wordHeaderHits * 5);
      
      // Ưu tiên độ dài phù hợp của câu và file Q&A
      if (score > 0 && c.file && c.file.includes('03_Human-QA')) score += 5;
    } else {
      // Online mode: Tính cosine similarity + boost từ khóa
      if (q.length === indexDim) {
        score = dot(q, c.vec);
        score += Math.min(hits * 0.5, 1.0);
        score += Math.min(headerHits * 0.2, 0.4);
      }
    }

    // Boost chung
    if (c.file && c.file.includes('03_Human-QA')) {
      score += isVectorFailed ? 5 : 0.35;
    }
    if (c.file && c.file.includes('drive-extracted')) {
      score += isVectorFailed ? 2 : 0.05;
    }

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Nếu ở chế độ offline, lọc bỏ các chunk hoàn toàn không khớp từ khóa nào
  let filtered = scored;
  if (isVectorFailed) {
    filtered = scored.filter(item => item.score > 2.0); // phải có ít nhất 1 hit từ khóa
  }

  // Nếu có minScore (ở chế độ vector), kiểm tra top item trước — nếu tất cả rất thấp thì trả rỗng
  const topScore = filtered[0]?.score ?? 0;
  if (!isVectorFailed && minScore > 0 && topScore < minScore) {
    console.log(`[RAG] Top score ${topScore.toFixed(3)} < minScore ${minScore} → bỏ qua (query quá mơ hồ)`);
    return [];
  }
  
  // Lọc trùng lặp văn bản để tránh gửi các đoạn giống hệt nhau làm loãng prompt
  const uniqueTexts: string[] = [];
  const seen = new Set<string>();
  for (const item of filtered) {
    const normalized = item.text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueTexts.push(item.text);
      if (uniqueTexts.length >= k) break;
    }
  }
  return uniqueTexts;
}
