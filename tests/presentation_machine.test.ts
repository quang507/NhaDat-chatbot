// Unit test presentation machine (P1.2) - chạy: bun test tests/presentation_machine.test.ts
// Tập trung vào các RACE có thật từng phải vá tay trong page cũ:
//   - refine về sau khi slide đã đổi (slideKeyRef cũ)
//   - STT bắn lại nguyên văn cùng câu trong 8s (lastQueryRef cũ)
//   - kết quả seq cũ về sau khi Sale đã CLEAR
//   - lỗi pha 1 phải xoá dấu câu cũ để nhắc lại là chạy ngay
//   - FREEZE giữa lúc querying: slide vẫn hiện nhưng không tự bật nghe

import { describe, expect, test } from 'bun:test';
import {
  initialCtx, transition, MachineCtx, MachineEvent, MachineEffect,
  DUPLICATE_WINDOW_MS, SESSION_IDLE_MS,
} from '../lib/presentation-machine';
import type { SlideData } from '../lib/slide-types';

const slide = (title: string, extra: Partial<SlideData> = {}): SlideData => ({
  title, points: [], speech_text: title, image_urls: [], ...extra,
});

// Câu chắc chắn qua cổng intent (khớp catalog vị trí dự án).
const GOOD_QUERY = 'cho xem vị trí dự án đi';

function run(ctx: MachineCtx, evs: MachineEvent[]): { ctx: MachineCtx; effects: MachineEffect[] } {
  const all: MachineEffect[] = [];
  for (const ev of evs) {
    const r = transition(ctx, ev);
    ctx = r.ctx;
    all.push(...r.effects);
  }
  return { ctx, effects: all };
}

const effTypes = (effs: MachineEffect[]) => effs.map(e => e.type);

describe('vòng đời cơ bản', () => {
  test('MIC_ON -> nghe; SPEECH hợp lệ -> querying + START_QUERY', () => {
    const { ctx, effects } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
    ]);
    expect(ctx.state).toBe('querying');
    expect(ctx.querySeq).toBe(1);
    const q = effects.find(e => e.type === 'START_QUERY') as any;
    expect(q).toBeTruthy();
    expect(q.text).toBe(GOOD_QUERY);
    expect(q.recent).toEqual([]); // ngữ cảnh gửi đi là TRƯỚC câu hiện tại
    expect(ctx.recent).toEqual([GOOD_QUERY]);
  });

  test('SLIDE_READY đúng seq -> hiện slide + quay lại nghe', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
    ]);
    const r = transition(ctx, { type: 'SLIDE_READY', seq: 1, data: slide('Vị trí dự án') });
    expect(r.ctx.state).toBe('listening');
    expect(r.ctx.slide?.title).toBe('Vị trí dự án');
    expect(r.ctx.slideId).toBe(1);
    expect(effTypes(r.effects)).toContain('START_LISTENING');
    expect(effTypes(r.effects)).toContain('RECORD_SHOWN');
  });
});

describe('race pha 2 (refine)', () => {
  function tocSlide1(): MachineCtx {
    return run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SLIDE_READY', seq: 1, data: slide('Slide 1') },
    ]).ctx;
  }

  test('refine đúng slide -> chèn answer_text', () => {
    const r = transition(tocSlide1(), { type: 'REFINE_READY', seq: 1, patch: { answer_text: 'Dạ đúng ạ' } });
    expect(r.ctx.slide?.answer_text).toBe('Dạ đúng ạ');
  });

  test('refine về SAU khi khách đã sang slide khác -> BỎ, không đè', () => {
    let ctx = tocSlide1();
    // Khách hỏi tiếp -> slide 2 (dùng câu khác đủ mạnh qua intent)
    ({ ctx } = run(ctx, [
      { type: 'SPEECH', text: 'tiến độ thi công dự án tới đâu rồi', now: 60_000 },
      { type: 'SLIDE_READY', seq: 2, data: slide('Slide 2') },
    ]));
    expect(ctx.slide?.title).toBe('Slide 2');
    // Refine của truy vấn 1 mới lết về
    const r = transition(ctx, { type: 'REFINE_READY', seq: 1, patch: { answer_text: 'CŨ RÍCH' } });
    expect(r.ctx.slide?.answer_text).toBeUndefined();
    expect(r.ctx.slide?.title).toBe('Slide 2');
  });

  test('interim về trước, slide đầy đủ thay thế sau - vẫn nhận refine theo seq', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SLIDE_READY', seq: 1, interim: true, data: slide("Ny'ah Phú Định", { answer_text: 'Trả lời nhanh' }) },
    ]);
    expect(ctx.state).toBe('querying'); // interim KHÔNG kết thúc truy vấn
    expect(ctx.slide?.answer_text).toBe('Trả lời nhanh');
    ({ ctx } = run(ctx, [{ type: 'SLIDE_READY', seq: 1, data: slide('Slide đầy đủ') }]));
    expect(ctx.state).toBe('listening');
    expect(ctx.slide?.title).toBe('Slide đầy đủ');
    const r = transition(ctx, { type: 'REFINE_READY', seq: 1, patch: { answer_text: 'Bám câu hỏi' } });
    expect(r.ctx.slide?.answer_text).toBe('Bám câu hỏi');
  });
});

describe('cổng chống lặp 8s', () => {
  test('cùng câu trong 8s -> bỏ; quá 8s -> chạy lại', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SLIDE_READY', seq: 1, data: slide('S1') },
    ]);
    // Lặp trong 8s
    let r = transition(ctx, { type: 'SPEECH', text: GOOD_QUERY, now: 1000 + DUPLICATE_WINDOW_MS - 1 });
    expect(r.ctx.state).toBe('listening');
    expect(effTypes(r.effects)).not.toContain('START_QUERY');
    expect(effTypes(r.effects)).toContain('START_LISTENING'); // mic phải mở lại
    // Quá 8s
    r = transition(ctx, { type: 'SPEECH', text: GOOD_QUERY, now: 1000 + DUPLICATE_WINDOW_MS + 1 });
    expect(r.ctx.state).toBe('querying');
  });

  test('QUERY_FAILED xoá dấu câu cũ -> nhắc lại nguyên văn là chạy ngay', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'QUERY_FAILED', seq: 1, error: 'API 500' },
    ]);
    expect(ctx.state).toBe('listening');
    const r = transition(ctx, { type: 'SPEECH', text: GOOD_QUERY, now: 2000 }); // trong 8s
    expect(r.ctx.state).toBe('querying'); // KHÔNG bị cổng lặp giữ
  });
});

describe('Sale điều khiển', () => {
  test('FREEZE giữa querying: slide về vẫn hiện nhưng KHÔNG tự bật nghe', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SALE_FREEZE' },
    ]);
    expect(ctx.state).toBe('frozen');
    const r = transition(ctx, { type: 'SLIDE_READY', seq: 1, data: slide('S1') });
    expect(r.ctx.slide?.title).toBe('S1');
    expect(r.ctx.state).toBe('frozen');
    expect(effTypes(r.effects)).not.toContain('START_LISTENING');
  });

  test('CLEAR vô hiệu truy vấn đang bay - kết quả về không đè màn đã xoá', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SALE_CLEAR' },
    ]);
    expect(ctx.slide).toBeNull();
    expect(ctx.state).toBe('listening');
    const r = transition(ctx, { type: 'SLIDE_READY', seq: 1, data: slide('S1') }); // seq đã cũ
    expect(r.ctx.slide).toBeNull();
  });

  test('OVERRIDE_QUERY bỏ qua cổng intent (câu tự do vẫn chạy)', () => {
    const { ctx, effects } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SALE_OVERRIDE_QUERY', text: 'xyz abc', now: 1000 },
    ]);
    expect(ctx.state).toBe('querying');
    expect(effTypes(effects)).toContain('START_QUERY');
  });
});

describe('phiên khách', () => {
  test('im lặng quá 5 phút -> câu mới chốt sổ phiên cũ + xoá ngữ cảnh', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SLIDE_READY', seq: 1, data: slide('S1') },
    ]);
    const later = 1000 + SESSION_IDLE_MS + 1000;
    const r = transition(ctx, { type: 'SPEECH', text: 'tiến độ thi công dự án tới đâu rồi', now: later });
    expect(effTypes(r.effects)).toContain('FLUSH_SESSION');
    const q = r.effects.find(e => e.type === 'START_QUERY') as any;
    expect(q.recent).toEqual([]); // ngữ cảnh khách cũ không lây sang khách mới
  });

  test('SESSION_TIMEOUT -> về màn chờ + chốt sổ', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SLIDE_READY', seq: 1, data: slide('S1') },
    ]);
    const r = transition(ctx, { type: 'SESSION_TIMEOUT' });
    expect(r.ctx.slide).toBeNull();
    expect(r.ctx.recent).toEqual([]);
    expect(effTypes(r.effects)).toContain('FLUSH_SESSION');
  });
});

describe('same-slide & resume', () => {
  test('server trả đúng slide đang hiện -> patch tại chỗ, KHÔNG đổi slideId', () => {
    let { ctx } = run(initialCtx(), [
      { type: 'MIC_ON' },
      { type: 'SPEECH', text: GOOD_QUERY, now: 1000 },
      { type: 'SLIDE_READY', seq: 1, data: slide('S1', { image_urls: ['/a.jpg'] }) },
    ]);
    const idBefore = ctx.slideId;
    ({ ctx } = run(ctx, [
      { type: 'SPEECH', text: 'tiến độ thi công dự án tới đâu rồi', now: 60_000 },
      { type: 'SLIDE_READY', seq: 2, data: slide('S1', { image_urls: ['/a.jpg'], answer_text: 'Cập nhật' }) },
    ]));
    expect(ctx.slideId).toBe(idBefore); // không remount lớp
    expect(ctx.slide?.answer_text).toBe('Cập nhật');
  });

  test('resume seq=-1 áp slide nhưng không đổi trạng thái nghe', () => {
    const r = transition(initialCtx(), { type: 'SLIDE_READY', seq: -1, data: slide('Resume') });
    expect(r.ctx.slide?.title).toBe('Resume');
    expect(r.ctx.state).toBe('idle');
    expect(effTypes(r.effects)).not.toContain('START_LISTENING');
  });
});
