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

const ALL_COLS = [...CATEGORIES, 'Khác'];

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
  // Nhóm theo danh mục (theo thứ tự CATEGORIES), trong mỗi nhóm giữ thứ tự mới->cũ
  const order = [...CATEGORIES, 'Khác'];
  const sorted = [...entries].sort((a, b) => {
    const ia = order.indexOf(a.cat) === -1 ? order.length : order.indexOf(a.cat);
    const ib = order.indexOf(b.cat) === -1 ? order.length : order.indexOf(b.cat);
    return ia - ib;
  });
  return sorted
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
  const [persona, setPersona] = useState('');
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
      setPersona(data.persona || '');
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

  async function crawl(wholeSite: boolean) {
    if (!url.trim()) return;
    setBusy(true);
    setStatus(wholeSite ? `Đang lấy cả web ${url} (có thể mất ~1 phút)...` : `Đang lấy nội dung từ ${url}...`);
    try {
      const endpoint = wholeSite ? '/api/admin/crawl-site' : '/api/admin/crawl';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxPages: 30 }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewContent(c => (c + data.markdown).trim());
        setStatus(
          wholeSite
            ? `Đã lấy ${data.pages} trang vào ô soạn thảo bên dưới.`
            : 'Đã lấy nội dung từ web vào ô soạn thảo bên dưới.'
        );
        setUrl('');
      } else setStatus(data.error || 'Lấy nội dung thất bại');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function organize() {
    if (entries.length === 0) return;
    if (!confirm('AI sẽ phân loại vào 6 danh mục và làm sạch (gộp trùng, bỏ thông tin cũ đã bị thay thế). Chỉ đổi khi chắc chắn, không chắc thì giữ nguyên. Bạn vẫn xem lại được trước khi Lưu. Tiếp tục?')) return;
    setBusy(true);
    setStatus('🤖 Đang phân loại & làm sạch bằng AI... (có thể mất 30–60 giây với dữ liệu lớn)');
    try {
      const res = await fetch('/api/admin/organize', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entries.map(e => ({ cat: e.cat, date: e.date, content: e.content })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Lỗi: ${data.error}`);
        return;
      }
      const organized: Entry[] = data.entries.map((e: { cat: string; content: string }, i: number) => ({
        id: `org-${i}-${Date.now()}`,
        cat: e.cat,
        date: now(),
        content: e.content,
      }));
      setEntries(organized);
      setStatus(
        (data.truncated
          ? '⚠️ Dữ liệu lớn nên AI có thể chưa xử lý hết — kiểm tra kỹ xem có bị thiếu không. '
          : '') + `✅ Đã phân loại & làm sạch: còn ${organized.length} mục (trước đó ${entries.length}). Kiểm tra rồi bấm Lưu!`
      );
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
    setStatus('Đã thêm 1 mục mới. Nhớ bấm Lưu!');
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
        body: JSON.stringify({ content: serialize(entries), persona }),
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
      <div className="max-w-6xl mx-auto space-y-5">
        <h1 className="text-2xl font-bold text-gray-800">📊 Quản lý dữ liệu Bot</h1>

        {/* Văn phong bot */}
        <details className="bg-white rounded-xl shadow p-5">
          <summary className="font-semibold text-gray-800 cursor-pointer">
            🎭 Tính cách & cách trả lời của bot
          </summary>
          <p className="text-xs text-gray-400 mt-2 mb-2">
            Mô tả bot nên trả lời thế nào (giọng điệu, xưng hô, quy tắc). Để trống sẽ dùng văn phong mặc định.
          </p>
          <textarea
            value={persona}
            onChange={e => setPersona(e.target.value)}
            rows={12}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </details>

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
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://nhadat.company/..." className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={() => crawl(false)} disabled={busy} className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-50">1 trang</button>
                <button onClick={() => crawl(true)} disabled={busy} className="flex-1 bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-50">Cả web (≤30 trang)</button>
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

        {/* Thanh công cụ + danh sách dạng cột */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="font-semibold text-gray-800">
              📚 Dữ liệu đã nạp ({entries.length} mục)
            </p>
            {entries.length > 0 && (
              <button
                onClick={organize}
                disabled={busy}
                className="bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                🤖 Phân loại & Làm sạch dữ liệu
              </button>
            )}
          </div>

          {entries.length === 0 && <p className="text-sm text-gray-400">Chưa có dữ liệu.</p>}

          {/* Cột theo danh mục (cuộn ngang) */}
          <div className="flex gap-4 overflow-x-auto pb-3">
            {ALL_COLS.filter(cat => cat !== 'Khác' || entries.some(e => e.cat === 'Khác' || e.id === 'legacy')).map(cat => {
              const colEntries = entries.filter(e => (CATEGORIES.includes(e.cat) ? e.cat : 'Khác') === cat);
              return (
                <div key={cat} className="flex-shrink-0 w-80 bg-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold rounded-full px-3 py-1 ${CAT_COLOR[cat]}`}>{cat}</span>
                    <span className="text-xs text-gray-400">{colEntries.length}</span>
                  </div>
                  <div className="space-y-3">
                    {colEntries.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Trống</p>}
                    {colEntries.map(e => (
                      <div key={e.id} className="bg-white rounded-lg shadow-sm p-3">
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <span className="text-[11px] text-gray-400">{e.date}</span>
                          <div className="flex items-center gap-2">
                            <select
                              value={CATEGORIES.includes(e.cat) ? e.cat : 'Khác'}
                              onChange={ev => updateEntry(e.id, { cat: ev.target.value })}
                              className="text-[11px] text-gray-500 border border-gray-200 rounded px-1 py-0.5 max-w-[110px]"
                              title="Chuyển danh mục"
                            >
                              {[...CATEGORIES, 'Khác'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button onClick={() => deleteEntry(e.id)} className="text-xs text-red-500 hover:text-red-700">🗑</button>
                          </div>
                        </div>
                        <textarea
                          value={e.content}
                          onChange={ev => updateEntry(e.id, { content: ev.target.value })}
                          rows={Math.min(12, Math.max(3, e.content.split('\n').length))}
                          className="w-full border border-gray-200 rounded-lg p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
