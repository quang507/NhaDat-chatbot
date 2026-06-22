// Tiện ích cho trang admin: kiểm tra mật khẩu + đọc/ghi data.md trên GitHub

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data.md';

export function checkAuth(req: Request): boolean {
  const pass = req.headers.get('x-admin-pass') || '';
  const expected = process.env.ADMIN_PASSWORD || '';
  return !!expected && pass === expected;
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN || '';
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

// Lấy nội dung hiện tại của data.md + sha (cần sha để ghi đè)
export async function getDataFile(): Promise<{ content: string; sha: string | null }> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) return { content: '', sha: null };
  if (!res.ok) throw new Error(`GitHub đọc file lỗi: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content || '', 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

// Ghi đè data.md trên GitHub (tự commit -> Vercel redeploy)
export async function saveDataFile(content: string): Promise<void> {
  const { sha } = await getDataFile();
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const body = {
    message: 'Cập nhật data.md từ trang admin',
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub ghi file lỗi: ${res.status} ${await res.text()}`);
}
