import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { chunkText, embedQuery, loadIndex, saveIndex } from '@/lib/rag';
import type { Chunk, Index } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const COHERE_API_KEY = process.env.COHERE_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DIMS = COHERE_API_KEY ? 1024 : 3072;

function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];

  if (COHERE_API_KEY) {
    // Cohere: tối đa 96 texts/request, giới hạn 100k TPM
    const BATCH = 96;
    for (let i = 0; i < texts.length; i += BATCH) {
      if (i > 0) await sleep(2000);
      const chunk = texts.slice(i, i + BATCH);
      const res = await fetch('https://api.cohere.com/v1/embed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          texts: chunk,
          model: 'embed-multilingual-v3.0',
          input_type: 'search_document',
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Cohere embed lỗi ${res.status}: ${err}`);
      }
      const data = await res.json();
      for (const emb of (data.embeddings || [])) {
        out.push(normalize(emb));
      }
    }
  } else if (GEMINI_API_KEY) {
    // Fallback: Gemini embedding
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
  } else {
    throw new Error('Chưa có COHERE_API_KEY hoặc GEMINI_API_KEY');
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
