import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const revalidate = 60;

// Công khai: widget chat đọc gợi ý câu hỏi + thông tin liên hệ
export async function GET() {
  try {
    const cfg = await getConfig();
    // Cache tại CDN edge 5 phút (SWR 1h): widget nào load cũng gọi endpoint này,
    // để edge trả thay vì đánh thức lambda -> ~0ms cho hầu hết lượt mở widget.
    return NextResponse.json(cfg, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch {
    return NextResponse.json({ suggestions: [], phone: '', zalo: '' });
  }
}
