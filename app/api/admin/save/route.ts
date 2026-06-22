import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, saveDataFile } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Lưu nội dung mới vào data.md trên GitHub
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { content } = await req.json();
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Thiếu nội dung' }, { status: 400 });
    }
    await saveDataFile(content);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
