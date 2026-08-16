// ============================================================================
// GIAO THỨC WEBSOCKET SHOWROOM (B2 - docs/PORTRAIT_75_TECHSPEC.md §5.3)
//
// Nguyên tắc: WS chở SỰ KIỆN JSON - ảnh KHÔNG đi qua WS (ảnh là static file
// HTTP có cache; WS chỉ gửi URL để TV prefetch). Message WS trùng khớp event
// của presentation machine nên không cần tầng dịch.
//
// Dùng chung 3 phía: TV (lib/slide-transport.ts), Companion (app/companion),
// server showroom (server/index.ts).
//
// MỘT endpoint WS duy nhất `/ws` - client phân vai bằng message đầu tiên
// (TV_HELLO / COMPANION_HELLO). Không tách 2 route để router không có cửa
// nhầm upgrade vào catch-all HTTP.
// ============================================================================

import type { SlideData } from '@/lib/slide-types';

/** Nhịp heartbeat client -> server. */
export const WS_PING_MS = 10_000;
/** Quá hạn không nhận PONG -> coi là đứt, reconnect. */
export const WS_PONG_TIMEOUT_MS = 25_000;
/** Bậc thang backoff reconnect (ms). */
export const WS_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
/** seq đặc biệt: server đẩy lại slide hiện hành khi TV (re)connect. */
export const RESUME_SEQ = -1;

// ── Server -> TV ────────────────────────────────────────────────────────────
export type SaleCmd =
  | 'FREEZE' | 'RESUME' | 'CLEAR'
  | 'PREV_IMAGE' | 'NEXT_IMAGE' | 'TOGGLE_ROTATE' | 'PICK_IMAGE';

export type ServerToTv =
  | { t: 'SLIDE_READY'; seq: number; data: SlideData; interim?: boolean }
  | { t: 'SLIDE_SKIP'; seq: number; reason?: string }
  | { t: 'QUERY_FAILED'; seq: number; error: string }
  | { t: 'REFINE_READY'; seq: number; patch: Partial<SlideData> }
  | { t: 'PREFETCH'; urls: string[] }
  | { t: 'SALE_CMD'; cmd: SaleCmd; arg?: number | string }
  | { t: 'OVERRIDE_QUERY'; text: string }
  | { t: 'PONG' };

// ── TV -> Server ────────────────────────────────────────────────────────────
export type TvToServer =
  | { t: 'TV_HELLO' }
  | { t: 'SPEECH'; seq: number; text: string; recent: string[] }
  | { t: 'TV_STATE'; state: string; slideId: number; title?: string }
  | { t: 'PING' };

// ── Companion -> Server (relay nguyên văn xuống TV) ─────────────────────────
export type CompanionToServer =
  | { t: 'COMPANION_HELLO' }
  | { t: 'SALE_CMD'; cmd: SaleCmd; arg?: number | string }
  | { t: 'OVERRIDE_QUERY'; text: string }
  | { t: 'PING' };

// ── Server -> Companion ─────────────────────────────────────────────────────
export type ServerToCompanion =
  | { t: 'TV_STATE'; state: string; slideId: number; title?: string }
  | { t: 'TV_COUNT'; count: number }
  | { t: 'PONG' };

export function parseMsg<T>(raw: unknown): T | null {
  try {
    const s = typeof raw === 'string' ? raw : String(raw);
    const o = JSON.parse(s);
    return o && typeof o.t === 'string' ? (o as T) : null;
  } catch {
    return null;
  }
}
