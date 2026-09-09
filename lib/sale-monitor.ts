// ============================================================================
// SALE MONITOR - "tab thứ hai" cho Sale soi TV đang làm gì (app/sale/page.tsx)
//
// Bài toán: khách nhìn TV (/slide), Sale không biết TV NGHE được gì, vì sao
// một câu bị bỏ qua, vì sao nhảy sang slide lạ. Debug HUD (?debug=1) hiện đè
// lên màn khách nên không dùng được lúc đang tư vấn.
//
// Cách làm: /slide phát sự kiện qua BroadcastChannel (cùng trình duyệt, cùng
// origin - KHÔNG cần server). /sale mở ở tab/cửa sổ thứ hai nghe channel này,
// tự chạy lại cổng intent + catalog trên câu nghe được để hiện lý do, và có
// thể bẻ lái TV (chiếu chủ đề / đóng băng / xoá) qua cùng channel.
//
// Phần thuần (analyzeUtterance, suggestNextTopics, TOPIC_GUIDE) không đụng
// DOM -> unit-test bằng `bun test tests/sale_monitor.test.ts`.
// ============================================================================

import {
  AmbientIntent, IntentTopic, TOPIC_KEYWORDS, classifyAmbientIntent, keywordWeight,
} from '@/lib/intent';
import { STATIC_SLIDES, matchStaticSlide } from '@/lib/static_slides';
import { TOPIC_LABELS } from '@/lib/presentation-machine';
import type { SaleCmd } from '@/lib/ws-protocol';

export const MONITOR_CHANNEL = 'nyah-sale-monitor';

// ── Thông điệp qua BroadcastChannel ──────────────────────────────────────────
export interface TvSnapshot {
  audio: string;        // trạng thái mic (useVoiceAgent)
  machine: string;      // trạng thái presentation machine
  transport: string;    // http | ws
  ws: string;           // connected | reconnecting
  slideId: number;
  slideTitle?: string;
  slideSource?: string; // _source server đánh dấu (static_fast / dynamic_llm ...)
  topicLabel: string;
  heardText: string;
  recent: string[];
  errorMsg?: string;
  errorNote?: string;
  at: number;
}

export type TvToMonitor =
  | { t: 'TV_HELLO' }
  | { t: 'HEARD'; text: string; at: number }     // STT trả câu - TRƯỚC cổng intent
  | { t: 'LOG'; line: string; at: number }       // dòng debug (cùng nguồn với HUD)
  | { t: 'SNAPSHOT'; snap: TvSnapshot };

export type MonitorToTv =
  | { t: 'MONITOR_HELLO' }                       // tab Sale vừa mở -> TV gửi lại snapshot
  | { t: 'OVERRIDE_QUERY'; text: string }
  | { t: 'SALE_CMD'; cmd: SaleCmd; arg?: number | string };

export interface MonitorBus<Out, In> {
  post(msg: Out): void;
  subscribe(handler: (msg: In) => void): () => void;
  close(): void;
}

/** Mở kênh 2 tab. Trả null nếu trình duyệt không có BroadcastChannel (kiosk cũ). */
export function openMonitorBus<Out, In>(): MonitorBus<Out, In> | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const ch = new BroadcastChannel(MONITOR_CHANNEL);
  return {
    post: msg => { try { ch.postMessage(msg); } catch { /* channel đã đóng */ } },
    subscribe: handler => {
      const fn = (ev: MessageEvent) => {
        const m = ev.data;
        if (m && typeof m.t === 'string') handler(m as In);
      };
      ch.addEventListener('message', fn);
      return () => ch.removeEventListener('message', fn);
    },
    close: () => ch.close(),
  };
}

// ── Phân tích một câu nghe được (mirror cổng trong presentation-machine) ─────
export type UtteranceVerdict = 'query' | 'catalog' | 'skip';

export interface UtteranceAnalysis {
  intent: AmbientIntent;
  /** Slide tĩnh khớp (nếu có) - cùng thứ tự combo -> general như machine. */
  catalogTitle: string | null;
  verdict: UtteranceVerdict;
  /** Lý do ngắn bằng tiếng Việt cho Sale đọc. */
  why: string;
}

const REASON_VI: Record<AmbientIntent['reason'], string> = {
  too_short: 'câu quá ngắn (<2 từ)',
  filler: 'câu chêm / không có từ khóa dự án',
  competitor: 'nhắc tên dự án đối thủ - chặn',
  has_project_topic: 'có từ khóa dự án',
  explicit_slide_request: 'Sale yêu cầu mở slide',
  weak_signal: 'chỉ có từ chung chung, chưa đủ điểm',
};

export function analyzeUtterance(text: string): UtteranceAnalysis {
  const intent = classifyAmbientIntent(text);
  const catalog = matchStaticSlide(text, 'combo') || matchStaticSlide(text, 'general');
  const catalogTitle = catalog ? catalog.title : null;
  if (intent.shouldGenerate) {
    return { intent, catalogTitle, verdict: 'query', why: REASON_VI[intent.reason] };
  }
  if (catalogTitle) {
    return { intent, catalogTitle, verdict: 'catalog', why: `${REASON_VI[intent.reason]}, nhưng catalog khớp "${catalogTitle}"` };
  }
  return { intent, catalogTitle, verdict: 'skip', why: REASON_VI[intent.reason] };
}

// ── Cẩm nang chủ đề: từ khóa kích hoạt + chủ đề nên nói tiếp ─────────────────
export interface TopicSuggestion {
  label: string;  // chữ hiện trên chip
  query: string;  // câu gửi cho TV (OVERRIDE_QUERY) - phải qua được cổng intent/catalog
}

export interface TopicGuide {
  label: string;
  next: TopicSuggestion[];
}

// Query của mỗi gợi ý được chọn từ chính từ khóa catalog (lib/static_slides.ts)
// để bấm là chắc chắn ra slide - test sale_monitor.test.ts kiểm tra điều này.
export const TOPIC_GUIDE: Record<IntentTopic, TopicGuide> = {
  price: {
    label: TOPIC_LABELS.price,
    next: [
      { label: 'Lịch thanh toán theo đợt', query: 'lịch thanh toán' },
      { label: 'Vay ngân hàng & lãi suất', query: 'vay ngân hàng' },
      { label: 'Chính sách ưu đãi', query: 'chính sách ưu đãi' },
      { label: 'Đặt chỗ giữ căn', query: 'đặt cọc giữ chỗ' },
      { label: 'Rổ hàng còn lại', query: 'còn căn nào' },
      { label: 'Gói bàn giao thô & Air', query: 'gói air' },
      { label: 'Bài toán đầu tư', query: 'đầu tư sinh lời' },
    ],
  },
  location: {
    label: TOPIC_LABELS.location,
    next: [
      { label: '18 phút đến Quận 1', query: '18 phút' },
      { label: 'Địa chỉ & 2 cổng', query: 'địa chỉ dự án' },
      { label: 'Trường học cho con', query: 'trường học' },
      { label: 'Bệnh viện gần', query: 'bệnh viện' },
      { label: 'Chợ & siêu thị', query: 'siêu thị' },
      { label: 'Ra sân bay', query: 'sân bay' },
      { label: 'Sơ đồ phân lô', query: 'sơ đồ phân lô' },
    ],
  },
  unit: {
    label: TOPIC_LABELS.unit,
    next: [
      { label: 'Thang máy trong nhà', query: 'thang máy' },
      { label: 'Khí tươi AirTop', query: 'airtop' },
      { label: 'Sân thượng đa năng', query: 'sân thượng' },
      { label: 'Giếng trời & ánh sáng', query: 'giếng trời' },
      { label: 'Cấu trúc 6 tầng', query: 'mấy tầng' },
      { label: 'Diện tích các lô', query: 'diện tích' },
      { label: 'Hướng nhà & phong thủy', query: 'hướng nhà' },
      { label: 'Nhà cho 3 thế hệ', query: '3 thế hệ' },
    ],
  },
  legal: {
    label: TOPIC_LABELS.legal,
    next: [
      { label: 'Tiến độ xây dựng', query: 'tiến độ' },
      { label: 'Lộ trình bàn giao', query: 'bàn giao' },
      { label: 'Chủ đầu tư Nhã Đạt', query: 'chủ đầu tư' },
      { label: 'Dự án đã làm', query: 'dự án đã làm' },
      { label: 'Đối tác đồng hành', query: 'đối tác' },
      { label: 'An ninh compound', query: 'an ninh' },
    ],
  },
  amenity: {
    label: TOPIC_LABELS.amenity,
    next: [
      { label: 'Công viên nội khu', query: 'công viên' },
      { label: 'Sân thể thao', query: 'sân thể thao' },
      { label: 'Sân chơi trẻ em', query: 'sân chơi' },
      { label: 'Landmark Coffee', query: 'cà phê' },
      { label: 'Cảnh quan nội khu', query: 'cảnh quan' },
      { label: 'Cổng chào dự án', query: 'cổng chào' },
      { label: 'Không gian yên tĩnh', query: 'yên tĩnh' },
    ],
  },
  design: {
    label: TOPIC_LABELS.design,
    next: [
      { label: 'Sơ đồ phân lô', query: 'sơ đồ phân lô' },
      { label: 'Signature by Codinachs', query: 'signature' },
      { label: 'Dòng Cashmere', query: 'cashmere' },
      { label: 'Thang xoắn nghệ thuật', query: 'thang xoắn' },
      { label: 'Mặt tiền gạch bông gió', query: 'gạch bông gió' },
      { label: 'Fusion 2 mặt tiền', query: '2 mặt tiền' },
      { label: 'Nhà thông minh', query: 'smart home' },
    ],
  },
  general: {
    label: TOPIC_LABELS.general,
    next: [
      { label: 'Quy mô 50 căn', query: 'quy mô' },
      { label: 'Vị trí dự án', query: 'vị trí dự án' },
      { label: 'Bảng giá', query: 'bảng giá' },
      { label: 'Pháp lý', query: 'pháp lý' },
      { label: 'Tiến độ', query: 'tiến độ' },
      { label: 'Mẫu nhà Cosmo', query: 'mẫu nhà cosmo' },
      { label: 'Mẫu nhà Fusion', query: 'mẫu nhà fusion' },
      { label: 'Mẫu nhà Opus', query: 'mẫu nhà opus' },
    ],
  },
};

export const TOPIC_ORDER: IntentTopic[] = ['price', 'location', 'unit', 'legal', 'amenity', 'design', 'general'];

/** Từ khóa kích hoạt của một chủ đề, từ MẠNH (tự đủ) xếp trước. */
export function topicKeywords(topic: IntentTopic): { kw: string; strong: boolean }[] {
  return TOPIC_KEYWORDS[topic]
    .map(kw => ({ kw, strong: keywordWeight(topic, kw) >= 2 }))
    .sort((a, b) => Number(b.strong) - Number(a.strong));
}

/**
 * Chủ đề nên nói tiếp: gợi ý của topic hiện tại, bỏ những slide đã chiếu.
 * Hết gợi ý trong topic -> bù bằng gợi ý chung (general).
 */
export function suggestNextTopics(topic: IntentTopic | null, shownTitles: string[], limit = 6): TopicSuggestion[] {
  const shown = new Set(shownTitles);
  const notShown = (s: TopicSuggestion) => {
    const hit = matchStaticSlide(s.query, 'combo') || matchStaticSlide(s.query, 'general');
    return !hit || !shown.has(hit.title);
  };
  const primary = TOPIC_GUIDE[topic || 'general'].next.filter(notShown);
  if (primary.length >= limit || topic === 'general' || !topic) return primary.slice(0, limit);
  const seen = new Set(primary.map(s => s.query));
  const filler = TOPIC_GUIDE.general.next.filter(s => !seen.has(s.query) && notShown(s));
  return [...primary, ...filler].slice(0, limit);
}

// ── Tra catalog: Sale gõ vài chữ -> thấy slide nào có, nói từ gì thì ra ──────
export interface CatalogIndexEntry {
  title: string;
  keywords: string[];
  allOf?: string[];
  /** Câu mẫu để bấm chiếu ngay (đủ allOf + 1 keyword). */
  query: string;
}

let catalogIndexCache: CatalogIndexEntry[] | null = null;

export function catalogIndex(): CatalogIndexEntry[] {
  if (catalogIndexCache) return catalogIndexCache;
  const seen = new Set<string>();
  const out: CatalogIndexEntry[] = [];
  for (const e of STATIC_SLIDES) {
    if (!e.keywords.length && !e.allOf?.length) continue;
    if (seen.has(e.slide.title)) continue;
    seen.add(e.slide.title);
    const query = [...(e.allOf || []), e.keywords[0]].filter(Boolean).join(' ');
    out.push({ title: e.slide.title, keywords: e.keywords, allOf: e.allOf, query });
  }
  catalogIndexCache = out;
  return out;
}

export function searchCatalog(q: string, limit = 12): CatalogIndexEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return catalogIndex()
    .filter(e =>
      e.title.toLowerCase().includes(needle) ||
      e.keywords.some(k => k.includes(needle)) ||
      (e.allOf || []).some(k => k.includes(needle)))
    .slice(0, limit);
}
