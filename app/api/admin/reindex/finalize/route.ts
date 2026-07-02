import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { saveIndex } from '@/lib/rag';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { chunks } = await req.json();
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json({ error: 'chunks must be a non-empty array' }, { status: 400 });
    }
    
    const index = {
      chunks,
      builtAt: new Date().toISOString(),
    };
    
    await saveIndex(index);
    return NextResponse.json({ ok: true, totalChunks: chunks.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
