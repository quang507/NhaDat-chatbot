// lib/conversation.ts — LỚP QUẢN LÝ HỘI THOẠI (Conversation Manager)
// ─────────────────────────────────────────────────────────────────────────────
// Đây là "bộ não" mà lib/intent.ts còn thiếu: intent.ts chỉ phân loại 1 CÂU rời rạc
// (keyword matching), còn module này giữ TRẠNG THÁI cả cuộc trò chuyện:
//
//   1. Conversation State Machine — khách đang ở GIAI ĐOẠN nào của phễu bán hàng
//      (chào hỏi → tìm hiểu nhu cầu → vị trí → mặt bằng → tiện ích → tài chính →
//       pháp lý → chốt). Biết stage giúp AI "hiểu khách vừa chuyển chủ đề" thay vì
//      phản ứng máy móc theo từ khóa.
//
//   2. Customer Memory — ghi nhớ điều khách tiết lộ (tên, ngân sách, mối quan tâm,
//      lo ngại, mẫu nhà ưa thích) để KHÔNG hỏi lại và cá nhân hóa câu trả lời.
//      Ví dụ: "Anh Long lúc nãy chia sẻ ngân sách khoảng 3 tỷ, trong tầm này..."
//
// Thiết kế: THUẦN HÀM (pure functions) + immutable reducer — dễ test, dễ dùng cả
// client (giữ state trong useRef) lẫn server (nhận/serialize qua request).
// Không phụ thuộc DOM/React nên import được ở mọi nơi.

import type { AmbientIntent, IntentTopic } from './intent';

// ── Giai đoạn phễu bán hàng ──────────────────────────────────────────────────
export type SalesStage =
  | 'greeting'    // chào hỏi, mở đầu
  | 'discovery'   // khai thác nhu cầu (khách chưa hỏi cụ thể)
  | 'location'    // vị trí / kết nối / khu vực
  | 'masterplan'  // mặt bằng / mẫu nhà / thiết kế / diện tích
  | 'amenities'   // tiện ích nội khu, không gian sống
  | 'finance'     // giá / thanh toán / vay / đầu tư
  | 'legal'       // pháp lý / sổ / tiến độ / bàn giao
  | 'close';      // chốt: xem nhà, liên hệ, đặt cọc

// Thứ tự tiến triển tự nhiên của phễu — dùng để gợi ý "bước tiếp theo".
export const STAGE_ORDER: SalesStage[] = [
  'greeting', 'discovery', 'location', 'masterplan', 'amenities', 'finance', 'legal', 'close',
];

// Map chủ đề (từ intent.ts) → giai đoạn hội thoại. 1 câu hỏi về giá kéo khách vào
// stage 'finance', hỏi vị trí kéo vào 'location'... AI luôn biết khách đang ở đâu.
const TOPIC_TO_STAGE: Record<IntentTopic, SalesStage> = {
  price: 'finance',
  location: 'location',
  unit: 'masterplan',
  design: 'masterplan',
  legal: 'legal',
  amenity: 'amenities',
  general: 'discovery',
};

// ── Bộ nhớ khách hàng ────────────────────────────────────────────────────────
export interface CustomerMemory {
  name?: string;              // "anh Long"
  budgetTy?: number;          // ngân sách quy về TỶ đồng (vd 3, 5.5)
  preferredModel?: string;    // mẫu nhà ưa thích: 'cosmo' | 'fusion' | 'opus' | 'signature'...
  interests: string[];        // điều khách quan tâm: 'view sông', 'con nhỏ', 'ở ngay', 'đầu tư'...
  concerns: string[];         // lo ngại cần trấn an: 'ngập', 'kẹt xe', 'pháp lý', 'ồn'...
}

export interface ConversationState {
  stage: SalesStage;
  previousStage: SalesStage | null;
  memory: CustomerMemory;
  turns: number;              // số lượt khách đã nói (để biết đã qua giai đoạn chào hỏi chưa)
}

export function createConversationState(): ConversationState {
  return {
    stage: 'greeting',
    previousStage: null,
    memory: { interests: [], concerns: [] },
    turns: 0,
  };
}

// ── Trích xuất NGÂN SÁCH ──────────────────────────────────────────────────────
// Bắt các cách nói tiền tỷ tự nhiên: "2 tỷ", "3 tỉ rưỡi", "tầm 5 tỷ", "khoảng 4 tỷ 5",
// "trên dưới 10 tỉ", "hai tỷ". Quy tất cả về số TỶ (float).
const VN_NUMBER_WORDS: Record<string, number> = {
  'một': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'năm': 5, 'sáu': 6, 'bảy': 7, 'tám': 8, 'chín': 9, 'mười': 10,
};

export function extractBudget(text: string): number | undefined {
  const t = text.toLowerCase();
  // Không phải câu tiết lộ ngân sách nếu chỉ hỏi giá ("giá bao nhiêu tỷ") — cần có
  // đại từ sở hữu/khả năng ("có", "tầm", "khoảng", "ngân sách", "chỉ", "được") đứng gần.
  const budgetCue = /(có|tầm|khoảng|ngân sách|tài chính|chỉ có|được|trong tay|dư|cầm|mang theo|tối đa|trên dưới)/;
  const isAskingPrice = /(giá|bán).*(bao nhiêu|nhiêu tiền)/.test(t);
  if (isAskingPrice && !budgetCue.test(t)) return undefined;

  // 1) Dạng số: "3 tỷ", "3.5 tỷ", "3,5 tỉ", "4 tỷ rưỡi", "4 tỷ 5"
  const numMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:tỷ|tỉ|ty)\s*(rưỡi|(\d))?/);
  if (numMatch) {
    let val = parseFloat(numMatch[1].replace(',', '.'));
    if (numMatch[2] === 'rưỡi') val += 0.5;
    else if (numMatch[3]) val += parseInt(numMatch[3], 10) / 10; // "4 tỷ 5" = 4.5
    if (val > 0 && val < 1000) return val;
  }

  // 2) Dạng chữ: "hai tỷ", "năm tỉ rưỡi"
  const wordMatch = t.match(/(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:tỷ|tỉ)\s*(rưỡi)?/);
  if (wordMatch) {
    let val = VN_NUMBER_WORDS[wordMatch[1]] || 0;
    if (wordMatch[2] === 'rưỡi') val += 0.5;
    if (val > 0) return val;
  }
  return undefined;
}

// ── Trích xuất TÊN khách ──────────────────────────────────────────────────────
// STT thường trả chữ thường nên không thể dựa vào viết hoa. Bắt theo mẫu câu giới
// thiệu: "tôi tên là Long", "anh tên Long", "em là Hùng", "mình tên Mai". Giữ CON
// SERVATIVE: chỉ lấy 1 token chữ cái ngay sau "tên/là", tránh nuốt cả câu.
const NAME_STOPWORDS = new Set(['gì', 'chi', 'ai', 'muốn', 'cần', 'đang', 'hỏi', 'xem', 'anh', 'chị', 'em', 'cô', 'chú']);

export function extractName(text: string): string | undefined {
  const t = text.toLowerCase().normalize('NFC');
  const m = t.match(/(?:tôi|mình|anh|chị|em|cô|chú)?\s*tên\s*(?:là|:)?\s*([a-zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]+)/)
        || t.match(/\b(?:tôi|mình|anh|chị|em|cô|chú)\s+là\s+([a-zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]+)\b/);
  if (!m) return undefined;
  const raw = m[1];
  if (!raw || raw.length < 2 || NAME_STOPWORDS.has(raw)) return undefined;
  // Viết hoa chữ cái đầu cho đẹp khi hiển thị.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Trích xuất MỐI QUAN TÂM & LO NGẠI ─────────────────────────────────────────
// Mỗi entry: [nhãn chuẩn hóa, danh sách từ khóa nhận diện]. Nhãn dùng để dựng
// profile ngắn gọn cho LLM, không lặp nguyên câu khách nói.
const INTEREST_PATTERNS: Array<[string, RegExp]> = [
  ['view sông/thoáng', /view sông|hướng sông|view đẹp|view thoáng|nhìn ra|thoáng mát/],
  ['có con nhỏ', /con nhỏ|con còn nhỏ|em bé|trẻ nhỏ|có con|con cái|gia đình trẻ/],
  ['ở với ông bà / đa thế hệ', /ông bà|ba thế hệ|3 thế hệ|đa thế hệ|nhiều thế hệ|sống chung|bố mẹ ở cùng/],
  ['muốn ở ngay', /ở ngay|vào ở liền|nhận nhà sớm|ở luôn|dọn vào ngay|cần gấp/],
  ['đầu tư sinh lời', /đầu tư|sinh lời|cho thuê|lướt sóng|tăng giá|dòng tiền|lợi nhuận/],
  ['vừa ở vừa kinh doanh', /kinh doanh|mở công ty|văn phòng|showroom|buôn bán|làm ăn|vừa ở vừa/],
  ['nuôi thú cưng', /nuôi chó|nuôi mèo|thú cưng|pet/],
  ['làm việc tại nhà', /làm việc tại nhà|wfh|work from home|freelance|phòng làm việc/],
];
const CONCERN_PATTERNS: Array<[string, RegExp]> = [
  ['sợ ngập', /ngập|ngập nước|triều cường|nước dâng|thoát nước/],
  ['ngại kẹt xe', /kẹt xe|ùn tắc|tắc đường|xa trung tâm|đi lại khó/],
  ['lo pháp lý', /pháp lý|sổ hồng|tranh chấp|giấy tờ|quy hoạch|dính quy hoạch/],
  ['sợ ồn / an ninh', /ồn|ồn ào|náo nhiệt|trộm|an ninh|an toàn không/],
  ['ngại vay / lãi suất', /không thích vay|ngại vay|sợ nợ|lãi suất cao|gánh nặng lãi/],
  ['lo tiến độ / bàn giao', /chậm tiến độ|trễ hẹn|có xây xong|treo|bỏ hoang/],
];

function matchLabels(text: string, patterns: Array<[string, RegExp]>): string[] {
  const t = text.toLowerCase();
  return patterns.filter(([, re]) => re.test(t)).map(([label]) => label);
}

export function extractInterests(text: string): string[] {
  return matchLabels(text, INTEREST_PATTERNS);
}
export function extractConcerns(text: string): string[] {
  return matchLabels(text, CONCERN_PATTERNS);
}

// ── Trích xuất MẪU NHÀ ưa thích ───────────────────────────────────────────────
export function extractPreferredModel(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/fusion|phiêu dân|gen 5/.test(t)) return 'Fusion Gen 5';
  if (/opus|ô pút|office|văn phòng/.test(t)) return 'Opus / Office';
  if (/cosmo|cót mô|cốt mô|gen 2/.test(t)) return 'Cosmo Gen 2';
  if (/signature|codinachs/.test(t)) return 'Signature';
  if (/cashmere/.test(t)) return 'Cashmere';
  return undefined;
}

// ── Reducer: cập nhật trạng thái sau mỗi câu khách nói ────────────────────────
// Nguyên tắc chuyển stage:
//   - Explicit topic (intent có topic mạnh) → nhảy thẳng tới stage của topic đó.
//   - Không có topic rõ nhưng đã qua vài lượt → rời 'greeting' sang 'discovery'.
//   - Nhận diện tín hiệu CHỐT ("xem nhà", "liên hệ", "đặt cọc") → stage 'close'.
const CLOSE_SIGNALS = /xem nhà|tham quan|đặt cọc|giữ chỗ|liên hệ|số điện thoại|hẹn gặp|ghé xem|chốt|mua luôn|đặt căn/;

function mergeUnique(base: string[], add: string[]): string[] {
  if (add.length === 0) return base;
  const set = new Set(base);
  for (const x of add) set.add(x);
  return Array.from(set);
}

export function updateConversationState(
  state: ConversationState,
  text: string,
  intent: AmbientIntent,
): ConversationState {
  const memory: CustomerMemory = {
    name: extractName(text) ?? state.memory.name,
    budgetTy: extractBudget(text) ?? state.memory.budgetTy,
    preferredModel: extractPreferredModel(text) ?? state.memory.preferredModel,
    interests: mergeUnique(state.memory.interests, extractInterests(text)),
    concerns: mergeUnique(state.memory.concerns, extractConcerns(text)),
  };

  // Xác định stage mới.
  let nextStage: SalesStage = state.stage;
  if (CLOSE_SIGNALS.test(text.toLowerCase())) {
    nextStage = 'close';
  } else if (intent.topic && intent.shouldGenerate) {
    nextStage = TOPIC_TO_STAGE[intent.topic];
  } else if (state.stage === 'greeting' && state.turns >= 1) {
    nextStage = 'discovery';
  }

  return {
    stage: nextStage,
    // previousStage = giai đoạn NGAY TRƯỚC lượt này (luôn cập nhật), để didStageChange
    // phản ánh đúng "có đổi giai đoạn ở CHÍNH lượt này không" — không bị dính (sticky).
    previousStage: state.stage,
    memory,
    turns: state.turns + 1,
  };
}

// Khách có vừa ĐỔI giai đoạn hội thoại ngay ở lượt vừa rồi không? (dùng để làm mới slide)
export function didStageChange(state: ConversationState): boolean {
  return state.previousStage !== null && state.previousStage !== state.stage;
}

// ── Dựng "profile" gửi cho /api/chat ──────────────────────────────────────────
// Chat route đã có sẵn hook: nhét chuỗi này vào system prompt dưới nhãn
// "THÔNG TIN ĐÃ BIẾT VỀ KHÁCH". Nhờ đó LLM tự nhắc lại: "Anh Long lúc nãy chia sẻ
// ngân sách khoảng 3 tỷ...". Trả '' nếu chưa biết gì (để không nhét nhiễu).
export function buildProfileNote(memory: CustomerMemory): string {
  const lines: string[] = [];
  if (memory.name) lines.push(`- Tên/xưng hô: ${memory.name}`);
  if (memory.budgetTy) lines.push(`- Ngân sách khách tiết lộ: khoảng ${formatTy(memory.budgetTy)} tỷ`);
  if (memory.preferredModel) lines.push(`- Mẫu nhà đang quan tâm: ${memory.preferredModel}`);
  if (memory.interests.length) lines.push(`- Mối quan tâm: ${memory.interests.join(', ')}`);
  if (memory.concerns.length) lines.push(`- Điều đang băn khoăn (cần trấn an khéo): ${memory.concerns.join(', ')}`);
  return lines.join('\n');
}

function formatTy(n: number): string {
  // 3 -> "3", 3.5 -> "3,5" (kiểu Việt Nam)
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}
