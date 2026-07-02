import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60s per batch is very safe for 100 chunks

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

async function embedBatchTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!GEMINI_API_KEY) throw new Error('Chưa có GEMINI_API_KEY');
  const out: number[][] = [];

  const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map(text => ({
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
  return out;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { texts } = await req.json();
    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: 'texts must be a non-empty array' }, { status: 400 });
    }
    
    // Process batch of embeddings
    const vectors = await embedBatchTexts(texts);
    return NextResponse.json({ ok: true, vectors });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
