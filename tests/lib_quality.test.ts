// ============================================================================
// KIỂM THỬ CHẤT LƯỢNG CÁC LIB THUẦN (chạy: bun test tests/lib_quality.test.ts)
//
// Chốt chặn hồi quy cho các bug đã từng có thật trong repo:
//   - speech.ts: '$1' không nội suy, pattern lặp chữ cái đầu ("lộ"/"cần" câm)
//   - intent.ts: includes() trần ("đánh giá cao" nhảy slide bảng giá)
//   - rag.ts: isJunkChunk xoá oan dòng số liệu
//   - units.ts: nhận diện câu hỏi rổ hàng chung
// ============================================================================
import { describe, expect, test } from 'bun:test';
import { normalizeVietnameseSpeech } from '@/lib/speech';
import { classifyAmbientIntent, hasProjectKeyword, isCompetitor, kwHit, rmDia } from '@/lib/intent';
import { isJunkChunk } from '@/lib/rag';
import { isGeneralUnsoldQuery, detectUnit } from '@/lib/units';

describe('speech: chuẩn hóa lỗi nghe nhầm STT', () => {
  const cases: [string, string][] = [
    ['cho xem cân số 5 đi', 'cho xem căn số 5 đi'],
    ['lộ số 3 giá bao nhiêu', 'lô số 3 giá bao nhiêu'],
    ['cần số bảy', 'căn số bảy'],
    ['con 4 còn không', 'căn số 4 còn không'],
    ['phố đêm ở đâu', 'phú định ở đâu'],
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" -> "${expected}"`, () => {
      expect(normalizeVietnameseSpeech(input)).toBe(expected);
    });
  }
  test('không còn "$1" literal trong output', () => {
    for (const q of ['cân số 5', 'lô 12', 'cống 2 bao nhiêu']) {
      expect(normalizeVietnameseSpeech(q)).not.toContain('$1');
    }
  });
  test('không phá câu bình thường', () => {
    expect(normalizeVietnameseSpeech('đánh giá con đường')).toBe('đánh giá con đường');
  });
});

describe('intent: cổng slide có biên từ', () => {
  test('câu hỏi giá thật -> tạo slide topic price', () => {
    const r = classifyAmbientIntent('giá bán căn này bao nhiêu vậy em');
    expect(r.shouldGenerate).toBe(true);
    expect(r.topic).toBe('price');
  });
  test('"đánh giá cao" KHÔNG nhảy slide bảng giá', () => {
    const r = classifyAmbientIntent('anh đánh giá cao chỗ này');
    expect(r.shouldGenerate).toBe(false);
  });
  test('"cho anh hỏi" KHÔNG khớp từ khóa "chợ" (bỏ dấu)', () => {
    expect(kwHit('cho anh hỏi', rmDia('cho anh hỏi'), 'chợ')).toBe(false);
  });
  test('câu vị trí + tên dự án -> topic location', () => {
    const r = classifyAmbientIntent('cho anh hỏi vị trí dự án phú định ở đâu');
    expect(r.shouldGenerate).toBe(true);
    expect(r.topic).toBe('location');
  });
  test('hasProjectKeyword / isCompetitor', () => {
    expect(hasProjectKeyword('mẫu cosmo gen 2 đẹp không')).toBe(true);
    expect(isCompetitor('so với mizuki thì sao')).toBe(true);
    expect(isCompetitor('nhà đẹp quá')).toBe(false);
  });
});

describe('rag: lọc chunk rác không xoá oan số liệu', () => {
  test('chunk có số + đơn vị luôn được giữ', () => {
    expect(isJunkChunk('### Căn 05\nDiện tích 26.5 m², giá 8,98 tỷ')).toBe(false);
    expect(isJunkChunk('| #03 | 26.5 | 8,98 |')).toBe(false);
  });
  test('chunk chỉ có markup ảnh/menu bị coi là rác', () => {
    expect(isJunkChunk('![img](https://a.com/x.png)\n![img2](https://a.com/y.png)\n---')).toBe(true);
  });
  test('câu văn xuôi >= 6 từ được giữ', () => {
    expect(isJunkChunk('Dự án được thiết kế theo phong cách hiện đại tối giản')).toBe(false);
  });
});

describe('units: nhận diện câu hỏi rổ hàng / căn cụ thể', () => {
  test('câu hỏi rổ hàng chung', () => {
    expect(isGeneralUnsoldQuery('còn căn nào chưa bán không')).toBe(true);
    expect(isGeneralUnsoldQuery('bảng giá hiện tại thế nào')).toBe(true);
    expect(isGeneralUnsoldQuery('tiện ích có gì')).toBe(false);
  });
  test('detectUnit bắt số căn', () => {
    expect(detectUnit('căn số 5 diện tích bao nhiêu')).toBe(5);
    expect(detectUnit('tiện ích nội khu có gì')).toBeNull();
  });
});
