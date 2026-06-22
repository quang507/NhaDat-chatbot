import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const revalidate = 60;

// Công khai: widget chat đọc gợi ý câu hỏi + thông tin liên hệ
export async function GET() {
  try {
    const cfg = await getConfig();
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json({ suggestions: [], phone: '', zalo: '' });
  }
}
