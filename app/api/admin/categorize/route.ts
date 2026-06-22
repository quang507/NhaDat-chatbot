import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const CATEGORIES = [
  'Pháp lý',
  'Tính năng / Tiện ích',
  'Tiến độ',
  'Giá & Thanh toán',
  'Vị trí',
  'Câu hỏi thường gặp',
];

// Nhận content thô -> Gemini phân loại -> trả về mảng { cat, content }[]
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Thiếu GEMINI_API_KEY' }, { status: 500 });
  }

  try {
    const { content } = await req.json();
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Thiếu nội dung' }, { status: 400 });
    }

    const prompt = `Bạn là chuyên gia phân loại tài liệu bất động sản.

Hãy đọc toàn bộ nội dung dưới đây và phân loại TỪNG ĐOẠN vào đúng 1 trong 6 danh mục:
${CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

QUY TẮC:
- Giữ NGUYÊN VẸN nội dung, KHÔNG rút gọn, KHÔNG thêm, KHÔNG sửa.
- Mỗi đoạn chỉ thuộc 1 danh mục phù hợp nhất.
- Nếu 1 đoạn vừa có nhiều loại, ưu tiên danh mục chiếm nhiều nhất.
- Nội dung không rõ loại thì để vào "Câu hỏi thường gặp".

TRẢ VỀ JSON hợp lệ theo đúng cấu trúc này (không thêm gì khác):
{
  "Pháp lý": "toàn bộ nội dung thuộc danh mục này, giữ nguyên",
  "Tính năng / Tiện ích": "...",
  "Tiến độ": "...",
  "Giá & Thanh toán": "...",
  "Vị trí": "...",
  "Câu hỏi thường gặp": "..."
}

NỘI DUG CẦN PHÂN LOẠI:
${content}`;

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: JSON.stringify(data) }, { status: res.status });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // thử tìm JSON trong text nếu model thêm text xung quanh
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return NextResponse.json({ error: 'Model không trả về JSON hợp lệ' }, { status: 500 });
      parsed = JSON.parse(match[0]);
    }

    // Trả về mảng entries chỉ gồm các mục có nội dung
    const entries = CATEGORIES
      .map(cat => ({ cat, content: (parsed[cat] || '').trim() }))
      .filter(e => e.content.length > 0);

    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
