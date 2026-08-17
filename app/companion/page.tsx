"use client";

// ============================================================================
// /companion - BẢNG ĐIỀU KHIỂN CỦA SALE trên điện thoại (B2.3)
//
// Nối WebSocket tới server showroom và phát SALE_CMD; TV là subscriber cùng
// bus nên lệnh phản ánh tức thời. Không có logic slide nào ở đây - chỉ là một
// producer sự kiện thứ hai đúng như thiết kế machine (tech-spec §2.2, §5.3).
//
//   /companion            -> WS same-origin (mở từ chính server showroom)
//   /companion?server=ws://192.168.1.10:3080 -> chỉ định server LAN
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CompanionToServer, ServerToCompanion, SaleCmd } from '@/lib/ws-protocol';
import { createReconnectingWs, ReconnectingWs } from '@/lib/ws-client';

// Từ khoá bẻ lái nhanh - Sale chạm 1 phát thay vì gõ (ISO 9241-110).
const QUICK_QUERIES = [
  'vị trí dự án', 'tiến độ thi công', 'pháp lý dự án', 'giá bán và thanh toán',
  'mẫu nhà Cosmo', 'mẫu nhà Fusion', 'mẫu nhà Opus', 'tiện ích xung quanh',
];

type ConnState = 'connecting' | 'connected' | 'reconnecting';

export default function CompanionPage() {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [tvCount, setTvCount] = useState(0);
  const [tvState, setTvState] = useState<{ state: string; title?: string }>({ state: '—' });
  const [frozen, setFrozen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const connRef = useRef<ReconnectingWs | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const server = qs.get('server');
    const url = server
      ? `${server.replace(/\/$/, '')}/ws`
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    // Heartbeat + backoff + reconnect nằm trong lib/ws-client (dùng chung với TV).
    const conn = createReconnectingWs({
      url,
      hello: { t: 'COMPANION_HELLO' } satisfies CompanionToServer,
      onStatus: setConn,
      onMessage: raw => {
        const msg = raw as unknown as ServerToCompanion;
        if (msg.t === 'TV_COUNT') setTvCount(msg.count);
        if (msg.t === 'TV_STATE') {
          setTvState({ state: msg.state, title: msg.title });
          setFrozen(msg.state === 'frozen');
        }
      },
    });
    connRef.current = conn;
    return () => { connRef.current = null; conn.dispose(); };
  }, []);

  const sendMsg = useCallback((msg: CompanionToServer) => connRef.current?.send(msg) ?? false, []);
  const cmd = useCallback((c: SaleCmd) => sendMsg({ t: 'SALE_CMD', cmd: c }), [sendMsg]);

  const sendQuery = (text: string) => {
    const q = text.trim();
    if (!q) return;
    if (sendMsg({ t: 'OVERRIDE_QUERY', text: q })) setQueryText('');
  };

  // Chưa nối server thì mọi lệnh đều rơi vào hư không - disable nút cho Sale
  // biết ngay thay vì bấm thấy nhấp animation mà TV không phản ứng.
  const offline = conn !== 'connected';
  const dis = offline ? 'opacity-40 pointer-events-none' : '';

  const STATE_VI: Record<string, string> = {
    idle: 'Chờ', listening: 'Đang nghe', querying: 'Đang tạo slide',
    frozen: 'Đóng băng', mic_error: 'Mic lỗi - chế độ tay', '—': '—',
  };

  return (
    <div className="min-h-screen bg-[#0b0c12] text-white flex flex-col" style={{ fontFamily: "var(--font-display, sans-serif)" }}>
      {/* Trạng thái kết nối + TV */}
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <p className="text-[#e8b84b] font-bold tracking-[0.25em] uppercase text-xs">Ny&apos;ah · Sale Console</p>
          <p className="text-white/50 text-sm mt-1">
            {conn === 'connected' ? `${tvCount} TV đang nối` : conn === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối - đang thử lại…'}
          </p>
        </div>
        <span className={`w-3 h-3 rounded-full ${conn === 'connected' ? 'bg-[#2E9E5B]' : 'bg-amber-400 animate-pulse'}`} aria-hidden />
      </header>

      {/* TV đang chiếu gì */}
      <div className="mx-5 rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
        <p className="text-white/40 text-xs uppercase tracking-wider">Màn hình TV</p>
        <p className="font-semibold text-lg mt-0.5 truncate">{tvState.title || 'Màn chờ'}</p>
        <p className="text-white/50 text-sm">{STATE_VI[tvState.state] || tvState.state}</p>
      </div>

      {/* 2 nút khẩn - to, cách xa nhau (Fitts) */}
      <div className="grid grid-cols-2 gap-4 px-5 mt-5">
        <button
          onClick={() => cmd(frozen ? 'RESUME' : 'FREEZE')}
          disabled={offline}
          className={`h-28 rounded-3xl font-black text-xl active:scale-95 transition-transform ${dis} ${
            frozen ? 'bg-[#2E9E5B] text-white' : 'bg-[#e8b84b] text-[#0b0c12]'
          }`}
        >
          {frozen ? '▶ TIẾP TỤC' : '⏸ ĐÓNG BĂNG'}
        </button>
        <button
          onClick={() => cmd('CLEAR')}
          disabled={offline}
          className={`h-28 rounded-3xl bg-[#101218] border-2 border-red-400/40 text-red-300 font-black text-xl active:scale-95 transition-transform ${dis}`}
        >
          🗑 XOÁ SLIDE
        </button>
      </div>

      {/* Điều khiển ảnh */}
      <div className="grid grid-cols-3 gap-3 px-5 mt-4">
        <button onClick={() => cmd('PREV_IMAGE')} disabled={offline} aria-label="Ảnh trước" className={`h-16 rounded-2xl bg-[#101218] border border-white/10 text-2xl active:scale-95 transition-transform ${dis}`}>⏮</button>
        <button onClick={() => cmd('TOGGLE_ROTATE')} disabled={offline} aria-label="Bật/tắt tự chuyển ảnh" className={`h-16 rounded-2xl bg-[#101218] border border-white/10 text-2xl active:scale-95 transition-transform ${dis}`}>⏯</button>
        <button onClick={() => cmd('NEXT_IMAGE')} disabled={offline} aria-label="Ảnh sau" className={`h-16 rounded-2xl bg-[#101218] border border-white/10 text-2xl active:scale-95 transition-transform ${dis}`}>⏭</button>
      </div>

      {/* Bẻ lái truy vấn */}
      <div className="px-5 mt-6 flex-1">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Chiếu nhanh chủ đề</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => sendQuery(q)}
              disabled={offline}
              className={`px-4 py-2.5 rounded-full bg-[#101218] border border-white/15 text-sm text-white/85 active:scale-95 transition-transform ${dis}`}
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={e => { e.preventDefault(); sendQuery(queryText); }}
        >
          <input
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            placeholder="Gõ chủ đề muốn chiếu…"
            aria-label="Chủ đề muốn chiếu"
            className="flex-1 rounded-2xl bg-[#101218] border border-white/15 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#e8b84b]/60"
          />
          <button type="submit" disabled={offline} className={`px-5 rounded-2xl bg-[#e8b84b] text-[#0b0c12] font-bold active:scale-95 transition-transform ${dis}`}>
            Chiếu
          </button>
        </form>
      </div>

      <p className="px-5 py-4 text-white/25 text-xs">
        Lệnh đi qua server showroom (WS). TV phải mở /slide?ws=1 (hoặc ?ws=ws://…).
      </p>
    </div>
  );
}
