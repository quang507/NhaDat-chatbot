'use client';

import { useState, useRef, useEffect } from 'react';
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

function renderMarkdown(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let html = escaped;
  
  // 1. Render markdown images: ![alt](url) (supports relative paths /images/... or full URLs)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-xl my-2 border border-gray-200 shadow-sm max-h-[250px] object-cover" />');
  
  // 2. Render normal links: [text](url) (not preceded by !)
  html = html.replace(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-650 hover:underline font-semibold">$1</a>');
  
  // 3. Render raw Google Drive links
  html = html.replace(/(?<!href=")(https:\/\/drive\.google\.com\/[^\s\)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-650 hover:underline font-semibold">Link Google Drive</a>');
  
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

export default function DifyChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);   // hiện 3 chấm chờ
  const [streaming, setStreaming] = useState(false); // khóa nút send khi chờ API
  const [cfg, setCfg] = useState<Config>({ suggestions: [], phone: '', zalo: '' });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setCfg).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage({ type: 'nhadat-chat', open }, '*');
    }
  }, [open]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || streaming) return;
    setInput('');
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setStreaming(true); // khóa nút send ngay
    setLoading(true);   // hiện 3 chấm chờ
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      let acc = '';
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
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
      if (!acc) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: 'Không có phản hồi, vui lòng thử lại.' };
          return copy;
        });
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Không thể kết nối, vui lòng thử lại.' }]);
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

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center text-2xl hover:bg-blue-700 transition"
        aria-label="Mở chatbot"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 h-[500px] flex flex-col rounded-2xl shadow-2xl bg-white border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center gap-2">
            <span className="text-xl">🏠</span>
            <div className="flex-1">
              <p className="font-semibold text-sm">nhadat.company</p>
              <p className="text-xs opacity-80">NyAh Phú Định · Villa NyAh</p>
            </div>
            <Link href="/voice" className="text-xs bg-white/20 hover:bg-white/30 rounded-full px-2.5 py-1 flex items-center gap-1 font-semibold" title="Đàm thoại giọng nói">
              🎧 Voice
            </Link>
            {cfg.phone && (
              <a href={`tel:${cfg.phone}`} className="text-xs bg-white/20 hover:bg-white/30 rounded-full px-2.5 py-1" title="Gọi tư vấn">📞</a>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm mt-4">
                <p className="text-3xl mb-2">🏡</p>
                <p className="mb-3">Xin chào anh/chị! Em là trợ lý của <strong>nhadat.company</strong>, sẵn sàng tư vấn về dự án <strong>NyAh Phú Định</strong> và <strong>Villa NyAh</strong> ạ.</p>
                {cfg.suggestions.length > 0 && (
                  <div className="space-y-2 text-left">
                    {cfg.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => send(s)}
                        className="w-full text-left text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 hover:border-blue-400 hover:bg-blue-50 transition"
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
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
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

          {/* Liên hệ nhanh */}
          {showContact && (
            <div className="flex gap-2 px-3 py-2 bg-white border-t border-gray-100">
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
          )}

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Nhập câu hỏi..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => send(input)}
              disabled={streaming || !input.trim()}
              className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0 self-end"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
