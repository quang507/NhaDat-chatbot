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
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
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
    } else {
      return NextResponse.json({ error: `Không hỗ trợ định dạng .${ext}` }, { status: 400 });
    }

    const markdown = `\n\n## ${name}\n\n${text.trim()}\n`;
    return NextResponse.json({ markdown });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
