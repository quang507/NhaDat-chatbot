'use client';

import { useState } from 'react';
import JSZip from 'jszip';

const SUPPORTED_EXTS = new Set(['pdf','doc','docx','xls','xlsx','csv','txt','md','png','jpg','jpeg','webp','gif']);

async function extractPdfClientSide(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use bundled worker via public path to avoid CDN dependency
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    if (text.trim()) pages.push(text.trim());
  }
  return pages.join('\n\n');
}

const CATEGORIES = [
  'Villa Ny\'ah',
  'Ny\'ah Phú Định',
  'Pháp lý',
  'Tính năng / Tiện ích',
  'Tiến độ',
  'Giá & Thanh toán',
  'Vị trí',
  'Câu hỏi thường gặp',
];

const CAT_COLOR: Record<string, string> = {
  "Villa Ny'ah": 'bg-rose-100 text-rose-700',
  "Ny'ah Phú Định": 'bg-orange-100 text-orange-700',
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
interface Config {
  suggestions: string[];
  phone: string;
  zalo: string;
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // cat đang hover
  const [entries, setEntries] = useState<Entry[]>([]);
  const [persona, setPersona] = useState('');
  const [config, setConfig] = useState<Config>({ suggestions: [], phone: '', zalo: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // tab "Khách hàng & Lịch sử"
  const [showLogs, setShowLogs] = useState(false);
  const [leads, setLeads] = useState<Record<string, string>[]>([]);
  const [chats, setChats] = useState<Record<string, string>[]>([]);

  // form thêm mục mới
  const [newCat, setNewCat] = useState(CATEGORIES[0]);
  const [newContent, setNewContent] = useState('');
  const [url, setUrl] = useState('');
  // file queue: chọn trước, xem trước, xóa bớt rồi mới xử lý
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileProgress, setFileProgress] = useState<Record<string, 'waiting' | 'processing' | 'done' | 'error'>>({});

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
      if (data.config) setConfig(data.config);
      setLoggedIn(true);
      setStatus('');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const extracted: File[] = [];

    for (const file of arr) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'zip') {
        setStatus(`Đang giải nén ${file.name}...`);
        try {
          const zip = await JSZip.loadAsync(file);
          const zipFiles: File[] = [];
          const tasks: Promise<void>[] = [];
          zip.forEach((relPath, entry) => {
            if (entry.dir) return;
            if (relPath.includes('__MACOSX') || relPath.split('/').pop()?.startsWith('.')) return;
            const entryExt = relPath.split('.').pop()?.toLowerCase() || '';
            if (!SUPPORTED_EXTS.has(entryExt)) return;
            // Use relPath as filename to preserve uniqueness across subdirs
            const displayName = relPath.replace(/\//g, ' › ');
            tasks.push(
              entry.async('blob').then(blob => {
                zipFiles.push(new File([blob], displayName, { type: blob.type }));
              })
            );
          });
          await Promise.all(tasks);
          zipFiles.sort((a, b) => a.name.localeCompare(b.name));
          extracted.push(...zipFiles);
          setStatus(`Đã giải nén ${file.name}: ${zipFiles.length} file`);
        } catch (e) {
          setStatus(`Lỗi giải nén ${file.name}: ${String(e)}`);
          extracted.push(file); // fallback: vẫn thêm ZIP gốc
        }
      } else {
        extracted.push(file);
      }
    }

    setPendingFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...extracted.filter(f => !names.has(f.name))];
    });
    setFileProgress({});
  }

  function removeFile(name: string) {
    setPendingFiles(prev => prev.filter(f => f.name !== name));
    setFileProgress(prev => { const n = { ...prev }; delete n[name]; return n; });
  }

  async function processFiles() {
    if (pendingFiles.length === 0) return;
    setBusy(true);
    const init: Record<string, 'waiting' | 'processing' | 'done' | 'error'> = {};
    pendingFiles.forEach(f => { init[f.name] = 'waiting'; });
    setFileProgress(init);
    let added = '';
    for (const file of pendingFiles) {
      setFileProgress(prev => ({ ...prev, [file.name]: 'processing' }));
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      try {
        // PDF: extract client-side, only send text
        if (ext === 'pdf') {
          setStatus(`Đang đọc PDF ${file.name}...`);
          const text = await extractPdfClientSide(file, (page, total) => {
            setStatus(`${file.name}: trang ${page}/${total}...`);
          });
          const res = await fetch('/api/admin/convert', {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, name: file.name }),
          });
          const data = await res.json();
          if (res.ok) {
            added += (added ? '\n\n---\n\n' : '') + data.markdown;
            setFileProgress(prev => ({ ...prev, [file.name]: 'done' }));
          } else {
            setFileProgress(prev => ({ ...prev, [file.name]: 'error' }));
            setStatus(`Lỗi ${file.name}: ${data.error}`);
          }
          continue;
        }

        // Các file khác: gửi binary như cũ
        setStatus(`Đang xử lý ${file.name}...`);
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/admin/convert', { method: 'POST', headers: authHeaders(), body: form });
        const data = await res.json();
        if (res.ok) {
          added += (added ? '\n\n---\n\n' : '') + data.markdown;
          setFileProgress(prev => ({ ...prev, [file.name]: 'done' }));
          if (data.count) setStatus(`✅ ZIP: đã đọc ${data.count} file`);
        } else {
          setFileProgress(prev => ({ ...prev, [file.name]: 'error' }));
          setStatus(`Lỗi ${file.name}: ${data.error}`);
        }
      } catch (e) {
        setFileProgress(prev => ({ ...prev, [file.name]: 'error' }));
        setStatus(`Không xử lý được ${file.name}: ${String(e)}`);
      }
    }
    if (added) {
      setNewContent(c => (c ? c + '\n\n---\n\n' + added : added).trim());
      setStatus(`✅ Xong ${pendingFiles.length} file. Nội dung hiện ở ô bên dưới, chỉnh sửa rồi Thêm.`);
    }
    setPendingFiles([]);
    setFileProgress({});
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
        (data.partial ? `⚠️ ${data.partial} ` : '') +
        (data.truncated ? '⚠️ Một số mục lớn có thể bị rút ngắn. ' : '') +
        `✅ Đã xử lý: còn ${organized.length} mục (trước ${entries.length}). Kiểm tra rồi bấm Lưu!`
      );
    } catch (e) {
      setStatus(`⚠️ Mất kết nối giữa chừng (dữ liệu quá lớn). Bấm lại "Phân loại" để tiếp tục. Lỗi: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadLogs() {
    setBusy(true);
    setStatus('Đang tải lịch sử...');
    try {
      const res = await fetch('/api/admin/logs', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Tải thất bại');
        return;
      }
      setLeads(data.leads || []);
      setChats(data.chats || []);
      setShowLogs(true);
      setStatus('');
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
    const content = serialize(entries);
    try {
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, persona, config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Lưu thất bại');
        return;
      }
      // Lập lại chỉ mục tìm kiếm ngay (không cần đợi deploy) để bot trả lời nhanh + đúng
      setStatus('✅ Đã lưu. Đang lập chỉ mục tìm kiếm cho bot...');
      const r2 = await fetch('/api/admin/reindex', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const d2 = await r2.json();
      if (r2.ok) setStatus(`✅ Đã lưu & lập chỉ mục ${d2.chunks} đoạn. Bot đã sẵn sàng trả lời nhanh!`);
      else setStatus(`✅ Đã lưu, nhưng lập chỉ mục lỗi: ${d2.error}. Bấm "Lập lại chỉ mục" để thử lại.`);
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    setBusy(true);
    setStatus('Đang lập lại chỉ mục tìm kiếm... (dữ liệu lớn có thể mất 1-2 phút)');
    try {
      const res = await fetch('/api/admin/reindex', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (res.ok) setStatus(`✅ Đã lập chỉ mục ${data.chunks} đoạn. Bot trả lời nhanh & đúng trọng tâm hơn.`);
      else setStatus(`Lỗi: ${data.error}`);
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  function exportLeads() {
    const rows = [['Thời gian', 'Số điện thoại', 'Tin nhắn'], ...leads.map(l => [l.time || '', l.phone || '', (l.message || '').replace(/\n/g, ' ')])];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gray-800">📊 Quản lý dữ liệu Bot</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLogs(false)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${!showLogs ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}
            >
              📚 Dữ liệu
            </button>
            <button
              onClick={loadLogs}
              disabled={busy}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${showLogs ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300'} disabled:opacity-50`}
            >
              📞 Khách hàng & Lịch sử
            </button>
          </div>
        </div>

        {showLogs && (
          <div className="space-y-5">
            {/* Thống kê nhanh */}
            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const chatsToday = chats.filter(c => (c.time || '').slice(0, 10) === today).length;
              const conv = chats.length ? Math.round((leads.length / chats.length) * 100) : 0;
              // top câu hỏi theo từ khóa đơn giản
              const stats = [
                { label: 'Tổng câu hỏi (gần đây)', value: chats.length, icon: '💬' },
                { label: 'Câu hỏi hôm nay', value: chatsToday, icon: '📅' },
                { label: 'Lead (SĐT)', value: leads.length, icon: '📞' },
                { label: 'Tỉ lệ ra lead', value: `${conv}%`, icon: '📈' },
              ];
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {stats.map(s => (
                    <div key={s.label} className="bg-white rounded-xl shadow p-4">
                      <p className="text-2xl">{s.icon}</p>
                      <p className="text-2xl font-bold text-gray-800 mt-1">{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Leads */}
            <div className="bg-white rounded-xl shadow p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-800">📞 Khách để lại số điện thoại ({leads.length})</p>
                {leads.length > 0 && (
                  <button onClick={exportLeads} className="text-sm bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700">⬇️ Xuất Excel (CSV)</button>
                )}
              </div>
              {leads.length === 0 && <p className="text-sm text-gray-400">Chưa có khách nào để lại SĐT.</p>}
              <div className="space-y-2">
                {leads.map((l, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-green-700">📱 {l.phone}</span>
                      <span className="text-xs text-gray-400">{l.time?.replace('T', ' ').slice(0, 16)}</span>
                    </div>
                    <p className="text-gray-600 mt-1">{l.message}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat history */}
            <div className="bg-white rounded-xl shadow p-5">
              <p className="font-semibold text-gray-800 mb-3">💬 Lịch sử câu hỏi gần đây ({chats.length})</p>
              {chats.length === 0 && <p className="text-sm text-gray-400">Chưa có câu hỏi nào.</p>}
              <div className="space-y-3">
                {chats.map((c, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 text-sm">
                    <span className="text-xs text-gray-400">{c.time?.replace('T', ' ').slice(0, 16)}</span>
                    <p className="text-gray-800 font-medium mt-1">❓ {c.question}</p>
                    <p className="text-gray-600 mt-1 whitespace-pre-wrap">💬 {c.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!showLogs && (
        <>
        <h1 className="sr-only">Quản lý dữ liệu</h1>

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

        {/* Cấu hình hiển thị: gợi ý câu hỏi + liên hệ */}
        <details className="bg-white rounded-xl shadow p-5">
          <summary className="font-semibold text-gray-800 cursor-pointer">
            ⚙️ Gợi ý câu hỏi & Liên hệ (Gọi/Zalo)
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Câu hỏi gợi ý hiện khi khách mở chat (mỗi dòng 1 câu):</p>
              <textarea
                value={config.suggestions.join('\n')}
                onChange={e => setConfig(c => ({ ...c, suggestions: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))}
                rows={4}
                placeholder="Dự án có những loại sản phẩm nào?"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">📞 Hotline (nút Gọi)</p>
                <input
                  value={config.phone}
                  onChange={e => setConfig(c => ({ ...c, phone: e.target.value }))}
                  placeholder="0901234567"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">💬 Link Zalo (nút Chat Zalo)</p>
                <input
                  value={config.zalo}
                  onChange={e => setConfig(c => ({ ...c, zalo: e.target.value }))}
                  placeholder="https://zalo.me/0901234567"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">Nút Gọi/Zalo tự hiện trong khung chat sau khi khách trò chuyện. Nhớ bấm Lưu.</p>
          </div>
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
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-500">📎 PDF, Word, Excel, CSV, TXT, PNG, JPG, ZIP</p>
              <label className="inline-block cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg px-3 py-1.5 transition">
                + Chọn file
                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.zip" onChange={e => pickFiles(e.target.files)} className="hidden" />
              </label>
              {pendingFiles.length > 0 && (
                <div className="space-y-1">
                  {pendingFiles.map(f => {
                    const prog = fileProgress[f.name];
                    const icon = prog === 'processing' ? '⏳' : prog === 'done' ? '✅' : prog === 'error' ? '❌' : '📄';
                    const size = f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(f.size / 1024)}KB`;
                    return (
                      <div key={f.name} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1">
                        <span className="text-xs">{icon}</span>
                        <span className="flex-1 text-xs text-gray-700 truncate max-w-[160px]" title={f.name}>{f.name}</span>
                        <span className="text-[10px] text-gray-400">{size}</span>
                        {!prog && (
                          <button onClick={() => removeFile(f.name)} className="text-gray-400 hover:text-red-500 text-xs font-bold leading-none" title="Xóa khỏi danh sách">✕</button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={processFiles}
                    disabled={busy}
                    className="w-full mt-1 bg-blue-600 text-white text-xs font-medium rounded-lg py-1.5 hover:bg-blue-700 disabled:opacity-50"
                  >
                    ▶ Xử lý {pendingFiles.length} file
                  </button>
                </div>
              )}
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
              <div className="flex gap-2">
                <button
                  onClick={reindex}
                  disabled={busy}
                  className="bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                  title="Tạo lại chỉ mục tìm kiếm để bot trả lời nhanh & đúng trọng tâm"
                >
                  🔎 Lập lại chỉ mục
                </button>
                <button
                  onClick={organize}
                  disabled={busy}
                  className="bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  🤖 Phân loại & Làm sạch dữ liệu
                </button>
              </div>
            )}
          </div>

          {entries.length === 0 && <p className="text-sm text-gray-400">Chưa có dữ liệu.</p>}

          {/* Cột theo danh mục (cuộn ngang) — hỗ trợ kéo thả thẻ giữa các cột */}
          <div className="flex gap-4 overflow-x-auto pb-3">
            {ALL_COLS.filter(cat => cat !== 'Khác' || entries.some(e => e.cat === 'Khác' || e.id === 'legacy')).map(cat => {
              const colEntries = entries.filter(e => (CATEGORIES.includes(e.cat) ? e.cat : 'Khác') === cat);
              const isOver = dragOver === cat && dragId !== null && entries.find(e => e.id === dragId)?.cat !== cat;
              return (
                <div
                  key={cat}
                  className={`flex-shrink-0 w-80 rounded-xl p-3 transition-colors ${isOver ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100'}`}
                  onDragOver={ev => { ev.preventDefault(); setDragOver(cat); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={ev => {
                    ev.preventDefault();
                    setDragOver(null);
                    if (dragId) updateEntry(dragId, { cat });
                    setDragId(null);
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold rounded-full px-3 py-1 ${CAT_COLOR[cat]}`}>{cat}</span>
                    <span className="text-xs text-gray-400">{colEntries.length}</span>
                  </div>
                  <div className={`space-y-3 min-h-[40px] ${colEntries.length > 5 ? 'max-h-[780px] overflow-y-auto pr-1' : ''}`}>
                    {colEntries.length === 0 && (
                      <p className={`text-xs text-center py-4 ${isOver ? 'text-blue-400' : 'text-gray-400'}`}>
                        {isOver ? '⬇ Thả vào đây' : 'Trống'}
                      </p>
                    )}
                    {colEntries.map(e => (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={() => setDragId(e.id)}
                        onDragEnd={() => { setDragId(null); setDragOver(null); }}
                        className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-opacity ${dragId === e.id ? 'opacity-30' : 'opacity-100'}`}
                      >
                        {/* Card header */}
                        <div className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-100 ${CAT_COLOR[cat]}`}>
                          <span className="text-[11px] font-medium cursor-grab active:cursor-grabbing select-none opacity-70">⠿ {e.date}</span>
                          <button onClick={() => deleteEntry(e.id)} className="text-[11px] opacity-50 hover:opacity-100 hover:text-red-600 transition-opacity">✕</button>
                        </div>
                        <textarea
                          value={e.content}
                          onChange={ev => updateEntry(e.id, { content: ev.target.value })}
                          rows={Math.min(10, Math.max(3, e.content.split('\n').length))}
                          className="w-full p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
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
        </>
        )}
      </div>
    </div>
  );
}
