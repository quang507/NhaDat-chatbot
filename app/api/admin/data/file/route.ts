import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { path: relPath } = await req.json();
    if (typeof relPath !== 'string' || !relPath) {
      return NextResponse.json({ error: 'Thiếu đường dẫn file' }, { status: 400 });
    }

    const dataDir = path.join(process.cwd(), 'data');
    // Giải quyết đường dẫn tuyệt đối để tránh directory traversal
    const safePath = path.resolve(dataDir, relPath);

    // Ngăn chặn Directory Traversal
    if (!safePath.startsWith(dataDir)) {
      return NextResponse.json({ error: 'Đường dẫn không hợp lệ' }, { status: 403 });
    }

    const ext = path.extname(safePath).toLowerCase();
    if (!['.md', '.txt', '.docx', '.xlsx', '.xls', '.csv'].includes(ext)) {
      return NextResponse.json({ error: 'Định dạng file không được hỗ trợ' }, { status: 400 });
    }

    // Kiểm tra file có tồn tại không
    try {
      const stat = await fs.stat(safePath);
      if (!stat.isFile()) {
        return NextResponse.json({ error: 'Không phải là file' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'File không tồn tại' }, { status: 404 });
    }

    let content = '';
    if (ext === '.md' || ext === '.txt') {
      content = await fs.readFile(safePath, 'utf-8');
    } else if (ext === '.docx') {
      try {
        const buffer = await fs.readFile(safePath);
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        content = result.value || '';
      } catch (e: any) {
        content = `[Không thể đọc file Word: ${e.message}]`;
      }
    } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      try {
        const buffer = await fs.readFile(safePath);
        const XLSX = require('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        content = wb.SheetNames.map((s: string) => `### Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n');
      } catch (e: any) {
        content = `[Không thể đọc file Excel: ${e.message}]`;
      }
    }

    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
