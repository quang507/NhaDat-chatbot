import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Cắt nhỏ 1 nội dung quá dài theo ranh giới đoạn để không vượt giới hạn token
function splitBig(content: string, max: number): string[] {
  if (content.length <= max) return [content];
  const parts: string[] = [];
  const blocks = content.split(/\n(?=#{1,6}\s)|\n\s*\n/);
  let cur = '';
  for (const b of blocks) {
    if ((cur + '\n\n' + b).length > max) {
      if (cur) parts.push(cur);
      cur = b.length > max ? '' : b;
      if (b.length > max) {
        for (let i = 0; i < b.length; i += max) parts.push(b.slice(i, i + max));
      }
    } else {
      cur = cur ? cur + '\n\n' + b : b;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

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

    // 1) Cắt nhỏ các mục quá lớn, rồi gom thành các BATCH dưới ngưỡng token để tránh lỗi 429
    const CHAR_PER_PART = 30000; // mỗi mảnh tối đa ~7.5k token
    const BATCH_CHARS = 80000;   // mỗi lần gọi AI tối đa ~20k token (an toàn dưới 250k/phút)
    type E = { cat: string; date: string; content: string };
    const flat: E[] = [];
    for (const e of entries as E[]) {
      for (const piece of splitBig(e.content, CHAR_PER_PART)) {
        flat.push({ cat: e.cat, date: e.date, content: piece });
      }
    }
    const batches: E[][] = [];
    let batch: E[] = [];
    let size = 0;
    for (const e of flat) {
      if (size + e.content.length > BATCH_CHARS && batch.length) {
        batches.push(batch);
        batch = [];
        size = 0;
      }
      batch.push(e);
      size += e.content.length;
    }
    if (batch.length) batches.push(batch);

    const allResults: { cat: string; content: string }[] = [];
    let anyTruncated = false;

    for (let bi = 0; bi < batches.length; bi++) {
      if (bi > 0) await sleep(6000); // giãn cách để không vượt giới hạn token/phút
      const group = batches[bi];
      const input = group
        .map((e, i) =>
          `### MỤC #${i} | Loại hiện tại: ${e.cat} | Ngày: ${e.date}\n${e.content}`
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
        // Đã có kết quả từ batch trước -> trả về phần đã xong + cảnh báo, thay vì hỏng toàn bộ
        if (allResults.length > 0) {
          return NextResponse.json({
            entries: allResults,
            truncated: true,
            partial: `Đã xử lý ${bi}/${batches.length} phần thì gặp giới hạn (lỗi ${res.status}). Lưu phần này rồi chạy lại sau ít phút để xử lý tiếp.`,
          });
        }
        const status = res.status;
        return NextResponse.json(
          { error: status === 429 ? 'Vượt giới hạn token/phút của Gemini (free tier). Đợi 1 phút rồi thử lại, hoặc nâng API key trả phí.' : JSON.stringify(data) },
          { status }
        );
      }

      const finish = data.candidates?.[0]?.finishReason;
      if (finish === 'MAX_TOKENS') anyTruncated = true;
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let parsed: { entries?: { cat: string; content: string }[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) { anyTruncated = true; continue; }
        try { parsed = JSON.parse(match[0]); } catch { anyTruncated = true; continue; }
      }

      for (const e of parsed.entries || []) {
        const content = (e.content || '').trim();
        if (content) allResults.push({ cat: CATEGORIES.includes(e.cat) ? e.cat : 'Câu hỏi thường gặp', content });
      }
    }

    if (allResults.length === 0) {
      return NextResponse.json({ error: 'Không nhận được kết quả hợp lệ' }, { status: 500 });
    }

    return NextResponse.json({ entries: allResults, truncated: anyTruncated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
