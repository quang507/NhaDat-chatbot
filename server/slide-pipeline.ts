// ============================================================================
// SLIDE PIPELINE PHÍA SERVER (B2.2 - docs/PORTRAIT_75_TECHSPEC.md §5.3)
//
// Ở chế độ WS, server orchestrate 2 pha thay client: nhận SPEECH -> chạy pha 1
// (slide đầy đủ) SONG SONG pha 2 (refine) -> đẩy event về TV theo đúng thứ tự
// client cũ từng tự làm (interim / SLIDE_READY / REFINE_READY). Tái dùng
// nguyên khối handler app/api/slide/route.ts - không copy logic pipeline.
//
// PREFETCH: matchStaticSlide chạy ~0ms -> báo TV nạp ảnh catalog NGAY khi khách
// vừa dứt câu, trước khi LLM kịp trả lời.
// ============================================================================

import { POST as slidePost } from '../app/api/slide/route';
import { matchStaticSlide } from '../lib/static_slides';
import type { ServerToTv } from '../lib/ws-protocol';
import type { SlideData } from '../lib/slide-types';

type Emit = (msg: ServerToTv) => void;

async function callSlideApi(body: unknown): Promise<any | null> {
  try {
    const res = await slidePost(new Request('http://showroom.internal/api/slide', {
      method: 'POST',
      // x-forwarded-for cố định: rate limit của route tính theo IP - mọi truy vấn
      // WS nội bộ showroom gom về một "IP", trần mặc định của route vẫn dư sức.
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'ws-internal' },
      body: JSON.stringify(body),
    }) as any);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('[slide-pipeline] gọi handler lỗi:', e);
    return null;
  }
}

export async function runSlidePipeline(seq: number, text: string, recent: string[], emit: Emit): Promise<void> {
  // Prefetch hint tức thời từ catalog tĩnh (trước cả khi LLM chạy).
  const hit = matchStaticSlide(text, 'combo') || matchStaticSlide(text, 'general');
  if (hit?.image_urls?.length) emit({ t: 'PREFETCH', urls: hit.image_urls.slice(0, 6) });

  let finalDone = false;
  const refineP = callSlideApi({ message: text, ambient: true, refine: true, context: { recent } });

  // Câu trả lời nhanh về trước slide đầy đủ -> đẩy interim.
  refineP.then(ref => {
    if (finalDone || !ref || ref.skip || !ref.answer_text) return;
    emit({
      t: 'SLIDE_READY', seq, interim: true,
      data: {
        layout_type: 'text_only', title: "Ny'ah Phú Định", points: [],
        speech_text: ref.answer_text, answer_text: ref.answer_text,
      } as SlideData,
    });
  });

  const data = await callSlideApi({ message: text, ambient: true, context: { recent } });
  finalDone = true;
  if (!data) { emit({ t: 'QUERY_FAILED', seq, error: 'Pipeline slide lỗi (xem log server)' }); return; }
  if (data.skip || !data.speech_text || !data.title || String(data.title).includes('Lỗi hiển thị')) {
    emit({ t: 'SLIDE_SKIP', seq, reason: data.reason || `title="${data.title || ''}"` });
    return;
  }
  if (!data.layout_type) data.layout_type = 'split_image_right';
  emit({ t: 'SLIDE_READY', seq, data });

  if (data._source === 'static_fast') {
    const ref = await refineP;
    if (ref && !ref.skip && ref.answer_text) {
      emit({
        t: 'REFINE_READY', seq,
        patch: { answer_text: ref.answer_text, ...(ref.image_url ? { image_urls: [ref.image_url] } : {}) },
      });
    }
  }
}
