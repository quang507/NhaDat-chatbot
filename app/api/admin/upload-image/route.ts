import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'];
const MAX_BYTES = 8 * 1024 * 1024; // 8MB/ảnh

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

// Làm sạch tên: bỏ dấu, khoảng trắng -> gạch ngang; giữ chữ/số/-/_/.
function sanitize(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_.]/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase();
}

// Upload 1 ảnh -> commit vào public/images/<folder>/<file> trên nhánh main.
// Sau khi Vercel build lại, ảnh phục vụ tại /images/<folder>/<file>.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const folderRaw = (form.get('folder') as string | null)?.trim() || '01_NyAh-PhuDinh';
    if (!file) return NextResponse.json({ error: 'Không có file ảnh' }, { status: 400 });

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!IMG_EXT.includes(ext)) {
      return NextResponse.json({ error: `Định dạng .${ext} không hỗ trợ. Chỉ nhận: ${IMG_EXT.join(', ')}` }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: `Ảnh quá lớn (${(buf.length / 1048576).toFixed(1)}MB). Tối đa 8MB.` }, { status: 400 });
    }

    // Chuẩn hóa folder + tên file
    const folder = folderRaw.split('/').map(sanitize).filter(Boolean).join('/');
    const base = sanitize(file.name.replace(/\.[^.]+$/, '')) || 'anh';
    const fileName = `${base}.${ext}`;
    const repoPath = `public/images/${folder}/${fileName}`;

    // Kiểm tra file đã tồn tại (lấy sha để ghi đè)
    let sha: string | undefined;
    const check = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(repoPath)}?ref=${BRANCH}`, {
      headers: ghHeaders(), cache: 'no-store',
    });
    if (check.ok) sha = (await check.json()).sha;

    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(repoPath)}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `Upload ảnh: ${folder}/${fileName}`,
        content: buf.toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `GitHub lỗi: ${res.status} ${await res.text()}` }, { status: 500 });
    }

    const publicUrl = '/images/' + `${folder}/${fileName}`.split('/').map(encodeURIComponent).join('/');
    return NextResponse.json({
      ok: true,
      path: repoPath,
      url: publicUrl,
      overwritten: !!sha,
      note: 'Ảnh đã commit lên GitHub. Vercel cần ~1-2 phút build lại thì ảnh mới hiển thị.',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Xóa 1 ảnh trên GitHub
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { path: relPath } = await req.json();
    if (!relPath) return NextResponse.json({ error: 'Thiếu đường dẫn file' }, { status: 400 });

    const repoPath = `public/images/${relPath}`;

    // Lấy sha để xóa
    let sha: string | undefined;
    const check = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(repoPath)}?ref=${BRANCH}`, {
      headers: ghHeaders(), cache: 'no-store',
    });
    if (!check.ok) {
      return NextResponse.json({ error: 'Không tìm thấy ảnh trên GitHub' }, { status: 404 });
    }
    sha = (await check.json()).sha;

    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(repoPath)}`, {
      method: 'DELETE',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `Xóa ảnh: ${relPath}`,
        sha,
        branch: BRANCH,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `GitHub lỗi khi xóa: ${res.status} ${await res.text()}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note: 'Đã xóa ảnh trên GitHub.' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
