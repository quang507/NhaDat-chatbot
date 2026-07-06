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
  reason: 'too_short' | 'filler' | 'competitor' | 'has_project_topic' | 'explicit_slide_request' | 'weak_signal';
  confidence: number;
  topic?: IntentTopic;
  score?: number;   // tổng điểm tín hiệu (dùng để chẩn đoán/log)
  hits?: string[];  // các từ khóa đã khớp
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
    // Đồ nội thất cụ thể — khách hay hỏi thẳng tên món đồ thay vì nói "nội thất" chung chung
    'bàn ăn', 'bàn bếp', 'tủ bếp', 'tủ quần áo', 'kệ tivi', 'bàn trà', 'đèn trang trí',
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

// ── Chấm điểm tín hiệu (chống false-positive từ 1 từ phổ thông) ───────────────
// Nguyên tắc: mở slide khi có TÍN HIỆU MẠNH (điểm >= NGƯỠNG), thay vì chỉ cần
// 1 keyword bất kỳ. Mỗi từ khóa có trọng số:
//   2 = tín hiệu mạnh, tự-đủ (tên dự án/mẫu nhà, danh từ đặc thù: sổ hồng, mặt bằng, bảng giá...)
//   1 = tín hiệu yếu, chung chung (đầu tư, thiết kế, ở đâu, công ty, nhà phố...)
// => 1 từ mạnh (2đ) là đủ; nhưng phải có 2 từ yếu (1+1) mới đủ. 1 từ yếu đơn độc → BỎ QUA.
const STRONG_THRESHOLD = 2;

// Tên riêng dự án / thương hiệu / mẫu nhà — anchor mạnh (trong nhóm general).
const GENERAL_ANCHORS = new Set<string>([
  'phú định', "ny'ah", 'nyah', 'niah', 'nhã đạt', 'nha dat', 'nhà đạt',
  'chủ đầu tư', 'founder',
  'cosmo', 'cót mô', 'cốt mô', 'cot mo', 'côt mô',
  'fusion', 'phiêu dân', 'phiêu-dân', 'fiu',
  'opus', 'ô-pút', 'ô pút', 'o pút', 'opút',
  'cashmere', 'signature',
]);

// Từ khóa CHUNG CHUNG (weight 1) — dễ xuất hiện trong tám chuyện, cần tín hiệu thứ 2 đi kèm.
const GENERIC_KEYWORDS = new Set<string>([
  // general yếu
  'công ty', 'nhà phố', 'nhà mẫu', 'gen 2', 'gen 5', 'gen hai', 'gen năm',
  // price yếu
  'vay', 'ngân hàng', 'lãi suất', 'đầu tư', 'lợi nhuận', 'cho thuê',
  // location yếu
  'trung tâm', 'metro', 'quận 1', 'bình chánh', 'di chuyển', 'bao lâu', 'bao xa',
  'ở đâu', 'chỗ nào', 'đường đi', 'nằm ở',
  // unit yếu
  'master', 'hướng nhà',
  // legal yếu
  'xây dựng', 'cam kết', 'tiến độ',
  // amenity yếu
  'xanh', 'sinh thái', 'coffee', 'cà phê',
  // design yếu
  'thiết kế', 'toàn cảnh', 'ngoại thất',
]);

function weightOf(topic: IntentTopic, kw: string): number {
  if (topic === 'general') return GENERAL_ANCHORS.has(kw) ? 2 : 1;
  return GENERIC_KEYWORDS.has(kw) ? 1 : 2;
}

// Chấm điểm toàn bộ text: gom điểm theo topic, trả topic mạnh nhất + tổng điểm.
function scoreTopics(clean: string): { total: number; strong: number; topic?: IntentTopic; hits: string[] } {
  const topicOrder: IntentTopic[] = ['unit', 'price', 'location', 'legal', 'design', 'amenity', 'general'];
  const perTopic = new Map<IntentTopic, number>();
  const hits: string[] = [];
  let total = 0;
  let strong = 0;
  for (const topic of topicOrder) {
    for (const kw of TOPIC_KEYWORDS[topic]) {
      if (clean.includes(kw)) {
        const w = weightOf(topic, kw);
        perTopic.set(topic, (perTopic.get(topic) || 0) + w);
        total += w;
        if (w >= 2) strong++;
        hits.push(kw);
      }
    }
  }
  // topic đại diện = topic có điểm cao nhất; hòa điểm -> ưu tiên theo topicOrder (cụ thể trước general)
  let best: IntentTopic | undefined;
  let bestScore = 0;
  for (const topic of topicOrder) {
    const s = perTopic.get(topic) || 0;
    if (s > bestScore) { bestScore = s; best = topic; }
  }
  return { total, strong, topic: best, hits };
}

// ── Classifier chính ─────────────────────────────────────────────────────────
export function classifyAmbientIntent(text: string): AmbientIntent {
  const clean = text.normalize('NFC').toLowerCase().trim();  // NFD (STT) -> NFC để khớp từ khóa
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  // 1. Explicit trigger — sale chủ động yêu cầu → bắn ngay (ưu tiên cao nhất, kể cả câu ngắn)
  for (const trigger of EXPLICIT_TRIGGERS) {
    if (clean.includes(trigger)) {
      return { shouldGenerate: true, reason: 'explicit_slide_request', confidence: 1.0, topic: 'general' };
    }
  }

  // 2. Đối thủ cạnh tranh → chặn ngay (không cần gọi slide)
  if (isCompetitor(clean)) {
    return { shouldGenerate: false, reason: 'competitor', confidence: 1.0 };
  }

  // 3. Quá ngắn (< 3 từ) → bỏ qua (explicit đã xử lý ở trên)
  if (wordCount < 3) {
    return { shouldGenerate: false, reason: 'too_short', confidence: 1.0 };
  }

  // 4. Câu chêm xã giao ngắn → bỏ qua
  const isFiller = FILLER_WORDS.some(f => clean === f || clean.startsWith(f + ' ') || clean.endsWith(' ' + f) || clean.includes(' ' + f + ' '));
  if (isFiller && wordCount < 6) {
    return { shouldGenerate: false, reason: 'filler', confidence: 0.9 };
  }

  // 5. Chấm điểm tín hiệu chủ đề dự án
  const { total, strong, topic, hits } = scoreTopics(clean);

  // Không có tín hiệu nào → bỏ qua
  if (total === 0 || !topic) {
    return { shouldGenerate: false, reason: 'filler', confidence: 0.6, score: 0, hits };
  }

  // Cần TÍN HIỆU MẠNH: ít nhất 1 từ khóa đặc thù (weight 2), HOẶC tổng điểm >= 3.
  // 1 từ chung chung đơn độc (đầu tư / ở đâu / công ty...) hoặc 2 từ chung chung → BỎ QUA.
  const hasStrongSignal = strong >= 1 || total >= STRONG_THRESHOLD + 1;
  if (!hasStrongSignal) {
    return { shouldGenerate: false, reason: 'weak_signal', confidence: 0.5, topic, score: total, hits };
  }

  // Đủ tín hiệu → tạo slide. Confidence tỉ lệ theo điểm (cao hơn nếu topic cụ thể).
  const confidence = Math.min(0.6 + total * 0.12 + (topic !== 'general' ? 0.1 : 0), 0.98);
  return { shouldGenerate: true, reason: 'has_project_topic', confidence, topic, score: total, hits };
}

// ── Chống nhảy slide/ảnh liên tục — DÙNG CHUNG cho app/voice và app/slide ────
// Giữ 1 chủ đề tối thiểu ngần này trước khi đổi sang chủ đề khác. Cùng chủ đề thì
// giữ nguyên slide/ảnh đang hiện (không timeout, không đổi) cho tới khi khách đổi
// chủ đề thật — khớp yêu cầu "mỗi chủ đề hiện ổn định, đừng nhảy liên tục".
export const SLIDE_MIN_DISPLAY_MS = 4500;

export interface SlideDisplayState {
  topic: IntentTopic | null;
  at: number; // Date.now() lúc slide/ảnh hiện tại được set
}

// Trả về true nếu nên gọi API lấy slide/ảnh mới; false nếu nên giữ nguyên cái đang hiện.
export function shouldRefreshSlide(intent: AmbientIntent, prev: SlideDisplayState, now: number): boolean {
  if (!intent.shouldGenerate) return false;
  if (intent.reason === 'explicit_slide_request') return true; // sale chủ động -> luôn làm mới
  const sameTopic = !!intent.topic && intent.topic === prev.topic;
  if (sameTopic) return false;
  return now - prev.at >= SLIDE_MIN_DISPLAY_MS;
}
