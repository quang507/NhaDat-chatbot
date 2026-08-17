// ============================================================================
// SLIDE TRANSPORT (P1.3 + B2 - docs/PORTRAIT_75_TECHSPEC.md §3.1, §5.3)
//
// Machine phát effect START_QUERY -> transport lo phần "lấy slide về", trả kết
// quả dưới dạng EVENT (SLIDE_READY/SLIDE_SKIP/QUERY_FAILED/REFINE_READY) có seq
// - machine tự rớt event cũ, component không cần biết transport nào đang chạy.
//
//   • HttpTransport: fetch 2 pha /api/slide (Vercel hoặc server LAN) - đúng
//     logic cũ của page (interim + refine cho static_fast), chuyển ra khỏi UI.
//   • WsTransport:   nối server showroom (B2) - server orchestrate 2 pha và
//     đẩy event về; kèm heartbeat, reconnect backoff, resume slide khi nối lại,
//     nhận SALE_CMD từ Companion + PREFETCH hint.
// ============================================================================

import type { SlideData } from '@/lib/slide-types';
import { TvToServer, SaleCmd } from '@/lib/ws-protocol';
import { createReconnectingWs } from '@/lib/ws-client';

export type TransportEvent =
  | { t: 'SLIDE_READY'; seq: number; data: SlideData; interim?: boolean }
  | { t: 'SLIDE_SKIP'; seq: number; reason?: string }
  | { t: 'QUERY_FAILED'; seq: number; error: string }
  | { t: 'REFINE_READY'; seq: number; patch: Partial<SlideData> }
  | { t: 'PREFETCH'; urls: string[] }
  | { t: 'SALE_CMD'; cmd: SaleCmd; arg?: number | string }
  | { t: 'OVERRIDE_QUERY'; text: string }
  | { t: 'WS_STATUS'; status: 'connected' | 'reconnecting' };

export interface SlideTransport {
  readonly kind: 'http' | 'ws';
  query(seq: number, text: string, recent: string[]): void;
  /** TV báo trạng thái cho Companion soi (chỉ WS dùng). */
  sendState(state: string, slideId: number, title?: string): void;
  dispose(): void;
}

type OnEvent = (ev: TransportEvent) => void;
type OnDebug = (msg: string) => void;

// ── HTTP: 2 pha như cũ ──────────────────────────────────────────────────────
export function createHttpTransport(onEvent: OnEvent, onDebug: OnDebug = () => {}): SlideTransport {
  let disposed = false;
  const emit: OnEvent = ev => { if (!disposed) onEvent(ev); };

  const query = async (seq: number, text: string, recent: string[]) => {
    const t0 = Date.now();
    // PHA 2 bắn SONG SONG với pha 1 - tiết kiệm trọn một vòng mạng.
    const refinePromise = fetch('/api/slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, ambient: true, refine: true, context: { recent } }),
    }).then(r => (r.ok ? r.json() : null)).catch(() => null);

    // HIỆN TẠM: câu trả lời nhanh thường về TRƯỚC slide đầy đủ.
    let finalDone = false;
    refinePromise.then(ref => {
      if (finalDone || !ref || ref.skip || !ref.answer_text) return;
      emit({
        t: 'SLIDE_READY', seq, interim: true,
        data: {
          layout_type: 'text_only', title: "Ny'ah Phú Định", points: [],
          speech_text: ref.answer_text, answer_text: ref.answer_text,
        },
      });
    });

    try {
      const res = await fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ambient: true, context: { recent } }),
      });
      finalDone = true;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        emit({ t: 'QUERY_FAILED', seq, error: `API ${res.status}: ${body.slice(0, 120) || res.statusText}` });
        return;
      }
      const data: SlideData = await res.json();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (data.skip || !data.speech_text || !data.title || data.title.includes('Lỗi hiển thị')) {
        emit({ t: 'SLIDE_SKIP', seq, reason: (data as any).reason || `title="${data.title || ''}"` });
        return;
      }
      const nImgs = data.image_urls?.length ?? (data.image_url ? 1 : 0);
      onDebug(`🖼 Slide OK sau ${secs}s - "${data.title}", ${nImgs} ảnh, layout: ${data.layout_type || 'mặc định'}`);
      emit({ t: 'SLIDE_READY', seq, data });
      // Slide tĩnh đã hiện (~0ms) -> chờ refine chèn câu trả lời bám câu hỏi.
      if (data._source === 'static_fast') {
        const ref = await refinePromise;
        if (ref && !ref.skip && ref.answer_text) {
          emit({
            t: 'REFINE_READY', seq,
            patch: { answer_text: ref.answer_text, ...(ref.image_url ? { image_urls: [ref.image_url] } : {}) },
          });
        }
      }
    } catch (e: any) {
      finalDone = true;
      emit({ t: 'QUERY_FAILED', seq, error: String(e?.message || e) });
    }
  };

  return {
    kind: 'http',
    query: (seq, text, recent) => { void query(seq, text, recent); },
    sendState: () => {},
    dispose: () => { disposed = true; },
  };
}

// ── WS: server showroom orchestrate, client chỉ nghe event ──────────────────
export function createWsTransport(url: string, onEvent: OnEvent, onDebug: OnDebug = () => {}): SlideTransport {
  let disposed = false;
  const emit: OnEvent = ev => { if (!disposed) onEvent(ev); };

  const conn = createReconnectingWs({
    url,
    hello: { t: 'TV_HELLO' } satisfies TvToServer,
    // Server nói cùng ngôn ngữ event với machine -> chuyển thẳng.
    onMessage: msg => emit(msg as unknown as TransportEvent),
    onStatus: status => { if (status !== 'connecting') emit({ t: 'WS_STATUS', status }); },
    onDebug,
  });

  return {
    kind: 'ws',
    query: (seq, text, recent) => {
      if (!conn.send({ t: 'SPEECH', seq, text, recent } satisfies TvToServer)) {
        // WS đứt giữa chừng: trả lỗi ngay để machine quay về nghe, không treo querying.
        emit({ t: 'QUERY_FAILED', seq, error: 'Mất kết nối server showroom' });
      }
    },
    sendState: (state, slideId, title) => { conn.send({ t: 'TV_STATE', state, slideId, title } satisfies TvToServer); },
    dispose: () => { disposed = true; conn.dispose(); },
  };
}

/**
 * Chọn transport theo URL trang:
 *   /slide?ws=1            -> WS same-origin (server showroom serve app - B3)
 *   /slide?ws=ws://ip:3080 -> WS chỉ định host (app còn ở Vercel, server ở LAN)
 *   mặc định               -> HTTP (Vercel, không đổi hành vi)
 */
export function pickTransport(search: string, onEvent: OnEvent, onDebug?: OnDebug): SlideTransport {
  const qs = new URLSearchParams(search);
  const wsParam = qs.get('ws');
  if (wsParam) {
    const url = wsParam === '1'
      ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
      : `${wsParam.replace(/\/$/, '')}/ws`;
    return createWsTransport(url, onEvent, onDebug);
  }
  return createHttpTransport(onEvent, onDebug);
}
