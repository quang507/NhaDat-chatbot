import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, getDataFile } from '@/lib/admin';

export const runtime = 'nodejs';

// Đăng nhập + lấy nội dung data.md hiện tại
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { content } = await getDataFile();
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
