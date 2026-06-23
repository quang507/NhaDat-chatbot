// RAG: chia nhỏ data.md, tạo embedding, lưu chỉ mục, và truy hồi đoạn liên quan.
// Mục tiêu: thay vì nhét cả 250k token vào mỗi câu hỏi (gây chậm + lỗi 429),
// ta chỉ gửi vài đoạn liên quan nhất tới câu hỏi -> nhanh, rẻ, ít lỗi.

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const INDEX_BRANCH = 'chatbot-logs'; // dùng chung nhánh log (không trigger Vercel deploy)
const INDEX_PATH = 'index.json';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBED_MODEL = 'text-embedding-004';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DIMS = 768;

export interface Chunk {
  text: string;
  vec: number[]; // đã chuẩn hóa (normalized) để cosine = dot product
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

async function embedOne(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
  const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) throw new Error(`Embedding 404: model "${EMBED_MODEL}" không tìm thấy. Kiểm tra GEMINI_API_KEY trong Vercel có đúng key từ AI Studio không. Chi tiết: ${errText}`);
    throw new Error(`Embedding lỗi ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return normalize(data.embedding?.values || []);
}

async function embedBatch(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]> {
  const out: number[][] = [];
  // Gọi tuần tự để tránh rate limit, mỗi text 1 request
  for (const text of texts) {
    out.push(await embedOne(text, taskType));
  }
  return out;
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
    // invalidate nếu index dùng dims cũ (text-embedding-004 = 768)
    if (memIndex.chunks[0]?.vec?.length !== DIMS) { memIndex = null; memIndexAt = 0; }
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

// Truy hồi top-K đoạn liên quan nhất với câu hỏi
export async function retrieve(query: string, index: Index, k = 12): Promise<string[]> {
  const q = await embedQuery(query);
  if (!q.length) return [];
  const scored = index.chunks
    .map(c => ({ text: c.text, score: dot(q, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored.map(s => s.text);
}
