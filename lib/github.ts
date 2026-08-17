// Hằng số + header GitHub API dùng chung cho rag.ts / logs.ts / admin.ts
// (trước đây mỗi file tự định nghĩa một bản ghHeaders y hệt nhau).

export const GH_OWNER = process.env.GITHUB_OWNER || 'quang507';
export const GH_REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
export const GH_API = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`;

export function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}
