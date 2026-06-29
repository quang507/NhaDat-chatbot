import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { chunkText, embedQuery, loadIndex, saveIndex } from '@/lib/rag';
import type { Chunk, Index } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBED_MODEL = 'gemini-embedding-001'; // khớp lib/rag.ts + sync_and_reindex.js
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DIMS = 3072; // gemini-embedding-001 mặc định 3072 chiều

function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!GEMINI_API_KEY) throw new Error('Chưa có GEMINI_API_KEY');
  const out: number[][] = [];

  // Gemini embedding (gemini-embedding-001, 3072 chiều)
  const BATCH = 5;
  for (let i = 0; i < texts.length; i += BATCH) {
    if (i > 0) await sleep(3000);
    const chunk = texts.slice(i, i + BATCH);
    const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: chunk.map(text => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        })),
      }),
    });
    if (!res.ok) throw new Error(`Gemini embed lỗi ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const emb of (data.embeddings || [])) {
      out.push(normalize(emb.values || []));
    }
  }
  return out;
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function getFileSha(path: string): Promise<string | null> {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: ghHeaders(),
    cache: 'no-store',
  });
  if (!r.ok) return null;
  return (await r.json()).sha || null;
}

async function saveFileToGitHub(path: string, content: string, message: string): Promise<void> {
  const encoded = Buffer.from(content, 'utf-8').toString('base64');
  const sha = await getFileSha(path);
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message,
      content: encoded,
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub lưu file lỗi: ${res.status} ${await res.text()}`);
}

/**
 * POST /api/admin/crawl-save-index
 * Body: { filename: string, markdown: string }
 * 1. Lưu markdown lên GitHub data/web-crawl/<filename>.md
 * 2. Tạo embedding cho nội dung mới
 * 3. Merge vào index.json cũ (giữ nguyên các chunk cũ, chỉ thêm chunk mới)
 * 4. Push index.json mới lên nhánh chatbot-logs
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { filename, markdown } = await req.json();
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'Thiếu filename' }, { status: 400 });
    }
    if (!markdown || typeof markdown !== 'string' || markdown.trim().length < 100) {
      return NextResponse.json({ error: 'Markdown quá ngắn hoặc rỗng' }, { status: 400 });
    }

    // Bước 1: Lưu file markdown lên GitHub
    const safeName = filename.replace(/[^a-zA-Z0-9\-_.]/g, '_').replace(/_{2,}/g, '_');
    const filePath = `data/web-crawl/${safeName}.md`;
    await saveFileToGitHub(filePath, markdown, `Crawl web: ${safeName}`);

    // Bước 2: Chunk và embed nội dung mới
    const rawChunks = chunkText(markdown);
    if (rawChunks.length === 0) {
      return NextResponse.json({ error: 'Không tách được nội dung thành chunks' }, { status: 400 });
    }
    // Kiểm tra giới hạn (Cohere trial: 100k TPM ≈ tối đa ~200 chunks ~500 chars/chunk an toàn)
    const MAX_CHUNKS = 150;
    const chunks = rawChunks.slice(0, MAX_CHUNKS);
    const annotated = chunks.map(t => `## 🔖 [Web Crawl] · ${safeName}\n\n${t}`);

    const vecs = await embedTexts(annotated);
    if (vecs.length !== annotated.length) {
      throw new Error(`Số lượng vector không khớp: ${vecs.length} vs ${annotated.length}`);
    }

    const newChunks: (Chunk & { file: string; hash: string })[] = annotated.map((text, i) => ({
      text,
      vec: vecs[i] || [],
      file: filePath,
      hash: `web-${safeName}`,
    }));

    // Bước 3: Tải index cũ và merge (xóa chunks cũ của file này nếu có, thêm chunks mới)
    const oldIndex = await loadIndex();
    const oldChunks: Chunk[] = oldIndex
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (oldIndex.chunks as any[]).filter((c: any) => c.file !== filePath && c.vec?.length === DIMS)
      : [];

    const mergedIndex: Index = {
      chunks: [...oldChunks, ...newChunks],
      builtAt: new Date().toISOString(),
    };

    // Bước 4: Lưu index mới lên chatbot-logs
    await saveIndex(mergedIndex);

    // Bước 5: Append vào data.md để Rebuild về sau luôn giữ nội dung này
    try {
      const DATA_PATH = 'data.md';
      const dataSha = await getFileSha(DATA_PATH);
      const dataRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`, {
        headers: ghHeaders(), cache: 'no-store',
      });
      const dataJson = dataRes.ok ? await dataRes.json() : null;
      const existingData = dataJson ? Buffer.from(dataJson.content || '', 'base64').toString('utf-8') : '';
      const appendBlock = `\n\n---\n<!-- web-crawl: ${safeName} -->\n${markdown.trim()}\n`;
      const newData = existingData.trimEnd() + appendBlock;
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
        method: 'PUT',
        headers: ghHeaders(),
        body: JSON.stringify({
          message: `Append web crawl vào data.md: ${safeName}`,
          content: Buffer.from(newData, 'utf-8').toString('base64'),
          branch: BRANCH,
          ...(dataSha ? { sha: dataSha } : {}),
        }),
      });
    } catch (e2) {
      console.warn('Append data.md failed (non-fatal):', e2);
    }

    return NextResponse.json({
      ok: true,
      file: filePath,
      newChunks: newChunks.length,
      totalChunks: mergedIndex.chunks.length,
      truncated: rawChunks.length > MAX_CHUNKS,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
