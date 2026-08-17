'use client';

import { useState, useRef, useEffect } from 'react';
import { createSessionRecorder } from '@/lib/session-digest';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}
interface Config {
  suggestions: string[];
  phone: string;
  zalo: string;
}

function renderMarkdown(text: string, large = false) {
  // Escape cả dấu nháy: nội dung là output LLM (có thể bị prompt-injection qua
  // dữ liệu RAG/crawl) và sẽ được chèn vào attribute src/href bên dưới - thiếu
  // escape `"` là thoát được attribute -> XSS (vd ![x](u" onerror="...)).
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  let html = escaped;

  // 1. Render markdown images: ![alt](url) (supports relative paths /images/... or full URLs)
  // large = chế độ full trang, cho ảnh cao hơn vì không còn bị khung 500px bó lại
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img src="$2" alt="$1" class="max-w-full h-auto rounded-xl my-2 border border-gray-200 shadow-sm ${large ? 'max-h-[340px]' : 'max-h-[250px]'} object-cover" />`);

  // 2. Render normal links: [text](url). Ảnh ![..](..) đã được thay ở bước 1 nên không cần lookbehind.
  // (Tránh lookbehind (?<!) vì Safari/iOS ≤ 16.3 ném lỗi -> crash widget.)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-650 hover:underline font-semibold">$1</a>');

  // 3. Render raw Google Drive links - bỏ qua URL đã nằm trong href="..." (nhóm bắt tùy chọn thay lookbehind)
  html = html.replace(/(href=")?(https:\/\/drive\.google\.com\/[^\s\)"]+)/g, (m, href, url) =>
    href ? m : `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-650 hover:underline font-semibold">Link Google Drive</a>`);

  // 3b. Render raw Google Maps links - tương tự, bỏ qua URL đã trong href
  html = html.replace(/(href=")?(https:\/\/maps\.(?:app\.goo\.gl|google\.com)\/[^\s\)\]"]+)/g, (m, href, url) =>
    href ? m : `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline font-semibold">📍 Xem đường đi trên Google Maps</a>`);

  // 4. Render bold text: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 5. Render bullet points
  html = html.replace(/^\s*[\*\-]\s+/gm, '• ');

  return html;
}

// Trí nhớ phiên: rút thông tin khách từ hội thoại để bot không hỏi lại
function extractProfile(messages: Message[]): string {
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  const facts: string[] = [];
  const name = userText.match(/(?:tôi|mình|em|anh|chị|tên)\s+(?:là|tên là|tên)\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){0,2})/);
  if (name) facts.push(`Tên: ${name[1]}`);
  const budget = userText.match(/(\d+(?:[.,]\d+)?)\s*(tỷ|tỉ|triệu|tr\b)/i);
  if (budget) facts.push(`Ngân sách: ${budget[0]}`);
  const area = userText.match(/(?:ở|khu vực|quận|huyện|tại|gần)\s+([A-ZÀ-Ỹ][\wÀ-ỹ\s]{2,25})/);
  if (area) facts.push(`Khu vực quan tâm: ${area[1].trim()}`);
  return facts.join('\n');
}

interface ChatPanelProps {
  // true khi panel này chạy trong iframe nhúng (/embed) - 🎧/📊 phải mở tab mới
  // thay vì điều hướng ngay trong iframe (iframe nhỏ 360x600 không đủ chỗ hiển thị
  // trang /voice, /slide full-screen; điều hướng tại chỗ sẽ "kẹt" widget ở đó).
  embedded?: boolean;
  // true khi chat hiển thị là MỘT TRANG trọn màn hình (trang chủ "/") - đồng bộ
  // trải nghiệm với /voice, /slide: bỏ bo góc/viền/đổ bóng của khung widget,
  // canh giữa cột hội thoại max-w-3xl, chữ và nút lớn hơn.
  fullPage?: boolean;
}

// Component chat dùng chung cho trang chủ "/" (full trang) và trang /embed
// (nhúng qua iframe vào WordPress) - tránh 2 bản logic lệch nhau.
export default function ChatPanel({ embedded = false, fullPage = false }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);   // hiện 3 chấm chờ
  const [streaming, setStreaming] = useState(false); // khóa nút send khi chờ API
  const [cfg, setCfg] = useState<Config>({ suggestions: [], phone: '', zalo: '' });
  const bottomRef = useRef<HTMLDivElement>(null);

  // Trang chủ "/" vẫn có thể bị website khác nhúng qua iframe (plugin WordPress
  // bản cũ trỏ thẳng về "/" thay vì /embed). Phát hiện lúc chạy để 🎧/📊 mở tab
  // mới như embedded, không điều hướng kẹt trong iframe nhỏ.
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      // Truy cập window.top bị chặn cross-origin => chắc chắn đang trong iframe
      setInIframe(true);
    }
  }, []);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setCfg).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Gom hỏi-đáp cả phiên -> 1 tin Telegram tổng hợp khi khách rời/im lặng 10'.
  const recorderRef = useRef(createSessionRecorder('chat'));
  useEffect(() => recorderRef.current.bindUnload(), []);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || streaming) return;
    recorderRef.current.push(msg);
    setInput('');
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setStreaming(true); // khóa nút send ngay
    setLoading(true);   // hiện 3 chấm chờ

    // Chỉ số cố định của slot trả lời cho LƯỢT NÀY: history + tin user vừa gửi.
    // Không dùng copy[copy.length-1] vì stream còn chạy mà khách gửi câu mới
    // thì "tin cuối" đã là tin khác -> stream cũ đè mất tin mới.
    const assistantIdx = history.length + 1;
    const writeAssistant = (content: string) =>
      setMessages(prev => {
        const copy = [...prev];
        if (copy[assistantIdx]?.role === 'assistant') copy[assistantIdx] = { role: 'assistant', content };
        return copy;
      });
    let acc = '';

    // Bắn SONG SONG /api/slide (ambient=true -> nhánh slide tĩnh ~0ms, không
    // tốn LLM) để lấy ảnh dự án đính kèm câu trả lời - cùng cơ chế /voice dùng.
    // Câu không khớp chủ đề thì slide trả skip -> không đính gì.
    const slidePromise: Promise<{ skip?: boolean; title?: string; image_urls?: string[] } | null> =
      fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, ambient: true }),
      }).then(r => (r.ok ? r.json() : null)).catch(() => null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-handshake': 'npd-mktg-handshake'
        },
        body: JSON.stringify({ message: msg, history, profile: extractProfile([...history, { role: 'user', content: msg }]) }),
      });

      // Lỗi -> chỉ hiển thị thông báo thân thiện ngắn gọn (không dump JSON cho khách)
      if (!res.ok || !res.body) {
        let friendly = 'Có lỗi xảy ra, vui lòng thử lại.';
        try {
          const data = await res.json();
          friendly = data.friendly || friendly;
        } catch {}
        setMessages(prev => [...prev, { role: 'assistant', content: friendly }]);
        return;
      }

      // Bắt đầu streaming: tạo slot trả lời trống
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        // Khi nhận được chữ đầu tiên -> mở khóa nút send ngay
        if (firstChunk && acc.trim()) {
          firstChunk = false;
          setStreaming(false);
          setLoading(false);
        }
        writeAssistant(acc);
      }
      if (!acc) {
        writeAssistant('Không có phản hồi, vui lòng thử lại.');
      } else {
        recorderRef.current.answerLast(acc);
        // Trả lời xong -> đính ảnh dự án nếu câu hỏi khớp chủ đề có ảnh.
        // Chờ tối đa 4s: slide tĩnh về ~0ms, chỉ nhánh LLM mới chậm - quá hạn
        // thì thôi, không giữ khách.
        const slide = await Promise.race([
          slidePromise,
          new Promise<null>(r => setTimeout(() => r(null), 4000)),
        ]);
        const imgs = slide && !slide.skip && Array.isArray(slide.image_urls)
          ? Array.from(new Set(slide.image_urls)).slice(0, 2) : [];
        if (imgs.length) {
          const md = '\n\n' + imgs.map(u => `![${slide!.title || 'Ảnh dự án'}](${u})`).join('\n');
          acc += md;
          writeAssistant(acc);
        }
      }
    } catch {
      // Đứt mạng giữa chừng: nếu đã stream được một phần thì đánh dấu tin bị cắt
      // ngay trên tin đó thay vì thêm một tin lỗi rời rạc.
      if (acc) {
        writeAssistant(acc + '\n\n⚠️ Kết nối bị gián đoạn, câu trả lời có thể chưa đầy đủ.');
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Không thể kết nối, vui lòng thử lại.' }]);
      }
    } finally {
      setStreaming(false);
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showContact = (cfg.phone || cfg.zalo) && messages.length >= 2;
  // Trong iframe (trang /embed hoặc "/" bị nhúng): mở /voice, /slide ở tab mới
  // để không điều hướng mất khung chat nhỏ.
  const linkTarget = embedded || inIframe ? '_blank' : undefined;

  // Full trang: nội dung canh giữa thành cột hội thoại (kiểu ChatGPT), widget/embed giữ nguyên
  const center = fullPage ? 'w-full max-w-3xl mx-auto' : '';
  const headerBtn = fullPage
    ? 'text-xs font-medium bg-white/20 hover:bg-white/30 rounded-full h-9 px-3 flex items-center gap-1.5 transition'
    : 'text-xs bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center';

  return (
    <div className={`w-full h-full flex flex-col bg-white overflow-hidden ${fullPage ? '' : 'rounded-2xl shadow-2xl border border-gray-200'}`}>
      {/* Header */}
      <div className={`bg-blue-600 text-white ${fullPage ? 'px-4 sm:px-6 py-3 shadow-md relative z-10' : 'px-4 py-3'}`}>
        <div className={`flex items-center ${fullPage ? `gap-2 ${center}` : 'gap-1.5'}`}>
          <span className={`rounded-lg bg-white flex items-center justify-center flex-shrink-0 ${fullPage ? 'w-9 h-9' : 'w-8 h-8'}`}>
            <img src="/logo.svg" alt="Nhã Đạt AI" className="w-[80%] h-[80%] object-contain" />
          </span>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold truncate ${fullPage ? 'text-base leading-tight' : 'text-sm'}`}>Nhã Đạt AI</p>
            <p className="text-xs opacity-80 truncate">NyAh Phú Định · Villa NyAh</p>
          </div>
          <Link href="/voice" target={linkTarget} className={headerBtn} title="Đàm thoại giọng nói">
            🎧{fullPage && <span className="hidden sm:inline">Giọng nói</span>}
          </Link>
          <Link href="/slide" target={linkTarget} className={headerBtn} title="Trình chiếu slide">
            📊{fullPage && <span className="hidden sm:inline">Slide</span>}
          </Link>
          {cfg.phone && (
            <a href={`tel:${cfg.phone}`} className={headerBtn} title="Gọi tư vấn">
              📞{fullPage && <span className="hidden sm:inline">Gọi</span>}
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className={`p-4 space-y-3 ${fullPage ? `sm:px-6 sm:py-6 ${center}` : ''}`}>
          {messages.length === 0 && (
            <div className={`text-center text-gray-500 ${fullPage ? 'text-sm sm:text-base mt-6 sm:mt-14' : 'text-sm mt-4'}`}>
              <img src="/logo.svg" alt="Nhã Đạt AI" className={`object-contain mx-auto mb-3 ${fullPage ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-20 h-20'}`} />
              {fullPage && <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Nhã Đạt AI</h1>}
              <p className={fullPage ? 'mb-5 max-w-xl mx-auto' : 'mb-3'}>Xin chào anh/chị! Em là trợ lý của <strong>nhadat.company</strong>, sẵn sàng tư vấn về dự án <strong>NyAh Phú Định</strong> và <strong>Villa NyAh</strong> ạ.</p>
              {cfg.suggestions.length > 0 && (
                <div className={fullPage ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 text-left' : 'space-y-2 text-left'}>
                  {cfg.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className={`w-full text-left text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 hover:border-blue-400 hover:bg-blue-50 transition ${fullPage ? 'sm:px-4 sm:py-3' : ''}`}
                    >
                      💬 {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${fullPage ? 'text-sm sm:text-base' : 'text-sm'} ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                }`}
              >
                {m.role === 'assistant' ? (
                  <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content, fullPage) }} />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm">
                <span className="inline-flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Liên hệ nhanh */}
      {showContact && (
        <div className="bg-white border-t border-gray-100">
          <div className={`flex gap-2 px-3 py-2 ${fullPage ? `sm:px-6 ${center}` : ''}`}>
            {cfg.phone && (
              <a href={`tel:${cfg.phone}`} className="flex-1 text-center text-xs font-medium bg-green-600 text-white rounded-lg py-2 hover:bg-green-700">
                📞 Gọi tư vấn
              </a>
            )}
            {cfg.zalo && (
              <a href={cfg.zalo} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-medium bg-blue-500 text-white rounded-lg py-2 hover:bg-blue-600">
                💬 Chat Zalo
              </a>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200">
        <div className={`p-3 flex gap-2 ${fullPage ? `sm:px-6 sm:py-4 ${center}` : ''}`}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Nhập câu hỏi..."
            aria-label="Nhập câu hỏi"
            rows={1}
            className={`flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${fullPage ? 'text-base sm:px-4 sm:py-2.5' : 'text-sm'}`}
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            aria-label="Gửi câu hỏi"
            className={`rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0 self-end ${fullPage ? 'w-11 h-11' : 'w-9 h-9'}`}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
