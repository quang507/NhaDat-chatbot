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

// Phân loại vào 6 danh mục + làm sạch (gộp trùng, bỏ cũ) - THẬN TRỌNG, không chắc thì giữ nguyên
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Thiếu GEMINI_API_KEY' }, { status: 500 });
  }

  try {
    const { entries } = await req.json();
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'Thiếu dữ liệu' }, { status: 400 });
    }

    // entries theo thứ tự MỚI -> CŨ (index nhỏ = mới hơn)
    const input = entries
      .map((e: { cat: string; date: string; content: string }, i: number) =>
        `### MỤC #${i} | Loại hiện tại: ${e.cat} | Ngày: ${e.date}${i === 0 ? ' (MỚI NHẤT)' : i === entries.length - 1 ? ' (CŨ NHẤT)' : ''}\n${e.content}`
      )
      .join('\n\n');

    const prompt = `Bạn là chuyên gia tổ chức dữ liệu bất động sản. Dưới đây là các MỤC dữ liệu, sắp xếp từ MỚI NHẤT (#0) đến CŨ NHẤT.

Hãy thực hiện 2 việc:

A) PHÂN LOẠI: gán mỗi nội dung vào đúng 1 trong 6 danh mục:
${CATEGORIES.map((c, i) => `   ${i + 1}. ${c}`).join('\n')}

B) LÀM SẠCH (RẤT THẬN TRỌNG):
   - CHỈ gộp/loại bỏ khi CHẮC CHẮN hai phần nói về CÙNG MỘT chủ đề/đối tượng cụ thể VÀ một bản đã bị bản mới hơn thay thế (vd: cùng một chính sách nhưng có thông báo cập nhật mới; cùng một bảng giá/rổ hàng nhưng có bản tháng mới hơn).
   - Khi mâu thuẫn về CÙNG chủ đề, GIỮ thông tin từ mục MỚI HƠN (index nhỏ hơn), bỏ thông tin cũ đã sai.
   - NẾU KHÔNG CHẮC CHẮN, hoặc hai phần là thông tin KHÁC NHAU (khác dự án, khác sản phẩm, khác khía cạnh) → PHẢI GIỮ NGUYÊN CẢ HAI, KHÔNG xóa, KHÔNG gộp.
   - TUYỆT ĐỐI KHÔNG bịa thêm, KHÔNG rút gọn nội dung hợp lệ. Giữ nguyên câu chữ gốc.
   - Thà giữ thừa còn hơn xóa nhầm dữ liệu thật.

TRẢ VỀ JSON hợp lệ:
{
  "entries": [
    { "cat": "<một trong 6 danh mục>", "content": "<nội dung giữ nguyên/đã gộp>" }
  ]
}
Sắp xếp các mục theo thứ tự mới -> cũ. Danh mục phải là một trong: ${CATEGORIES.map(c => `"${c}"`).join(', ')}.

DỮ LIỆU:
${input}`;

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

    const finish = data.candidates?.[0]?.finishReason;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: { entries?: { cat: string; content: string }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json(
          { error: 'Dữ liệu quá lớn nên AI không xử lý trọn được. Hãy làm sạch theo từng phần nhỏ hơn.' },
          { status: 500 }
        );
      }
      parsed = JSON.parse(match[0]);
    }

    const result = (parsed.entries || [])
      .map(e => ({ cat: CATEGORIES.includes(e.cat) ? e.cat : 'Câu hỏi thường gặp', content: (e.content || '').trim() }))
      .filter(e => e.content.length > 0);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Không nhận được kết quả hợp lệ' }, { status: 500 });
    }

    return NextResponse.json({
      entries: result,
      truncated: finish === 'MAX_TOKENS',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
