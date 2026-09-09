// Unit test phần thuần của tab Sale (lib/sale-monitor.ts) - chạy: bun test tests/sale_monitor.test.ts
// Mục tiêu: mọi chip "nói tiếp" bấm là PHẢI ra slide (qua cổng intent hoặc catalog),
// và phân tích câu nghe phải cho cùng kết luận với cổng trong presentation-machine.

import { describe, expect, test } from 'bun:test';
import {
  TOPIC_GUIDE, TOPIC_ORDER, analyzeUtterance, catalogIndex, searchCatalog,
  suggestNextTopics, topicKeywords,
} from '../lib/sale-monitor';
import { initialCtx, transition } from '../lib/presentation-machine';

describe('analyzeUtterance - khớp cổng của machine', () => {
  const cases = [
    'cho xem vị trí dự án đi',
    'ừ đúng rồi',
    'bên vinhomes giá tốt hơn',
    'căn này thanh toán mấy đợt',
    'nhà có thang máy không em',
    'anh muốn đầu tư',
    'tiến độ tới đâu rồi',
  ];
  for (const text of cases) {
    test(`"${text}"`, () => {
      const a = analyzeUtterance(text);
      // Machine đang nghe: START_QUERY chỉ phát khi câu qua cổng.
      const r = transition({ ...initialCtx(), state: 'listening' }, { type: 'SPEECH', text, now: 10_000 });
      const machineQueried = r.effects.some(e => e.type === 'START_QUERY');
      expect(a.verdict !== 'skip').toBe(machineQueried);
    });
  }

  test('câu chêm -> skip kèm lý do tiếng Việt', () => {
    const a = analyzeUtterance('dạ vâng');
    expect(a.verdict).toBe('skip');
    expect(a.why.length).toBeGreaterThan(0);
  });

  test('từ chung chung đơn độc -> weak_signal, hiện hits để Sale thấy', () => {
    const a = analyzeUtterance('anh muốn đầu tư');
    expect(a.intent.reason).toBe('weak_signal');
    expect(a.intent.hits).toContain('đầu tư');
  });
});

describe('TOPIC_GUIDE - chip nào bấm cũng ra slide', () => {
  for (const topic of TOPIC_ORDER) {
    for (const s of TOPIC_GUIDE[topic].next) {
      test(`${topic}: "${s.query}"`, () => {
        // Sale bấm chip = SALE_OVERRIDE_QUERY (force) -> luôn truy vấn; nhưng câu
        // phải tự qua được cổng intent/catalog để server có thứ mà trả.
        expect(analyzeUtterance(s.query).verdict).not.toBe('skip');
      });
    }
  }
});

describe('suggestNextTopics', () => {
  test('bỏ slide đã chiếu', () => {
    const all = suggestNextTopics('price', []);
    expect(all.length).toBeGreaterThan(0);
    const first = all[0];
    const shownTitle = (() => {
      const { matchStaticSlide } = require('../lib/static_slides');
      const hit = matchStaticSlide(first.query, 'combo') || matchStaticSlide(first.query, 'general');
      return hit?.title as string;
    })();
    expect(shownTitle).toBeTruthy();
    const after = suggestNextTopics('price', [shownTitle]);
    expect(after.some(s => s.query === first.query)).toBe(false);
  });

  test('topic null -> gợi ý chung', () => {
    expect(suggestNextTopics(null, []).length).toBeGreaterThan(0);
  });

  test('topic hẹp hết gợi ý -> bù bằng general', () => {
    const { matchStaticSlide } = require('../lib/static_slides');
    const shown = TOPIC_GUIDE.legal.next
      .map(s => (matchStaticSlide(s.query, 'combo') || matchStaticSlide(s.query, 'general'))?.title)
      .filter(Boolean) as string[];
    const out = suggestNextTopics('legal', shown, 6);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some(s => TOPIC_GUIDE.general.next.some(g => g.query === s.query))).toBe(true);
  });
});

describe('topicKeywords / catalog', () => {
  test('từ mạnh xếp trước', () => {
    const kws = topicKeywords('price');
    const firstWeak = kws.findIndex(k => !k.strong);
    const lastStrong = kws.map(k => k.strong).lastIndexOf(true);
    expect(firstWeak === -1 || lastStrong < firstWeak).toBe(true);
  });

  test('catalogIndex bỏ entry không keyword, không trùng title', () => {
    const idx = catalogIndex();
    expect(idx.length).toBeGreaterThan(30);
    expect(new Set(idx.map(e => e.title)).size).toBe(idx.length);
    expect(idx.every(e => e.query.length > 0)).toBe(true);
  });

  test('searchCatalog tìm theo từ khóa lẫn tiêu đề', () => {
    expect(searchCatalog('thang máy').some(e => e.title.includes('Thang máy'))).toBe(true);
    expect(searchCatalog('Pháp lý').length).toBeGreaterThan(0);
    expect(searchCatalog('')).toEqual([]);
  });
});
