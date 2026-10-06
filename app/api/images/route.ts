import { NextRequest, NextResponse } from 'next/server';
import { searchImages } from '@/lib/image-search';
import { rateLimited } from '@/lib/ratelimit';

export const runtime = 'nodejs';

// Chọn ảnh đính kèm câu trả lời chat theo NGỮ NGHĨA (câu hỏi + câu trả lời).
// Trả mảng rỗng khi chưa có image_index.json / không ảnh nào đủ ngưỡng -
// client tự quay về ảnh của /api/slide (so khớp từ khóa).
export async function POST(req: NextRequest) {
  if (rateLimited(req, 'images', 60)) return NextResponse.json({ images: [] }, { status: 429 });
  try {
    const { question, answer } = await req.json();
    if (typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    const images = await searchImages(question.slice(0, 500), typeof answer === 'string' ? answer : '');
    return NextResponse.json({ images });
  } catch (e) {
    console.warn('[api/images] lỗi, trả rỗng:', e);
    return NextResponse.json({ images: [] });
  }
}
