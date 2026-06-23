import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Nhận 1 file upload -> trích xuất text -> trả về markdown
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Không có file' }, { status: 400 });
    }

    const name = file.name || 'file';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (ext === 'pdf') {
      // pdf-parse v2 dùng DOMMatrix (browser API) - cần polyfill trước khi import
      if (typeof globalThis.DOMMatrix === 'undefined') {
        // @ts-expect-error polyfill minimal cho Node.js
        globalThis.DOMMatrix = class DOMMatrix {
          constructor() { return this; }
        };
      }
      // Dùng API cũ (v1 style) qua default export để tránh lỗi DOMMatrix
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheet of wb.SheetNames) {
        parts.push(`### ${sheet}\n${XLSX.utils.sheet_to_csv(wb.Sheets[sheet])}`);
      }
      text = parts.join('\n\n');
    } else if (ext === 'txt' || ext === 'md') {
      text = buffer.toString('utf-8');
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      // Dùng Gemini Vision để đọc nội dung ảnh (bảng giá, sơ đồ, flyer...)
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'Thiếu GEMINI_API_KEY' }, { status: 500 });
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      const mime = mimeMap[ext] || 'image/png';
      const b64 = buffer.toString('base64');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'Hãy trích xuất toàn bộ nội dung văn bản, số liệu, bảng biểu trong ảnh này thành markdown. Giữ nguyên cấu trúc bảng, số liệu giá, tên sản phẩm. Chỉ trả về nội dung, không giải thích thêm.' },
                { inline_data: { mime_type: mime, data: b64 } },
              ],
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: `Gemini Vision lỗi: ${JSON.stringify(data)}` }, { status: 500 });
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) return NextResponse.json({ error: 'Không đọc được nội dung từ ảnh' }, { status: 500 });
    } else {
      return NextResponse.json({ error: `Không hỗ trợ định dạng .${ext}` }, { status: 400 });
    }

    const markdown = `\n\n## ${name}\n\n${text.trim()}\n`;
    return NextResponse.json({ markdown });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
