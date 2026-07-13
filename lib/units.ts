// Tra cứu THÔNG TIN TỪNG LÔ (1-50) — nguồn: Data_productlist.xlsx (chính thức, cập nhật 24/6/2026).
// "DT" = Diện Tích. Cột B (model) = TÊN ĐẦY ĐỦ để hiển thị. Vẫn hiểu alias ngắn: cosmo/fusion/opus...
// Dùng cho cả chat bot lẫn slide bot: hỏi căn X -> trả đúng mẫu/diện tích/mặt tiền/hướng/địa chỉ.

export type ModelFamily = 'office' | 'opus' | 'cashmere' | 'signature' | 'fusion_gen_5' | 'cosmo_gen_2';

interface Lot { model: string; fam: ModelFamily; dtDat: number; dtSan: number; front: number; kt: string; huong: string; diaChi: string; }

const LOTS: Record<number, Lot> = {
  1: { model: 'Office 1', fam: 'office', dtDat: 67.3, dtSan: 472.53, front: 3.33, kt: '3.33m (mặt tiền) x 17.57m x 15.67m x 4.29m', huong: 'Nam ( Tây Tứ Mệnh)', diaChi: '' },
  2: { model: 'Office 1', fam: 'office', dtDat: 62.9, dtSan: 396.07, front: 4.01, kt: '4.01m (mặt tiền) x 15.67m x 15.47m x 4.29m', huong: 'Nam ( Tây Tứ Mệnh)', diaChi: '' },
  3: { model: 'Cosmo v2', fam: 'cosmo_gen_2', dtDat: 49, dtSan: 211, front: 5, kt: '5.00m (mặt tiền) x 8.99m x 10.76m x 4.29m', huong: 'Đông  - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  4: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 42.9, dtSan: 211.4, front: 4, kt: '4.00m (mặt tiền) x 10.76m x 10.81m x 4.01m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  5: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 43.1, dtSan: 213.7, front: 4, kt: '4.00m (mặt tiền) x 10.81m x 10.91m x 4.03m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  6: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 43.3, dtSan: 213.41, front: 4, kt: '4.00m (mặt tiền) x 10.91m x 10.94m x 4.02m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  7: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 43.5, dtSan: 214.21, front: 4, kt: '4.00m (mặt tiền) x 10.94m x 10.97m x 4.03m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  8: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 43.8, dtSan: 215.61, front: 4, kt: '4.00m (mặt tiền) x 10.97m x 11.00m x 4.04m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  9: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 43.9, dtSan: 216.18, front: 4, kt: '4.00m (mặt tiền) x 11.00m x 11.03m x 4.03m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  10: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 44.2, dtSan: 217.33, front: 4, kt: '4.00m (mặt tiền) x 11.03m x 11.08m x 4.04m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  11: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 44.4, dtSan: 219.81, front: 4, kt: '4.00m (mặt tiền) x 11.08m x 11.16m x 4.05m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  12: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 44.6, dtSan: 220.72, front: 4, kt: '4.00m (mặt tiền) x 11.16m x 11.18m x 4.03m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  13: { model: 'Fusion Gen 4 v4', fam: 'fusion_gen_5', dtDat: 44.8, dtSan: 190.02, front: 4, kt: '4.00m (mặt tiền) x 11.18m x 11.21m x 4.05m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  14: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 54.7, dtSan: 245.86, front: 5.74, kt: '5.74m (mặt tiền góc) x 11.21m x 11.81m x 4.07m', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  15: { model: 'Opus v3', fam: 'opus', dtDat: 77.5, dtSan: 349.09, front: 5, kt: '5.00m (mặt tiền đường lớn) x 15.77m x 15.21m x 5.03m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  16: { model: 'Opus v3', fam: 'opus', dtDat: 74.7, dtSan: 345.01, front: 5, kt: '5.00m (mặt tiền đường lớn) x 15.21m x 14.65m x 5.03m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  17: { model: 'Opus v3', fam: 'opus', dtDat: 71.9, dtSan: 335.23, front: 5, kt: '5.00m (mặt tiền đường lớn) x 14.65m x 14.10m x 5.03m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  18: { model: 'Opus v3', fam: 'opus', dtDat: 55.4, dtSan: 263.5, front: 4, kt: '4.00m (mặt tiền đường lớn) x 14.10m x 13.68m x 4.02m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  19: { model: 'Cashmere', fam: 'cashmere', dtDat: 65.9, dtSan: 294.26, front: 4, kt: '4.00m (mặt tiền đường lớn) x 13.68m x 15.99m x 5.80m (cạnh đáy thắt vát)', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  20: { model: 'Opus v3', fam: 'opus', dtDat: 61.8, dtSan: 274.06, front: 4.14, kt: '4.14m (mặt tiền) x 15.99m x 14.91m x 4.14m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  21: { model: 'Opus v3', fam: 'opus', dtDat: 57.5, dtSan: 271.63, front: 4, kt: '4.00m (mặt tiền đường lớn) x 14.91m x 13.95m x 4.14m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  22: { model: 'Cashmere', fam: 'cashmere', dtDat: 73.8, dtSan: 334.92, front: 4.14, kt: '4.14m (mặt tiền) x 13.95m x 17.84m x 4.14m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  23: { model: 'Cashmere', fam: 'cashmere', dtDat: 69.6, dtSan: 313.84, front: 4, kt: '4.00m (mặt tiền đường lớn) x 17.84m x 15.85m x 5.47m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  24: { model: 'Opus v3', fam: 'opus', dtDat: 73.5, dtSan: 351.2, front: 4.14, kt: '4.14m (mặt tiền) x 15.85m x 15.08m x 5.47m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  25: { model: 'Office 2', fam: 'office', dtDat: 64.5, dtSan: 358.46, front: 4, kt: '4.00m (mặt tiền đường lớn) x 15.08m x 13.88m x 5.00m', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  26: { model: 'Office 2', fam: 'office', dtDat: 91.8, dtSan: 517, front: 6.4, kt: '6.40m (mặt tiền đường lớn) x 13.88m x 9.87m x 12.55m (cạnh xéo góc)', huong: 'Bắc ( Đông tứ trạch)', diaChi: '' },
  27: { model: 'Fusion 2MT Gen 5', fam: 'fusion_gen_5', dtDat: 49.2, dtSan: 246.46, front: 4, kt: '4.00m (mặt tiền) x 12.55m x 12.06m x 4.10m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  28: { model: 'Fusion 2MT Gen 5', fam: 'fusion_gen_5', dtDat: 47.3, dtSan: 237.1, front: 4, kt: '4.00m (mặt tiền) x 12.06m x 11.57m x 4.06m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  29: { model: 'Fusion 2MT Gen 4 v4', fam: 'fusion_gen_5', dtDat: 45.4, dtSan: 194.64, front: 4, kt: '4.00m (mặt tiền) x 11.57m x 11.16m x 4.08m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  30: { model: 'Fusion 2MT Gen 4 v4', fam: 'fusion_gen_5', dtDat: 44.5, dtSan: 193.49, front: 4, kt: '4.00m (mặt tiền) x 11.16m x 11.10m x 4.04m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  31: { model: 'Fusion 2MT Gen 5', fam: 'fusion_gen_5', dtDat: 44.3, dtSan: 223.16, front: 4, kt: '4.00m (mặt tiền) x 11.10m x 11.04m x 4.03m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  32: { model: 'Fusion 2MT Gen 4 v3', fam: 'fusion_gen_5', dtDat: 44, dtSan: 178.62, front: 4, kt: '4.00m (mặt tiền) x 11.04m x 10.98m x 4.03m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  33: { model: 'Fusion 2MT Gen 4 v3', fam: 'fusion_gen_5', dtDat: 43.8, dtSan: 176.1, front: 4, kt: '4.00m (mặt tiền) x 10.98m x 10.92m x 4.02m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  34: { model: 'Fusion 2MT Gen 4 v3', fam: 'fusion_gen_5', dtDat: 43.5, dtSan: 175.36, front: 4, kt: '4.00m (mặt tiền) x 10.92m x 10.86m x 4.02m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  35: { model: 'Fusion 2MT Gen 5', fam: 'fusion_gen_5', dtDat: 43.3, dtSan: 218.9, front: 4, kt: '4.00m (mặt tiền) x 10.86m x 10.80m x 4.01m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  36: { model: 'Fusion Gen 5 v2', fam: 'fusion_gen_5', dtDat: 43.1, dtSan: 214.85, front: 4, kt: '4.00m (mặt tiền) x 10.80m x 10.75m x 4.01m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  37: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 54, dtSan: 234.01, front: 4.31, kt: '4.31m (mặt tiền) x 10.75m x 10.71m x 4.79m', huong: 'Tây - Tây Nam ( Tây Tứ Mệnh)', diaChi: '' },
  38: { model: 'Cosmo', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 176.52, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  39: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 217.05, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  40: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 217.05, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  41: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 217.05, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  42: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 217.05, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Đông - Đông Nam (Đông Tứ Mệnh)', diaChi: '' },
  43: { model: 'Signature v2', fam: 'signature', dtDat: 55.8, dtSan: 296.48, front: 5, kt: '5.00m (mặt tiền nội khu) x 8.75m x 10.75m x 6.75m x 2.49m (Góc vát vòng cung)', huong: 'Nam ( Tây Tứ Mệnh)', diaChi: '' },
  44: { model: 'Signature v2', fam: 'signature', dtDat: 55.8, dtSan: 296.48, front: 5, kt: '5.00m (mặt tiền nội khu) x 8.75m x 10.75m x 6.75m x 2.52m (Góc vát vòng cung)', huong: 'Nam ( Tây Tứ Mệnh)', diaChi: '' },
  45: { model: 'Cosmo v2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 187.84, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Tây ( Tây Tứ Mệnh)', diaChi: '' },
  46: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 217.05, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Tây ( Tây Tứ Mệnh)', diaChi: '' },
  47: { model: 'Cosmo v2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 186.18, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Tây ( Tây Tứ Mệnh)', diaChi: '' },
  48: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 217.05, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Tây ( Tây Tứ Mệnh)', diaChi: '' },
  49: { model: 'Cosmo v2', fam: 'cosmo_gen_2', dtDat: 43.8, dtSan: 187.84, front: 5, kt: '5.00m (mặt tiền) x 8.75m x 8.75m x 5.00m (Lô vuông vắn)', huong: 'Tây ( Tây Tứ Mệnh)', diaChi: '' },
  50: { model: 'Cosmo Gen 2', fam: 'cosmo_gen_2', dtDat: 57, dtSan: 249.32, front: 5, kt: '5.00m (mặt tiền) x 12.11m x 10.77m x 6.00m', huong: 'Tây ( Tây Tứ Mệnh)', diaChi: '' },
};

const PRICES: Record<number, string> = {
  50: 'Giá nhà thô: 11.470.000.000 VNĐ | Giá Gói Air: 11.797.600.000 VNĐ',
  42: 'Giá nhà thô: 8.981.000.000 VNĐ | Giá Gói Air: 9.277.100.000 VNĐ',
  3: 'Giá nhà thô: 9.710.000.000 VNĐ | Giá Gói Air: 9.957.800.000 VNĐ',
  24: 'Giá nhà thô: 12.751.000.000 VNĐ | Giá Gói Air: 13.136.350.000 VNĐ',
  23: 'Giá nhà thô: 10.498.000.000 VNĐ (Gói Air liên hệ)',
  25: 'Giá nhà thô: 10.766.000.000 VNĐ',
  26: 'Giá nhà thô: 16.566.000.000 VNĐ',
  1: 'Giá nhà thô: 14.443.000.000 VNĐ',
  2: 'Giá nhà thô: 12.791.000.000 VNĐ',
};

const UNSOLD = new Set<number>([1, 2, 3, 23, 24, 42, 50]); // rổ hàng T6.2026: còn trống

// Đặc điểm theo HỌ mẫu nhà (dùng chung cho các biến thể: Cosmo/Cosmo v2/Cosmo Gen 2...).
const FAMILY_FEATURES: Record<ModelFamily, string> = {
  office: 'Nhà phố thương mại "2 trong 1" — tầng dưới làm văn phòng/kinh doanh (mặt tiền trưng bày), tầng trên để ở. Có thang máy, hệ khí tươi AirTop.',
  opus: 'Dòng nhà phố cao cấp Opus — diện tích sử dụng lớn, thang máy lên sân thượng, hệ AirTop, bố trí sang trọng cho gia đình nhiều thế hệ.',
  cashmere: 'Dòng Cashmere — thiết kế cao cấp, lô lớn góc/vát đặc biệt, không gian rộng rãi.',
  signature: 'Dòng Signature by Codinachs — hợp tác KTS Codinachs, mặt tiền góc vát vòng cung, thiết kế dấu ấn riêng.',
  fusion_gen_5: 'Mẫu nhà yêu thích nhất, cải tiến qua nhiều thế hệ (Gen 4/Gen 5, có bản 2 mặt tiền). 4 phòng ngủ cho 3 thế hệ, thang máy, garage, bếp full-size, thang biến hóa + thang xoắn, hệ AirTop.',
  cosmo_gen_2: 'Nhà phố cao cấp Cosmo (Gen 2) — mặt tiền 5m, 6 tầng (trệt + lửng + 3 lầu + sân thượng), phòng Master rộng, bếp full-size, garage, thang máy, thang biến hóa + thang xoắn, hệ khí tươi AirTop.',
};

// Họ -> thư mục ẢNH (chỉ có 3 bộ ảnh: opus/fusion/cosmo). Office->opus, Cashmere/Signature->cosmo (tạm).
export function imageFamily(n: number): 'opus' | 'fusion_gen_5' | 'cosmo_gen_2' {
  const f = LOTS[n]?.fam;
  if (f === 'opus' || f === 'office') return 'opus';
  if (f === 'fusion_gen_5') return 'fusion_gen_5';
  return 'cosmo_gen_2'; // cosmo, cashmere, signature
}

const FAMILY_NAME: Record<ModelFamily, string> = {
  office: 'Office', opus: 'Opus', cashmere: 'Cashmere', signature: 'Signature by Codinachs',
  fusion_gen_5: 'Fusion Gen 5', cosmo_gen_2: 'Cosmo Gen 2',
};

export function unitModel(n: number): ModelFamily {
  return LOTS[n]?.fam || 'cosmo_gen_2';
}

// Đổi số tiếng Việt dạng CHỮ -> SỐ (voice-to-text đôi khi ghi "ba mươi ba" thay vì "33").
function vietnameseWordsToNumber(raw: string): number | null {
  let s = ' ' + raw.toLowerCase().trim() + ' ';
  s = s.replace(/\blinh\b|\blẻ\b/g, ' ').replace(/\s+/g, ' ');
  const units: Record<string, number> = {
    'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
    'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
  };
  const words = s.trim().split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'mười') { const next = words[i + 1] ? units[words[i + 1]] : undefined; return 10 + (next !== undefined ? next : 0); }
  }
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'mươi' && i > 0 && units[words[i - 1]] !== undefined) {
      const tens = units[words[i - 1]] * 10; const next = words[i + 1] ? units[words[i + 1]] : undefined;
      return tens + (next !== undefined ? next : 0);
    }
  }
  for (const w of words) if (units[w] !== undefined) return units[w];
  return null;
}

export function detectUnit(message: string): number | null {
  const msg = message || '';
  const m = msg.match(/(?:căn|lô|ô|unit|nhà)\s*(?:số\s*)?#?\s*(\d{1,2})\b/i) || msg.match(/#\s*(\d{1,2})\b/);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 50) return n; }
  const wm = msg.match(/(?:căn|lô|ô|unit|nhà)\s*(?:số\s*)?((?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|linh|lẻ)(?:\s+(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|linh|lẻ))*)/i);
  if (wm) { const n = vietnameseWordsToNumber(wm[1]); if (n !== null && n >= 1 && n <= 50) return n; }
  return null;
}

// Khối facts chính xác để nhét vào prompt + từ khóa tăng cường RAG.
export function unitContext(n: number): { facts: string; modelKeywords: string } {
  const l = LOTS[n];
  if (!l) return { facts: '', modelKeywords: '' };
  const depth = l.front ? (l.dtDat / l.front) : 0;
  const status = UNSOLD.has(n) ? 'CÒN TRỐNG (chưa bán)' : 'ĐÃ BÁN';
  const facts = `THÔNG TIN CHÍNH XÁC LÔ #${String(n).padStart(2, '0')} (dùng đúng số liệu này, KHÔNG bịa; "DT" = Diện Tích):
- Mẫu nhà (tên đầy đủ): ${l.model}
- DT đất (theo GCN): ${l.dtDat} m²; DT sàn (GPXD): ${l.dtSan} m²
- Mặt tiền: ${l.front} m${depth ? `; chiều sâu ~${depth.toFixed(1)} m` : ''}
- Kích thước lô: ${l.kt}
- Hướng nhà: ${l.huong}${l.diaChi ? `\n- Địa chỉ: ${l.diaChi}` : ''}
- Trạng thái: ${status}
${PRICES[n] ? `- Bảng giá T6/2026: ${PRICES[n]}\n` : ''}- Đặc điểm dòng ${FAMILY_NAME[l.fam]}: ${FAMILY_FEATURES[l.fam]}`;
  const modelKeywords = `${l.model} ${FAMILY_NAME[l.fam]} mẫu nhà diện tích DT mặt tiền hướng datasheet giá bán giá tiền bảng giá`;
  return { facts, modelKeywords };
}

export function getGeneralUnsoldContext(): string {
  const unsoldList = Array.from(UNSOLD).sort((a, b) => a - b);
  let str = "=== DANH SÁCH CÁC CĂN/LÔ CÒN TRỐNG (CHƯA BÁN) & GIÁ BÁN TỪNG CĂN ===\n";
  for (const n of unsoldList) {
    const l = LOTS[n];
    if (!l) continue;
    const price = PRICES[n] || 'Liên hệ trực tiếp để có giá chính xác';
    str += `- Lô #${String(n).padStart(2, '0')}: Mẫu ${l.model}, DT đất: ${l.dtDat}m², DT sàn: ${l.dtSan}m², Hướng: ${l.huong}. ${price}\n`;
  }
  str += "\nLƯU Ý: Tất cả các căn/lô khác ngoài danh sách này đều ĐÃ BÁN.";
  return str;
}
