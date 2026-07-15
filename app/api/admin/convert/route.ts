import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function extractText(name: string, buffer: Buffer): Promise<string> {
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'pdf') {
    if (typeof globalThis.DOMMatrix === 'undefined') {
      // @ts-expect-error polyfill minimal cho Node.js
      globalThis.DOMMatrix = class DOMMatrix { constructor() { return this; } };
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return wb.SheetNames.map(s => `### ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n');
  }

  if (ext === 'txt' || ext === 'md') {
    return buffer.toString('utf-8');
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY');
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: 'Trích xuất toàn bộ nội dung văn bản, số liệu, bảng biểu trong ảnh thành markdown. Giữ nguyên cấu trúc bảng, số liệu giá, tên sản phẩm. Chỉ trả nội dung, không giải thích.' },
            { inline_data: { mime_type: mimeMap[ext] || 'image/png', data: buffer.toString('base64') } },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`Gemini Vision lỗi: ${res.status}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Không hỗ trợ định dạng .${ext}`);
}

const SUPPORTED = new Set(['pdf','doc','docx','xls','xlsx','csv','txt','md','png','jpg','jpeg','webp','gif']);

// Nhận 1 file (hoặc ZIP chứa nhiều file) -> trích xuất text -> trả về markdown
// Hoặc nhận JSON { text, name } khi client đã extract sẵn (PDF.js client-side)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const { text, name } = await req.json() as { text: string; name: string };
      if (!text) return NextResponse.json({ error: 'Không có text' }, { status: 400 });
      const markdown = `## ${name || 'file'}\n\n${text.trim()}`;
      return NextResponse.json({ markdown });
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Không có file' }, { status: 400 });

    const name = file.name || 'file';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const buffer = Buffer.from(await file.arrayBuffer());

    // ZIP: giải nén và xử lý từng file bên trong
    if (ext === 'zip') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries() as Array<{ entryName: string; isDirectory: boolean; getData: () => Buffer }>;
      const parts: string[] = [];
      const errors: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.split('/').pop() || entry.entryName;
        const entryExt = entryName.split('.').pop()?.toLowerCase() || '';
        // Bỏ qua file hệ thống macOS/Windows và định dạng không hỗ trợ
        if (entryName.startsWith('__MACOSX') || entryName.startsWith('.') || !SUPPORTED.has(entryExt)) continue;
        try {
          const entryBuf = entry.getData();
          const text = await extractText(entryName, entryBuf);
          if (text.trim()) parts.push(`## ${entryName}\n\n${text.trim()}`);
        } catch (e) {
          errors.push(`${entryName}: ${String(e)}`);
        }
      }

      if (parts.length === 0) {
        return NextResponse.json({ error: `Không đọc được file nào trong ZIP.${errors.length ? ' Lỗi: ' + errors.join('; ') : ''}` }, { status: 400 });
      }
      const markdown = parts.join('\n\n---\n\n');
      return NextResponse.json({ markdown, count: parts.length, errors: errors.length ? errors : undefined });
    }

    // File đơn
    if (!SUPPORTED.has(ext)) {
      return NextResponse.json({ error: `Không hỗ trợ định dạng .${ext}. Hỗ trợ: PDF, Word, Excel, CSV, TXT, PNG, JPG, WEBP, ZIP` }, { status: 400 });
    }
    const text = await extractText(name, buffer);
    const markdown = `## ${name}\n\n${text.trim()}`;
    return NextResponse.json({ markdown });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
