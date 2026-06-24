// RAG: chia nhỏ data.md, tạo embedding, lưu chỉ mục, và truy hồi đoạn liên quan.
// Mục tiêu: thay vì nhét cả 250k token vào mỗi câu hỏi (gây chậm + lỗi 429),
// ta chỉ gửi vài đoạn liên quan nhất tới câu hỏi -> nhanh, rẻ, ít lỗi.

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const INDEX_BRANCH = 'chatbot-logs'; // dùng chung nhánh log (không trigger Vercel deploy)
const INDEX_PATH = 'index.json';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const COHERE_API_KEY = process.env.COHERE_API_KEY || '';
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
  return chunks;
}

// ---------- Embedding ----------
function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

// Embed batch
async function embedBatch(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (COHERE_API_KEY) {
    const cohereTaskType = taskType === 'RETRIEVAL_DOCUMENT' ? 'search_document' : 'search_query';
    const res = await fetch('https://api.cohere.com/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        texts: texts,
        model: 'embed-multilingual-v3.0',
        input_type: cohereTaskType
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cohere embedding lỗi ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return (data.embeddings || []).map((emb: number[]) => normalize(emb));
  } else {
    // Dùng Gemini Fallback
    const PARALLEL = 5;
    const out: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += PARALLEL) {
      if (i > 0) await new Promise(r => setTimeout(r, 200));
      const slice = texts.slice(i, i + PARALLEL);
      const vecs = await Promise.all(slice.map(async t => {
        const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: t }] },
            taskType,
          }),
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
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedBatch([text], 'RETRIEVAL_QUERY');
  return v || [];
}

// ---------- Xây chỉ mục ----------
export async function buildIndex(dataText: string): Promise<Index> {
  const texts = chunkText(dataText);
  const vecs = await embedBatch(texts, 'RETRIEVAL_DOCUMENT');
  const chunks: Chunk[] = texts.map((text, i) => ({ text, vec: vecs[i] || [] }));
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

export async function loadIndex(): Promise<Index | null> {
  // cache trong RAM 5 phút
  if (memIndex && Date.now() - memIndexAt < 5 * 60 * 1000) {
    if (!memIndex.chunks[0]?.vec?.length) { memIndex = null; memIndexAt = 0; }
    else return memIndex;
  }
  // dedup: nhiều request đồng thời chỉ tải 1 lần
  if (memIndexLoading) return memIndexLoading;
  memIndexLoading = (async () => {
    try {
      const sha = await getSha(INDEX_PATH);
      if (!sha) return null;
      const r = await fetch(`${API}/git/blobs/${sha}`, { headers: ghHeaders(), cache: 'no-store' });
      if (!r.ok) return null;
      const blob = await r.json();
      const json = Buffer.from(blob.content || '', blob.encoding || 'base64').toString('utf-8');
      memIndex = JSON.parse(json) as Index;
      memIndexAt = Date.now();
      return memIndex;
    } catch {
      return null;
    } finally {
      memIndexLoading = null;
    }
  })();
  return memIndexLoading;
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
  const standaloneNumRe = /\b([1-9]\d?)\b(?![\s-]*(?:tỷ|tỉ|triệu|m|tr\b|m2|m²))/i;
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

// Truy hồi top-K đoạn liên quan nhất — hybrid: vector similarity + keyword boost
export async function retrieve(query: string, index: Index, k = 20): Promise<string[]> {
  const q = await embedQuery(query);
  if (!q.length) return [];

  const indexDim = index.chunks[0]?.vec?.length || 0;
  if (indexDim > 0 && q.length !== indexDim) {
    console.error(`[RAG LỖI] Lệch số chiều Vector! Query có ${q.length} chiều, nhưng Database có ${indexDim} chiều. Vui lòng đồng bộ lại.`);
    return [];
  }

  const keywords = extractKeywords(query);
  const scored = index.chunks.map(c => {
    let score = dot(q, c.vec);
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
    
    // Boost cực mạnh (+0.5) cho các keyword chính xác (như Mã căn, Lô, Số nhà)
    score += Math.min(hits * 0.5, 1.0);

    // Boost thêm (+0.2) cho tiêu đề/header khớp chính xác để ưu tiên nội dung chính chủ của lô đất
    score += Math.min(headerHits * 0.2, 0.4);

    // Ưu tiên dữ liệu mới được trích xuất từ Google Drive (drive-extracted/) bằng cách cộng điểm nhẹ (+0.05)
    if (c.file && c.file.includes('drive-extracted')) {
      score += 0.05;
    }

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  
  // Lọc trùng lặp văn bản để tránh gửi các đoạn giống hệt nhau làm loãng prompt
  const uniqueTexts: string[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const normalized = item.text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueTexts.push(item.text);
      if (uniqueTexts.length >= k) break;
    }
  }
  return uniqueTexts;
}
