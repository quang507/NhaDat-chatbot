'use client';

import { useState } from 'react';

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');

  function authHeaders() {
    return { 'x-admin-pass': pass };
  }

  async function login() {
    setBusy(true);
    setStatus('Đang đăng nhập...');
    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Đăng nhập thất bại');
        return;
      }
      setContent(data.content || '');
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
        const res = await fetch('/api/admin/convert', {
          method: 'POST',
          headers: authHeaders(),
          body: form,
        });
        const data = await res.json();
        if (res.ok) {
          added += data.markdown;
        } else {
          setStatus(`Lỗi ${file.name}: ${data.error}`);
        }
      } catch {
        setStatus(`Không xử lý được ${file.name}`);
      }
    }
    if (added) {
      setContent(c => c + added);
      setStatus('Đã thêm nội dung từ file. Nhớ bấm Lưu!');
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
        setContent(c => c + data.markdown);
        setStatus('Đã thêm nội dung từ web. Nhớ bấm Lưu!');
        setUrl('');
      } else {
        setStatus(data.error || 'Crawl thất bại');
      }
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setStatus('Đang lưu lên GitHub...');
    try {
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('✅ Đã lưu! Vercel sẽ deploy lại sau ~1 phút, bot cập nhật dữ liệu mới.');
      } else {
        setStatus(data.error || 'Lưu thất bại');
      }
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
          <button
            onClick={login}
            disabled={busy}
            className="w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            Đăng nhập
          </button>
          {status && <p className="text-sm text-red-500 mt-3">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">📊 Quản lý dữ liệu Bot</h1>

        {/* Upload + Crawl */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow border-2 border-dashed border-gray-300">
            <p className="font-semibold text-sm mb-2 text-gray-700">📎 Kéo thả / chọn file</p>
            <p className="text-xs text-gray-400 mb-2">PDF, Word, Excel, CSV, TXT</p>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
              onChange={e => uploadFiles(e.target.files)}
              className="text-sm"
            />
          </div>
          <div className="bg-white p-4 rounded-xl shadow">
            <p className="font-semibold text-sm mb-2 text-gray-700">🌐 Lấy nội dung từ web</p>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://nhadat.company/..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={crawl}
                disabled={busy}
                className="bg-gray-700 text-white rounded-lg px-3 text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                Lấy
              </button>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="bg-white p-4 rounded-xl shadow">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm text-gray-700">📝 Nội dung dữ liệu (data.md)</p>
            <span className="text-xs text-gray-400">{content.length.toLocaleString()} ký tự</span>
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={20}
            className="w-full border border-gray-300 rounded-lg p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Save bar */}
        <div className="flex items-center gap-4 sticky bottom-0 bg-gray-50 py-3">
          <button
            onClick={save}
            disabled={busy}
            className="bg-green-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            💾 Lưu & Cập nhật Bot
          </button>
          {status && <p className="text-sm text-gray-600">{status}</p>}
        </div>
      </div>
    </div>
  );
}
