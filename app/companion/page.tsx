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
import {
  CompanionToServer, ServerToCompanion, SaleCmd, parseMsg,
  WS_PING_MS, WS_PONG_TIMEOUT_MS, WS_BACKOFF_MS,
} from '@/lib/ws-protocol';

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
  const wsRef = useRef<WebSocket | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    let backoffIdx = 0;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let lastPongAt = Date.now();

    const qs = new URLSearchParams(window.location.search);
    const server = qs.get('server');
    const url = server
      ? `${server.replace(/\/$/, '')}/ws`
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    const connect = () => {
      if (disposedRef.current) return;
      setConn(backoffIdx === 0 ? 'connecting' : 'reconnecting');
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { schedule(); return; }
      wsRef.current = ws;
      ws.onopen = () => {
        backoffIdx = 0;
        lastPongAt = Date.now();
        setConn('connected');
        ws.send(JSON.stringify({ t: 'COMPANION_HELLO' } satisfies CompanionToServer));
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (Date.now() - lastPongAt > WS_PONG_TIMEOUT_MS) { try { ws.close(); } catch {} return; }
          try { ws.send(JSON.stringify({ t: 'PING' } satisfies CompanionToServer)); } catch {}
        }, WS_PING_MS);
      };
      ws.onmessage = e => {
        const msg = parseMsg<ServerToCompanion>(e.data);
        if (!msg) return;
        if (msg.t === 'PONG') { lastPongAt = Date.now(); return; }
        if (msg.t === 'TV_COUNT') setTvCount(msg.count);
        if (msg.t === 'TV_STATE') {
          setTvState({ state: msg.state, title: msg.title });
          setFrozen(msg.state === 'frozen');
        }
      };
      ws.onclose = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (!disposedRef.current) { setConn('reconnecting'); schedule(); }
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    const schedule = () => {
      const delay = WS_BACKOFF_MS[Math.min(backoffIdx++, WS_BACKOFF_MS.length - 1)];
      setTimeout(connect, delay);
    };
    connect();
    return () => {
      disposedRef.current = true;
      if (pingTimer) clearInterval(pingTimer);
      try { wsRef.current?.close(); } catch {}
    };
  }, []);

  const sendMsg = useCallback((msg: CompanionToServer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  const cmd = useCallback((c: SaleCmd) => sendMsg({ t: 'SALE_CMD', cmd: c }), [sendMsg]);

  const sendQuery = (text: string) => {
    const q = text.trim();
    if (!q) return;
    sendMsg({ t: 'OVERRIDE_QUERY', text: q });
    setQueryText('');
  };

  const STATE_VI: Record<string, string> = {
    idle: 'Chờ', listening: 'Đang nghe', querying: 'Đang tạo slide',
    frozen: 'Đóng băng', mic_error: 'Mic lỗi - chế độ tay', '—': '—',
  };

  return (
    <div className="min-h-screen bg-[#0b0c12] text-white flex flex-col" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
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
          className={`h-28 rounded-3xl font-black text-xl active:scale-95 transition-transform ${
            frozen ? 'bg-[#2E9E5B] text-white' : 'bg-[#e8b84b] text-[#0b0c12]'
          }`}
        >
          {frozen ? '▶ TIẾP TỤC' : '⏸ ĐÓNG BĂNG'}
        </button>
        <button
          onClick={() => cmd('CLEAR')}
          className="h-28 rounded-3xl bg-[#101218] border-2 border-red-400/40 text-red-300 font-black text-xl active:scale-95 transition-transform"
        >
          🗑 XOÁ SLIDE
        </button>
      </div>

      {/* Điều khiển ảnh */}
      <div className="grid grid-cols-3 gap-3 px-5 mt-4">
        <button onClick={() => cmd('PREV_IMAGE')} className="h-16 rounded-2xl bg-[#101218] border border-white/10 text-2xl active:scale-95 transition-transform">⏮</button>
        <button onClick={() => cmd('TOGGLE_ROTATE')} className="h-16 rounded-2xl bg-[#101218] border border-white/10 text-2xl active:scale-95 transition-transform">⏯</button>
        <button onClick={() => cmd('NEXT_IMAGE')} className="h-16 rounded-2xl bg-[#101218] border border-white/10 text-2xl active:scale-95 transition-transform">⏭</button>
      </div>

      {/* Bẻ lái truy vấn */}
      <div className="px-5 mt-6 flex-1">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Chiếu nhanh chủ đề</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => sendQuery(q)}
              className="px-4 py-2.5 rounded-full bg-[#101218] border border-white/15 text-sm text-white/85 active:scale-95 transition-transform"
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
            className="flex-1 rounded-2xl bg-[#101218] border border-white/15 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#e8b84b]/60"
          />
          <button type="submit" className="px-5 rounded-2xl bg-[#e8b84b] text-[#0b0c12] font-bold active:scale-95 transition-transform">
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
