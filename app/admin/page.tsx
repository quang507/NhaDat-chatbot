'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';

const SUPPORTED_EXTS = new Set(['pdf','doc','docx','xls','xlsx','csv','txt','md','png','jpg','jpeg','webp','gif']);

async function extractPdfClientSide(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
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

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  url?: string;            // chỉ ảnh: URL public /images/...
  children?: TreeNode[];
}

interface Config {
  suggestions: string[];
  phone: string;
  zalo: string;
}

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [persona, setPersona] = useState('');
  const [config, setConfig] = useState<Config>({ suggestions: [], phone: '', zalo: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // Tabs: 'tree' | 'images' | 'crawl' | 'settings' | 'logs'
  const [activeTab, setActiveTab] = useState<'tree' | 'images' | 'crawl' | 'settings' | 'logs'>('tree');

  // Tab Hình ảnh (cây public/images)
  const [imageTree, setImageTree] = useState<TreeNode[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [openImageDirs, setOpenImageDirs] = useState<Record<string, boolean>>({});
  const [selectedImage, setSelectedImage] = useState<TreeNode | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('01_NyAh-PhuDinh');
  const [uploadStatus, setUploadStatus] = useState('');

  // Logs & Leads
  const [leads, setLeads] = useState<Record<string, string>[]>([]);
  const [chats, setChats] = useState<Record<string, string>[]>([]);

  // Tree View States
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Crawl & Convert States
  const [url, setUrl] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileProgress, setFileProgress] = useState<Record<string, 'waiting' | 'processing' | 'done' | 'error'>>({});
  const [outputMarkdown, setOutputMarkdown] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [crawlMaxPages, setCrawlMaxPages] = useState(30);
  const [crawlFilename, setCrawlFilename] = useState('');
  const [embedStatus, setEmbedStatus] = useState('');

  function authHeaders() {
    return { 'x-admin-pass': pass };
  }

  // Khởi chạy mở rộng các thư mục cấp 1 khi có dữ liệu cây
  useEffect(() => {
    if (tree.length > 0) {
      const initOpen: Record<string, boolean> = {};
      tree.forEach(node => {
        if (node.type === 'directory') {
          initOpen[node.path] = true;
        }
      });
      setOpenDirs(initOpen);
    }
  }, [tree]);

  // Tự động mở rộng các thư mục khi tìm kiếm
  useEffect(() => {
    if (searchQuery) {
      const paths: string[] = [];
      const getPaths = (nodes: TreeNode[]) => {
        nodes.forEach(n => {
          if (n.type === 'directory') {
            paths.push(n.path);
            if (n.children) getPaths(n.children);
          }
        });
      };
      const filtered = filterTree(tree, searchQuery);
      getPaths(filtered);
      setOpenDirs(prev => {
        const next = { ...prev };
        paths.forEach(p => {
          next[p] = true;
        });
        return next;
      });
    }
  }, [searchQuery]);

  async function login() {
    setBusy(true);
    setStatus('Đang đăng nhập...');
    try {
      const res = await fetch('/api/admin/data', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', ...authHeaders() } 
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Đăng nhập thất bại');
        return;
      }
      setTree(data.tree || []);
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

  async function loadLogs() {
    setBusy(true);
    setStatus('Đang tải lịch sử...');
    try {
      const res = await fetch('/api/admin/logs', { 
        method: 'POST', 
        headers: authHeaders() 
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Tải thất bại');
        return;
      }
      setLeads(data.leads || []);
      setChats(data.chats || []);
      setStatus('');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  // Load logs automatically when selecting logs tab
  useEffect(() => {
    if (loggedIn && activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, loggedIn]);

  async function loadImages() {
    setBusy(true);
    setStatus('Đang tải danh sách hình ảnh...');
    try {
      const res = await fetch('/api/admin/images', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Tải hình ảnh thất bại');
        return;
      }
      setImageTree(data.tree || []);
      setImageCount(data.count || 0);
      setImagesLoaded(true);
      // Mở sẵn các thư mục cấp 1
      const open: Record<string, boolean> = {};
      (data.tree || []).forEach((n: TreeNode) => { if (n.type === 'directory') open[n.path] = true; });
      setOpenImageDirs(open);
      setStatus('');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  // Upload ảnh online -> commit vào public/images/<folder> trên GitHub
  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const folder = uploadFolder.trim() || '01_NyAh-PhuDinh';
    let ok = 0; const errs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadStatus(`🔄 Đang upload ${i + 1}/${files.length}: ${f.name}...`);
      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('folder', folder);
        const res = await fetch('/api/admin/upload-image', { method: 'POST', headers: authHeaders(), body: fd });
        const data = await res.json();
        if (res.ok) ok++; else errs.push(`${f.name}: ${data.error}`);
      } catch { errs.push(`${f.name}: lỗi mạng`); }
    }
    setUploadStatus(`✅ Đã upload ${ok}/${files.length} ảnh vào public/images/${folder}. ⏳ Vercel cần ~1-2 phút build lại để ảnh hiển thị.${errs.length ? ' ❌ Lỗi: ' + errs.join('; ') : ''}`);
    setBusy(false);
  }

  // Tự tải hình ảnh lần đầu mở tab
  useEffect(() => {
    if (loggedIn && activeTab === 'images' && !imagesLoaded) {
      loadImages();
    }
  }, [activeTab, loggedIn, imagesLoaded]);

  async function selectFile(node: TreeNode) {
    setSelectedFile(node);
    setLoadingFile(true);
    setFileContent('');
    try {
      const res = await fetch('/api/admin/data/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ path: node.path }),
      });
      const data = await res.json();
      if (res.ok) {
        setFileContent(data.content || '');
      } else {
        setFileContent(`Lỗi khi tải file: ${data.error}`);
      }
    } catch (e) {
      setFileContent(`Lỗi kết nối: ${String(e)}`);
    } finally {
      setLoadingFile(false);
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
          extracted.push(file);
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

        setStatus(`Đang xử lý ${file.name}...`);
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/admin/convert', { method: 'POST', headers: authHeaders(), body: form });
        const data = await res.json();
        if (res.ok) {
          added += (added ? '\n\n---\n\n' : '') + data.markdown;
          setFileProgress(prev => ({ ...prev, [file.name]: 'done' }));
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
      setOutputMarkdown(c => (c ? c + '\n\n---\n\n' : '') + added);
      setStatus(`✅ Xử lý thành công ${pendingFiles.length} file. Bạn có thể copy Markdown bên dưới.`);
    }
    setPendingFiles([]);
    setFileProgress({});
    setBusy(false);
  }

  async function crawl(wholeSite: boolean) {
    if (!url.trim()) return;
    setBusy(true);
    setOutputMarkdown(c => c);
    try {
      if (!wholeSite) {
        // Trích xuất 1 trang đơn
        setStatus(`Đang lấy nội dung từ ${url}...`);
        const res = await fetch('/api/admin/crawl', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (res.ok) {
          setOutputMarkdown(c => (c ? c + '\n\n---\n\n' : '') + data.markdown);
          setStatus('✅ Đã lấy nội dung từ web thành công.');
          setUrl('');
        } else setStatus(data.error || 'Lấy nội dung thất bại');
        return;
      }

      // --- Quét cả site: Batch crawl từ client ---
      setStatus(`Đang khám phá các trang con của ${url}...`);

      // Bước 1: Khám phá toàn bộ links từ trang chủ
      const linksRes = await fetch('/api/admin/crawl-links', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const linksData = await linksRes.json();
      if (!linksRes.ok) {
        setStatus(linksData.error || 'Không lấy được danh sách trang');
        return;
      }

      // Bước 2: Xây danh sách URLs cần crawl (giới hạn maxPages)
      const allLinks: string[] = linksData.links || [];
      const urlsToVisit = Array.from(new Set([url, ...allLinks])).slice(0, crawlMaxPages);

      // Hiện nội dung trang chủ ngay lập tức nếu có
      let collectedMarkdown = '';
      if (linksData.homeText) {
        collectedMarkdown = `## Nguồn: ${url}\n\n${linksData.homeText}`;
        setOutputMarkdown(collectedMarkdown);
      }

      // Bước 3: Crawl từng batch 5 trang một
      const BATCH = 5;
      const remainingUrls = urlsToVisit.filter(u => u !== url);
      let doneCount = linksData.homeText ? 1 : 0;
      const total = urlsToVisit.length;

      for (let i = 0; i < remainingUrls.length; i += BATCH) {
        const batch = remainingUrls.slice(i, i + BATCH);
        setStatus(`Đang quét trang ${doneCount + 1}–${Math.min(doneCount + BATCH, total)} / ${total}...`);

        const batchRes = await fetch('/api/admin/crawl-site', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: batch }),
        });
        const batchData = await batchRes.json();
        if (batchRes.ok && batchData.markdown) {
          collectedMarkdown += '\n' + batchData.markdown;
          setOutputMarkdown(collectedMarkdown);
          doneCount += batchData.pages;
        }
      }

      setStatus(`✅ Quét hoàn tất ${doneCount} trang (tìm thấy ${allLinks.length} trang con).`);
      setUrl('');
    } catch {
      setStatus('Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function embedAndIndex() {
    if (!outputMarkdown.trim()) return;
    const name = crawlFilename.trim() || 'web-crawl';
    setBusy(true);
    setEmbedStatus('🔄 Đang tạo embedding và cập nhật index...');
    try {
      const res = await fetch('/api/admin/crawl-save-index', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, markdown: outputMarkdown }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmbedStatus(`✅ Đã lưu file và nạp ${data.newChunks} chunk mới vào RAG (tổng: ${data.totalChunks} chunks).${
          data.truncated ? ' ⚠️ Một số chunk bị bỏ do quá giới hạn.' : ''
        }`);
      } else {
        setEmbedStatus(`❌ Lỗi: ${data.error}`);
      }
    } catch {
      setEmbedStatus('❌ Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  // Build lại TOÀN BỘ index từ data.md (xóa sạch chunk cũ -> hết data lỗi/trùng).
  async function rebuildFullIndex() {
    if (!confirm('Build lại TOÀN BỘ index từ data.md? Thao tác này xóa hết chunk cũ và tạo mới (mất ~1-2 phút).')) return;
    setBusy(true);
    setEmbedStatus('🔄 Đang build lại toàn bộ index từ data.md (xóa sạch chunk cũ)...');
    try {
      const res = await fetch('/api/admin/reindex', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setEmbedStatus(`✅ Đã build lại toàn bộ index. Tổng ${data.chunks} chunks (đã xóa hết chunk cũ).`);
      } else {
        setEmbedStatus(`❌ Lỗi: ${data.error}`);
      }
    } catch {
      setEmbedStatus('❌ Không kết nối được');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setStatus('Đang lưu cấu hình lên GitHub...');
    try {
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Lưu thất bại');
        return;
      }
      setStatus('✅ Đã lưu cấu hình lên GitHub thành công! Vercel sẽ tự động cập nhật sau 1-2 phút.');
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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // Lọc cây dữ liệu dựa trên từ khóa tìm kiếm
  function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
    if (!query) return nodes;
    const lowerQuery = query.toLowerCase();
    
    return nodes
      .map(node => {
        if (node.type === 'file') {
          return node.name.toLowerCase().includes(lowerQuery) ? node : null;
        } else {
          const filteredChildren = filterTree(node.children || [], query);
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lowerQuery)) {
            return { ...node, children: filteredChildren };
          }
          return null;
        }
      })
      .filter((n): n is TreeNode => n !== null);
  }

  const toggleDir = (path: string) => {
    setOpenDirs(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Render đệ quy cây thư mục
  function renderTreeNodes(nodes: TreeNode[], depth = 0) {
    return nodes.map(node => {
      const isOpen = !!openDirs[node.path];
      const isSelected = selectedFile?.path === node.path;
      
      if (node.type === 'directory') {
        return (
          <div key={node.path} className="select-none">
            <div
              onClick={() => toggleDir(node.path)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-800/40 transition-colors text-slate-300 font-medium my-0.5 group"
              style={{ paddingLeft: `${depth * 16 + 12}px` }}
            >
              <span className={`text-slate-500 text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              <span className="text-amber-500 text-lg">📂</span>
              <span className="truncate flex-1 text-slate-200 group-hover:text-white">{node.name}</span>
              <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-normal group-hover:bg-slate-700">
                {node.children?.length || 0}
              </span>
            </div>
            {isOpen && node.children && (
              <div className="mt-0.5 border-l border-slate-800/50 ml-5">
                {renderTreeNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={node.path}
            onClick={() => selectFile(node)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all text-sm my-0.5 border-l-2 ${
              isSelected
                ? 'bg-blue-600/10 text-blue-400 border-blue-500 font-semibold'
                : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 border-transparent'
            }`}
            style={{ paddingLeft: `${depth * 16 + 16}px` }}
          >
            <span className="text-sky-400 text-base">📄</span>
            <span className="truncate flex-1">{node.name}</span>
            {node.size !== undefined && (
              <span className="text-[10px] text-slate-600 font-normal">
                {(node.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        );
      }
    });
  }

  // Render cây hình ảnh (giống cây text, nhưng file là ảnh + thumbnail mini)
  function renderImageTree(nodes: TreeNode[], depth = 0) {
    return nodes.map(node => {
      const isOpen = !!openImageDirs[node.path];
      const isSelected = selectedImage?.path === node.path;

      if (node.type === 'directory') {
        return (
          <div key={node.path} className="select-none">
            <div
              onClick={() => setOpenImageDirs(p => ({ ...p, [node.path]: !p[node.path] }))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-800/40 transition-colors text-slate-300 font-medium my-0.5 group"
              style={{ paddingLeft: `${depth * 16 + 12}px` }}
            >
              <span className={`text-slate-500 text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              <span className="text-amber-500 text-lg">📂</span>
              <span className="truncate flex-1 text-slate-200 group-hover:text-white">{node.name}</span>
              <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-normal group-hover:bg-slate-700">
                {node.children?.length || 0}
              </span>
            </div>
            {isOpen && node.children && (
              <div className="mt-0.5 border-l border-slate-800/50 ml-5">
                {renderImageTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }
      return (
        <div
          key={node.path}
          onClick={() => setSelectedImage(node)}
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all text-sm my-0.5 border-l-2 ${
            isSelected
              ? 'bg-blue-600/10 text-blue-400 border-blue-500 font-semibold'
              : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 border-transparent'
          }`}
          style={{ paddingLeft: `${depth * 16 + 16}px` }}
        >
          {node.url
            ? <img src={node.url} alt="" loading="lazy" className="w-7 h-7 rounded object-cover border border-slate-700 flex-shrink-0 bg-slate-800" />
            : <span className="text-sky-400 text-base">🖼️</span>}
          <span className="truncate flex-1">{node.name}</span>
          {node.size !== undefined && (
            <span className="text-[10px] text-slate-600 font-normal">{(node.size / 1024).toFixed(1)} KB</span>
          )}
        </div>
      );
    });
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 left-1/3 w-60 h-60 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative bg-slate-900/60 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-600/15 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/5 text-3xl">🔐</div>
            <h1 className="text-2xl font-bold text-slate-100">Quản trị Hệ thống</h1>
            <p className="text-sm text-slate-500 mt-1">Đồng bộ cơ sở dữ liệu & thiết lập Bot</p>
          </div>
          <div className="space-y-4">
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="Nhập mật khẩu truy cập..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
            <button 
              onClick={login} 
              disabled={busy} 
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-xl py-3 shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all text-sm"
            >
              {busy ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
            {status && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
                ⚠️ {status}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const filteredTree = filterTree(tree, searchQuery);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Glow ambient background */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-blue-500/5">🤖</div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                NhaDat ChatBot Admin
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Trực tuyến</span>
              </h1>
              <p className="text-xs text-slate-500">Cơ sở dữ liệu RAG & Cấu hình AI</p>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <nav className="flex bg-slate-900/60 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('tree')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'tree' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              📁 Sơ đồ cây
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'images' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🖼️ Hình ảnh
            </button>
            <button
              onClick={() => setActiveTab('crawl')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'crawl' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🌐 Nạp dữ liệu
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              ⚙️ Cấu hình Bot
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'logs' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              📞 Khách hàng
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 flex flex-col gap-6">
        
        {/* Status notification */}
        {status && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between text-sm transition-all ${
            status.includes('✅') 
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' 
              : status.includes('⚠️') || status.includes('Lỗi') 
                ? 'bg-red-500/5 border-red-500/20 text-red-400' 
                : 'bg-blue-500/5 border-blue-500/20 text-blue-400'
          }`}>
            <span className="flex items-center gap-2 font-medium">
              {status.includes('✅') ? '✨' : status.includes('⚠️') ? '⚠️' : '⚡'} {status}
            </span>
            <button onClick={() => setStatus('')} className="text-slate-500 hover:text-slate-300 text-xs font-bold px-2">Đóng</button>
          </div>
        )}

        {/* TAB 1: Sơ đồ cây (Tree View & Preview) */}
        {activeTab === 'tree' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
            {/* Left side: Directory Tree */}
            <div className="lg:col-span-4 bg-slate-900/30 backdrop-blur-md border border-slate-900 rounded-2xl p-4 flex flex-col gap-4">
              
              {/* Sync guide alert */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 space-y-2">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="text-blue-400 text-sm">💡</span> Đồng bộ dữ liệu OneDrive
                </p>
                <p className="leading-relaxed text-[11px]">
                  Dữ liệu RAG được đồng bộ từ thư mục OneDrive. Để thêm, sửa hoặc xóa file, hãy thực hiện trên máy tính của bạn và chạy script:
                </p>
                <div className="bg-slate-900 text-slate-300 font-mono p-2 rounded-lg text-[10px] select-all border border-slate-800">
                  node sync_and_reindex.js
                </div>
              </div>

              {/* Search file input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm kiếm file, thư mục..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">🔍</span>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold">✕</button>
                )}
              </div>

              {/* Tree container */}
              <div className="flex-1 overflow-y-auto max-h-[550px] pr-1 scrollbar-thin">
                {filteredTree.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-xs">
                    {searchQuery ? 'Không tìm thấy kết quả nào' : 'Thư mục data rỗng'}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {renderTreeNodes(filteredTree)}
                  </div>
                )}
              </div>
            </div>

            {/* Right side: File Preview Panel */}
            <div className="lg:col-span-8 bg-slate-900/30 backdrop-blur-md border border-slate-900 rounded-2xl p-5 flex flex-col min-h-[500px]">
              {selectedFile ? (
                <div className="flex-1 flex flex-col gap-4">
                  {/* File Metadata Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">📄</span>
                      <div>
                        <h2 className="text-sm font-semibold text-white truncate max-w-[320px] sm:max-w-md">{selectedFile.name}</h2>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">Đường dẫn: {selectedFile.path}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {selectedFile.size !== undefined && (
                        <span className="text-xs bg-slate-800 border border-slate-700/50 px-2.5 py-1 rounded-lg text-slate-400 font-mono">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                      {fileContent && (
                        <>
                          <button
                            onClick={() => copyToClipboard(fileContent)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/50 transition-colors flex items-center gap-1.5"
                          >
                            {copySuccess ? '✅ Đã sao chép' : '📋 Sao chép'}
                          </button>
                          
                          {/* Download as file */}
                          <a
                            href={`data:text/plain;charset=utf-8,${encodeURIComponent(fileContent)}`}
                            download={selectedFile.name}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/50 transition-colors flex items-center gap-1.5"
                          >
                            ⬇️ Tải về
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* File Content Display */}
                  <div className="flex-1 flex flex-col min-h-[350px]">
                    {loadingFile ? (
                      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                        <span className="animate-pulse">⚡ Đang đọc nội dung file...</span>
                      </div>
                    ) : (
                      <div className="flex-1 relative bg-slate-950 border border-slate-900 rounded-xl overflow-hidden flex flex-col">
                        
                        {/* Word count status bar */}
                        <div className="bg-slate-900/50 border-b border-slate-900 px-3 py-1.5 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                          <span>ĐỊNH DẠNG: {selectedFile.name.split('.').pop()?.toUpperCase()}</span>
                          <span>ĐỘ DÀI: {fileContent.length} ký tự (khoảng {fileContent.split(/\s+/).filter(Boolean).length} từ)</span>
                        </div>

                        {/* File Textarea Viewer */}
                        <textarea
                          readOnly
                          value={fileContent}
                          placeholder="File này không có nội dung văn bản."
                          className="flex-1 w-full bg-slate-950 p-4 font-mono text-xs text-slate-300 leading-relaxed resize-none focus:outline-none scrollbar-thin select-text cursor-default"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-slate-950/50 mb-4 text-slate-600">📂</div>
                  <h3 className="text-slate-300 font-semibold text-sm">Chưa có file nào được chọn</h3>
                  <p className="text-slate-600 text-xs mt-1.5 max-w-sm leading-relaxed">Click chọn bất kỳ tệp tin nào trong danh sách sơ đồ cây bên trái để xem trước nội dung nạp vào chatbot.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Nạp dữ liệu (Crawl & Convert) */}
        {/* TAB: Hình ảnh (cây public/images + xem trước) */}
        {activeTab === 'images' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
            {/* Trái: cây ảnh */}
            <div className="lg:col-span-4 bg-slate-900/30 backdrop-blur-md border border-slate-900 rounded-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5 text-sm">
                  🖼️ Hình ảnh <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{imageCount}</span>
                </p>
                <button onClick={loadImages} disabled={busy} className="text-[11px] bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700/50">↻ Tải lại</button>
              </div>

              {/* Upload ảnh online */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
                <p className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">⬆️ Tải ảnh lên (online)</p>
                <label className="text-[10px] text-slate-500">Thư mục đích (trong public/images/)</label>
                <input
                  value={uploadFolder}
                  onChange={e => setUploadFolder(e.target.value)}
                  placeholder="01_NyAh-PhuDinh/noi_that/opus"
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
                <label className={`text-center text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer transition-all ${busy ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
                  📁 Chọn ảnh để upload
                  <input
                    type="file" accept="image/*" multiple disabled={busy} className="hidden"
                    onChange={e => { uploadImages(e.target.files); e.target.value = ''; }}
                  />
                </label>
                {uploadStatus && <p className="text-[10px] text-slate-400 leading-relaxed">{uploadStatus}</p>}
                <p className="text-[10px] text-slate-600 leading-relaxed">Tên file tự chuẩn hóa (bỏ dấu, viết thường). Ảnh commit lên GitHub → Vercel build ~1-2 phút mới hiện. Hoặc vẫn có thể dùng OneDrive <span className="font-mono">ChatBotImages_Upload</span> + <span className="font-mono">Chay_Dong_Bo.bat</span>.</p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[550px] pr-1 scrollbar-thin">
                {imageTree.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-xs">{imagesLoaded ? 'Chưa có hình ảnh nào trong public/images' : 'Đang tải...'}</div>
                ) : (
                  <div className="space-y-0.5">{renderImageTree(imageTree)}</div>
                )}
              </div>
            </div>

            {/* Phải: xem trước ảnh */}
            <div className="lg:col-span-8 bg-slate-900/30 backdrop-blur-md border border-slate-900 rounded-2xl p-5 flex flex-col min-h-[500px]">
              {selectedImage && selectedImage.url ? (
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-white truncate max-w-[320px] sm:max-w-md">{selectedImage.name}</h2>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[320px] sm:max-w-md">{selectedImage.url}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedImage.size !== undefined && (
                        <span className="text-xs bg-slate-800 border border-slate-700/50 px-2.5 py-1 rounded-lg text-slate-400 font-mono">{(selectedImage.size / 1024).toFixed(1)} KB</span>
                      )}
                      <button onClick={() => copyToClipboard(selectedImage.url || '')} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/50">
                        {copySuccess ? '✅ Đã chép' : '📋 Chép URL'}
                      </button>
                      <a href={selectedImage.url} target="_blank" rel="noreferrer" className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/50">↗ Mở</a>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden p-4">
                    <img src={selectedImage.url} alt={selectedImage.name} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
                  <span className="text-5xl">🖼️</span>
                  <p className="text-sm">Chọn một ảnh bên trái để xem trước</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'crawl' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
            {/* Tools Area */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* File Converter */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-sm text-slate-200 flex items-center gap-2">📎 Trình chuyển đổi File sang Markdown</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Hỗ trợ kéo thả PDF, Word, Excel, CSV, TXT, ZIP. Công cụ sẽ chuyển đổi nội dung file thành định dạng Markdown chuẩn cho Bot.
                </p>

                <div className="border-2 border-dashed border-slate-800 hover:border-slate-700/80 rounded-xl p-6 text-center space-y-3 transition-colors relative cursor-pointer group">
                  <input 
                    type="file" 
                    multiple 
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.zip" 
                    onChange={e => pickFiles(e.target.files)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  />
                  <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center mx-auto text-lg border border-slate-800 text-slate-500 group-hover:text-blue-400 group-hover:border-blue-500/20 transition-all">📂</div>
                  <div>
                    <span className="text-xs text-slate-300 block font-medium">Bấm chọn hoặc kéo thả files vào đây</span>
                    <span className="text-[10px] text-slate-600 block mt-1">Dung lượng file tối đa 20MB</span>
                  </div>
                </div>

                {pendingFiles.length > 0 && (
                  <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 space-y-2.5">
                    <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Danh sách chờ xử lý ({pendingFiles.length})</p>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {pendingFiles.map(f => {
                        const prog = fileProgress[f.name];
                        const icon = prog === 'processing' ? '⏳' : prog === 'done' ? '✅' : prog === 'error' ? '❌' : '📄';
                        const size = f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(f.size / 1024)}KB`;
                        return (
                          <div key={f.name} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-2.5 py-1.5 border border-slate-900/50 text-xs">
                            <span className="text-xs">{icon}</span>
                            <span className="flex-1 text-slate-300 truncate max-w-[180px]" title={f.name}>{f.name}</span>
                            <span className="text-[10px] text-slate-600 font-mono">{size}</span>
                            {!prog && (
                              <button onClick={() => removeFile(f.name)} className="text-slate-500 hover:text-red-400 text-xs font-bold leading-none px-1.5" title="Xóa">✕</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={processFiles}
                      disabled={busy}
                      className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2 disabled:opacity-50 transition-all flex items-center justify-center gap-1"
                    >
                      🚀 Bắt đầu chuyển đổi {pendingFiles.length} file
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Markdown Output Area */}
            <div className="lg:col-span-7 bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col min-h-[400px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📝</span>
                  <h3 className="font-bold text-sm text-slate-200">Kết quả Markdown đầu ra</h3>
                  <button
                    onClick={rebuildFullIndex}
                    disabled={busy}
                    title="Build lại toàn bộ index từ data.md — xóa sạch chunk cũ/lỗi/trùng"
                    className="ml-1 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg shadow-orange-500/10 transition-all disabled:opacity-50 flex items-center gap-1"
                  >
                    🔁 Rebuild toàn bộ Index
                  </button>
                </div>
                {outputMarkdown && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={embedAndIndex}
                      disabled={busy}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg shadow-emerald-500/10 transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      ⚡ Embed &amp; Nạp vào Bot
                    </button>
                    <button
                      onClick={() => copyToClipboard(outputMarkdown)}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg shadow-blue-500/10 transition-all"
                    >
                      {copySuccess ? '✅ Đã sao chép' : '📋 Sao chép'}
                    </button>
                    <button
                      onClick={() => { setOutputMarkdown(''); setEmbedStatus(''); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 font-semibold"
                    >
                      Xóa
                    </button>
                  </div>
                )}
              </div>

              {/* Tên file khi embed */}
              {outputMarkdown && (
                <div className="flex items-center gap-2 mt-3">
                  <label className="text-xs text-slate-500 whitespace-nowrap">📁 Tên file:</label>
                  <input
                    value={crawlFilename}
                    onChange={e => setCrawlFilename(e.target.value)}
                    placeholder="vd: nhadat-company (không cần .md)"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Trạng thái embed */}
              {embedStatus && (
                <div className={`mt-2 text-xs px-3 py-2 rounded-lg border ${
                  embedStatus.startsWith('✅') ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                  : embedStatus.startsWith('❌') ? 'bg-red-500/5 border-red-500/20 text-red-400'
                  : 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                }`}>
                  {embedStatus}
                </div>
              )}

              <div className="flex-1 mt-4 relative bg-slate-950 border border-slate-900 rounded-xl overflow-hidden flex flex-col">
                <div className="bg-slate-900/50 border-b border-slate-900 px-3 py-1.5 text-[10px] text-slate-500 font-mono flex justify-between">
                  <span>MÔ TẢ: Copy nội dung này tạo file md lưu vào OneDrive của bạn</span>
                  <span>ĐỘ DÀI: {outputMarkdown.length} ký tự</span>
                </div>
                <textarea
                  value={outputMarkdown}
                  onChange={e => setOutputMarkdown(e.target.value)}
                  placeholder="Nội dung Markdown được sinh ra từ các file hoặc website tải lên sẽ xuất hiện ở đây để bạn xem trước, chỉnh sửa và copy..."
                  className="flex-1 w-full bg-slate-950 p-4 font-mono text-xs text-slate-300 leading-relaxed resize-none focus:outline-none scrollbar-thin"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Cấu hình Bot (Persona & Settings) */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            
            {/* Instructions info box */}
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 flex gap-3 text-xs text-slate-400">
              <span className="text-xl">⚙️</span>
              <div className="space-y-1">
                <p className="font-semibold text-slate-200">Cài đặt cấu hình trực tuyến</p>
                <p className="leading-relaxed">
                  Thiết lập này được lưu trực tiếp trên GitHub và có hiệu lực ngay sau khi lưu. Persona quy định tính cách và hành vi trả lời của AI, trong khi cấu hình gợi ý giúp người dùng dễ dàng tương tác.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Persona Textarea */}
              <div className="lg:col-span-7 bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-3">
                <h2 className="font-bold text-sm text-slate-200 flex items-center gap-2">🎭 Tính cách & Quy tắc trả lời của Bot (Persona)</h2>
                <p className="text-xs text-slate-500">Quy định cách chatbot xưng hô, giọng điệu phản hồi và các nguyên tắc bám sát nguồn dữ liệu.</p>
                <textarea
                  value={persona}
                  onChange={e => setPersona(e.target.value)}
                  rows={16}
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl p-4 text-xs font-mono text-slate-300 leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none scrollbar-thin"
                />
              </div>

              {/* Bot Config (Suggestions + Contact) */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                
                {/* Suggestions List */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 space-y-3">
                  <h2 className="font-bold text-sm text-slate-200">💡 Câu hỏi gợi ý ban đầu</h2>
                  <p className="text-xs text-slate-500">Mỗi dòng tương ứng với một nút câu hỏi nhanh khi khách hàng vừa mở khung chat.</p>
                  <textarea
                    value={config.suggestions.join('\n')}
                    onChange={e => setConfig(c => ({ ...c, suggestions: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))}
                    rows={6}
                    placeholder="Mỗi dòng là một câu hỏi..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Contact information */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 space-y-4">
                  <h2 className="font-bold text-sm text-slate-200">📞 Thông tin liên hệ nút chat</h2>
                  <p className="text-xs text-slate-500">Các nút liên hệ nhanh sẽ xuất hiện trong bong bóng chat của khách hàng.</p>
                  
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Số điện thoại Hotline</label>
                      <input
                        value={config.phone}
                        onChange={e => setConfig(c => ({ ...c, phone: e.target.value }))}
                        placeholder="Ví dụ: 0901234567"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Đường dẫn liên hệ Zalo</label>
                      <input
                        value={config.zalo}
                        onChange={e => setConfig(c => ({ ...c, zalo: e.target.value }))}
                        placeholder="Ví dụ: https://zalo.me/0901234567"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky/Fixed Save Bar */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-900 p-4 rounded-2xl flex items-center justify-between">
              <span className="text-xs text-slate-500">Lưu ý: Mọi cấu hình thay đổi cần bấm nút Lưu để cập nhật.</span>
              <button
                onClick={saveSettings}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                💾 Lưu & Cập nhật Bot
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: Khách hàng (Leads & Chat history logs) */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            {/* Dashboard Statistics */}
            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const chatsToday = chats.filter(c => (c.time || '').slice(0, 10) === today).length;
              const conv = chats.length ? Math.round((leads.length / chats.length) * 100) : 0;
              const stats = [
                { label: 'Tổng số hội thoại', value: chats.length, icon: '💬', color: 'text-blue-400 bg-blue-500/5 border-blue-500/10' },
                { label: 'Hội thoại hôm nay', value: chatsToday, icon: '📅', color: 'text-purple-400 bg-purple-500/5 border-purple-500/10' },
                { label: 'Khách hàng để lại SĐT (Leads)', value: leads.length, icon: '📞', color: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' },
                { label: 'Tỷ lệ chuyển đổi SĐT', value: `${conv}%`, icon: '📈', color: 'text-amber-400 bg-amber-500/5 border-amber-500/10' },
              ];
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {stats.map(s => (
                    <div key={s.label} className={`border rounded-2xl p-4 flex items-center justify-between shadow-sm ${s.color}`}>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                        <p className="text-2xl font-bold mt-1.5 text-slate-200">{s.value}</p>
                      </div>
                      <span className="text-3xl filter saturate-75 opacity-90">{s.icon}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Leads Container (Left side) */}
              <div className="lg:col-span-5 bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col min-h-[450px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                  <p className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <span>📞</span> Danh sách Leads ({leads.length})
                  </p>
                  {leads.length > 0 && (
                    <button 
                      onClick={exportLeads} 
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg px-3 py-1.5 transition-all font-semibold"
                    >
                      ⬇️ Xuất file Excel
                    </button>
                  )}
                </div>

                <div className="flex-1 mt-4 overflow-y-auto max-h-[500px] space-y-3 pr-1 scrollbar-thin">
                  {leads.length === 0 ? (
                    <div className="text-center py-12 text-slate-600 text-xs">Chưa có số điện thoại nào được đăng ký.</div>
                  ) : (
                    leads.map((l, i) => (
                      <div key={i} className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 text-xs space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                          <span className="font-bold text-emerald-400 text-sm">📱 {l.phone}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{l.time?.replace('T', ' ').slice(0, 16)}</span>
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          <span className="text-slate-600 font-bold block mb-0.5 text-[10px] uppercase">Tin nhắn tương tác:</span>
                          "{l.message}"
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat history logs (Right side) */}
              <div className="lg:col-span-7 bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col min-h-[450px]">
                <p className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
                  <span>💬</span> Lịch sử hội thoại gần đây ({chats.length})
                </p>

                <div className="flex-1 mt-4 overflow-y-auto max-h-[500px] space-y-4 pr-1 scrollbar-thin">
                  {chats.length === 0 ? (
                    <div className="text-center py-12 text-slate-600 text-xs">Chưa có cuộc hội thoại nào.</div>
                  ) : (
                    chats.map((c, i) => (
                      <div key={i} className="bg-slate-950 border border-slate-900 rounded-xl p-4 text-xs space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                          <span className="text-[10px] text-slate-500 font-mono">{c.time?.replace('T', ' ').slice(0, 16)}</span>
                          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full text-[9px] text-slate-400">Hội thoại #{chats.length - i}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="space-y-0.5">
                            <span className="text-blue-400 font-bold text-[9px] uppercase">Khách hàng hỏi:</span>
                            <p className="text-slate-200 font-medium bg-slate-900/40 p-2.5 rounded-lg leading-relaxed">{c.question}</p>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-purple-400 font-bold text-[9px] uppercase">AI phản hồi:</span>
                            <div className="text-slate-400 bg-slate-900/10 p-2.5 rounded-lg leading-relaxed whitespace-pre-wrap">{c.answer}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer bar */}
      <footer className="bg-slate-950 border-t border-slate-900 px-6 py-4 text-center text-[10px] text-slate-600 font-mono">
        NHADAT BOT MANAGEMENT SYSTEM PANEL © 2026
      </footer>
    </div>
  );
}
