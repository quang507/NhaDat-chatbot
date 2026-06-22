import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, saveFile } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Lưu data.md và/hoặc persona.md lên GitHub
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { content, persona } = await req.json();
    if (typeof content === 'string') {
      await saveFile('data.md', content, 'Cập nhật data.md từ trang admin');
    }
    if (typeof persona === 'string') {
      await saveFile('persona.md', persona, 'Cập nhật văn phong bot từ trang admin');
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
