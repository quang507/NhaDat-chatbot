// WebSocket client tự nối lại - DÙNG CHUNG cho TV (lib/slide-transport.ts) và
// Companion (app/companion/page.tsx). Trước đây mỗi bên tự viết một bản
// heartbeat PING/PONG + pong-timeout + backoff + reconnect y hệt nhau.
//
// Backoff chỉ reset khi kết nối GIỮ ỔN ĐỊNH 10s - reset ngay tại onopen sẽ
// thành vòng reconnect 1s cố định nếu server nhận kết nối rồi rớt liền.
import { parseMsg, WS_PING_MS, WS_PONG_TIMEOUT_MS, WS_BACKOFF_MS } from '@/lib/ws-protocol';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting';

export interface ReconnectingWs {
  /** Gửi 1 message JSON. Trả false nếu socket chưa mở (message KHÔNG được xếp hàng). */
  send(msg: unknown): boolean;
  dispose(): void;
}

export function createReconnectingWs(opts: {
  url: string;
  /** Message chào gửi ngay khi nối (TV_HELLO / COMPANION_HELLO). */
  hello: unknown;
  /** Nhận message đã parse (PONG đã được nuốt ở đây, không chuyển tiếp). */
  onMessage: (msg: { t: string } & Record<string, unknown>) => void;
  onStatus?: (status: WsStatus) => void;
  onDebug?: (msg: string) => void;
}): ReconnectingWs {
  let ws: WebSocket | null = null;
  let disposed = false;
  let backoffIdx = 0;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let lastPongAt = Date.now();

  const send = (msg: unknown) => {
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); return true; }
    return false;
  };

  const schedule = () => {
    const delay = WS_BACKOFF_MS[Math.min(backoffIdx++, WS_BACKOFF_MS.length - 1)];
    setTimeout(connect, delay);
  };

  const connect = () => {
    if (disposed) return;
    opts.onStatus?.(backoffIdx === 0 ? 'connecting' : 'reconnecting');
    try { ws = new WebSocket(opts.url); } catch (e) {
      opts.onDebug?.(`🔴 WS không mở được: ${e}`);
      schedule();
      return;
    }
    ws.onopen = () => {
      const stableTimer = setTimeout(() => { backoffIdx = 0; }, 10_000);
      ws?.addEventListener('close', () => clearTimeout(stableTimer), { once: true });
      lastPongAt = Date.now();
      send(opts.hello);
      opts.onStatus?.('connected');
      opts.onDebug?.(`🔌 WS nối ${opts.url}`);
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (Date.now() - lastPongAt > WS_PONG_TIMEOUT_MS) {
          opts.onDebug?.('💔 WS mất PONG - nối lại');
          try { ws?.close(); } catch {}
          return;
        }
        send({ t: 'PING' });
      }, WS_PING_MS);
    };
    ws.onmessage = e => {
      const msg = parseMsg<{ t: string } & Record<string, unknown>>(e.data);
      if (!msg) return;
      if (msg.t === 'PONG') { lastPongAt = Date.now(); return; }
      opts.onMessage(msg);
    };
    ws.onclose = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (!disposed) { opts.onStatus?.('reconnecting'); schedule(); }
    };
    ws.onerror = () => { try { ws?.close(); } catch {} };
  };

  connect();

  return {
    send,
    dispose: () => {
      disposed = true;
      if (pingTimer) clearInterval(pingTimer);
      try { ws?.close(); } catch {}
    },
  };
}
