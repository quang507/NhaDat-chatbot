'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ChatPanel from './ChatPanel';

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Tự động thu gọn chatbot khi vào trang trình chiếu hoặc hội thoại
  useEffect(() => {
    if (pathname === '/slide' || pathname === '/voice') {
      setOpen(false);
    }
  }, [pathname]);

  if (pathname === '/voice' || pathname === '/slide') return null;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-white text-gray-800 shadow-xl border border-gray-200 flex items-center justify-center text-2xl hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 overflow-hidden"
        aria-label={open ? 'Đóng chatbot' : 'Mở chatbot Nhã Đạt AI'}
      >
        {open ? '✕' : <img src="/logo.svg" alt="Nhã Đạt AI" className="w-[78%] h-[78%] object-contain" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 h-[500px]">
          <ChatPanel />
        </div>
      )}
    </>
  );
}
