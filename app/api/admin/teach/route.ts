import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { chunkText, loadIndex, saveIndex } from '@/lib/rag';
import type { Chunk, Index } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 120;

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DIMS = 3072;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function normalize(v: number[]): number[] {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}
async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!GEMINI_API_KEY) throw new Error('Chưa có GEMINI_API_KEY');
  const out: number[][] = [];
  const BATCH = 5;
  for (let i = 0; i < texts.length; i += BATCH) {
    if (i > 0) await sleep(3000);
    const chunk = texts.slice(i, i + BATCH);
    const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: chunk.map(text => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT' })) }),
    });
    if (!res.ok) throw new Error(`Gemini embed lỗi ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const emb of (data.embeddings || [])) out.push(normalize(emb.values || []));
  }
  return out;
}
// File tích lũy các cặp Q&A do người dùng "dạy" — đặt tên có '03_Human-QA' để bot ưu tiên bê nguyên văn.
const TEACH_PATH = 'data/03_Human-QA/03_Human-QA_day-bot.md';

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function readFile(path: string): Promise<{ content: string; sha: string | null }> {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`, {
    headers: ghHeaders(), cache: 'no-store',
  });
  if (r.status === 404) return { content: '', sha: null };
  if (!r.ok) throw new Error(`Đọc file lỗi: ${r.status}`);
  const d = await r.json();
  return { content: Buffer.from(d.content || '', 'base64').toString('utf-8'), sha: d.sha };
}

// Dạy bot 1 cặp Q&A: ghi vào file Human-QA + nhúng vào index ngay.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  try {
    const { question, answer } = await req.json();
    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: 'Thiếu câu hỏi hoặc câu trả lời' }, { status: 400 });
    }

    // 1. Đọc file Q&A cũ, nối thêm cặp mới
    const { content: old, sha } = await readFile(TEACH_PATH);
    const header = old.trim() ? old.trimEnd() + '\n\n' : '# 03_Human-QA — Q&A do người dùng dạy bot\n\n> Bot BẮT BUỘC bê nguyên văn câu trả lời (Response) khi khách hỏi câu trùng/tương tự.\n\n';
    const block = `## Câu hỏi: ${question.trim()}\n\n**Response:**\n${answer.trim()}\n\n---\n`;
    const updated = header + block;

    // 2. Ghi lên GitHub
    const put = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(TEACH_PATH)}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `Dạy bot: ${question.trim().slice(0, 50)}`,
        content: Buffer.from(updated, 'utf-8').toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!put.ok) return NextResponse.json({ error: `Ghi file lỗi: ${put.status} ${await put.text()}` }, { status: 500 });

    // 3. Re-embed toàn bộ file này: bỏ chunk cũ của file, thêm chunk mới
    const rawChunks = chunkText(updated);
    const annotated = rawChunks.map(t => `## 🔖 [03_Human-QA] · Dạy Bot\n\n${t}`);
    const vecs = await embedTexts(annotated);
    const newChunks: (Chunk & { file: string; hash: string })[] = annotated.map((text, i) => ({
      text, vec: vecs[i] || [], file: TEACH_PATH, hash: 'teach',
    }));

    const oldIndex = await loadIndex();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kept: Chunk[] = oldIndex ? (oldIndex.chunks as any[]).filter((c: any) => c.file !== TEACH_PATH && c.vec?.length === DIMS) : [];
    const merged: Index = { chunks: [...kept, ...newChunks], builtAt: new Date().toISOString() };
    await saveIndex(merged);

    return NextResponse.json({ ok: true, totalChunks: merged.chunks.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
