import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { readLogs } from '@/lib/logs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Lấy lead + lịch sử chat gần đây
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const [leads, chats] = await Promise.all([readLogs('leads', 100), readLogs('chats', 100)]);
    return NextResponse.json({ leads, chats });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
