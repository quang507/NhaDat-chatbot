// Ghi log lead + lịch sử chat vào nhánh riêng "chatbot-logs" trên GitHub
// (Vercel chỉ deploy từ main nên ghi vào nhánh này KHÔNG trigger deploy lại)

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const SRC_BRANCH = process.env.GITHUB_BRANCH || 'main';
const LOG_BRANCH = 'chatbot-logs';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

let branchReady = false;
async function ensureBranch(): Promise<boolean> {
  if (branchReady) return true;
  const check = await fetch(`${API}/git/refs/heads/${LOG_BRANCH}`, { headers: ghHeaders(), cache: 'no-store' });
  if (check.ok) {
    branchReady = true;
    return true;
  }
  // tạo nhánh từ main
  const base = await fetch(`${API}/git/refs/heads/${SRC_BRANCH}`, { headers: ghHeaders(), cache: 'no-store' });
  if (!base.ok) return false;
  const sha = (await base.json()).object?.sha;
  if (!sha) return false;
  const create = await fetch(`${API}/git/refs`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({ ref: `refs/heads/${LOG_BRANCH}`, sha }),
  });
  branchReady = create.ok || create.status === 422; // 422 = đã tồn tại
  return branchReady;
}

// Ghi 1 bản ghi (mỗi bản = 1 file, tránh xung đột ghi đồng thời)
export async function writeLog(dir: 'chats' | 'leads', obj: Record<string, unknown>): Promise<void> {
  try {
    if (!process.env.GITHUB_TOKEN) return;
    if (!(await ensureBranch())) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `logs/${dir}/${stamp}-${Math.random().toString(36).slice(2, 7)}.json`;
    await fetch(`${API}/contents/${name}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `log ${dir}`,
        content: Buffer.from(JSON.stringify(obj, null, 2), 'utf-8').toString('base64'),
        branch: LOG_BRANCH,
      }),
    });
  } catch {
    // log lỗi không được phép làm hỏng câu trả lời cho khách
  }
}

// Đọc N bản ghi mới nhất trong 1 thư mục log
export async function readLogs(dir: 'chats' | 'leads', limit = 50): Promise<Record<string, unknown>[]> {
  const list = await fetch(`${API}/contents/logs/${dir}?ref=${LOG_BRANCH}`, { headers: ghHeaders(), cache: 'no-store' });
  if (!list.ok) return [];
  const files = (await list.json()) as { name: string; path: string }[];
  const recent = files
    .filter(f => f.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, limit);
  const items = await Promise.all(
    recent.map(async f => {
      const r = await fetch(`${API}/contents/${f.path}?ref=${LOG_BRANCH}`, { headers: ghHeaders(), cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      try {
        return JSON.parse(Buffer.from(data.content || '', 'base64').toString('utf-8'));
      } catch {
        return null;
      }
    })
  );
  return items.filter(Boolean) as Record<string, unknown>[];
}

// Tìm số điện thoại VN trong tin nhắn (nếu có -> coi là lead)
export function extractPhone(text: string): string | null {
  const cleaned = text.replace(/[ .\-()]/g, '');
  const m = cleaned.match(/(?:\+84|84|0)\d{9}/);
  return m ? m[0] : null;
}
