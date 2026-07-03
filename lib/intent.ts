// lib/intent.ts — NGUỒN SỰ THẬT DUY NHẤT cho intent classification + keyword lists.
// Cả slide/page.tsx (client) và api/slide/route.ts (server) đều import từ đây.
//
// Cách tiếp cận: 3 lớp phân loại nhanh (không cần LLM, <1ms):
//   1. FILLER — câu chêm không mang thông tin (bỏ qua ngay)
//   2. EXPLICIT — sale chủ động yêu cầu mở slide (ưu tiên cao nhất)
//   3. TOPIC — nhận diện chủ đề qua từ khóa ngữ nghĩa (có nhóm + độ ưu tiên)
//
// Khác string.includes() đơn thuần: mỗi từ khóa được gom theo NHÓM NGỮ NGHĨA
// (price / location / unit / legal / amenity / design / general) giúp downstream
// biết "khách đang hỏi về GÌ" chứ không chỉ "có keyword không".

export type IntentTopic = 'price' | 'location' | 'unit' | 'legal' | 'amenity' | 'design' | 'general';

export type AmbientIntent = {
  shouldGenerate: boolean;
  reason: 'too_short' | 'filler' | 'competitor' | 'has_project_topic' | 'explicit_slide_request';
  confidence: number;
  topic?: IntentTopic;
};

// ── Câu chêm / phản hồi xã giao không cần slide ──────────────────────────────
const FILLER_WORDS = [
  'ừ', 'ok', 'đúng rồi', 'cái đó đẹp', 'rồi sao nữa', 'anh thấy ổn', 'vâng', 'à ừ',
  'thế à', 'ừ nhỉ', 'được rồi', 'thì cũng tốt', 'ok em', 'dạ', 'dạ anh', 'dạ chị',
  'ừ đúng', 'hiểu rồi', 'nghe rồi', 'biết rồi', 'rõ rồi', 'oke', 'okay',
];

// ── Sale chủ động yêu cầu mở slide (ưu tiên cao nhất, bắn ngay) ──────────────
export const EXPLICIT_TRIGGERS = [
  'cho khách xem', 'mở slide', 'hiện cái', 'show phần', 'trình chiếu',
  'mở hình', 'cho xem', 'nhìn trên màn hình', 'em mở', 'mở cho',
  'mở lên', 'chiếu lên', 'xem trên màn',
];

// ── Dự án / thương hiệu đối thủ — nếu xuất hiện thì CHẶN slide của mình ──────
export const COMPETITORS = [
  'vinhome', 'vin home', 'vinhomes', 'vin group', 'grand park', 'ocean park', 'cần giờ',
  'eco retreat', 'eco-retreat', 'ecoretreat', 'ecopark', 'eco park',
  'masteri', 'the global city', 'global city', 'vạn phúc', 'waterpoint', 'water point',
  'mizuki', 'akari', 'flora', 'lovera', 'valora', 'the privia', 'privia', 'essensia',
  'celadon', 'west gate', 'westgate', 'the beverly', 'beverly', 'izumi', 'aqua city',
  'novaland', 'nam long', 'khang điền', 'phú mỹ hưng', 'lumiere', 'glory heights',
  'classia', 'senturia', 'the rivana', 'la vida', 'phú đông', 'opal', 'dragon',
];

// ── Từ khóa theo nhóm ngữ nghĩa ──────────────────────────────────────────────
// Mỗi nhóm = 1 "slot" ngữ nghĩa. Downstream có thể dùng topic để chọn layout,
// chọn ảnh, hoặc điều chỉnh RAG query.
export const TOPIC_KEYWORDS: Record<IntentTopic, string[]> = {
  // 💰 Tài chính / giao dịch
  price: [
    'giá bán', 'bảng giá', 'bao nhiêu tiền', 'mấy tỷ', 'thanh toán', 'đặt cọc',
    'chiết khấu', 'trả góp', 'ân hạn', 'pttt', 'booking', 'báo giá',
    'bao nhiêu tỷ', 'giá bao nhiêu', 'giá từ', 'tiền cọc', 'phí quản lý',
    'vay', 'ngân hàng', 'lãi suất', 'đầu tư', 'lợi nhuận', 'cho thuê',
  ],

  // 📍 Vị trí / địa lý
  location: [
    'vị trí', 'địa chỉ', 'bản đồ', 'an dương vương', 'trương đình hội', 'võ văn kiệt',
    'nguyễn văn linh', 'quận 8', 'bình chánh', 'metro', 'quận 1',
    'mặt tiền', 'cách trung tâm', 'bao xa', 'ở đâu', 'nằm ở', 'chỗ nào',
    'đường đi', 'di chuyển', 'bao lâu', 'quốc lộ', 'trung tâm',
  ],

  // 🏠 Căn hộ / không gian / công năng
  unit: [
    'căn số', 'diện tích', 'gara', 'thang máy', 'thang xoắn', 'thang biến hóa',
    'sân thượng', 'phòng ngủ', 'phòng khách', 'phòng tắm', 'phòng bếp', 'phòng học',
    'ban công', 'master', 'hướng nhà', 'giếng trời', 'thông tầng', 'airtop', 'air top',
    'wc', 'vệ sinh', 'lavabo', 'ô tô', 'đỗ xe', 'đậu xe', 'khí tươi',
    'số phòng', 'tầng mấy', 'bao nhiêu tầng', 'diện tích sàn',
  ],

  // 📋 Pháp lý / giấy tờ
  legal: [
    'pháp lý', 'sổ hồng', 'sổ đỏ', 'qsdđ', 'quy hoạch', 'giấy phép', 'hoàn công',
    'sở hữu lâu dài', 'sang tên', 'hợp đồng mua bán', 'hdmb', 'cam kết',
    'giấy phép xây dựng', 'bảo hành', 'tiến độ', 'bàn giao', 'xây dựng',
  ],

  // 🌳 Tiện ích ngoại khu
  amenity: [
    'tiện ích', 'công viên', 'hồ bơi', 'bể bơi', 'cầu lông', 'bóng rổ',
    'sân thể thao', 'landmark', 'khu vui chơi', 'sân chơi', 'trung tâm thương mại',
    'cà phê', 'coffee', 'sinh thái', 'xanh',
  ],

  // 🎨 Thiết kế / kiến trúc / nội thất
  design: [
    'mặt bằng', 'mẫu nhà', 'thiết kế nhà', 'nội thất', 'phối cảnh',
    'kiến trúc nhà', 'sa bàn', 'ngoại thất', 'toàn cảnh', 'sofa', 'giường',
    'nhà mẫu', 'kiến trúc', 'thiết kế',
  ],

  // 🏢 Tên riêng dự án / thương hiệu (general anchor)
  general: [
    // Tên dự án & chủ đầu tư
    'phú định', "ny'ah", 'nyah', 'niah', 'nhã đạt', 'nha dat', 'nhà đạt',
    'chủ đầu tư', 'founder', 'công ty',
    // Mẫu nhà (+ biến thể phát âm sai từ STT)
    'cosmo', 'cót mô', 'cốt mô', 'cot mo', 'côt mô',
    'fusion', 'phiêu dân', 'phiêu-dân', 'fiu',
    'opus', 'ô-pút', 'ô pút', 'o pút', 'opút',
    'cashmere', 'signature',
    'gen 2', 'gen 5', 'gen hai', 'gen năm',
    // Danh từ chung về dự án
    'nhà phố', 'nhà mẫu',
  ],
};

// Flat list dùng cho server-side pre-filter (import trong api/slide/route.ts)
export const ALL_PROJECT_KEYWORDS: string[] = [
  ...TOPIC_KEYWORDS.general,
  ...TOPIC_KEYWORDS.price,
  ...TOPIC_KEYWORDS.location,
  ...TOPIC_KEYWORDS.unit,
  ...TOPIC_KEYWORDS.legal,
  ...TOPIC_KEYWORDS.amenity,
  ...TOPIC_KEYWORDS.design,
];

export function hasProjectKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return ALL_PROJECT_KEYWORDS.some(kw => lower.includes(kw));
}

export function isCompetitor(text: string): boolean {
  const lower = text.toLowerCase();
  return COMPETITORS.some(kw => lower.includes(kw));
}

// ── Classifier chính ─────────────────────────────────────────────────────────
export function classifyAmbientIntent(text: string): AmbientIntent {
  const clean = text.normalize('NFC').toLowerCase().trim();  // NFD (STT) -> NFC để khớp từ khóa
  const wordCount = clean.split(/\s+/).length;

  // 1. Quá ngắn (< 3 từ) và không phải explicit trigger → bỏ qua
  if (wordCount < 3 && !EXPLICIT_TRIGGERS.some(t => clean.includes(t))) {
    return { shouldGenerate: false, reason: 'too_short', confidence: 1.0 };
  }

  // 2. Câu chêm xã giao ngắn → bỏ qua
  const isFiller = FILLER_WORDS.some(f => clean === f || clean.startsWith(f + ' ') || clean.endsWith(' ' + f) || clean.includes(' ' + f + ' '));
  if (isFiller && wordCount < 6) {
    return { shouldGenerate: false, reason: 'filler', confidence: 0.9 };
  }

  // 3. Đối thủ cạnh tranh → chặn ngay (không cần gọi slide)
  if (isCompetitor(clean)) {
    return { shouldGenerate: false, reason: 'competitor', confidence: 1.0 };
  }

  // 4. Explicit trigger — sale chủ động yêu cầu → bắn ngay
  for (const trigger of EXPLICIT_TRIGGERS) {
    if (clean.includes(trigger)) {
      return { shouldGenerate: true, reason: 'explicit_slide_request', confidence: 1.0, topic: 'general' };
    }
  }

  // 5. Nhận dạng topic theo nhóm ngữ nghĩa — ưu tiên theo thứ tự cụ thể → chung
  const topicOrder: IntentTopic[] = ['unit', 'price', 'location', 'legal', 'design', 'amenity', 'general'];
  for (const topic of topicOrder) {
    if (TOPIC_KEYWORDS[topic].some(kw => clean.includes(kw))) {
      return {
        shouldGenerate: true,
        reason: 'has_project_topic',
        confidence: topic === 'general' ? 0.75 : 0.9,
        topic,
      };
    }
  }

  // 6. Không khớp gì → bỏ qua
  return { shouldGenerate: false, reason: 'filler', confidence: 0.6 };
}
