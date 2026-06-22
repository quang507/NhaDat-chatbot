'use client';

import { useState } from 'react';

const CATEGORIES = [
  'Pháp lý',
  'Tính năng / Tiện ích',
  'Tiến độ',
  'Giá & Thanh toán',
  'Vị trí',
  'Câu hỏi thường gặp',
];

const CAT_COLOR: Record<string, string> = {
  'Pháp lý': 'bg-red-100 text-red-700',
  'Tính năng / Tiện ích': 'bg-blue-100 text-blue-700',
  'Tiến độ': 'bg-amber-100 text-amber-700',
  'Giá & Thanh toán': 'bg-green-100 text-green-700',
  'Vị trí': 'bg-purple-100 text-purple-700',
  'Câu hỏi thường gặp': 'bg-cyan-100 text-cyan-700',
  'Khác': 'bg-gray-100 text-gray-700',
};

interface Entry {
  id: string;
  cat: string;
  date: string;
  content: string;
}

const MARKER = /^## 🔖 \[([^\]]+)\] · (.+)$/gm;

function parseEntries(raw: string): Entry[] {
  const matches = Array.from(raw.matchAll(MARKER));
  if (matches.length === 0) {
    return raw.trim()
      ? [{ id: 'legacy', cat: 'Khác', date: 'dữ liệu cũ', content: raw.trim() }]
      : [];
  }
  const entries: Entry[] = [];
  const pre = raw.slice(0, matches[0].index!).trim();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    let content = raw.slice(start, end).trim();
    content = content.replace(/\n*---\s*$/, '').trim();
    entries.push({ id: `${i}-${m[2]}`, cat: m[1], date: m[2], content });
  }
  if (pre) entries.push({ id: 'legacy', cat: 'Khác', date: 'dữ liệu cũ', content: pre });
  return entries;
}

function serialize(entries: Entry[]): string {
  return entries
    .map(e => `## 🔖 [${e.cat}] · ${e.date}\n\n${e.content}`)
    .join('\n\n---\n\n');
}

function now() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // form thêm mục mới
  const [newCat, setNewCat] = useState(CATEGORIES[0]);
  const [newContent, setNewContent] = useState('');
  const [url, setUrl] = useState('');

  function authHeaders() {
    return { 'x-admin-pass': pass };
  }

  async function login() {
    setBusy(true);
    setStatus('Đang đăng nhập...');
    try {
      const res = await fetch('/api/admin/data', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Đăng nhập thất bại');
        return;
      }
      setEntries(parseEntries(data.content || ''));
      setLoggedIn(true);
      setStatus('');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let added = '';
    for (const file of Array.from(files)) {
      setStatus(`Đang xử lý ${file.name}...`);
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/api/admin/convert', { method: 'POST', headers: authHeaders(), body: form });
        const data = await res.json();
        if (res.ok) added += data.markdown;
        else setStatus(`Lỗi ${file.name}: ${data.error}`);
      } catch {
        setStatus(`Không xử lý được ${file.name}`);
      }
    }
    if (added) {
      setNewContent(c => (c + added).trim());
      setStatus('Đã trích xuất nội dung từ file vào ô soạn thảo bên dưới.');
    }
    setBusy(false);
  }

  async function crawl() {
    if (!url.trim()) return;
    setBusy(true);
    setStatus(`Đang lấy nội dung từ ${url}...`);
    try {
      const res = await fetch('/api/admin/crawl', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewContent(c => (c + data.markdown).trim());
        setStatus('Đã lấy nội dung từ web vào ô soạn thảo bên dưới.');
        setUrl('');
      } else setStatus(data.error || 'Lấy nội dung thất bại');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  function addEntry() {
    if (!newContent.trim()) {
      setStatus('Chưa có nội dung để thêm.');
      return;
    }
    const entry: Entry = { id: `${Date.now()}`, cat: newCat, date: now(), content: newContent.trim() };
    setEntries(prev => [entry, ...prev]); // mới nhất lên đầu
    setNewContent('');
    setStatus('Đã thêm 1 mục mới lên đầu danh sách. Nhớ bấm Lưu!');
  }

  function updateEntry(id: string, patch: Partial<Entry>) {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    setStatus('Đã xóa 1 mục. Nhớ bấm Lưu!');
  }

  async function save() {
    setBusy(true);
    setStatus('Đang lưu lên GitHub...');
    try {
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: serialize(entries) }),
      });
      const data = await res.json();
      if (res.ok) setStatus('✅ Đã lưu! Vercel deploy lại sau ~1 phút, bot cập nhật dữ liệu mới.');
      else setStatus(data.error || 'Lưu thất bại');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-80">
          <h1 className="text-xl font-bold mb-4 text-gray-800">🔐 Quản trị dữ liệu</h1>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Mật khẩu"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={login} disabled={busy} className="w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50">
            Đăng nhập
          </button>
          {status && <p className="text-sm text-red-500 mt-3">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <h1 className="text-2xl font-bold text-gray-800">📊 Quản lý dữ liệu Bot</h1>

        {/* Thêm mục mới */}
        <div className="bg-white p-5 rounded-xl shadow space-y-3">
          <p className="font-semibold text-gray-800">➕ Thêm dữ liệu mới</p>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600">Loại:</label>
            <select value={newCat} onChange={e => setNewCat(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">📎 File (PDF, Word, Excel, CSV, TXT)</p>
              <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md" onChange={e => uploadFiles(e.target.files)} className="text-sm" />
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">🌐 Lấy từ web</p>
              <div className="flex gap-2">
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={crawl} disabled={busy} className="bg-gray-700 text-white rounded-lg px-3 text-sm hover:bg-gray-800 disabled:opacity-50">Lấy</button>
              </div>
            </div>
          </div>

          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={5}
            placeholder="Nội dung mục mới (gõ tay, hoặc nội dung từ file/web sẽ hiện ở đây để bạn chỉnh sửa trước khi thêm)..."
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={addEntry} disabled={busy} className="bg-blue-600 text-white rounded-lg px-5 py-2 font-medium hover:bg-blue-700 disabled:opacity-50">
            ➕ Thêm vào danh sách
          </button>
        </div>

        {/* Danh sách mục đã nạp */}
        <div>
          <p className="font-semibold text-gray-800 mb-2">
            📚 Dữ liệu đã nạp ({entries.length} mục) — mới nhất ở trên, bot đọc từ trên xuống
          </p>
          <div className="space-y-3">
            {entries.length === 0 && <p className="text-sm text-gray-400">Chưa có dữ liệu.</p>}
            {entries.map(e => (
              <div key={e.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={CATEGORIES.includes(e.cat) ? e.cat : 'Khác'}
                      onChange={ev => updateEntry(e.id, { cat: ev.target.value })}
                      className={`text-xs font-semibold rounded-full px-3 py-1 border-0 ${CAT_COLOR[e.cat] || CAT_COLOR['Khác']}`}
                    >
                      {[...CATEGORIES, 'Khác'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="text-xs text-gray-400">{e.date}</span>
                  </div>
                  <button onClick={() => deleteEntry(e.id)} className="text-xs text-red-500 hover:text-red-700">🗑 Xóa</button>
                </div>
                <textarea
                  value={e.content}
                  onChange={ev => updateEntry(e.id, { content: ev.target.value })}
                  rows={Math.min(10, Math.max(3, e.content.split('\n').length))}
                  className="w-full border border-gray-200 rounded-lg p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save bar */}
        <div className="flex items-center gap-4 sticky bottom-0 bg-gray-50 py-3 border-t border-gray-200">
          <button onClick={save} disabled={busy} className="bg-green-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-green-700 disabled:opacity-50">
            💾 Lưu & Cập nhật Bot
          </button>
          {status && <p className="text-sm text-gray-600">{status}</p>}
        </div>
      </div>
    </div>
  );
}
