import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, getFile, DEFAULT_PERSONA } from '@/lib/admin';

export const runtime = 'nodejs';

// Đăng nhập + lấy nội dung data.md và persona.md hiện tại
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const [data, persona] = await Promise.all([getFile('data.md'), getFile('persona.md')]);
    return NextResponse.json({
      content: data.content,
      persona: persona.content || DEFAULT_PERSONA,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
