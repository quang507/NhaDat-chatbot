import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, getFile } from '@/lib/admin';
import { chunkText } from '@/lib/rag';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const data = await getFile('data.md');
    const content = data.content;
    
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'data.md trống, chưa có gì để lập chỉ mục' }, { status: 400 });
    }
    
    const chunks = chunkText(content);
    return NextResponse.json({ ok: true, chunks });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
