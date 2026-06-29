import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

// Đọc file GitHub (kèm sha). File > 1MB -> dùng download_url.
async function readGh(path: string): Promise<{ content: string; sha: string | null }> {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`, {
    headers: ghHeaders(), cache: 'no-store',
  });
  if (r.status === 404) return { content: '', sha: null };
  if (!r.ok) throw new Error(`Đọc ${path} lỗi: ${r.status}`);
  const d = await r.json();
  let content = '';
  if (d.content) content = Buffer.from(d.content, 'base64').toString('utf-8');
  else if (d.download_url) { const raw = await fetch(d.download_url, { cache: 'no-store' }); if (raw.ok) content = await raw.text(); }
  return { content, sha: d.sha || null };
}

async function writeGh(path: string, content: string, sha: string | null, message: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Ghi ${path} lỗi: ${res.status} ${await res.text()}`);
}

/**
 * POST /api/admin/data/save-embed
 * Body: { path: "01_NyAh-PhuDinh/abc.md" (tương đối trong data/), oldContent, newContent }
 * 1. Ghi nội dung mới vào data/<path> trên GitHub
 * 2. Vá data.md: thay oldContent -> newContent (để Rebuild sau này khớp)
 * (Client tự gọi /api/admin/reindex sau đó để embed lại toàn bộ.)
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  try {
    const { path: relPath, oldContent, newContent } = await req.json();
    if (typeof relPath !== 'string' || !relPath) {
      return NextResponse.json({ error: 'Thiếu đường dẫn file' }, { status: 400 });
    }
    if (typeof newContent !== 'string' || !newContent.trim()) {
      return NextResponse.json({ error: 'Nội dung rỗng' }, { status: 400 });
    }
    if (relPath.includes('..')) {
      return NextResponse.json({ error: 'Đường dẫn không hợp lệ' }, { status: 403 });
    }
    if (!/\.(md|txt)$/i.test(relPath)) {
      return NextResponse.json({ error: 'Chỉ sửa được file .md hoặc .txt' }, { status: 400 });
    }

    // 1. Ghi file
    const filePath = `data/${relPath}`;
    const { sha } = await readGh(filePath);
    await writeGh(filePath, newContent, sha, `Sửa nội dung: ${relPath}`);

    // 2. Vá data.md (nếu tìm thấy nội dung cũ)
    let dataMdPatched = false;
    if (typeof oldContent === 'string' && oldContent.trim() && oldContent !== newContent) {
      try {
        const dm = await readGh('data.md');
        if (dm.content && dm.content.includes(oldContent)) {
          const updated = dm.content.split(oldContent).join(newContent);
          await writeGh('data.md', updated, dm.sha, `Vá data.md theo sửa file: ${relPath}`);
          dataMdPatched = true;
        }
      } catch (e) {
        console.warn('Vá data.md thất bại (không chặn):', e);
      }
    }

    return NextResponse.json({ ok: true, file: filePath, dataMdPatched });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
