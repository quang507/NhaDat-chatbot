// Tra cứu thông tin TỪNG CĂN (1-50) cho cả chat bot lẫn slide bot.
// Nguồn: sơ đồ phân lô chính thức + datasheet mẫu nhà Ny'ah Phú Định.
// Mục tiêu: khi khách hỏi "tính năng / diện tích / mặt tiền căn X", bot luôn trả lời
// ĐÚNG mẫu nhà + số liệu, kèm tính năng của mẫu nhà đó (không phụ thuộc may rủi của RAG).

export type ModelKey = 'opus' | 'fusion_gen_5' | 'cosmo_gen_2' | 'signature';

// Diện tích đất (m²) đọc từ sơ đồ phân lô chính thức.
const AREA: Record<number, number> = {
  1: 67.24, 2: 65.15, 3: 49.37, 4: 43.32, 5: 43.70, 6: 43.82, 7: 43.94, 8: 44.10, 9: 44.17, 10: 44.32,
  11: 44.51, 12: 44.73, 13: 44.94, 14: 54.96, 15: 77.46, 16: 74.68, 17: 71.89, 18: 55.51, 19: 65.92, 20: 61.80,
  21: 67.51, 22: 73.91, 23: 69.61, 24: 73.52, 25: 64.56, 26: 91.83, 27: 49.24, 28: 47.27, 29: 45.35, 30: 44.52,
  31: 44.28, 32: 44.04, 33: 43.80, 34: 43.59, 35: 43.33, 36: 43.11, 37: 47.12, 38: 43.75, 39: 43.75, 40: 43.75,
  41: 43.75, 42: 43.76, 43: 55.87, 44: 55.87, 45: 43.75, 46: 43.75, 47: 43.75, 48: 43.75, 49: 43.75, 50: 57.21,
};

// Mặt tiền (m) — cạnh giáp đường. true = lô góc/vát -> số xấp xỉ.
const FRONT: Record<number, [number, boolean]> = {
  1: [4.07, true], 2: [4.29, true], 3: [5.00, true],
  4: [4.00, false], 5: [4.00, false], 6: [4.00, false], 7: [4.00, false], 8: [4.00, false], 9: [4.00, false],
  10: [4.00, false], 11: [4.00, false], 12: [4.00, false], 13: [4.00, false], 14: [4.00, true],
  15: [5.00, false], 16: [5.00, false], 17: [5.00, false], 18: [4.00, false], 19: [4.00, false], 20: [4.00, false],
  21: [4.00, false], 22: [4.00, false], 23: [4.00, false], 24: [4.00, false], 25: [4.00, false], 26: [6.49, true],
  27: [4.09, true], 28: [4.00, false], 29: [4.00, false], 30: [4.00, false], 31: [4.00, false], 32: [4.00, false],
  33: [4.00, false], 34: [4.00, false], 35: [4.00, false], 36: [4.00, false], 37: [4.40, true],
  38: [5.00, false], 39: [5.00, false], 40: [5.00, false], 41: [5.00, false], 42: [5.00, false],
  43: [6.75, true], 44: [6.75, true],
  45: [5.00, false], 46: [5.00, false], 47: [5.00, false], 48: [5.00, false], 49: [5.00, false], 50: [5.00, true],
};

const OPUS = [1, 2, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
const FUSION = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37];
const SIGNATURE = [43, 44];
const UNSOLD = new Set([1, 2, 3, 23, 24, 42, 50]); // rổ hàng T6.2026: còn trống

export function unitModel(n: number): ModelKey {
  if (OPUS.includes(n)) return 'opus';
  if (FUSION.includes(n)) return 'fusion_gen_5';
  if (SIGNATURE.includes(n)) return 'signature';
  return 'cosmo_gen_2';
}

const MODEL_NAME: Record<ModelKey, string> = {
  opus: 'Opus', fusion_gen_5: 'Fusion Gen 5', cosmo_gen_2: 'Cosmo Gen 2', signature: 'Signature by Codinachs',
};

const STREET: Record<number, string> = {};
for (let i = 1; i <= 50; i++) STREET[i] = (i >= 15 && i <= 26) ? 'An Dương Vương (hẻm 156)' : (i === 1 || i === 2) ? 'Trương Đình Hội' : 'đường nội khu';

// Tính năng nổi bật từng mẫu nhà
const MODEL_FEATURES: Record<ModelKey, string> = {
  cosmo_gen_2: 'Nhà phố cao cấp Gen 2, mặt tiền 5m, kết cấu 6 tầng (trệt + lửng + 3 lầu + sân thượng). Phòng ngủ Master rộng ~35-38m², bếp full-size có phòng ăn riêng, garage ô tô trong nhà, thang máy lên tận sân thượng, hệ khí tươi AirTop. Thang biến hóa (tầng 1→2→3) + thang xoắn (tầng 4→5, 5→6) tiết kiệm diện tích.',
  fusion_gen_5: 'Mẫu nhà yêu thích nhất, cải tiến qua 5 thế hệ. Diện tích sử dụng ~195m², 4 phòng ngủ cho 3 thế hệ, mặt tiền 4m. Có thang máy lên tận sân thượng, garage riêng, bếp full-size, thang biến hóa + thang xoắn, hệ AirTop.',
  opus: 'Dòng nhà phố thương mại hạng A "2 trong 1" — 2 tầng dưới (trệt + lửng) là văn phòng/thương mại (mặt tiền trưng bày, livestream), 4 tầng trên là căn hộ sân vườn cao cấp để ở. Diện tích sử dụng ~270m², có thang máy lên sân thượng, AirTop. Phù hợp người khởi nghiệp/kinh doanh.',
  signature: 'Dòng Signature by Codinachs — thiết kế hợp tác cùng KTS Codinachs, bố trí riêng biệt, cao cấp.',
};

// Bố trí công năng chuẩn (nhà phố 6 tầng)
const FLOORS = 'Bố trí tầng: Tầng 1 (trệt) gara + phòng khách; Tầng 2 (lửng) phòng ngủ ông bà; Tầng 3 bếp + phòng ăn + giặt sấy; Tầng 4 phòng ngủ Master; Tầng 5 phòng ngủ trẻ con; Tầng 6 sân thượng. (Riêng Opus: 2 tầng dưới là văn phòng/thương mại.)';

// Đổi số tiếng Việt dạng CHỮ -> SỐ (vì voice-to-text đôi khi ghi "ba mươi ba" thay vì "33").
// Hỗ trợ 1..50: "ba mươi ba"=33, "hai mươi"=20, "mười lăm"=15, "linh ba"/"lẻ ba"=3, "mốt"=1, "tư"=4, "lăm/nhăm"=5.
function vietnameseWordsToNumber(raw: string): number | null {
  let s = ' ' + raw.toLowerCase().trim() + ' ';
  s = s.replace(/\blinh\b|\blẻ\b/g, ' ').replace(/\s+/g, ' ');
  const units: Record<string, number> = {
    'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
    'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
  };
  const words = s.trim().split(' ').filter(Boolean);
  // "mười" / "mười X"
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'mười') {
      const next = words[i + 1] ? units[words[i + 1]] : undefined;
      return 10 + (next !== undefined ? next : 0);
    }
  }
  // "X mươi" / "X mươi Y"
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'mươi' && i > 0 && units[words[i - 1]] !== undefined) {
      const tens = units[words[i - 1]] * 10;
      const next = words[i + 1] ? units[words[i + 1]] : undefined;
      return tens + (next !== undefined ? next : 0);
    }
  }
  for (const w of words) if (units[w] !== undefined) return units[w];
  return null;
}

// Phát hiện số căn trong câu hỏi: "căn 40", "lô #03", "unit 23", "căn số 12", "căn ba mươi ba"...
export function detectUnit(message: string): number | null {
  const msg = message || '';
  // 1) Dạng chữ số
  const m = msg.match(/(?:căn|lô|ô|unit|nhà)\s*(?:số\s*)?#?\s*(\d{1,2})\b/i)
    || msg.match(/#\s*(\d{1,2})\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 50) return n;
  }
  // 2) Dạng chữ tiếng Việt: "căn ba mươi ba", "lô số mười lăm"
  const wm = msg.match(/(?:căn|lô|ô|unit|nhà)\s*(?:số\s*)?((?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|linh|lẻ)(?:\s+(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|linh|lẻ))*)/i);
  if (wm) {
    const n = vietnameseWordsToNumber(wm[1]);
    if (n !== null && n >= 1 && n <= 50) return n;
  }
  return null;
}

// Khối "facts" chính xác để nhét vào prompt + từ khóa mẫu nhà để tăng cường RAG.
export function unitContext(n: number): { facts: string; modelKeywords: string } {
  const model = unitModel(n);
  const name = MODEL_NAME[model];
  const area = AREA[n];
  const [front, approx] = FRONT[n];
  const a = approx ? '≈' : '';
  const depth = area / front;
  const status = UNSOLD.has(n) ? 'CÒN TRỐNG (chưa bán)' : 'ĐÃ BÁN';
  const facts = `THÔNG TIN CHÍNH XÁC VỀ CĂN #${String(n).padStart(2, '0')} (dùng đúng số liệu này, KHÔNG bịa):
- Mẫu nhà: ${name}
- Diện tích đất: ${area.toFixed(2)} m²
- Mặt tiền (ngang): ${a}${front.toFixed(2)} m; chiều sâu (dài): ${a}${depth.toFixed(1)} m
- Mặt tiền giáp đường: ${STREET[n]}
- Trạng thái: ${status}
- ${FLOORS}
- Tính năng mẫu ${name}: ${MODEL_FEATURES[model]}`;
  // từ khóa để query RAG kéo thêm datasheet/tính năng của đúng mẫu nhà
  const modelKeywords = `${name} mẫu nhà tính năng datasheet thang biến hóa thang xoắn bếp full-size`;
  return { facts, modelKeywords };
}
