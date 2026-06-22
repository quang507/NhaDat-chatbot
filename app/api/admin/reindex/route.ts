import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, getFile } from '@/lib/admin';
import { buildIndex, saveIndex } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Tạo lại chỉ mục tìm kiếm (RAG) từ data.md hiện tại trên GitHub.
// Có thể nhận content trực tiếp từ admin (data vừa chỉnh) để tạo chỉ mục ngay,
// không cần đợi Vercel deploy lại.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    let content = '';
    try {
      const body = await req.json();
      content = typeof body?.content === 'string' ? body.content : '';
    } catch {
      // không có body -> đọc từ GitHub
    }
    if (!content) {
      const data = await getFile('data.md');
      content = data.content;
    }
    if (!content.trim()) {
      return NextResponse.json({ error: 'data.md trống, chưa có gì để lập chỉ mục' }, { status: 400 });
    }
    const index = await buildIndex(content);
    await saveIndex(index);
    return NextResponse.json({ ok: true, chunks: index.chunks.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
