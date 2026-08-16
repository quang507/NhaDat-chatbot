// ============================================================================
// PRESENTATION MACHINE (P1 - docs/PORTRAIT_75_TECHSPEC.md §3.1)
//
// TOÀN BỘ trạng thái nghiệp vụ của màn trình chiếu /slide nằm ở đây, dưới dạng
// một state machine THUẦN TS (không import React) - unit-test được bằng
// `bun test tests/presentation_machine.test.ts`.
//
// Thay thế rừng cờ ref cũ trong app/slide/page.tsx:
//   isGeneratingRef      -> state === 'querying'
//   lastQueryRef (8s)    -> guard chống lặp trong handleSpeech (một chỗ duy nhất)
//   pha1Xong+slideKeyRef -> seq: mọi event truy vấn mang seq; event cũ tự rớt
//   lastSlideRef         -> ctx.lastSlideMeta
//   recentRef/idle timer -> ctx.recent + SESSION_TIMEOUT
//
// transition() trả về context mới + danh sách EFFECT (lệnh cho adapter React
// thực thi: gọi transport, bật/tắt mic, chốt sổ phiên...). Machine không tự
// làm side-effect nào.
// ============================================================================

import { classifyAmbientIntent, shouldRefreshSlide, IntentTopic } from '@/lib/intent';
import { matchStaticSlide } from '@/lib/static_slides';
import type { SlideData } from '@/lib/slide-types';
import { RESUME_SEQ } from '@/lib/ws-protocol';

export const DUPLICATE_WINDOW_MS = 8_000;
export const SESSION_IDLE_MS = 5 * 60 * 1000;

export const TOPIC_LABELS: Record<string, string> = {
  price: 'Giá & Thanh toán',
  location: 'Vị trí & Đường đi',
  unit: 'Không gian & Công năng',
  legal: 'Pháp lý & Tiến độ',
  amenity: 'Tiện ích',
  design: 'Thiết kế & Nội thất',
  general: "Dự án Ny'ah Phú Định",
};

export type MachineState =
  | 'idle'       // mic tắt, màn chờ (attract)
  | 'listening'  // đang nghe ngầm
  | 'querying'   // đang tạo slide (RAG/LLM)
  | 'frozen'     // Sale đóng băng (SALE_FREEZE)
  | 'mic_error'; // mic chết hẳn -> chế độ điều khiển tay

export interface MachineCtx {
  state: MachineState;
  slide: SlideData | null;
  /** Tăng khi slide THAY (không tăng khi patch tại chỗ) - SlideStage dùng làm key lớp. */
  slideId: number;
  /** seq truy vấn đã sinh ra slide hiện tại - guard cho REFINE_READY. */
  slideSeq: number;
  /** seq truy vấn mới nhất đã phát - event mang seq cũ hơn tự rớt. */
  querySeq: number;
  lastQuery: { text: string; at: number };
  lastSlideMeta: { topic: IntentTopic | null; detail?: string; at: number };
  lastUtteranceAt: number;
  /** Ngữ cảnh hội thoại gửi kèm truy vấn (tối đa 10 câu). */
  recent: string[];
  topicLabel: string;
  heardText: string;
  /** Ghi chú lỗi gần nhất - chỉ hiện cho Sale/debug, không chen vào màn khách. */
  errorNote: string;
  micFatal: string;
}

export type MachineEvent =
  | { type: 'MIC_ON' }
  | { type: 'MIC_OFF' }
  | { type: 'SPEECH'; text: string; now: number }
  | { type: 'SLIDE_READY'; seq: number; data: SlideData; interim?: boolean }
  | { type: 'SLIDE_SKIP'; seq: number; reason?: string }
  | { type: 'QUERY_FAILED'; seq: number; error: string }
  | { type: 'REFINE_READY'; seq: number; patch: Partial<SlideData> }
  | { type: 'SALE_FREEZE' }
  | { type: 'SALE_RESUME' }
  | { type: 'SALE_CLEAR' }
  | { type: 'SALE_OVERRIDE_QUERY'; text: string; now: number }
  | { type: 'SESSION_TIMEOUT' }
  | { type: 'MIC_FATAL'; message: string };

export type MachineEffect =
  | { type: 'START_QUERY'; seq: number; text: string; recent: string[] }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_VOICE' }
  | { type: 'FLUSH_SESSION' }
  | { type: 'RECORD_SHOWN'; query: string; title: string }
  | { type: 'ARM_IDLE_TIMER' }
  | { type: 'DEBUG'; message: string };

export interface TransitionResult {
  ctx: MachineCtx;
  effects: MachineEffect[];
}

export function initialCtx(): MachineCtx {
  return {
    state: 'idle',
    slide: null,
    slideId: 0,
    slideSeq: 0,
    querySeq: 0,
    lastQuery: { text: '', at: 0 },
    lastSlideMeta: { topic: null, at: 0 },
    lastUtteranceAt: 0,
    recent: [],
    topicLabel: '',
    heardText: '',
    errorNote: '',
    micFatal: '',
  };
}

const imgsOf = (s: SlideData | null) =>
  (s?.image_urls?.length ? s.image_urls : s?.image_url ? [s.image_url] : []).join('|');

/** Cùng title + cùng bộ ảnh = cùng slide -> cập nhật tại chỗ, không remount lớp. */
export const isSameSlide = (a: SlideData | null, b: SlideData) =>
  !!a && a.title === b.title && imgsOf(a) === imgsOf(b);

const keep = (ctx: MachineCtx, effects: MachineEffect[] = []): TransitionResult => ({ ctx, effects });

// ── Xử lý một câu nói (SPEECH hoặc SALE_OVERRIDE_QUERY) ─────────────────────
// force=true (Sale gõ/bấm từ khoá): bỏ qua cổng intent + cổng chống lặp.
function handleSpeech(ctx: MachineCtx, text: string, now: number, force: boolean): TransitionResult {
  const effects: MachineEffect[] = [{ type: 'ARM_IDLE_TIMER' }];
  // Câu bị bỏ qua khi đang nghe -> vẫn phải MỞ LẠI vòng nghe (backToListening cũ):
  // engine STT chốt câu xong là dừng, không nhắc thì mic "câm".
  const resumeFx: MachineEffect[] = ctx.state === 'listening' ? [{ type: 'START_LISTENING' }] : [];
  const query = text.trim();
  if (!query) return keep(ctx, [...effects, ...resumeFx]);

  if (ctx.state === 'querying') {
    effects.push({ type: 'DEBUG', message: '⏳ Đang tạo slide, bỏ qua câu mới' });
    return keep(ctx, effects);
  }
  if (ctx.state === 'idle' || ctx.state === 'frozen' || ctx.state === 'mic_error') {
    // Mic tắt/đóng băng: câu nói (nếu có lọt vào) không sinh truy vấn.
    if (!force) return keep(ctx, effects);
  }

  if (!force) {
    // Cổng chống lặp: STT hay bắn lại NGUYÊN VĂN cùng một câu khi restart engine.
    if (query === ctx.lastQuery.text && now - ctx.lastQuery.at < DUPLICATE_WINDOW_MS) {
      effects.push({ type: 'DEBUG', message: '🔁 Bỏ qua câu lặp y hệt trong 8s' });
      return keep(ctx, [...effects, ...resumeFx]);
    }
    // Cổng intent + fallback catalog slide tĩnh (giữ nguyên logic cũ của page).
    let intent = classifyAmbientIntent(query);
    if (!intent.shouldGenerate) {
      const catalogHit = matchStaticSlide(query, 'combo') || matchStaticSlide(query, 'general');
      if (catalogHit) {
        effects.push({ type: 'DEBUG', message: `📚 Catalog khớp "${catalogHit.title}" - cho qua dù intent ${intent.reason}` });
        intent = { ...intent, shouldGenerate: true, topic: intent.topic || 'general', reason: 'has_project_topic' };
      } else {
        effects.push({ type: 'DEBUG', message: `🚫 Intent BỎ QUA - lý do: ${intent.reason}, topic: ${intent.topic || '-'}` });
        return keep(ctx, [...effects, ...resumeFx]);
      }
    }
    if (!shouldRefreshSlide(intent, ctx.lastSlideMeta, now)) {
      effects.push({ type: 'DEBUG', message: '⏱ Giữ slide cũ (chưa đủ thời gian đổi)' });
      return keep(ctx, [...effects, ...resumeFx]);
    }
    ctx = { ...ctx, lastSlideMeta: { topic: intent.topic || null, detail: intent.detail, at: now } };
    const label = TOPIC_LABELS[intent.topic || 'general'] || TOPIC_LABELS.general;
    ctx = { ...ctx, topicLabel: label };
  } else {
    ctx = { ...ctx, topicLabel: ctx.topicLabel || TOPIC_LABELS.general };
  }

  // Khách im lặng quá hạn = KHÁCH MỚI: chốt sổ phiên cũ + xoá ngữ cảnh trước khi hỏi.
  let recent = ctx.recent;
  if (now - ctx.lastUtteranceAt > SESSION_IDLE_MS && recent.length) {
    effects.push({ type: 'FLUSH_SESSION' }, { type: 'DEBUG', message: '👤 Khách mới (im lặng >5 phút) - chốt sổ phiên cũ, xoá ngữ cảnh' });
    recent = [];
  }
  const seq = ctx.querySeq + 1;
  // recent gửi đi là ngữ cảnh TRƯỚC câu hiện tại (giữ đúng hành vi cũ).
  effects.push(
    { type: 'DEBUG', message: `🎙 Nghe: "${query.slice(0, 60)}"` },
    { type: 'START_QUERY', seq, text: query, recent },
  );
  return keep({
    ...ctx,
    state: 'querying',
    querySeq: seq,
    lastQuery: { text: query, at: now },
    lastUtteranceAt: now,
    recent: [...recent, query].slice(-10),
    heardText: query,
  }, effects);
}

// ── Bảng chuyển trạng thái ─────────────────────────────────────────────────
export function transition(ctx: MachineCtx, ev: MachineEvent): TransitionResult {
  switch (ev.type) {
    case 'MIC_ON':
      if (ctx.state === 'listening' || ctx.state === 'querying') return keep(ctx);
      return keep({ ...ctx, state: 'listening', micFatal: '', errorNote: '' }, [{ type: 'START_LISTENING' }]);

    case 'MIC_OFF':
      return keep({ ...ctx, state: 'idle', topicLabel: '', heardText: '' }, [{ type: 'STOP_VOICE' }]);

    case 'SPEECH':
      return handleSpeech(ctx, ev.text, ev.now, false);

    case 'SALE_OVERRIDE_QUERY':
      return handleSpeech(ctx, ev.text, ev.now, true);

    case 'SLIDE_READY': {
      // Resume từ server (WS reconnect) - áp slide nhưng KHÔNG đụng trạng thái nghe.
      if (ev.seq === RESUME_SEQ) {
        if (isSameSlide(ctx.slide, ev.data)) return keep(ctx);
        return keep({ ...ctx, slide: ev.data, slideId: ctx.slideId + 1, slideSeq: ctx.querySeq });
      }
      if (ev.seq !== ctx.querySeq) {
        return keep(ctx, [{ type: 'DEBUG', message: `🗑 Bỏ slide seq cũ ${ev.seq} (hiện tại ${ctx.querySeq})` }]);
      }
      if (ev.interim) {
        // Câu trả lời nhanh về TRƯỚC slide đầy đủ - hiện tạm, vẫn đang querying.
        if (ctx.state !== 'querying') return keep(ctx);
        return keep(
          { ...ctx, slide: ev.data, slideId: ctx.slideId + 1, slideSeq: ev.seq },
          [{ type: 'DEBUG', message: '⚡ Câu trả lời nhanh về trước slide - hiện tạm' }],
        );
      }
      const data: SlideData = { ...ev.data, layout_type: ev.data.layout_type || 'split_image_right' };
      const effects: MachineEffect[] = [
        { type: 'RECORD_SHOWN', query: ctx.lastQuery.text, title: data.title },
      ];
      let next: MachineCtx;
      if (isSameSlide(ctx.slide, data)) {
        // CHỐNG GIẬT: trùng slide đang hiện -> cập nhật tại chỗ, không đổi slideId.
        effects.push({ type: 'DEBUG', message: '♻️ Trùng slide đang hiện - cập nhật tại chỗ' });
        next = {
          ...ctx,
          slide: {
            ...ctx.slide!,
            ...(data.answer_text ? { answer_text: data.answer_text } : {}),
            speech_text: data.speech_text || ctx.slide!.speech_text,
          },
          slideSeq: ev.seq,
        };
      } else {
        next = { ...ctx, slide: data, slideId: ctx.slideId + 1, slideSeq: ev.seq };
      }
      // Đang frozen (Sale đóng băng giữa chừng) thì hiện slide nhưng KHÔNG bật nghe lại.
      if (ctx.state === 'querying') {
        next = { ...next, state: 'listening' };
        effects.push({ type: 'START_LISTENING' });
      }
      return keep(next, effects);
    }

    case 'SLIDE_SKIP': {
      if (ev.seq !== ctx.querySeq || ctx.state !== 'querying') return keep(ctx);
      return keep(
        { ...ctx, state: 'listening', topicLabel: '', heardText: '' },
        [
          { type: 'DEBUG', message: `⚪ Server SKIP - ${ev.reason || 'không đủ dữ liệu'}` },
          { type: 'START_LISTENING' },
        ],
      );
    }

    case 'QUERY_FAILED': {
      if (ev.seq !== ctx.querySeq || ctx.state !== 'querying') return keep(ctx);
      // Xoá dấu "câu vừa xử lý" để khách/Sale NHẮC LẠI nguyên văn là chạy ngay.
      return keep(
        { ...ctx, state: 'listening', lastQuery: { text: '', at: 0 }, errorNote: ev.error },
        [
          { type: 'DEBUG', message: `🔴 Lỗi tạo slide: ${ev.error.slice(0, 120)}` },
          { type: 'START_LISTENING' },
        ],
      );
    }

    case 'REFINE_READY': {
      // Chỉ chèn khi slide hiện tại vẫn là slide của đúng truy vấn đó.
      if (!ctx.slide || ev.seq !== ctx.slideSeq) {
        return keep(ctx, [{ type: 'DEBUG', message: '🗑 Bỏ refine - slide đã đổi' }]);
      }
      return keep(
        { ...ctx, slide: { ...ctx.slide, ...ev.patch } },
        [{ type: 'DEBUG', message: `✨ Refine chèn câu trả lời${ev.patch.image_urls ? ' + SỬA ẢNH' : ''}` }],
      );
    }

    case 'SALE_FREEZE': {
      if (ctx.state !== 'listening' && ctx.state !== 'querying') return keep(ctx);
      return keep({ ...ctx, state: 'frozen' }, [{ type: 'STOP_VOICE' }, { type: 'DEBUG', message: '⏸ Sale đóng băng' }]);
    }

    case 'SALE_RESUME': {
      if (ctx.state !== 'frozen') return keep(ctx);
      return keep({ ...ctx, state: 'listening' }, [{ type: 'START_LISTENING' }, { type: 'DEBUG', message: '▶️ Sale mở lại' }]);
    }

    case 'SALE_CLEAR': {
      // Rút slide + vô hiệu truy vấn đang bay (tăng seq) để kết quả về không đè lên
      // màn Sale vừa xoá. Đang querying -> quay về nghe.
      const next: MachineCtx = {
        ...ctx,
        slide: null,
        topicLabel: '',
        heardText: '',
        querySeq: ctx.querySeq + 1,
        state: ctx.state === 'querying' ? 'listening' : ctx.state,
      };
      const effects: MachineEffect[] = [{ type: 'DEBUG', message: '🗑 Sale xoá slide' }];
      if (ctx.state === 'querying') effects.push({ type: 'START_LISTENING' });
      return keep(next, effects);
    }

    case 'SESSION_TIMEOUT':
      // Khách rời đi: chốt sổ + trả màn về attract. Giữ nguyên trạng thái mic.
      return keep(
        {
          ...ctx,
          slide: null,
          topicLabel: '',
          heardText: '',
          recent: [],
          lastQuery: { text: '', at: 0 },
          lastSlideMeta: { topic: null, at: 0 },
          querySeq: ctx.querySeq + 1,
          state: ctx.state === 'querying' ? 'listening' : ctx.state,
        },
        [
          { type: 'FLUSH_SESSION' },
          { type: 'DEBUG', message: '🌙 Im lặng 5 phút - chốt sổ phiên, về màn chờ' },
        ],
      );

    case 'MIC_FATAL':
      return keep(
        { ...ctx, state: 'mic_error', micFatal: ev.message },
        [{ type: 'STOP_VOICE' }, { type: 'DEBUG', message: `⛔ Mic chết: ${ev.message}` }],
      );

    default:
      return keep(ctx);
  }
}
